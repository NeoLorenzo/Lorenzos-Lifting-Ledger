-- Migration: atomic_live_workout_mutations
-- Description: Adds atomic RPCs for adding an exercise with initial set slot, removing an exercise with order normalization, and removing a set with set number renumbering.

create or replace function public.add_session_exercise(
  p_session_id bigint,
  p_exercise_id bigint,
  p_gym_equipment_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  session_record public.workout_sessions;
  resolved_equipment_id bigint := null;
  equip_name_snapshot text := null;
  next_order integer;
  new_exercise_record public.session_exercises;
  new_set_record public.exercise_sets;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  -- Lock the session row to prevent race conditions during concurrent additions
  select * into session_record
  from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id and status = 'in_progress'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Active session not found or not owned by current user.';
  end if;

  if not exists (
    select 1 from public.exercises where id = p_exercise_id
  ) then
    raise exception using errcode = '22023', message = 'Exercise not found in catalogue.';
  end if;

  if p_gym_equipment_id is not null then
    select name into equip_name_snapshot
    from public.gym_equipment
    where id = p_gym_equipment_id
      and owner_id = session_owner_id
      and gym_id = session_record.gym_id;

    if not found then
      raise exception using errcode = '42501', message = 'Equipment not found, inactive, or not compatible with session gym.';
    end if;
    resolved_equipment_id := p_gym_equipment_id;
  else
    -- Resolve default equipment and snapshot deterministically from prior completed workouts
    select se_hist.gym_equipment_id, ge.name
    into resolved_equipment_id, equip_name_snapshot
    from public.session_exercises se_hist
    join public.workout_sessions ws_hist
      on ws_hist.id = se_hist.session_id and ws_hist.owner_id = se_hist.owner_id
    left join public.gym_equipment ge
      on ge.id = se_hist.gym_equipment_id and ge.owner_id = session_owner_id
    where ws_hist.owner_id = session_owner_id
      and ws_hist.gym_id = session_record.gym_id
      and ws_hist.status = 'completed'
      and se_hist.exercise_id = p_exercise_id
      and se_hist.gym_equipment_id is not null
    order by
      ws_hist.performed_on desc,
      ws_hist.created_at desc,
      ws_hist.id desc,
      se_hist.exercise_order desc,
      se_hist.id desc
    limit 1;
  end if;

  select coalesce(max(exercise_order), 0) + 1 into next_order
  from public.session_exercises
  where session_id = p_session_id and owner_id = session_owner_id;

  insert into public.session_exercises (
    owner_id,
    session_id,
    exercise_order,
    exercise_id,
    gym_equipment_id,
    equipment_name_snapshot
  )
  values (
    session_owner_id,
    p_session_id,
    next_order,
    p_exercise_id,
    resolved_equipment_id,
    equip_name_snapshot
  )
  returning * into new_exercise_record;

  insert into public.exercise_sets (
    owner_id,
    session_exercise_id,
    set_number,
    weight,
    reps,
    is_warmup,
    reported_rir_bucket,
    rir_source
  )
  values (
    session_owner_id,
    new_exercise_record.id,
    1,
    null,
    null,
    false,
    null,
    null
  )
  returning * into new_set_record;

  return jsonb_build_object(
    'id', new_exercise_record.id,
    'session_id', new_exercise_record.session_id,
    'exercise_order', new_exercise_record.exercise_order,
    'exercise_id', new_exercise_record.exercise_id,
    'gym_equipment_id', new_exercise_record.gym_equipment_id,
    'equipment_name_snapshot', new_exercise_record.equipment_name_snapshot,
    'initial_set_id', new_set_record.id
  );
end;
$$;

create or replace function public.remove_session_exercise(
  p_session_exercise_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  target_session_id bigint;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  -- Verify active session ownership and lock session row
  select ws.id into target_session_id
  from public.session_exercises se
  join public.workout_sessions ws
    on ws.id = se.session_id and ws.owner_id = se.owner_id
  where se.id = p_session_exercise_id
    and se.owner_id = session_owner_id
    and ws.status = 'in_progress'
  for update of ws;

  if not found then
    raise exception using errcode = '42501', message = 'Session exercise not found, not active, or not owned by current user.';
  end if;

  delete from public.session_exercises
  where id = p_session_exercise_id and owner_id = session_owner_id;

  with ordered as (
    select id, row_number() over (order by exercise_order, id)::integer as new_order
    from public.session_exercises
    where session_id = target_session_id and owner_id = session_owner_id
  )
  update public.session_exercises se
  set exercise_order = ordered.new_order
  from ordered
  where se.id = ordered.id and se.exercise_order <> ordered.new_order;

  return true;
end;
$$;

create or replace function public.remove_exercise_set(
  p_set_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  target_session_exercise_id bigint;
  target_session_id bigint;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  -- Verify active session ownership and lock session row
  select se.id, ws.id
  into target_session_exercise_id, target_session_id
  from public.exercise_sets es
  join public.session_exercises se
    on se.id = es.session_exercise_id and se.owner_id = es.owner_id
  join public.workout_sessions ws
    on ws.id = se.session_id and ws.owner_id = se.owner_id
  where es.id = p_set_id
    and es.owner_id = session_owner_id
    and ws.status = 'in_progress'
  for update of ws;

  if not found then
    raise exception using errcode = '42501', message = 'Set not found, not active, or not owned by current user.';
  end if;

  delete from public.exercise_sets
  where id = p_set_id and owner_id = session_owner_id;

  with ordered as (
    select id, row_number() over (order by set_number, id)::smallint as new_set_number
    from public.exercise_sets
    where session_exercise_id = target_session_exercise_id and owner_id = session_owner_id
  )
  update public.exercise_sets es
  set set_number = ordered.new_set_number
  from ordered
  where es.id = ordered.id and es.set_number <> ordered.new_set_number;

  return true;
end;
$$;

revoke all on function public.add_session_exercise(bigint, bigint, bigint) from public, anon;
revoke all on function public.remove_session_exercise(bigint) from public, anon;
revoke all on function public.remove_exercise_set(bigint) from public, anon;

grant execute on function public.add_session_exercise(bigint, bigint, bigint) to authenticated;
grant execute on function public.remove_session_exercise(bigint) to authenticated;
grant execute on function public.remove_exercise_set(bigint) to authenticated;
