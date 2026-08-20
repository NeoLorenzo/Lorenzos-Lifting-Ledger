begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

select hasnt_table('public', 'lift_entries', 'legacy lift_entries is absent');
select hasnt_table('public', 'lift_sets', 'legacy lift_sets is absent');
select hasnt_table('public', 'exercise_aliases', 'exercise aliases are absent');
select hasnt_column('public', 'session_exercises', 'exercise', 'historical exercise label is absent');
select hasnt_column('public', 'session_exercises', 'import_id', 'workout import ID is absent');
select hasnt_column('public', 'session_exercises', 'source_row', 'workout source row is absent');
select has_column('public', 'session_exercises', 'exercise_id', 'canonical exercise ID remains');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.session_exercises'::regclass
    and confrelid = 'public.exercises'::regclass
    and contype = 'f'
), 'session exercises retain the exercise foreign key');
select ok(not exists (
  select 1 from public.session_exercises session_exercise
  left join public.exercises exercise on exercise.id = session_exercise.exercise_id
  where exercise.id is null
), 'every persisted session exercise resolves to an exercise');
select ok(not exists (
  select 1 from public.data_imports where import_kind <> 'body_weight'
), 'legacy lifting-history import records are absent');
select has_function('public', 'import_body_weight', array['text', 'text', 'text', 'jsonb'], 'body-weight import function remains');
select has_function('public', 'body_weight_daily_series', array[]::text[], 'body-weight daily series remains');
select has_function('public', 'delete_body_weight_data', array[]::text[], 'body-weight deletion remains');
select ok((select relrowsecurity from pg_class where oid = 'public.body_weight_measurements'::regclass), 'body-weight RLS remains enabled');

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'canonical-one@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'canonical-two@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.gyms (owner_id, name)
values ('10000000-0000-0000-0000-000000000001', 'Owner One Gym');
insert into public.workout_sessions (owner_id, gym_id, performed_on, status)
select '10000000-0000-0000-0000-000000000001', id, date '2026-08-20', 'completed'
from public.gyms where owner_id = '10000000-0000-0000-0000-000000000001';
insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id, equipment_id)
select '10000000-0000-0000-0000-000000000001', session.id, 1, exercise.id, 'Machine A'
from public.workout_sessions session cross join lateral (select id from public.exercises order by id limit 1) exercise
where session.owner_id = '10000000-0000-0000-0000-000000000001';
insert into public.exercise_sets (owner_id, session_exercise_id, set_number, weight, reps)
select '10000000-0000-0000-0000-000000000001', id, 1, 100, 8
from public.session_exercises where owner_id = '10000000-0000-0000-0000-000000000001';

select is((select count(*) from public.workout_sessions), 1::bigint, 'an owner can see their workout session');
select is((select count(*) from public.exercise_sets where weight = 100 and reps = 8), 1::bigint, 'canonical set values and generated hierarchy persist');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.workout_sessions), 0::bigint, 'another owner cannot see the first owner workout');

select lives_ok($body_import$
  select * from public.import_body_weight(
    'body-weight-export.csv',
    repeat('a', 64),
    repeat('b', 64),
    '[{"source_row":2,"measured_on":"2026-08-18","weight_kg":80.5}]'::jsonb
  )
$body_import$, 'body-weight import remains callable by an authenticated owner');
select is((select count(*) from public.body_weight_measurements), 1::bigint, 'import creates one owner-visible measurement');
select ok(not exists (
  select 1 from public.data_imports where import_kind <> 'body_weight'
), 'new provenance uses body_weight semantics only');

insert into public.user_settings (owner_id, relative_e1rm_enabled)
values ('10000000-0000-0000-0000-000000000002', true);
select lives_ok('select public.delete_body_weight_data()', 'body-weight deletion remains callable');
select is((select count(*) from public.body_weight_measurements), 0::bigint, 'body-weight deletion removes only the current owner measurements');
select is((select relative_e1rm_enabled from public.user_settings where owner_id = '10000000-0000-0000-0000-000000000002'), false, 'body-weight deletion resets relative e1RM');

select * from finish();
rollback;
