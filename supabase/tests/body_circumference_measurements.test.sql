begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('public', 'body_circumference_measurements', 'circumference table exists');
select has_column('public', 'body_circumference_measurements', 'site', 'site identity is stored');
select has_column('public', 'body_circumference_measurements', 'measured_at', 'observation time is stored');
select has_column('public', 'body_circumference_measurements', 'circumference_cm', 'centimetres are stored');

insert into auth.users (id) values
  ('40000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($sql$
  insert into public.body_circumference_measurements (id, owner_id, site, measured_at, circumference_cm) values
    (1001, '40000000-0000-0000-0000-000000000001', 'waist', '2026-09-01 08:00+00', 83.2),
    (1002, '40000000-0000-0000-0000-000000000001', 'chest', '2026-09-01 08:05+00', 105.4),
    (1003, '40000000-0000-0000-0000-000000000001', 'waist', '2026-09-08 08:00+00', 82.7)
$sql$, 'owner can create observations');
select is((select count(*) from public.body_circumference_measurements), 3::bigint, 'owner sees own observations');
select lives_ok($sql$update public.body_circumference_measurements set circumference_cm = 82.4 where id = 1001$sql$, 'owner can correct an observation');
select is((select circumference_cm from public.body_circumference_measurements where id = 1001), 82.4::numeric, 'correction persists');
select lives_ok($sql$delete from public.body_circumference_measurements where id = 1002$sql$, 'owner can delete an observation');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.body_circumference_measurements), 0::bigint, 'second owner cannot read first owner observations');
select lives_ok($sql$update public.body_circumference_measurements set circumference_cm = 10 where id = 1001$sql$, 'cross-owner update is filtered by RLS');
select lives_ok($sql$delete from public.body_circumference_measurements where id = 1003$sql$, 'cross-owner delete is filtered by RLS');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.body_circumference_measurements), 2::bigint, 'cross-owner mutation attempts changed nothing');

select * from finish();
rollback;
