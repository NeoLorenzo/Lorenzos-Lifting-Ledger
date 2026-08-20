begin;

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
    select 1 from jsonb_to_recordset(p_rows) as item(source_row integer, measured_on date, weight_kg numeric)
    where item.source_row is null or item.source_row <= 0 or item.measured_on is null or item.weight_kg is null or item.weight_kg <= 0
  ) then raise exception 'Invalid body-weight measurement payload'; end if;
  if exists (
    select item.measured_on from jsonb_to_recordset(p_rows) as item(source_row integer, measured_on date, weight_kg numeric)
    group by item.measured_on having count(*) > 1
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

  insert into public.body_weight_measurements (owner_id, import_id, source_row, measured_on, weight_kg)
  select import_owner_id, body_import_id, item.source_row, item.measured_on, item.weight_kg
  from jsonb_to_recordset(p_rows) as item(source_row integer, measured_on date, weight_kg numeric)
  on conflict (owner_id, measured_on) do update set
    import_id = excluded.import_id,
    source_row = excluded.source_row,
    weight_kg = excluded.weight_kg,
    created_at = now();

  return query select body_import_id, count(*)
  from public.body_weight_measurements where owner_id = import_owner_id;
end;
$$;

comment on function public.import_body_weight(text, text, text, jsonb) is 'Atomically imports owner-scoped scale observations and refreshes provenance imported_at for every successful import.';

commit;
