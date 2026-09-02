begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select count(*) from auth.users), 0::bigint, 'bootstrap creates no auth users');
select is((select count(*) from public.exercises), 138::bigint, 'canonical global exercise catalogue has 138 rows');
select is((select count(distinct name) from public.exercises), 138::bigint, 'canonical exercise names are unique');
select is((select count(*) from public.exercises where code = 'exercise_' || id::text), 137::bigint, 'legacy exercise codes remain paired to stable IDs');
select is((select count(*) from public.exercises where code = 'exercise_press_machine_incline_plate_loaded_close_neutral_grip'), 1::bigint, 'consolidated close-neutral-grip exercise retains its canonical code');
select is((select count(*) from public.movement_patterns), 40::bigint, 'canonical movement-pattern catalogue has 40 rows');
select is((select count(*) from public.muscles), 40::bigint, 'canonical muscle catalogue has 40 rows');
select is((select count(*) from public.movement_mapping_versions where is_current), 1::bigint, 'one exercise-to-pattern mapping version is current');
select is((select count(*) from public.exercise_muscle_mapping_versions where is_current), 1::bigint, 'one derived exercise-to-muscle mapping version is current');
select is((select count(*) from public.exercise_muscle_relevance_versions where is_current), 1::bigint, 'one exercise-to-muscle relevance mapping version is current');
select is((select count(*) from public.exercise_movement_pattern_coefficients where mapping_version_id = (select id from public.movement_mapping_versions where is_current)), 5520::bigint, 'current exercise-to-pattern mapping is complete');
select is((select count(*) from public.exercise_muscle_coefficients where mapping_version_id = (select id from public.exercise_muscle_mapping_versions where is_current)), 5520::bigint, 'current derived exercise-to-muscle mapping is complete');
select is((select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = (select id from public.exercise_muscle_relevance_versions where is_current)), 5520::bigint, 'current exercise-to-muscle relevance mapping is complete');
select ok(not exists (
  select 1 from public.data_imports
  union all select 1 from public.gyms
  union all select 1 from public.gym_equipment
  union all select 1 from public.workout_sessions
  union all select 1 from public.session_exercises
  union all select 1 from public.exercise_sets
  union all select 1 from public.workout_presets
  union all select 1 from public.workout_preset_exercises
  union all select 1 from public.body_weight_measurements
  union all select 1 from public.user_settings
), 'owner-scoped history and settings tables begin empty');

select * from finish();
rollback;
