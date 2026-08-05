begin;

create table public.gyms (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id)
);

create table public.workout_sessions (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  gym_id bigint not null,
  performed_on date not null,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (gym_id, owner_id)
    references public.gyms(id, owner_id)
    on delete cascade
);

create table public.session_exercises (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id bigint not null,
  import_id uuid,
  source_row integer check (source_row >= 2),
  exercise_order integer not null check (exercise_order > 0),
  exercise text not null check (btrim(exercise) <> ''),
  equipment_id text,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (session_id, exercise_order),
  unique (import_id, source_row),
  foreign key (session_id, owner_id)
    references public.workout_sessions(id, owner_id)
    on delete cascade,
  foreign key (import_id, owner_id)
    references public.data_imports(id, owner_id)
    on delete cascade,
  check ((import_id is null) = (source_row is null))
);

create table public.exercise_sets (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_exercise_id bigint not null,
  set_number smallint not null check (set_number > 0),
  weight numeric check (weight >= 0),
  reps integer check (reps >= 0),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  is_warmup boolean not null default false,
  is_drop_set boolean not null default false,
  is_superset boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_exercise_id, set_number),
  foreign key (session_exercise_id, owner_id)
    references public.session_exercises(id, owner_id)
    on delete cascade,
  check (weight is not null or reps is not null)
);

create index workout_sessions_owner_date_idx
  on public.workout_sessions (owner_id, performed_on desc, id desc);
create index workout_sessions_gym_owner_idx
  on public.workout_sessions (gym_id, owner_id);
create index session_exercises_owner_session_idx
  on public.session_exercises (owner_id, session_id, exercise_order);
create index session_exercises_session_owner_idx
  on public.session_exercises (session_id, owner_id);
create index session_exercises_import_owner_idx
  on public.session_exercises (import_id, owner_id);
create index exercise_sets_owner_exercise_idx
  on public.exercise_sets (owner_id, session_exercise_id, set_number);
create index exercise_sets_exercise_owner_idx
  on public.exercise_sets (session_exercise_id, owner_id);

insert into public.gyms (owner_id, name, created_at)
select owner_id, gym, min(created_at)
from public.lift_entries
group by owner_id, gym;

insert into public.workout_sessions (owner_id, gym_id, performed_on, created_at)
select le.owner_id, g.id, le.performed_on, min(le.created_at)
from public.lift_entries le
join public.gyms g
  on g.owner_id = le.owner_id
 and g.name = le.gym
group by le.owner_id, g.id, le.performed_on;

insert into public.session_exercises (
  owner_id,
  session_id,
  import_id,
  source_row,
  exercise_order,
  exercise,
  equipment_id,
  created_at
)
select
  le.owner_id,
  ws.id,
  le.import_id,
  le.source_row,
  row_number() over (
    partition by le.owner_id, le.gym, le.performed_on
    order by le.source_row
  )::integer,
  le.exercise,
  le.equipment_id,
  le.created_at
from public.lift_entries le
join public.gyms g
  on g.owner_id = le.owner_id
 and g.name = le.gym
join public.workout_sessions ws
  on ws.owner_id = le.owner_id
 and ws.gym_id = g.id
 and ws.performed_on = le.performed_on;

insert into public.exercise_sets (
  owner_id,
  session_exercise_id,
  set_number,
  weight,
  reps,
  created_at
)
select
  ls.owner_id,
  se.id,
  ls.set_number,
  ls.weight,
  ls.reps,
  ls.created_at
from public.lift_sets ls
join public.lift_entries le
  on le.id = ls.entry_id
 and le.owner_id = ls.owner_id
join public.session_exercises se
  on se.import_id = le.import_id
 and se.source_row = le.source_row
 and se.owner_id = le.owner_id;

do $$
begin
  if (select count(*) from public.gyms) <>
     (select count(*) from (select distinct owner_id, gym from public.lift_entries) source_gyms) then
    raise exception 'Gym migration count mismatch';
  end if;

  if (select count(*) from public.workout_sessions) <>
     (select count(*) from (select distinct owner_id, gym, performed_on from public.lift_entries) source_sessions) then
    raise exception 'Session migration count mismatch';
  end if;

  if (select count(*) from public.session_exercises) <> (select count(*) from public.lift_entries) then
    raise exception 'Exercise migration count mismatch';
  end if;

  if (select count(*) from public.exercise_sets) <> (select count(*) from public.lift_sets) then
    raise exception 'Set migration count mismatch';
  end if;

  if exists (
    select 1
    from public.lift_entries le
    left join public.session_exercises se
      on se.import_id = le.import_id
     and se.source_row = le.source_row
     and se.owner_id = le.owner_id
    left join public.workout_sessions ws on ws.id = se.session_id and ws.owner_id = se.owner_id
    left join public.gyms g on g.id = ws.gym_id and g.owner_id = ws.owner_id
    where se.id is null
       or le.gym is distinct from g.name
       or le.performed_on is distinct from ws.performed_on
       or le.exercise is distinct from se.exercise
       or le.equipment_id is distinct from se.equipment_id
  ) then
    raise exception 'Exercise migration field mismatch';
  end if;

  if exists (
    select 1
    from public.lift_sets ls
    join public.lift_entries le on le.id = ls.entry_id and le.owner_id = ls.owner_id
    join public.session_exercises se
      on se.import_id = le.import_id
     and se.source_row = le.source_row
     and se.owner_id = le.owner_id
    left join public.exercise_sets es
      on es.owner_id = ls.owner_id
     and es.set_number = ls.set_number
     and es.session_exercise_id = se.id
    where es.id is null
       or ls.weight is distinct from es.weight
       or ls.reps is distinct from es.reps
       or es.rpe is not null
       or es.is_warmup
       or es.is_drop_set
       or es.is_superset
  ) then
    raise exception 'Set migration field mismatch';
  end if;
end
$$;

alter table public.gyms enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.exercise_sets enable row level security;

create policy "Users can view their own gyms"
  on public.gyms for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own gyms"
  on public.gyms for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own gyms"
  on public.gyms for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own gyms"
  on public.gyms for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "Users can view their own workout sessions"
  on public.workout_sessions for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own workout sessions"
  on public.workout_sessions for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own workout sessions"
  on public.workout_sessions for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own workout sessions"
  on public.workout_sessions for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "Users can view their own session exercises"
  on public.session_exercises for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own session exercises"
  on public.session_exercises for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own session exercises"
  on public.session_exercises for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own session exercises"
  on public.session_exercises for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "Users can view their own exercise sets"
  on public.exercise_sets for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own exercise sets"
  on public.exercise_sets for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own exercise sets"
  on public.exercise_sets for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own exercise sets"
  on public.exercise_sets for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on public.gyms, public.workout_sessions, public.session_exercises, public.exercise_sets from anon;
grant select, insert, update, delete
  on public.gyms, public.workout_sessions, public.session_exercises, public.exercise_sets
  to authenticated;
grant usage, select
  on sequence public.gyms_id_seq,
              public.workout_sessions_id_seq,
              public.session_exercises_id_seq,
              public.exercise_sets_id_seq
  to authenticated;

comment on table public.lift_entries is
  'Legacy import table retained temporarily for reconciliation; the app uses the four-layer workout model.';
comment on table public.lift_sets is
  'Legacy import table retained temporarily for reconciliation; the app uses exercise_sets.';

drop policy "Users can create their own lift entries" on public.lift_entries;
drop policy "Users can update their own lift entries" on public.lift_entries;
drop policy "Users can delete their own lift entries" on public.lift_entries;
drop policy "Users can create their own lift sets" on public.lift_sets;
drop policy "Users can update their own lift sets" on public.lift_sets;
drop policy "Users can delete their own lift sets" on public.lift_sets;
revoke insert, update, delete on public.lift_entries, public.lift_sets from authenticated;

commit;
