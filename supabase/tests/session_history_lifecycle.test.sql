begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column(
  'public',
  'workout_sessions',
  'is_historical_correction',
  'workout_sessions records historical correction mode'
);

create temporary table lifecycle_test_ids (
  c_session_id bigint,
  c_exercise_id bigint,
  c_set_id bigint
);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'history-lifecycle-user-1@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'history-lifecycle-user-2@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.gyms (owner_id, name)
values ('50000000-0000-0000-0000-000000000001', 'Correction Gym');

insert into public.workout_sessions (owner_id, gym_id, performed_on, status)
values
  ('50000000-0000-0000-0000-000000000001', (select id from public.gyms where name = 'Correction Gym'), date '2026-09-01', 'completed'),
  ('50000000-0000-0000-0000-000000000001', (select id from public.gyms where name = 'Correction Gym'), date '2026-09-02', 'completed'),
  ('50000000-0000-0000-0000-000000000001', (select id from public.gyms where name = 'Correction Gym'), date '2026-09-03', 'completed');

insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id)
values (
  '50000000-0000-0000-0000-000000000001',
  (select id from public.workout_sessions where performed_on = date '2026-09-03'),
  1,
  (select id from public.exercises order by id limit 1)
);

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
  '50000000-0000-0000-0000-000000000001',
  (select se.id
   from public.session_exercises se
   join public.workout_sessions ws on ws.id = se.session_id
   where ws.performed_on = date '2026-09-03'),
  1,
  50,
  10,
  false,
  1,
  'user_entered'
);

insert into lifecycle_test_ids (c_session_id, c_exercise_id, c_set_id)
select ws.id, se.id, es.id
from public.workout_sessions ws
join public.session_exercises se on se.session_id = ws.id
join public.exercise_sets es on es.session_exercise_id = se.id
where ws.performed_on = date '2026-09-03';

select lives_ok($sql$
  select public.reopen_completed_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-01')
  );
$sql$, 'a completed workout can be reopened for correction');

select is(
  (select status from public.workout_sessions where performed_on = date '2026-09-01'),
  'in_progress',
  'reopened workout becomes the active session'
);

select is(
  (select is_historical_correction from public.workout_sessions where performed_on = date '2026-09-01'),
  true,
  'reopened workout is marked as a historical correction'
);

select is(
  (select performed_on from public.workout_sessions where performed_on = date '2026-09-01'),
  date '2026-09-01',
  'reopening preserves the original workout date'
);

select lives_ok($sql$
  select public.add_session_exercise(
    (select id from public.workout_sessions where performed_on = date '2026-09-01'),
    (select id from public.exercises order by id limit 1),
    null::bigint
  );
$sql$, 'reopened workouts reuse the live structural editing RPCs');

select throws_ok($sql$
  select public.cancel_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-01')
  );
$sql$, '22023', 'Historical correction sessions cannot be cancelled; finish the correction instead.', 'historical corrections cannot be deleted through the live cancel lifecycle');

select throws_ok($sql$
  select public.reopen_completed_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-02')
  );
$sql$, '22023', 'Finish or cancel the active workout before reopening a completed session.', 'another completed workout cannot be reopened while a session is active');

select lives_ok($sql$
  select public.conclude_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-01')
  );
$sql$, 'finishing a correction completes the original session again');

select is(
  (select status from public.workout_sessions where performed_on = date '2026-09-01'),
  'completed',
  'finished correction returns the workout to completed state'
);

select is(
  (select is_historical_correction from public.workout_sessions where performed_on = date '2026-09-01'),
  false,
  'finished correction clears historical correction mode'
);

select lives_ok($sql$
  select public.reopen_completed_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-02')
  );
$sql$, 'a different historical workout can be reopened after the first correction finishes');

select throws_ok($sql$
  select public.delete_completed_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-02')
  );
$sql$, '22023', 'Only completed workout sessions can be deleted from Session History.', 'an active correction cannot be deleted through the history delete lifecycle');

select lives_ok($sql$
  select public.conclude_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-02')
  );
$sql$, 'the second correction can be finished normally');

select is(
  (select public.delete_completed_workout_session(
    (select c_session_id from lifecycle_test_ids)
  )),
  true,
  'completed history deletion succeeds'
);

select is(
  (select count(*) from public.workout_sessions where id = (select c_session_id from lifecycle_test_ids)),
  0::bigint,
  'history deletion removes the target workout session'
);

select is(
  (select count(*) from public.session_exercises where id = (select c_exercise_id from lifecycle_test_ids)),
  0::bigint,
  'history deletion cascades to session exercises'
);

select is(
  (select count(*) from public.exercise_sets where id = (select c_set_id from lifecycle_test_ids)),
  0::bigint,
  'history deletion cascades to exercise sets'
);

select is(
  (select count(*) from public.workout_sessions where performed_on in (date '2026-09-01', date '2026-09-02')),
  2::bigint,
  'history deletion leaves unrelated workout sessions intact'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok($sql$
  select public.reopen_completed_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-01')
  );
$sql$, '42501', 'Session not found or not owned by current user.', 'another owner cannot reopen the workout');

select throws_ok($sql$
  select public.delete_completed_workout_session(
    (select id from public.workout_sessions where performed_on = date '2026-09-01')
  );
$sql$, '42501', 'Session not found or not owned by current user.', 'another owner cannot delete the workout');

select * from finish();
rollback;
