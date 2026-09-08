begin;

create extension if not exists pgtap with schema extensions;
select plan(1);
select ok(false, 'intentional pgTAP validation probe for issue #34');
select * from finish();

rollback;
