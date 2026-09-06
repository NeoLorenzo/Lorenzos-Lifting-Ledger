begin;

create or replace function public.update_session_history_exercise(
  p_session_exercise_id bigint,
  p_equipment_id text,
  p_set_updates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  correction_owner_id uuid := (select auth.uid());
  submitted_updates jsonb := coalesce(p_set_updates, '[]'::jsonb);
  target_exercise public.session_exercises;
  submitted_set_count integer;
  existing_set_count integer;
  saved_payload jsonb;
begin
  if correction_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if jsonb_typeof(submitted_updates) <> 'array' then
    raise exception using errcode = '22023', message = 'Set updates must be a JSON array.';
  end if;

  select se.* into target_exercise
  from public.session_exercises se
  join public.workout_sessions ws
    on ws.id = se.session_id
   and ws.owner_id = se.owner_id
  where se.id = p_session_exercise_id
    and se.owner_id = correction_owner_id
    and ws.status = 'completed'
  for update of se;

  if not found then
    raise exception using errcode = '42501', message = 'Completed session exercise not found or not owned by the current user.';
  end if;

  -- Lock the current child set collection so validation and mutation use one stable snapshot.
  perform 1
  from public.exercise_sets es
  where es.session_exercise_id = p_session_exercise_id
    and es.owner_id = correction_owner_id
  for update;

  select jsonb_array_length(submitted_updates) into submitted_set_count;

  select count(*)::integer into existing_set_count
  from public.exercise_sets es
  where es.session_exercise_id = p_session_exercise_id
    and es.owner_id = correction_owner_id;

  -- Parse every submitted row before mutating anything. Invalid JSON field types fail here.
  if exists (
    select 1
    from jsonb_to_recordset(submitted_updates) as submitted(
      id bigint,
      weight numeric,
      reps integer,
      is_warmup boolean,
      reported_rir_bucket smallint
    )
    where submitted.id is null
       or submitted.is_warmup is null
       or (submitted.weight is not null and submitted.weight < 0)
       or (submitted.reps is not null and submitted.reps < 0)
       or (
         submitted.reported_rir_bucket is not null
         and (submitted.reported_rir_bucket < 0 or submitted.reported_rir_bucket > 4)
       )
       or (submitted.is_warmup and submitted.reported_rir_bucket is not null)
       or (not submitted.is_warmup and submitted.reported_rir_bucket is null)
  ) then
    raise exception using errcode = '22023', message = 'One or more submitted set values are invalid.';
  end if;

  if exists (
    select submitted.id
    from jsonb_to_recordset(submitted_updates) as submitted(id bigint)
    group by submitted.id
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Duplicate set IDs are not allowed.';
  end if;

  if submitted_set_count <> existing_set_count
     or exists (
       select 1
       from jsonb_to_recordset(submitted_updates) as submitted(id bigint)
       left join public.exercise_sets es
         on es.id = submitted.id
        and es.session_exercise_id = p_session_exercise_id
        and es.owner_id = correction_owner_id
       where es.id is null
     ) then
    raise exception using errcode = '22023', message = 'Submitted set IDs do not exactly match the current exercise sets.';
  end if;

  update public.session_exercises
  set equipment_id = p_equipment_id
  where id = p_session_exercise_id
    and owner_id = correction_owner_id
  returning * into target_exercise;

  with submitted as (
    select *
    from jsonb_to_recordset(submitted_updates) as parsed(
      id bigint,
      weight numeric,
      reps integer,
      is_warmup boolean,
      reported_rir_bucket smallint
    )
  )
  update public.exercise_sets es
  set weight = submitted.weight,
      reps = submitted.reps,
      is_warmup = submitted.is_warmup,
      reported_rir_bucket = submitted.reported_rir_bucket,
      rir_source = case when submitted.is_warmup then null else 'user_entered' end
  from submitted
  where es.id = submitted.id
    and es.session_exercise_id = p_session_exercise_id
    and es.owner_id = correction_owner_id;

  select jsonb_build_object(
    'id', target_exercise.id,
    'equipment_id', target_exercise.equipment_id,
    'sets', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', es.id,
          'weight', es.weight,
          'reps', es.reps,
          'is_warmup', es.is_warmup,
          'reported_rir_bucket', es.reported_rir_bucket,
          'rir_source', es.rir_source,
          'estimated_1rm_brzycki', es.estimated_1rm_brzycki,
          'estimated_1rm_epley', es.estimated_1rm_epley,
          'estimated_1rm_brzycki_rir_adjusted', es.estimated_1rm_brzycki_rir_adjusted,
          'estimated_1rm_epley_rir_adjusted', es.estimated_1rm_epley_rir_adjusted
        ) order by es.set_number, es.id
      ) filter (where es.id is not null),
      '[]'::jsonb
    )
  ) into saved_payload
  from public.exercise_sets es
  where es.session_exercise_id = p_session_exercise_id
    and es.owner_id = correction_owner_id;

  return saved_payload;
end;
$$;

revoke all on function public.update_session_history_exercise(bigint, text, jsonb) from public;
revoke all on function public.update_session_history_exercise(bigint, text, jsonb) from anon;
grant execute on function public.update_session_history_exercise(bigint, text, jsonb) to authenticated;

commit;
