begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email)
values ('20000000-0000-0000-0000-000000000001', 'rir-model@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.workout_sessions (owner_id, performed_on, status)
values ('20000000-0000-0000-0000-000000000001', date '2026-08-20', 'completed');
insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id)
select '20000000-0000-0000-0000-000000000001', session.id, 1, exercise.id
from public.workout_sessions session
cross join lateral (select id from public.exercises order by id limit 1) exercise
where session.owner_id = '20000000-0000-0000-0000-000000000001';

select lives_ok($sql$
  insert into public.exercise_sets (owner_id, session_exercise_id, set_number, weight, reps, is_warmup)
  select owner_id, id, 1, 20, 10, true from public.session_exercises
  where owner_id = '20000000-0000-0000-0000-000000000001'
$sql$, 'warm-up without RIR is accepted');

select throws_ok($sql$
  insert into public.exercise_sets (owner_id, session_exercise_id, set_number, weight, reps, is_warmup, reported_rir_bucket, rir_source)
  select owner_id, id, 2, 20, 10, true, 2, 'user_entered' from public.session_exercises
  where owner_id = '20000000-0000-0000-0000-000000000001'
$sql$, '23514');

select lives_ok($sql$
  insert into public.exercise_sets (owner_id, session_exercise_id, set_number, weight, reps)
  select owner_id, id, 3, 100, 8 from public.session_exercises
  where owner_id = '20000000-0000-0000-0000-000000000001'
$sql$, 'working-set drafts without RIR are accepted until workout conclusion');

select throws_ok($sql$
  insert into public.exercise_sets (owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source)
  select owner_id, id, 4, 100, 8, 5, 'user_entered' from public.session_exercises
  where owner_id = '20000000-0000-0000-0000-000000000001'
$sql$, '23514');

insert into public.exercise_sets (owner_id, session_exercise_id, set_number, weight, reps, reported_rir_bucket, rir_source)
select owner_id, id, generated.rir + 5, 100, 8, generated.rir, 'user_entered'
from public.session_exercises
cross join generate_series(0, 4) generated(rir)
where owner_id = '20000000-0000-0000-0000-000000000001';

select is((select count(*) from public.exercise_sets where reported_rir_bucket between 0 and 3 and rir_source = 'user_entered'), 4::bigint, 'new RIR 0-3 writes retain user-entered provenance');
select is((select count(*) from public.exercise_sets where reported_rir_bucket = 4 and rir_source = 'user_entered'), 1::bigint, '4+ is stored as bucket 4 with user-entered provenance');
select is((select estimated_1rm_brzycki from public.exercise_sets where reported_rir_bucket = 2), 124.14::numeric, 'observed Brzycki uses completed reps');
select is((select estimated_1rm_epley from public.exercise_sets where reported_rir_bucket = 2), 126.67::numeric, 'observed Epley uses completed reps');
select is((select estimated_1rm_brzycki_rir_adjusted from public.exercise_sets where reported_rir_bucket = 2), 133.33::numeric, 'adjusted Brzycki uses reps plus RIR');
select is((select estimated_1rm_epley_rir_adjusted from public.exercise_sets where reported_rir_bucket = 2), 133.33::numeric, 'adjusted Epley uses reps plus RIR');
select ok((select estimated_1rm_brzycki_rir_adjusted is null and estimated_1rm_epley_rir_adjusted is null from public.exercise_sets where reported_rir_bucket = 4), '4+ has no finite adjusted e1RM pair');

select * from finish();
rollback;
