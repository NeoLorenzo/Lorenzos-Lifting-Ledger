begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email)
values ('20000000-0000-0000-0000-000000000036', 'theneolorenzo@gmail.com');

create temporary table selected_exercises as
select id, name, row_number() over (order by id) as ordinal
from public.exercises
order by id
limit 2;

select is((select count(*) from selected_exercises), 2::bigint, 'test catalogue contains two exercises');

insert into public.workout_sessions (owner_id, performed_on, status)
values
  ('20000000-0000-0000-0000-000000000036', current_date, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 1, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 2, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 30, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 3, 'in_progress');

-- Exercise 1 appears in three qualifying recent completed sessions, plus one old
-- completed session and one in-progress session that must not count.
insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id)
select
  session.owner_id,
  session.id,
  1,
  exercise.id
from public.workout_sessions session
cross join (select id from selected_exercises where ordinal = 1) exercise
where session.owner_id = '20000000-0000-0000-0000-000000000036';

-- Exercise 2 appears in only two qualifying sessions and must be omitted.
insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id)
select
  session.owner_id,
  session.id,
  2,
  exercise.id
from public.workout_sessions session
cross join (select id from selected_exercises where ordinal = 2) exercise
where session.owner_id = '20000000-0000-0000-0000-000000000036'
  and session.status = 'completed'
  and session.performed_on in (current_date, current_date - 1);

-- Recent analytical working sets for exercise 1. The middle session is the best.
insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source
)
select
  exercise.owner_id,
  exercise.id,
  1,
  case session.performed_on
    when current_date then 100
    when current_date - 1 then 110
    when current_date - 2 then 105
    when current_date - 30 then 200
    when current_date - 3 then 220
  end,
  5,
  0,
  'user_entered'
from public.session_exercises exercise
join public.workout_sessions session
  on session.id = exercise.session_id
 and session.owner_id = exercise.owner_id
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 1;

-- A second valid set in one session proves qualification counts sessions, not sets.
insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source
)
select exercise.owner_id, exercise.id, 2, 90, 5, 0, 'user_entered'
from public.session_exercises exercise
join public.workout_sessions session on session.id = exercise.session_id
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 1
  and session.performed_on = current_date;

-- Warm-up and 4+ RIR history sets must not influence the exported maximum.
insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, is_warmup
)
select exercise.owner_id, exercise.id, 3, 300, 1, true
from public.session_exercises exercise
join public.workout_sessions session on session.id = exercise.session_id
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 1
  and session.performed_on = current_date;

insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source
)
select exercise.owner_id, exercise.id, 4, 400, 1, 4, 'user_entered'
from public.session_exercises exercise
join public.workout_sessions session on session.id = exercise.session_id
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 1
  and session.performed_on = current_date;

-- Exercise 2 has only two sessions despite valid working sets.
insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source
)
select exercise.owner_id, exercise.id, 1, 150, 5, 0, 'user_entered'
from public.session_exercises exercise
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 2;

select is((select count(*) from public.get_kleos_strength_snapshot()), 1::bigint, 'only exercises with at least three distinct qualifying sessions are exported');
select is((select qualifying_sessions from public.get_kleos_strength_snapshot()), 3::bigint, 'multiple sets in one workout still count as one session');
select is((select best_1rm from public.get_kleos_strength_snapshot()), 128.33::numeric, 'highest observed e1RM in the rolling window is selected');
select is((select achieved_on from public.get_kleos_strength_snapshot()), current_date - 1, 'export preserves the date of the selected set');
select is((select estimation_basis from public.get_kleos_strength_snapshot()), 'observed_e1rm_high'::text, 'export states the e1RM estimation basis');
select ok(not has_function_privilege('authenticated', 'public.get_kleos_strength_snapshot()', 'EXECUTE'), 'authenticated clients cannot execute the export RPC directly');
select ok(has_function_privilege('service_role', 'public.get_kleos_strength_snapshot()', 'EXECUTE'), 'service role may execute the narrow export RPC');

select * from finish();
rollback;
