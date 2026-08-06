begin;

create table public.exercises (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (
    name <> ''
    and name = regexp_replace(btrim(name), '\s+', ' ', 'g')
  ),
  canonical_exercise_id bigint,
  created_at timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id),
  foreign key (canonical_exercise_id, owner_id)
    references public.exercises(id, owner_id)
    on delete restrict,
  check (canonical_exercise_id is null or canonical_exercise_id <> id)
);

insert into public.exercises (owner_id, name, created_at)
select
  owner_id,
  regexp_replace(btrim(exercise), '\s+', ' ', 'g'),
  min(created_at)
from public.session_exercises
group by owner_id, regexp_replace(btrim(exercise), '\s+', ' ', 'g');

alter table public.session_exercises
  add column exercise_id bigint;

update public.session_exercises se
set exercise_id = e.id
from public.exercises e
where e.owner_id = se.owner_id
  and e.name = regexp_replace(btrim(se.exercise), '\s+', ' ', 'g');

do $$
begin
  if (select count(*) from public.exercises) <>
     (select count(*) from (
       select owner_id, regexp_replace(btrim(exercise), '\s+', ' ', 'g')
       from public.session_exercises
       group by owner_id, regexp_replace(btrim(exercise), '\s+', ' ', 'g')
     ) source_exercises) then
    raise exception 'Exercise catalogue count mismatch';
  end if;

  if exists (
    select 1
    from public.session_exercises se
    left join public.exercises e
      on e.id = se.exercise_id
     and e.owner_id = se.owner_id
    where e.id is null
       or e.name is distinct from regexp_replace(btrim(se.exercise), '\s+', ' ', 'g')
  ) then
    raise exception 'Session exercise catalogue link mismatch';
  end if;
end
$$;

alter table public.session_exercises
  alter column exercise_id set not null,
  add foreign key (exercise_id, owner_id)
    references public.exercises(id, owner_id)
    on delete restrict;

create index exercises_owner_created_idx
  on public.exercises (owner_id, created_at, id);
create index exercises_canonical_owner_idx
  on public.exercises (canonical_exercise_id, owner_id)
  where canonical_exercise_id is not null;
create index session_exercises_exercise_owner_idx
  on public.session_exercises (exercise_id, owner_id);

alter table public.exercises enable row level security;

create policy "Users can view their own exercises"
  on public.exercises for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own exercises"
  on public.exercises for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own exercises"
  on public.exercises for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own exercises"
  on public.exercises for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on public.exercises from anon;
revoke all on sequence public.exercises_id_seq from anon;
grant select, insert, update, delete on public.exercises to authenticated;
grant usage, select on sequence public.exercises_id_seq to authenticated;

comment on table public.exercises is
  'Owner-scoped exercise catalogue. Each distinct imported name remains separate until explicitly mapped to a canonical exercise.';
comment on column public.exercises.name is
  'Whitespace-normalized user label. Capitalization, punctuation, spelling, and movement variations remain distinct.';
comment on column public.exercises.canonical_exercise_id is
  'Optional same-owner mapping for future non-destructive exercise-name standardization.';
comment on column public.session_exercises.exercise is
  'Historical label snapshot retained exactly as recorded, independent of future catalogue standardization.';
comment on column public.session_exercises.equipment_id is
  'Equipment used for this performed exercise; deliberately not stored on the exercise catalogue.';

commit;
