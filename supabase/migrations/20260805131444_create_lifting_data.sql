create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_file_name text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  canonical_sha256 text not null check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_count integer not null check (source_row_count >= 0),
  imported_at timestamptz not null default now(),
  unique (owner_id, source_sha256),
  unique (id, owner_id)
);

create table public.lift_entries (
  id bigint generated always as identity primary key,
  import_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_row integer not null check (source_row >= 2),
  gym text not null,
  performed_on date not null,
  equipment_id text,
  exercise text not null,
  created_at timestamptz not null default now(),
  unique (import_id, source_row),
  unique (id, owner_id),
  foreign key (import_id, owner_id)
    references public.data_imports(id, owner_id)
    on delete cascade
);

create table public.lift_sets (
  id bigint generated always as identity primary key,
  entry_id bigint not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  set_number smallint not null check (set_number > 0),
  weight numeric,
  reps integer,
  created_at timestamptz not null default now(),
  unique (entry_id, set_number),
  foreign key (entry_id, owner_id)
    references public.lift_entries(id, owner_id)
    on delete cascade,
  check (weight is not null or reps is not null)
);

create index lift_entries_owner_date_idx
  on public.lift_entries (owner_id, performed_on desc, source_row desc);
create index lift_entries_import_owner_idx
  on public.lift_entries (import_id, owner_id);
create index lift_sets_owner_entry_idx
  on public.lift_sets (owner_id, entry_id, set_number);
create index lift_sets_entry_owner_idx
  on public.lift_sets (entry_id, owner_id);

alter table public.data_imports enable row level security;
alter table public.lift_entries enable row level security;
alter table public.lift_sets enable row level security;

create policy "Users can view their own imports"
  on public.data_imports for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own imports"
  on public.data_imports for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own imports"
  on public.data_imports for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own imports"
  on public.data_imports for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "Users can view their own lift entries"
  on public.lift_entries for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own lift entries"
  on public.lift_entries for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own lift entries"
  on public.lift_entries for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own lift entries"
  on public.lift_entries for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "Users can view their own lift sets"
  on public.lift_sets for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own lift sets"
  on public.lift_sets for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own lift sets"
  on public.lift_sets for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own lift sets"
  on public.lift_sets for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on public.data_imports, public.lift_entries, public.lift_sets from anon;
grant select, insert, update, delete
  on public.data_imports, public.lift_entries, public.lift_sets
  to authenticated;
grant usage, select
  on sequence public.lift_entries_id_seq, public.lift_sets_id_seq
  to authenticated;
