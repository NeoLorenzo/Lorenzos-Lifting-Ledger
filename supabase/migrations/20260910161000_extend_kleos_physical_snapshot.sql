begin;

drop function if exists public.get_kleos_strength_snapshot(uuid);

create function public.get_kleos_strength_snapshot(p_owner_id uuid)
returns table (
  exercise_id bigint,
  exercise_name text,
  equipment_name text,
  best_1rm numeric,
  body_weight_kg_at_achieved numeric,
  body_weight_kind text,
  best_1rm_relative_bw numeric,
  qualifying_sessions bigint,
  achieved_on date,
  estimation_basis text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with daily_body_weight as (
    select distinct on (measurement.measured_on)
      measurement.measured_on,
      measurement.weight_kg
    from public.body_weight_measurements measurement
    where measurement.owner_id = p_owner_id
    order by
      measurement.measured_on,
      (measurement.measured_at is not null) desc,
      measurement.measured_at desc nulls last,
      (measurement.source_kind = 'apple_health') desc,
      measurement.created_at desc,
      measurement.id desc
  ),
  candidate_sets as (
    select
      ws.id as session_id,
      ws.performed_on,
      se.exercise_id,
      e.name as exercise_name,
      nullif(btrim(se.equipment_name_snapshot), '') as equipment_name,
      es.id as set_id,
      es.estimated_1rm_high as estimated_1rm
    from public.workout_sessions ws
    join public.session_exercises se
      on se.session_id = ws.id
     and se.owner_id = ws.owner_id
    join public.exercises e
      on e.id = se.exercise_id
    join public.exercise_sets es
      on es.session_exercise_id = se.id
     and es.owner_id = ws.owner_id
    where ws.owner_id = p_owner_id
      and ws.status = 'completed'
      and ws.performed_on >= current_date - 29
      and not es.is_warmup
      and es.reported_rir_bucket between 0 and 3
      and es.estimated_1rm_high > 0
  ),
  eligible_exercises as (
    select
      candidate_sets.exercise_id,
      count(distinct candidate_sets.session_id) as session_count
    from candidate_sets
    group by candidate_sets.exercise_id
    having count(distinct candidate_sets.session_id) >= 3
  ),
  ranked_sets as (
    select
      candidate_sets.*,
      eligible_exercises.session_count,
      row_number() over (
        partition by candidate_sets.exercise_id
        order by
          candidate_sets.estimated_1rm desc,
          candidate_sets.performed_on desc,
          candidate_sets.set_id desc
      ) as rank
    from candidate_sets
    join eligible_exercises
      on eligible_exercises.exercise_id = candidate_sets.exercise_id
  ),
  winners as (
    select *
    from ranked_sets
    where rank = 1
  ),
  weight_context as (
    select
      winners.*,
      (
        select daily.weight_kg
        from daily_body_weight daily
        where daily.measured_on = winners.performed_on
        limit 1
      ) as exact_weight_kg,
      (
        select daily.measured_on
        from daily_body_weight daily
        where daily.measured_on < winners.performed_on
        order by daily.measured_on desc
        limit 1
      ) as previous_measured_on,
      (
        select daily.weight_kg
        from daily_body_weight daily
        where daily.measured_on < winners.performed_on
        order by daily.measured_on desc
        limit 1
      ) as previous_weight_kg,
      (
        select daily.measured_on
        from daily_body_weight daily
        where daily.measured_on > winners.performed_on
        order by daily.measured_on
        limit 1
      ) as next_measured_on,
      (
        select daily.weight_kg
        from daily_body_weight daily
        where daily.measured_on > winners.performed_on
        order by daily.measured_on
        limit 1
      ) as next_weight_kg
    from winners
  ),
  weighted_winners as (
    select
      weight_context.*,
      case
        when exact_weight_kg is not null then exact_weight_kg
        when previous_measured_on is not null and next_measured_on is not null then
          previous_weight_kg
          + (next_weight_kg - previous_weight_kg)
            * ((performed_on - previous_measured_on)::numeric
              / (next_measured_on - previous_measured_on)::numeric)
      end as resolved_body_weight_kg,
      case
        when exact_weight_kg is not null then 'measured'::text
        when previous_measured_on is not null and next_measured_on is not null then 'interpolated'::text
      end as resolved_body_weight_kind
    from weight_context
  )
  select
    weighted_winners.exercise_id,
    weighted_winners.exercise_name,
    weighted_winners.equipment_name,
    weighted_winners.estimated_1rm as best_1rm,
    weighted_winners.resolved_body_weight_kg as body_weight_kg_at_achieved,
    weighted_winners.resolved_body_weight_kind as body_weight_kind,
    case
      when weighted_winners.resolved_body_weight_kg > 0 then
        weighted_winners.estimated_1rm / weighted_winners.resolved_body_weight_kg
    end as best_1rm_relative_bw,
    weighted_winners.session_count as qualifying_sessions,
    weighted_winners.performed_on as achieved_on,
    'observed_e1rm_high'::text as estimation_basis
  from weighted_winners
  order by weighted_winners.exercise_name, weighted_winners.exercise_id;
$$;

comment on function public.get_kleos_strength_snapshot(uuid) is
  'Service-only read export for one owner. Preserves the existing 30-day/3-session winning observed e1RM rule and attaches body weight plus e1RM/body-weight for the exact winning workout date. Body weight follows Heracles daily representative/interpolation semantics and is null outside measured coverage; no extrapolation is performed.';

revoke all on function public.get_kleos_strength_snapshot(uuid) from public;
revoke all on function public.get_kleos_strength_snapshot(uuid) from anon;
revoke all on function public.get_kleos_strength_snapshot(uuid) from authenticated;
grant execute on function public.get_kleos_strength_snapshot(uuid) to service_role;

drop function if exists public.get_kleos_current_body_weight(uuid);

create function public.get_kleos_current_body_weight(p_owner_id uuid)
returns table (
  weight_kg numeric,
  measured_on date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with daily_body_weight as (
    select distinct on (measurement.measured_on)
      measurement.measured_on,
      measurement.weight_kg
    from public.body_weight_measurements measurement
    where measurement.owner_id = p_owner_id
    order by
      measurement.measured_on,
      (measurement.measured_at is not null) desc,
      measurement.measured_at desc nulls last,
      (measurement.source_kind = 'apple_health') desc,
      measurement.created_at desc,
      measurement.id desc
  )
  select
    daily_body_weight.weight_kg,
    daily_body_weight.measured_on
  from daily_body_weight
  order by daily_body_weight.measured_on desc
  limit 1;
$$;

comment on function public.get_kleos_current_body_weight(uuid) is
  'Service-only read export for the latest actual Heracles body-weight daily representative. It returns the latest measured calendar date and does not extrapolate body weight to today.';

revoke all on function public.get_kleos_current_body_weight(uuid) from public;
revoke all on function public.get_kleos_current_body_weight(uuid) from anon;
revoke all on function public.get_kleos_current_body_weight(uuid) from authenticated;
grant execute on function public.get_kleos_current_body_weight(uuid) to service_role;

commit;
