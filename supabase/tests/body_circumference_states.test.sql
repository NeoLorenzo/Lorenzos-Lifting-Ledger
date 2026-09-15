begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column(
  'public',
  'body_circumference_measurements',
  'measurement_state',
  'measurement state is stored'
);

select is(
  (select column_default::text from information_schema.columns where table_schema = 'public' and table_name = 'body_circumference_measurements' and column_name = 'measurement_state'),
  '''relaxed''::text'::text,
  'measurement state defaults to relaxed for existing and legacy-style inserts'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.body_circumference_measurements'::regclass
      and conname = 'body_circumference_measurements_state_check'
      and pg_get_constraintdef(oid) like '%relaxed%'
      and pg_get_constraintdef(oid) like '%flexed%'
  ),
  'measurement state is constrained to the supported values'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.body_circumference_measurements'::regclass
      and conname = 'body_circumference_measurements_flexed_site_check'
      and pg_get_constraintdef(oid) like '%upper_arm_left%'
      and pg_get_constraintdef(oid) like '%upper_arm_right%'
  ),
  'flexed state is constrained to left and right upper arms'
);

select has_index(
  'public',
  'body_circumference_measurements',
  'body_circumference_measurements_owner_site_state_measured_at_idx',
  'site and state longitudinal lookup index exists'
);

select * from finish();
rollback;
