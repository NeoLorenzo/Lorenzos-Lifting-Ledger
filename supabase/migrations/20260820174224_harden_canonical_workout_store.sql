begin;

lock table public.gyms,
  public.workout_sessions,
  public.session_exercises,
  public.exercise_sets,
  public.exercises,
  public.body_weight_measurements,
  public.data_imports
in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.session_exercises session_exercise
    left join public.exercises exercise
      on exercise.id = session_exercise.exercise_id
    where session_exercise.exercise_id is null
       or exercise.id is null
  ) then
    raise exception 'Canonical workout cleanup aborted: every session exercise must resolve to one current exercise';
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    left join public.gyms gym
      on gym.id = session.gym_id
     and gym.owner_id = session.owner_id
    where session.gym_id is not null
      and gym.id is null
  ) or exists (
    select 1
    from public.session_exercises session_exercise
    left join public.workout_sessions session
      on session.id = session_exercise.session_id
     and session.owner_id = session_exercise.owner_id
    where session.id is null
  ) or exists (
    select 1
    from public.exercise_sets exercise_set
    left join public.session_exercises session_exercise
      on session_exercise.id = exercise_set.session_exercise_id
     and session_exercise.owner_id = exercise_set.owner_id
    where session_exercise.id is null
  ) then
    raise exception 'Canonical workout cleanup aborted: workout ownership hierarchy is incomplete';
  end if;
end
$$;

create temporary table canonical_gyms_before on commit drop as
select id, owner_id, name, created_at from public.gyms;

create temporary table canonical_sessions_before on commit drop as
select id, owner_id, gym_id, performed_on, created_at, status
from public.workout_sessions;

create temporary table canonical_exercises_before on commit drop as
select id, owner_id, session_id, exercise_order, exercise_id, equipment_id, created_at
from public.session_exercises;

create temporary table canonical_sets_before on commit drop as
select id, owner_id, session_exercise_id, set_number, weight, reps, rpe,
  is_warmup, is_drop_set, is_superset, created_at,
  estimated_1rm_brzycki, estimated_1rm_epley,
  estimated_1rm_low, estimated_1rm_high
from public.exercise_sets;

alter table public.session_exercises
  drop column import_id,
  drop column source_row,
  drop column exercise;

drop table public.lift_sets;
drop table public.lift_entries;
drop table public.exercise_aliases;

delete from public.data_imports
where import_kind <> 'body_weight';

alter table public.data_imports
  drop constraint data_imports_import_kind_check,
  alter column import_kind set default 'body_weight',
  add constraint data_imports_import_kind_check
    check (import_kind = 'body_weight');

create or replace function public.delete_body_weight_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare deletion_owner_id uuid := (select auth.uid());
begin
  if deletion_owner_id is null then raise exception 'Authentication required'; end if;
  delete from public.body_weight_measurements where owner_id = deletion_owner_id;
  delete from public.data_imports
  where owner_id = deletion_owner_id
    and import_kind = 'body_weight';
  insert into public.user_settings (owner_id, relative_e1rm_enabled)
  values (deletion_owner_id, false)
  on conflict (owner_id) do update
    set relative_e1rm_enabled = false, updated_at = now();
end;
$$;

revoke all on function public.delete_body_weight_data() from public, anon;
grant execute on function public.delete_body_weight_data() to authenticated;

do $$
begin
  if exists (
    (select * from canonical_gyms_before
     except select id, owner_id, name, created_at from public.gyms)
    union all
    (select id, owner_id, name, created_at from public.gyms
     except select * from canonical_gyms_before)
  ) or exists (
    (select * from canonical_sessions_before
     except select id, owner_id, gym_id, performed_on, created_at, status from public.workout_sessions)
    union all
    (select id, owner_id, gym_id, performed_on, created_at, status from public.workout_sessions
     except select * from canonical_sessions_before)
  ) or exists (
    (select * from canonical_exercises_before
     except select id, owner_id, session_id, exercise_order, exercise_id, equipment_id, created_at
       from public.session_exercises)
    union all
    (select id, owner_id, session_id, exercise_order, exercise_id, equipment_id, created_at
       from public.session_exercises
     except select * from canonical_exercises_before)
  ) or exists (
    (select * from canonical_sets_before
     except select id, owner_id, session_exercise_id, set_number, weight, reps, rpe,
       is_warmup, is_drop_set, is_superset, created_at,
       estimated_1rm_brzycki, estimated_1rm_epley, estimated_1rm_low, estimated_1rm_high
       from public.exercise_sets)
    union all
    (select id, owner_id, session_exercise_id, set_number, weight, reps, rpe,
       is_warmup, is_drop_set, is_superset, created_at,
       estimated_1rm_brzycki, estimated_1rm_epley, estimated_1rm_low, estimated_1rm_high
       from public.exercise_sets
     except select * from canonical_sets_before)
  ) then
    raise exception 'Canonical workout cleanup aborted: workout data changed during cleanup';
  end if;

  if exists (
    select 1
    from public.session_exercises session_exercise
    left join public.exercises exercise on exercise.id = session_exercise.exercise_id
    where exercise.id is null
  ) then
    raise exception 'Canonical workout cleanup aborted: an exercise relation was lost';
  end if;
end
$$;

comment on column public.session_exercises.exercise_id is
  'Sole canonical exercise identity. Display labels come from exercises.name.';
comment on table public.data_imports is
  'Owner-scoped provenance for supported body-weight CSV imports.';

commit;
