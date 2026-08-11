begin;
alter table public.workout_sessions
  alter column gym_id drop not null,
  add column status text not null default 'completed'
    check (status in ('in_progress', 'completed'));
create unique index workout_sessions_one_in_progress_per_owner_idx
  on public.workout_sessions (owner_id)
  where status = 'in_progress';
create or replace function public.start_or_resume_workout_session()
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  active_session public.workout_sessions;
begin
  if session_owner_id is null then
    raise exception 'Authentication is required';
  end if;
  insert into public.workout_sessions (owner_id, gym_id, performed_on, status)
  values (session_owner_id, null, current_date, 'in_progress')
  on conflict (owner_id) where status = 'in_progress'
  do update set owner_id = excluded.owner_id
  returning * into active_session;
  return active_session;
end;
$$;
revoke all on function public.start_or_resume_workout_session() from public, anon;
grant execute on function public.start_or_resume_workout_session() to authenticated;
comment on column public.workout_sessions.status is
  'Session lifecycle state. Historical imported sessions are completed; only one session may be in progress per owner.';
comment on function public.start_or_resume_workout_session() is
  'Atomically returns the authenticated owner''s active session or creates one blank in-progress session.';
commit;