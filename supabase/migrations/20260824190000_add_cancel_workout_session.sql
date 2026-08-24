-- Migration: add_cancel_workout_session
-- Description: Adds cancel_workout_session RPC to safely delete in-progress workout sessions

create or replace function public.cancel_workout_session(
  p_session_id bigint
)
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

  delete from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id and status = 'in_progress';

  return true;
end;
$$;

revoke all on function public.cancel_workout_session(bigint) from public, anon;
grant execute on function public.cancel_workout_session(bigint) to authenticated;
