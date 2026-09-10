begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email)
values ('20000000-0000-0000-0000-000000000036', 'kleos-strength@example.test');

create temporary table selected_exercises as
select id, name, row_number() over (order by id) as ordinal
from public.exercises
order by id
limit 2;

select is((select count(*) from selected_exercises), 2::bigint, 'test catalogue contains two exercises');

insert into public.body_weight_measurements (
  owner_id, measured_on, measured_at, weight_kg, source_kind, source_record_key
)
values
  ('20000000-0000-0000-0000-000000000036', current_date - 2, now() - interval '2 days', 80, 'apple_health', 'test:kleos-bw:1'),
  ('20000000-0000-0000-0000-000000000036', current_date, now(), 82, 'apple_health', 'test:kleos-bw:2');

insert into public.workout_sessions (owner_id, performed_on, status)
values
  ('20000000-0000-0000-0000-000000000036', current_date, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 1, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 2, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 30, 'completed'),
  ('20000000-0000-0000-0000-000000000036', current_date - 3, 'in_progress');

insert into public.session_exercises (
  owner_id, session_id, exercise_order, exercise_id, equipment_name_snapshot
)
select
  session.owner_id,
  session.id,
  1,
  exercise.id,
  case session.performed_on
    when current_date then 'Current Machine'
    when current_date - 1 then 'Winning Machine'
    when current_date - 2 then 'Older Machine'
    when current_date - 30 then 'Outside Window Machine'
    when current_date - 3 then 'In Progress Machine'
  end
from public.workout_sessions session
cross join (select id from selected_exercises where ordinal = 1) exercise
where session.owner_id = '20000000-0000-0000-0000-000000000036';

insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id)
select session.owner_id, session.id, 2, exercise.id
from public.workout_sessions session
cross join (select id from selected_exercises where ordinal = 2) exercise
where session.owner_id = '20000000-0000-0000-0000-000000000036'
  and session.status = 'completed'
  and session.performed_on in (current_date, current_date - 1);

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

insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source
)
select exercise.owner_id, exercise.id, 2, 90, 5, 0, 'user_entered'
from public.session_exercises exercise
join public.workout_sessions session on session.id = exercise.session_id
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 1
  and session.performed_on = current_date;

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

insert into public.exercise_sets (
  owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source
)
select exercise.owner_id, exercise.id, 1, 150, 5, 0, 'user_entered'
from public.session_exercises exercise
where exercise.owner_id = '20000000-0000-0000-0000-000000000036'
  and exercise.exercise_order = 2;

select is((select count(*) from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 1::bigint, 'only exercises with at least three distinct qualifying sessions are exported');
select is((select qualifying_sessions from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 3::bigint, 'multiple sets in one workout still count as one session');
select is((select best_1rm from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 128.33::numeric, 'highest observed e1RM in the rolling window is selected');
select is((select equipment_name from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 'Winning Machine'::text, 'export carries equipment from the set that produced the selected e1RM');
select is((select achieved_on from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), current_date - 1, 'export preserves the date of the selected set');
select is((select body_weight_kg_at_achieved from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 81::numeric, 'winning lift uses interpolated body weight from the same workout date');
select is((select body_weight_kind from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 'interpolated'::text, 'export identifies interpolated body-weight provenance');
select is(
  round((select best_1rm_relative_bw from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 4),
  round(128.33::numeric / 81::numeric, 4),
  'relative e1RM divides the winning absolute e1RM by workout-date body weight'
);
select is((select estimation_basis from public.get_kleos_strength_snapshot('20000000-0000-0000-0000-000000000036')), 'observed_e1rm_high'::text, 'export states the e1RM estimation basis');
select is((select weight_kg from public.get_kleos_current_body_weight('20000000-0000-0000-0000-000000000036')), 82::numeric, 'current body weight is the latest actual daily representative');
select is((select measured_on from public.get_kleos_current_body_weight('20000000-0000-0000-0000-000000000036')), current_date, 'current body-weight export preserves its measurement date');
select ok(not has_function_privilege('authenticated', 'public.get_kleos_strength_snapshot(uuid)', 'EXECUTE'), 'authenticated clients cannot execute the strength export RPC directly');
select ok(has_function_privilege('service_role', 'public.get_kleos_strength_snapshot(uuid)', 'EXECUTE'), 'service role may execute the strength export RPC');
select ok(not has_function_privilege('authenticated', 'public.get_kleos_current_body_weight(uuid)', 'EXECUTE'), 'authenticated clients cannot execute the body-weight export RPC directly');
select ok(has_function_privilege('service_role', 'public.get_kleos_current_body_weight(uuid)', 'EXECUTE'), 'service role may execute the body-weight export RPC');

select * from finish();
rollback;
