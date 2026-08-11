begin;

alter table public.workout_preset_exercises
  add column set_count smallint not null default 1,
  add constraint workout_preset_exercises_set_count_check
    check (set_count between 1 and 20);

alter table public.exercise_sets
  drop constraint exercise_sets_check;

create function public.save_workout_preset(
  p_preset_id bigint,
  p_name text,
  p_exercise_ids bigint[],
  p_set_counts smallint[]
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

  if coalesce(cardinality(p_set_counts), 0) <> cardinality(p_exercise_ids)
     or exists (
       select 1
       from unnest(p_set_counts) as counts(count_value)
       where count_value is null or count_value not between 1 and 20
     )
     or (
       select count(distinct exercise_id)
       from unnest(p_exercise_ids) as ids(exercise_id)
     ) <> cardinality(p_exercise_ids) then
    raise exception using errcode = '22023', message = 'Preset exercises and set counts are invalid.';
  end if;

  if p_preset_id is null then
    insert into public.workout_presets (owner_id, name)
    values (preset_owner_id, normalized_name)
    returning * into saved_preset;
  else
    update public.workout_presets
    set name = normalized_name
    where id = p_preset_id and owner_id = preset_owner_id
    returning * into saved_preset;

    if not found then
      raise exception using errcode = '42501', message = 'Preset not found or not owned by the current user.';
    end if;

    delete from public.workout_preset_exercises
    where preset_id = saved_preset.id and owner_id = preset_owner_id;
  end if;

  insert into public.workout_preset_exercises (preset_id, owner_id, exercise_id, set_count)
  select saved_preset.id, preset_owner_id, selected.exercise_id, selected.set_count
  from unnest(p_exercise_ids, p_set_counts) as selected(exercise_id, set_count);

  update public.workout_presets
  set updated_at = now()
  where id = saved_preset.id and owner_id = preset_owner_id
  returning * into saved_preset;

  return saved_preset;
end;
$$;

create or replace function public.start_or_resume_workout_session(p_preset_id bigint)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  active_session public.workout_sessions;
  created_session boolean;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_preset_id is not null and not exists (
    select 1
    from public.workout_presets
    where id = p_preset_id and owner_id = session_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Preset not found or not owned by the current user.';
  end if;

  if p_preset_id is not null and not exists (
    select 1
    from public.workout_preset_exercises
    where preset_id = p_preset_id and owner_id = session_owner_id
  ) then
    raise exception using errcode = '22023', message = 'The selected preset has no exercises.';
  end if;

  insert into public.workout_sessions (owner_id, gym_id, performed_on, status)
  values (session_owner_id, null, current_date, 'in_progress')
  on conflict (owner_id) where status = 'in_progress' do nothing
  returning * into active_session;
  created_session := found;

  if not created_session then
    select * into active_session
    from public.workout_sessions
    where owner_id = session_owner_id and status = 'in_progress';
    return active_session;
  end if;

  if p_preset_id is not null then
    with randomized_exercises as (
      select
        membership.exercise_id,
        row_number() over (order by random())::integer as exercise_order
      from public.workout_preset_exercises as membership
      where membership.preset_id = p_preset_id
        and membership.owner_id = session_owner_id
    ), inserted_exercises as (
      insert into public.session_exercises (
        owner_id, session_id, exercise_order, exercise, exercise_id
      )
      select
        session_owner_id,
        active_session.id,
        randomized.exercise_order,
        exercise.name,
        exercise.id
      from randomized_exercises as randomized
      join public.exercises as exercise on exercise.id = randomized.exercise_id
      returning id, exercise_id
    )
    insert into public.exercise_sets (owner_id, session_exercise_id, set_number)
    select
      session_owner_id,
      inserted.id,
      generated.set_number::smallint
    from inserted_exercises as inserted
    join public.workout_preset_exercises as membership
      on membership.preset_id = p_preset_id
     and membership.owner_id = session_owner_id
     and membership.exercise_id = inserted.exercise_id
    cross join lateral generate_series(1, membership.set_count) as generated(set_number);
  end if;

  return active_session;
end;
$$;

create or replace function public.start_or_resume_workout_session()
returns public.workout_sessions
language sql
security invoker
set search_path = ''
as $$
  select public.start_or_resume_workout_session(null::bigint);
$$;

revoke all on function public.save_workout_preset(bigint, text, bigint[], smallint[]) from public, anon;
revoke all on function public.start_or_resume_workout_session(bigint) from public, anon;
grant execute on function public.save_workout_preset(bigint, text, bigint[], smallint[]) to authenticated;
grant execute on function public.start_or_resume_workout_session(bigint) to authenticated;

comment on column public.workout_preset_exercises.set_count is
  'Number of blank set slots created for this exercise when starting a session from the preset.';
comment on table public.workout_preset_exercises is
  'Unordered preset exercise memberships with a reusable set count; no load, reps, equipment, RPE, or warm-up state is stored.';
comment on table public.exercise_sets is
  'Numbered workout set slots. In-progress sessions may contain blank slots until weight or reps are recorded.';
comment on function public.start_or_resume_workout_session(bigint) is
  'Atomically creates an owner-scoped session and optionally populates randomized preset exercises and blank set slots.';

commit;