begin;

alter table public.body_weight_measurements
  add column source_kind text,
  add column source_record_key text,
  add column measured_at timestamptz,
  add column source_name text,
  add column source_bundle_identifier text;

update public.body_weight_measurements measurement
set
  source_kind = 'csv_import',
  source_record_key = 'csv:' || measurement.import_id::text || ':' || measurement.source_row::text,
  source_name = data_import.source_file_name
from public.data_imports data_import
where data_import.id = measurement.import_id
  and data_import.owner_id = measurement.owner_id;

alter table public.body_weight_measurements
  alter column source_kind set not null,
  alter column source_record_key set not null,
  alter column import_id drop not null,
  alter column source_row drop not null;

alter table public.body_weight_measurements
  drop constraint body_weight_measurements_owner_id_measured_on_key;

alter table public.body_weight_measurements
  add constraint body_weight_measurements_source_kind_check
    check (source_kind in ('csv_import', 'apple_health')),
  add constraint body_weight_measurements_source_record_key_check
    check (btrim(source_record_key) <> ''),
  add constraint body_weight_measurements_source_shape_check
    check (
      (source_kind = 'csv_import'
        and import_id is not null
        and source_row is not null
        and measured_at is null)
      or
      (source_kind = 'apple_health'
        and import_id is null
        and source_row is null
        and measured_at is not null)
    ),
  add constraint body_weight_measurements_owner_source_key_key
    unique (owner_id, source_kind, source_record_key);

create unique index body_weight_measurements_owner_csv_date_key
  on public.body_weight_measurements (owner_id, measured_on)
  where source_kind = 'csv_import';

create index body_weight_measurements_owner_date_time_idx
  on public.body_weight_measurements (owner_id, measured_on, measured_at desc, id desc);

create or replace function public.import_body_weight(
  p_source_file_name text,
  p_source_sha256 text,
  p_canonical_sha256 text,
  p_rows jsonb
)
returns table (import_id uuid, measurement_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  import_owner_id uuid := (select auth.uid());
  body_import_id uuid;
begin
  if import_owner_id is null then raise exception 'Authentication required'; end if;
  if btrim(coalesce(p_source_file_name, '')) = '' then raise exception 'Source filename is required'; end if;
  if p_source_sha256 !~ '^[0-9a-f]{64}$' or p_canonical_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid SHA-256 provenance';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one measurement is required';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as item(source_row integer, measured_on date, weight_kg numeric)
    where item.source_row is null
      or item.source_row <= 0
      or item.measured_on is null
      or item.weight_kg is null
      or item.weight_kg <= 0
  ) then raise exception 'Invalid body-weight measurement payload'; end if;
  if exists (
    select item.measured_on
    from jsonb_to_recordset(p_rows) as item(source_row integer, measured_on date, weight_kg numeric)
    group by item.measured_on
    having count(*) > 1
  ) then raise exception 'Duplicate body-weight date in payload'; end if;

  insert into public.data_imports (
    owner_id, import_kind, source_file_name, source_sha256, canonical_sha256, source_row_count
  ) values (
    import_owner_id, 'body_weight', p_source_file_name, p_source_sha256, p_canonical_sha256, jsonb_array_length(p_rows)
  )
  on conflict (owner_id, import_kind, source_sha256) do update set
    source_file_name = excluded.source_file_name,
    canonical_sha256 = excluded.canonical_sha256,
    source_row_count = excluded.source_row_count,
    imported_at = now()
  returning id into body_import_id;

  insert into public.body_weight_measurements (
    owner_id,
    import_id,
    source_row,
    measured_on,
    weight_kg,
    source_kind,
    source_record_key,
    source_name
  )
  select
    import_owner_id,
    body_import_id,
    item.source_row,
    item.measured_on,
    item.weight_kg,
    'csv_import',
    'csv:' || body_import_id::text || ':' || item.source_row::text,
    p_source_file_name
  from jsonb_to_recordset(p_rows) as item(source_row integer, measured_on date, weight_kg numeric)
  on conflict (owner_id, measured_on) where source_kind = 'csv_import' do update set
    import_id = excluded.import_id,
    source_row = excluded.source_row,
    weight_kg = excluded.weight_kg,
    source_record_key = excluded.source_record_key,
    source_name = excluded.source_name,
    source_bundle_identifier = null,
    measured_at = null,
    created_at = now();

  return query
  select body_import_id, count(*)
  from public.body_weight_measurements measurement
  where measurement.owner_id = import_owner_id;
end;
$$;

create or replace function public.sync_apple_health_body_weight(p_rows jsonb)
returns table (inserted_count bigint, measurement_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sync_owner_id uuid := (select auth.uid());
  inserted_rows bigint := 0;
begin
  if sync_owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one Apple Health measurement is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as item(
      source_record_key text,
      source_name text,
      source_bundle_identifier text,
      measured_at timestamptz,
      measured_on date,
      weight_kg numeric
    )
    where btrim(coalesce(item.source_record_key, '')) = ''
      or item.measured_at is null
      or item.measured_on is null
      or item.weight_kg is null
      or item.weight_kg <= 0
  ) then raise exception 'Invalid Apple Health body-weight payload'; end if;

  if exists (
    select item.source_record_key
    from jsonb_to_recordset(p_rows) as item(source_record_key text)
    group by item.source_record_key
    having count(*) > 1
  ) then raise exception 'Duplicate Apple Health source record key in payload'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as item(
      source_record_key text,
      source_name text,
      source_bundle_identifier text,
      measured_at timestamptz,
      measured_on date,
      weight_kg numeric
    )
    join public.body_weight_measurements existing
      on existing.owner_id = sync_owner_id
      and existing.source_kind = 'apple_health'
      and existing.source_record_key = item.source_record_key
    where existing.measured_at is distinct from item.measured_at
      or existing.measured_on is distinct from item.measured_on
      or existing.weight_kg is distinct from item.weight_kg
      or existing.source_bundle_identifier is distinct from nullif(btrim(item.source_bundle_identifier), '')
  ) then raise exception 'Apple Health source record key conflicts with an existing measurement'; end if;

  insert into public.body_weight_measurements (
    owner_id,
    import_id,
    source_row,
    measured_on,
    weight_kg,
    source_kind,
    source_record_key,
    measured_at,
    source_name,
    source_bundle_identifier
  )
  select
    sync_owner_id,
    null,
    null,
    item.measured_on,
    item.weight_kg,
    'apple_health',
    item.source_record_key,
    item.measured_at,
    nullif(btrim(item.source_name), ''),
    nullif(btrim(item.source_bundle_identifier), '')
  from jsonb_to_recordset(p_rows) as item(
    source_record_key text,
    source_name text,
    source_bundle_identifier text,
    measured_at timestamptz,
    measured_on date,
    weight_kg numeric
  )
  on conflict (owner_id, source_kind, source_record_key) do nothing;

  get diagnostics inserted_rows = row_count;

  return query
  select inserted_rows, count(*)
  from public.body_weight_measurements measurement
  where measurement.owner_id = sync_owner_id;
end;
$$;

drop function if exists public.body_weight_daily_series();
drop function if exists public.body_weight_daily_series(date, date);

create function public.body_weight_daily_series(
  p_start date default null,
  p_end date default null
)
returns table (
  measured_on date,
  weight_kg numeric,
  kind text,
  previous_measured_on date,
  next_measured_on date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with owned as (
    select distinct on (measurement.measured_on)
      measurement.measured_on,
      measurement.weight_kg
    from public.body_weight_measurements measurement
    where measurement.owner_id = (select auth.uid())
    order by
      measurement.measured_on,
      (measurement.measured_at is not null) desc,
      measurement.measured_at desc nulls last,
      (measurement.source_kind = 'apple_health') desc,
      measurement.created_at desc,
      measurement.id desc
  ), bounds as (
    select
      coalesce(p_start, min(measured_on)) as lo,
      coalesce(p_end, max(measured_on)) as hi
    from owned
  ), days as (
    select generate_series(lo, hi, interval '1 day')::date as measured_on
    from bounds
  ), neighbours as (
    select
      day.measured_on,
      measured.weight_kg as measured,
      (
        select previous.measured_on
        from owned previous
        where previous.measured_on <= day.measured_on
        order by previous.measured_on desc
        limit 1
      ) as previous_date,
      (
        select following.measured_on
        from owned following
        where following.measured_on >= day.measured_on
        order by following.measured_on
        limit 1
      ) as next_date
    from days day
    left join owned measured on measured.measured_on = day.measured_on
  )
  select
    neighbour.measured_on,
    case
      when neighbour.measured is not null then neighbour.measured
      when neighbour.previous_date is not null and neighbour.next_date is not null then
        previous.weight_kg
        + (following.weight_kg - previous.weight_kg)
          * ((neighbour.measured_on - previous.measured_on)::numeric
            / (following.measured_on - previous.measured_on)::numeric)
    end as weight_kg,
    case
      when neighbour.measured is not null then 'measured'
      when neighbour.previous_date is not null and neighbour.next_date is not null then 'interpolated'
    end as kind,
    case when neighbour.measured is null then neighbour.previous_date end as previous_measured_on,
    case when neighbour.measured is null then neighbour.next_date end as next_measured_on
  from neighbours neighbour
  left join owned previous on previous.measured_on = neighbour.previous_date
  left join owned following on following.measured_on = neighbour.next_date
  where neighbour.measured is not null
    or (neighbour.previous_date is not null and neighbour.next_date is not null)
  order by neighbour.measured_on;
$$;

revoke all on function public.sync_apple_health_body_weight(jsonb) from public, anon;
revoke all on function public.body_weight_daily_series(date, date) from public, anon;
grant execute on function public.sync_apple_health_body_weight(jsonb) to authenticated;
grant execute on function public.body_weight_daily_series(date, date) to authenticated;

comment on table public.body_weight_measurements is 'Owner-scoped raw scale observations from CSV imports or Apple Health. Multiple raw observations may share a date; calculated interpolation is never stored here.';
comment on column public.body_weight_measurements.source_kind is 'Provenance class: csv_import or apple_health.';
comment on column public.body_weight_measurements.source_record_key is 'Owner-scoped deterministic identity of the source measurement, used for idempotent ingestion.';
comment on column public.body_weight_measurements.measured_at is 'Exact source timestamp when available. Required for Apple Health and absent for date-only CSV observations.';
comment on function public.sync_apple_health_body_weight(jsonb) is 'Idempotently inserts authenticated-owner Apple Health bodyMass samples using caller-supplied deterministic source record keys.';
comment on function public.body_weight_daily_series(date, date) is 'Returns one deterministic representative per measured day plus transparent interpolation strictly between measured days; same-day raw observations are preserved in the source table.';

commit;
