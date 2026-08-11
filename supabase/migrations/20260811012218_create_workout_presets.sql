begin;

create table public.workout_presets (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (
    char_length(name) <= 100
    and name = regexp_replace(btrim(name), '\s+', ' ', 'g')
    and name <> ''
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index workout_presets_owner_name_unique_idx
  on public.workout_presets (owner_id, lower(name));
create index workout_presets_owner_updated_idx
  on public.workout_presets (owner_id, updated_at desc, id desc);

create table public.workout_preset_exercises (
  preset_id bigint not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (preset_id, exercise_id),
  foreign key (preset_id, owner_id)
    references public.workout_presets(id, owner_id)
    on delete cascade
);

create index workout_preset_exercises_owner_preset_idx
  on public.workout_preset_exercises (owner_id, preset_id);
create index workout_preset_exercises_exercise_idx
  on public.workout_preset_exercises (exercise_id, preset_id);

create function public.set_workout_preset_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_workout_presets_updated_at
before update on public.workout_presets
for each row execute function public.set_workout_preset_updated_at();

create function public.save_workout_preset(
  p_preset_id bigint,
  p_name text,
  p_exercise_ids bigint[]
)
returns public.workout_presets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  preset_owner_id uuid := (select auth.uid());
  normalized_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  saved_preset public.workout_presets;
begin
  if preset_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if normalized_name is null or normalized_name = '' or char_length(normalized_name) > 100 then
    raise exception using errcode = '22023', message = 'Preset name must contain 1 to 100 characters.';
  end if;

  if coalesce(cardinality(p_exercise_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'A preset must contain at least one exercise.';
  end if;

  if p_preset_id is null then
    insert into public.workout_presets (owner_id, name)
    values (preset_owner_id, normalized_name)
    returning * into saved_preset;
  else
    update public.workout_presets
    set name = normalized_name
    where id = p_preset_id
      and owner_id = preset_owner_id
    returning * into saved_preset;

    if not found then
      raise exception using errcode = '42501', message = 'Preset not found or not owned by the current user.';
    end if;

    delete from public.workout_preset_exercises
    where preset_id = saved_preset.id
      and owner_id = preset_owner_id;
  end if;

  insert into public.workout_preset_exercises (preset_id, owner_id, exercise_id)
  select saved_preset.id, preset_owner_id, exercise_id
  from (
    select distinct unnest(p_exercise_ids) as exercise_id
  ) selected_exercises;

  update public.workout_presets
  set updated_at = now()
  where id = saved_preset.id
    and owner_id = preset_owner_id
  returning * into saved_preset;

  return saved_preset;
end;
$$;

alter table public.workout_presets enable row level security;
alter table public.workout_preset_exercises enable row level security;

create policy "Users can view their own workout presets"
  on public.workout_presets for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own workout presets"
  on public.workout_presets for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own workout presets"
  on public.workout_presets for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own workout presets"
  on public.workout_presets for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "Users can view their own workout preset exercises"
  on public.workout_preset_exercises for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own workout preset exercises"
  on public.workout_preset_exercises for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own workout preset exercises"
  on public.workout_preset_exercises for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on public.workout_presets, public.workout_preset_exercises from anon;
revoke all on sequence public.workout_presets_id_seq from anon;
revoke all on function public.set_workout_preset_updated_at() from public, anon, authenticated;
revoke all on function public.save_workout_preset(bigint, text, bigint[]) from public, anon;

grant select, insert, update, delete
  on public.workout_presets
  to authenticated;
grant select, insert, delete
  on public.workout_preset_exercises
  to authenticated;
grant usage, select on sequence public.workout_presets_id_seq to authenticated;
grant execute on function public.save_workout_preset(bigint, text, bigint[]) to authenticated;

comment on table public.workout_presets is
  'Owner-scoped reusable named pools of global exercises. Exercise order is intentionally not modelled.';
comment on table public.workout_preset_exercises is
  'Unordered membership links between owner-scoped presets and the global exercise catalogue.';
comment on column public.workout_preset_exercises.exercise_id is
  'Reference to the global exercise catalogue. Session-specific set, load, RPE, equipment, and warm-up data are never copied.';

commit;