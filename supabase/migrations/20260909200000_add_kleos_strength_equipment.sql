begin;

drop function if exists public.get_kleos_strength_snapshot(uuid);

create function public.get_kleos_strength_snapshot(p_owner_id uuid)
returns table (
  exercise_id bigint,
  exercise_name text,
  equipment_name text,
  best_1rm numeric,
  qualifying_sessions bigint,
  achieved_on date,
  estimation_basis text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidate_sets as (
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
  )
  select
    ranked_sets.exercise_id,
    ranked_sets.exercise_name,
    ranked_sets.equipment_name,
    ranked_sets.estimated_1rm as best_1rm,
    ranked_sets.session_count as qualifying_sessions,
    ranked_sets.performed_on as achieved_on,
    'observed_e1rm_high'::text as estimation_basis
  from ranked_sets
  where ranked_sets.rank = 1
  order by ranked_sets.exercise_name, ranked_sets.exercise_id;
$$;

comment on function public.get_kleos_strength_snapshot(uuid) is
  'Service-only read export for one owner. Returns one row per exercise trained in at least 3 distinct completed sessions across today plus the preceding 29 calendar dates. equipment_name is the historical session equipment snapshot attached to the set that produced best_1rm. best_1rm is the highest positive estimated_1rm_high from non-warm-up RIR 0-3 working sets; estimated_1rm_high is the upper observed Brzycki/Epley estimate and is not a measured true 1RM.';

revoke all on function public.get_kleos_strength_snapshot(uuid) from public;
revoke all on function public.get_kleos_strength_snapshot(uuid) from anon;
revoke all on function public.get_kleos_strength_snapshot(uuid) from authenticated;
grant execute on function public.get_kleos_strength_snapshot(uuid) to service_role;

commit;
