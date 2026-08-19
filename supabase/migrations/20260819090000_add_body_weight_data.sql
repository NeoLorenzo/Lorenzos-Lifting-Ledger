begin;

alter table public.data_imports
  add column import_kind text not null default 'lifting_history'
  check (import_kind in ('lifting_history', 'body_weight'));

alter table public.data_imports
  drop constraint data_imports_owner_id_source_sha256_key;
alter table public.data_imports
  add constraint data_imports_owner_kind_source_sha256_key
  unique (owner_id, import_kind, source_sha256);

create table public.body_weight_measurements (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null,
  source_row integer not null check (source_row > 0),
  measured_on date not null,
  weight_kg numeric not null check (weight_kg > 0),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, measured_on),
  foreign key (import_id, owner_id)
    references public.data_imports(id, owner_id)
    on delete cascade
);

create index body_weight_measurements_owner_date_idx
  on public.body_weight_measurements (owner_id, measured_on);
create index body_weight_measurements_import_owner_idx
  on public.body_weight_measurements (import_id, owner_id);

alter table public.body_weight_measurements enable row level security;

create policy "Users can view their own body-weight measurements"
  on public.body_weight_measurements for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own body-weight measurements"
  on public.body_weight_measurements for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own body-weight measurements"
  on public.body_weight_measurements for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own body-weight measurements"
  on public.body_weight_measurements for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on public.body_weight_measurements from anon;
grant select, insert, update, delete on public.body_weight_measurements to authenticated;
grant usage, select on sequence public.body_weight_measurements_id_seq to authenticated;

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
    source_row_count = excluded.source_row_count
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

create or replace function public.body_weight_daily_series()
returns table (
  measured_on date,
  weight_kg numeric,
  provenance text,
  previous_measured_on date,
  previous_weight_kg numeric,
  next_measured_on date,
  next_weight_kg numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with owned as (
    select measurement.measured_on, measurement.weight_kg
    from public.body_weight_measurements measurement
    where measurement.owner_id = (select auth.uid())
  ), bounds as (
    select min(measured_on) first_day, max(measured_on) last_day from owned
  ), days as (
    select generate_series(first_day, last_day, interval '1 day')::date measured_on from bounds
  ), neighbours as (
    select days.measured_on,
      previous.measured_on previous_measured_on, previous.weight_kg previous_weight_kg,
      following.measured_on next_measured_on, following.weight_kg next_weight_kg
    from days
    left join lateral (select * from owned where owned.measured_on <= days.measured_on order by owned.measured_on desc limit 1) previous on true
    left join lateral (select * from owned where owned.measured_on >= days.measured_on order by owned.measured_on asc limit 1) following on true
  )
  select neighbours.measured_on,
    case when previous_measured_on = next_measured_on then previous_weight_kg
      else previous_weight_kg + (next_weight_kg - previous_weight_kg)
        * ((neighbours.measured_on - previous_measured_on)::numeric / nullif(next_measured_on - previous_measured_on, 0)) end,
    case when previous_measured_on = next_measured_on then 'measured' else 'interpolated' end,
    previous_measured_on, previous_weight_kg, next_measured_on, next_weight_kg
  from neighbours
  where previous_measured_on is not null and next_measured_on is not null
  order by neighbours.measured_on;
$$;

create or replace function public.delete_body_weight_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare deletion_owner_id uuid := (select auth.uid());
begin
  if deletion_owner_id is null then raise exception 'Authentication required'; end if;
  delete from public.body_weight_measurements where owner_id = deletion_owner_id;
  delete from public.data_imports data_import
  where data_import.owner_id = deletion_owner_id
    and data_import.import_kind = 'body_weight'
    and not exists (
      select 1 from public.session_exercises session_exercise
      where session_exercise.import_id = data_import.id
        and session_exercise.owner_id = deletion_owner_id
    );
end;
$$;

revoke all on function public.import_body_weight(text, text, text, jsonb) from public, anon;
revoke all on function public.body_weight_daily_series() from public, anon;
revoke all on function public.delete_body_weight_data() from public, anon;
grant execute on function public.import_body_weight(text, text, text, jsonb) to authenticated;
grant execute on function public.body_weight_daily_series() to authenticated;
grant execute on function public.delete_body_weight_data() to authenticated;

comment on table public.body_weight_measurements is 'Owner-scoped scale observations. Calculated interpolated values are never stored here.';
comment on function public.body_weight_daily_series() is 'Returns measured observations and transparent linear interpolation strictly between surrounding measurements; never extrapolates.';

commit;
