begin;

-- Keep the two-step reorder atomic without ever violating the positive-order
-- check constraint on session_exercises.
create or replace function public.reorder_session_exercises(
  p_session_id bigint,
  p_exercise_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  current_exercise_ids bigint[];
  order_offset integer;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.workout_sessions
    where id = p_session_id and owner_id = session_owner_id and status = 'in_progress'
  ) then
    raise exception using errcode = '42501', message = 'Session not found, not active, or not owned by current user.';
  end if;

  select array_agg(id order by id) into current_exercise_ids
  from public.session_exercises
  where session_id = p_session_id and owner_id = session_owner_id;

  if coalesce(cardinality(p_exercise_ids), 0) <> coalesce(cardinality(current_exercise_ids), 0)
     or exists (
       select 1 from unnest(p_exercise_ids) as passed(id)
       group by id having count(*) > 1
     )
     or exists (
       select 1 from unnest(p_exercise_ids) as passed(id)
       where passed.id is null or not (passed.id = any(current_exercise_ids))
     ) then
    raise exception using errcode = '22023', message = 'Submitted exercise IDs do not match the current session exercises.';
  end if;

  select coalesce(max(exercise_order), 0) + cardinality(p_exercise_ids)
    into order_offset
  from public.session_exercises
  where session_id = p_session_id and owner_id = session_owner_id;

  update public.session_exercises se
  set exercise_order = order_offset + pos.new_order
  from (
    select id, ordinality::integer as new_order
    from unnest(p_exercise_ids) with ordinality as ord(id, ordinality)
  ) pos
  where se.id = pos.id and se.session_id = p_session_id and se.owner_id = session_owner_id;

  update public.session_exercises se
  set exercise_order = pos.new_order
  from (
    select id, ordinality::integer as new_order
    from unnest(p_exercise_ids) with ordinality as ord(id, ordinality)
  ) pos
  where se.id = pos.id and se.session_id = p_session_id and se.owner_id = session_owner_id;
end;
$$;

commit;
