begin;

create table if not exists public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  relative_e1rm_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_settings
  add column if not exists relative_e1rm_enabled boolean default false,
  add column if not exists updated_at timestamptz default now();

update public.user_settings set relative_e1rm_enabled = false where relative_e1rm_enabled is null;
update public.user_settings set updated_at = now() where updated_at is null;

alter table public.user_settings
  alter column owner_id set not null,
  alter column relative_e1rm_enabled set default false,
  alter column relative_e1rm_enabled set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_settings'::regclass and contype = 'p'
  ) then
    alter table public.user_settings add primary key (owner_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_settings'::regclass and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ) then
    alter table public.user_settings
      add constraint user_settings_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

alter table public.user_settings enable row level security;

drop policy if exists "Users can view their own settings" on public.user_settings;
drop policy if exists "Users can create their own settings" on public.user_settings;
drop policy if exists "Users can update their own settings" on public.user_settings;

create policy "Users can view their own settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on table public.user_settings from anon, authenticated;
grant select, insert, update on table public.user_settings to authenticated;

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
      where session_exercise.import_id = data_import.id and session_exercise.owner_id = deletion_owner_id
    );
  insert into public.user_settings (owner_id, relative_e1rm_enabled)
  values (deletion_owner_id, false)
  on conflict (owner_id) do update
    set relative_e1rm_enabled = false, updated_at = now();
end;
$$;

revoke all on function public.delete_body_weight_data() from public, anon;
grant execute on function public.delete_body_weight_data() to authenticated;

comment on column public.user_settings.relative_e1rm_enabled is
  'Default-off presentation preference. Effective only while the owner has body-weight measurements.';

commit;
