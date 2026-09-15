-- Migration: add_completed_session_correction_lifecycle
-- Description: Adds safe reopen/delete operations for completed workouts and distinguishes historical correction sessions from ordinary live workouts.

alter table public.workout_sessions
  add column is_historical_correction boolean not null default false;

alter table public.workout_sessions
  add constraint workout_sessions_historical_correction_requires_in_progress
  check (not is_historical_correction or status = 'in_progress');

create or replace function public.reopen_completed_workout_session(
  p_session_id bigint
)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  target_session public.workout_sessions;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into target_session
  from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Session not found or not owned by current user.';
  end if;

  if target_session.status <> 'completed' then
    raise exception using errcode = '22023', message = 'Only completed workout sessions can be reopened for correction.';
  end if;

  if exists (
    select 1
    from public.workout_sessions
    where owner_id = session_owner_id
      and status = 'in_progress'
      and id <> p_session_id
  ) then
    raise exception using errcode = '22023', message = 'Finish or cancel the active workout before reopening a completed session.';
  end if;

  update public.workout_sessions
  set status = 'in_progress',
      is_historical_correction = true
  where id = p_session_id and owner_id = session_owner_id
  returning * into target_session;

  return target_session;
end;
$$;

create or replace function public.delete_completed_workout_session(
  p_session_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  target_session public.workout_sessions;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into target_session
  from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Session not found or not owned by current user.';
  end if;

  if target_session.status <> 'completed' then
    raise exception using errcode = '22023', message = 'Only completed workout sessions can be deleted from Session History.';
  end if;

  delete from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id and status = 'completed';

  return true;
end;
$$;

create or replace function public.cancel_workout_session(p_session_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  session_row public.workout_sessions;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into session_row
  from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id;

  if not found then
    raise exception using errcode = '42501', message = 'Session not found or not owned by current user.';
  end if;

  if session_row.status <> 'in_progress' then
    raise exception using errcode = '22023', message = 'Only in-progress workout sessions can be cancelled.';
  end if;

  if session_row.is_historical_correction then
    raise exception using errcode = '22023', message = 'Historical correction sessions cannot be cancelled; finish the correction instead.';
  end if;

  delete from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id and status = 'in_progress';

  return true;
end;
$$;

create or replace function public.conclude_workout_session(p_session_id bigint)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  concluded_session public.workout_sessions;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into concluded_session
  from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id and status = 'in_progress';

  if not found then
    raise exception using errcode = '42501', message = 'Active session not found or not owned by current user.';
  end if;

  if exists (
    select 1
    from public.exercise_sets es
    join public.session_exercises se
      on se.id = es.session_exercise_id and se.owner_id = es.owner_id
    where se.session_id = p_session_id
      and se.owner_id = session_owner_id
      and (
        (not es.is_warmup and (
          (es.weight is not null or es.reps is not null or es.reported_rir_bucket is not null)
          and (es.weight is null or es.reps is null or es.reported_rir_bucket is null)
        ))
        or
        (es.is_warmup and (
          (es.weight is not null or es.reps is not null)
          and (es.weight is null or es.reps is null)
        ))
      )
  ) then
    raise exception using errcode = '22023', message = 'Cannot conclude session: one or more sets are incomplete drafts.';
  end if;

  delete from public.exercise_sets
  where owner_id = session_owner_id
    and session_exercise_id in (
      select id from public.session_exercises
      where session_id = p_session_id and owner_id = session_owner_id
    )
    and weight is null
    and reps is null
    and reported_rir_bucket is null;

  delete from public.session_exercises
  where session_id = p_session_id
    and owner_id = session_owner_id
    and id not in (
      select distinct session_exercise_id
      from public.exercise_sets
      where owner_id = session_owner_id
    );

  with ordered as (
    select id, row_number() over (order by exercise_order) as new_order
    from public.session_exercises
    where session_id = p_session_id and owner_id = session_owner_id
  )
  update public.session_exercises se
  set exercise_order = ordered.new_order
  from ordered
  where se.id = ordered.id;

  update public.workout_sessions
  set status = 'completed',
      is_historical_correction = false
  where id = p_session_id and owner_id = session_owner_id
  returning * into concluded_session;

  return concluded_session;
end;
$$;

revoke all on function public.reopen_completed_workout_session(bigint) from public, anon;
revoke all on function public.delete_completed_workout_session(bigint) from public, anon;
revoke all on function public.cancel_workout_session(bigint) from public, anon;
revoke all on function public.conclude_workout_session(bigint) from public, anon;

grant execute on function public.reopen_completed_workout_session(bigint) to authenticated;
grant execute on function public.delete_completed_workout_session(bigint) to authenticated;
grant execute on function public.cancel_workout_session(bigint) to authenticated;
grant execute on function public.conclude_workout_session(bigint) to authenticated;
