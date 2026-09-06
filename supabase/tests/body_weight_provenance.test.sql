begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

select has_column('public', 'body_weight_measurements', 'source_kind', 'body weight stores source kind');
select has_column('public', 'body_weight_measurements', 'source_record_key', 'body weight stores deterministic source identity');
select has_column('public', 'body_weight_measurements', 'measured_at', 'body weight stores exact source timestamps when available');
select has_column('public', 'body_weight_measurements', 'source_name', 'body weight stores source display name');
select has_column('public', 'body_weight_measurements', 'source_bundle_identifier', 'body weight stores source bundle identifier');
select has_function('public', 'sync_apple_health_body_weight', array['jsonb'], 'Apple Health body-weight sync function exists');
select has_function('public', 'body_weight_daily_series', array['date', 'date'], 'daily body-weight series supports optional range bounds');

insert into auth.users (id, email)
values
  ('30000000-0000-0000-0000-000000000001', 'body-weight-owner-one@example.test'),
  ('30000000-0000-0000-0000-000000000002', 'body-weight-owner-two@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($apple_health_sync$
  select * from public.sync_apple_health_body_weight(
    '[
      {
        "source_record_key":"bodyMass|com.sbs.diet|2026-09-01T08:00:00Z|81.4",
        "source_name":"MacroFactor",
        "source_bundle_identifier":"com.sbs.diet",
        "measured_at":"2026-09-01T08:00:00Z",
        "measured_on":"2026-09-01",
        "weight_kg":81.4
      },
      {
        "source_record_key":"bodyMass|com.sbs.diet|2026-09-01T18:00:00Z|81.2",
        "source_name":"MacroFactor",
        "source_bundle_identifier":"com.sbs.diet",
        "measured_at":"2026-09-01T18:00:00Z",
        "measured_on":"2026-09-01",
        "weight_kg":81.2
      }
    ]'::jsonb
  )
$apple_health_sync$, 'two distinct Apple Health samples on one day can be synced');

select is(
  (select count(*) from public.body_weight_measurements),
  2::bigint,
  'both Apple Health samples are stored as raw observations'
);
select is(
  (select count(distinct measured_on) from public.body_weight_measurements),
  1::bigint,
  'same-day Apple Health samples keep one calendar date without being collapsed'
);
select is(
  (select weight_kg from public.body_weight_daily_series(date '2026-09-01', date '2026-09-01')),
  81.2::numeric,
  'daily analytics use the latest timestamped measurement for a day'
);
select is(
  (select inserted_count from public.sync_apple_health_body_weight(
    '[
      {
        "source_record_key":"bodyMass|com.sbs.diet|2026-09-01T08:00:00Z|81.4",
        "source_name":"MacroFactor",
        "source_bundle_identifier":"com.sbs.diet",
        "measured_at":"2026-09-01T08:00:00Z",
        "measured_on":"2026-09-01",
        "weight_kg":81.4
      },
      {
        "source_record_key":"bodyMass|com.sbs.diet|2026-09-01T18:00:00Z|81.2",
        "source_name":"MacroFactor",
        "source_bundle_identifier":"com.sbs.diet",
        "measured_at":"2026-09-01T18:00:00Z",
        "measured_on":"2026-09-01",
        "weight_kg":81.2
      }
    ]'::jsonb
  )),
  0::bigint,
  'replaying the same Apple Health samples inserts nothing'
);
select is(
  (select count(*) from public.body_weight_measurements),
  2::bigint,
  'idempotent replay leaves the raw observation count unchanged'
);

select lives_ok($csv_import$
  select * from public.import_body_weight(
    'body-weight-export.csv',
    repeat('a', 64),
    repeat('b', 64),
    '[{"source_row":2,"measured_on":"2026-09-01","weight_kg":80.9}]'::jsonb
  )
$csv_import$, 'CSV body-weight import still works alongside Apple Health data');
select is(
  (select count(*) from public.body_weight_measurements where measured_on = date '2026-09-01'),
  3::bigint,
  'CSV and Apple Health observations can coexist on the same date'
);
select is(
  (select weight_kg from public.body_weight_daily_series(date '2026-09-01', date '2026-09-01')),
  81.2::numeric,
  'timestamped Apple Health data remains the deterministic daily representative when CSV shares the date'
);

select lives_ok($csv_correction$
  select * from public.import_body_weight(
    'body-weight-export-correction.csv',
    repeat('c', 64),
    repeat('d', 64),
    '[{"source_row":2,"measured_on":"2026-09-01","weight_kg":80.8}]'::jsonb
  )
$csv_correction$, 'later CSV imports still correct the canonical CSV observation for an overlapping date');
select is(
  (select count(*) from public.body_weight_measurements where source_kind = 'csv_import' and measured_on = date '2026-09-01'),
  1::bigint,
  'CSV correction semantics still keep at most one CSV observation per owner and date'
);
select is(
  (select count(*) from public.body_weight_measurements where source_kind = 'apple_health'),
  2::bigint,
  'CSV correction does not overwrite Apple Health observations'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.body_weight_measurements),
  0::bigint,
  'another owner cannot read the first owner body-weight observations'
);
select is(
  (select inserted_count from public.sync_apple_health_body_weight(
    '[{
      "source_record_key":"bodyMass|com.sbs.diet|2026-09-01T08:00:00Z|81.4",
      "source_name":"MacroFactor",
      "source_bundle_identifier":"com.sbs.diet",
      "measured_at":"2026-09-01T08:00:00Z",
      "measured_on":"2026-09-01",
      "weight_kg":81.4
    }]'::jsonb
  )),
  1::bigint,
  'the same source record key may be used independently by another owner'
);
select is(
  (select count(*) from public.body_weight_measurements),
  1::bigint,
  'the second owner sees only their own synced measurement'
);

select * from finish();
rollback;
