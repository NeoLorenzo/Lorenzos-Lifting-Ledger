begin;

create table public.gym_equipment (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  gym_id bigint not null,
  name text not null check (
    char_length(name) <= 100
    and name = regexp_replace(btrim(name), '\s+', ' ', 'g')
    and name <> ''
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, gym_id, name),
  foreign key (gym_id, owner_id)
    references public.gyms(id, owner_id)
    on delete cascade
);

create index gym_equipment_gym_owner_idx
  on public.gym_equipment (gym_id, owner_id);
create unique index gym_equipment_owner_gym_lower_name_idx
  on public.gym_equipment (owner_id, gym_id, lower(name));

alter table public.gym_equipment enable row level security;

create policy "Users can view their own gym equipment"
  on public.gym_equipment for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can create their own gym equipment"
  on public.gym_equipment for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can update their own gym equipment"
  on public.gym_equipment for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy "Users can delete their own gym equipment"
  on public.gym_equipment for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on public.gym_equipment from anon;
grant select, insert, update, delete on public.gym_equipment to authenticated;
grant usage, select on sequence public.gym_equipment_id_seq to authenticated;

-- Migrate existing equipment strings into gym_equipment
insert into public.gym_equipment (owner_id, gym_id, name, created_at)
select
  ws.owner_id,
  ws.gym_id,
  regexp_replace(btrim(se.equipment_id), '\s+', ' ', 'g') as name,
  min(se.created_at) as created_at
from public.session_exercises se
join public.workout_sessions ws on ws.id = se.session_id and ws.owner_id = se.owner_id
where se.equipment_id is not null
  and btrim(se.equipment_id) <> ''
  and ws.gym_id is not null
group by ws.owner_id, ws.gym_id, regexp_replace(btrim(se.equipment_id), '\s+', ' ', 'g')
on conflict (owner_id, gym_id, name) do nothing;

alter table public.session_exercises
  add column gym_equipment_id bigint,
  add column equipment_name_snapshot text;

update public.session_exercises se
set gym_equipment_id = ge.id,
    equipment_name_snapshot = ge.name
from public.workout_sessions ws
join public.gym_equipment ge
  on ge.owner_id = ws.owner_id
 and ge.gym_id = ws.gym_id
where ws.id = se.session_id
  and ws.owner_id = se.owner_id
  and se.equipment_id is not null
  and regexp_replace(btrim(se.equipment_id), '\s+', ' ', 'g') = ge.name;

update public.session_exercises
set equipment_name_snapshot = regexp_replace(btrim(equipment_id), '\s+', ' ', 'g')
where equipment_id is not null
  and equipment_name_snapshot is null;

alter table public.session_exercises
  add constraint session_exercises_gym_equipment_fk
    foreign key (gym_equipment_id, owner_id)
    references public.gym_equipment(id, owner_id)
    on delete restrict;

create index session_exercises_equipment_owner_idx
  on public.session_exercises (gym_equipment_id, owner_id);

alter table public.workout_sessions
  add column source_preset_id bigint,
  add column source_preset_name text,
  add constraint workout_sessions_source_preset_fk
    foreign key (source_preset_id, owner_id)
    references public.workout_presets(id, owner_id)
    on delete set null (source_preset_id);

create index workout_sessions_source_preset_owner_idx
  on public.workout_sessions (source_preset_id, owner_id);

-- Relax exercise_sets check constraints for blank slots and drafts while enforcing valid RIR
alter table public.exercise_sets
  drop constraint if exists exercise_sets_reported_rir_bucket_check,
  drop constraint if exists exercise_sets_rir_state_check,
  drop constraint if exists exercise_sets_rir_source_check;

alter table public.exercise_sets
  add constraint exercise_sets_reported_rir_bucket_check
    check (reported_rir_bucket is null or reported_rir_bucket between 0 and 4),
  add constraint exercise_sets_rir_source_check
    check (rir_source is null or rir_source in ('user_entered', 'historical_backfill')),
  add constraint exercise_sets_rir_provenance_check
    check ((reported_rir_bucket is null) = (rir_source is null)),
  add constraint exercise_sets_warmup_check
    check (not is_warmup or (reported_rir_bucket is null and rir_source is null));

-- Function: create_or_get_gym_equipment
create or replace function public.create_or_get_gym_equipment(
  p_gym_id bigint,
  p_name text
)
returns public.gym_equipment
language plpgsql
security invoker
set search_path = ''
as $$
declare
  equipment_owner_id uuid := (select auth.uid());
  normalized_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  equipment_record public.gym_equipment;
begin
  if equipment_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if normalized_name is null or normalized_name = '' or char_length(normalized_name) > 100 then
    raise exception using errcode = '22023', message = 'Equipment name must contain 1 to 100 characters.';
  end if;

  if not exists (
    select 1 from public.gyms where id = p_gym_id and owner_id = equipment_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Gym not found or not owned by the current user.';
  end if;

  select * into equipment_record
  from public.gym_equipment
  where owner_id = equipment_owner_id
    and gym_id = p_gym_id
    and lower(name) = lower(normalized_name);

  if found then
    if not equipment_record.is_active then
      update public.gym_equipment
      set is_active = true
      where id = equipment_record.id and owner_id = equipment_owner_id
      returning * into equipment_record;
    end if;
    return equipment_record;
  end if;

  insert into public.gym_equipment (owner_id, gym_id, name, is_active)
  values (equipment_owner_id, p_gym_id, normalized_name, true)
  returning * into equipment_record;

  return equipment_record;
end;
$$;

-- Function: start_or_resume_workout_session
create or replace function public.start_or_resume_workout_session(
  p_gym_id bigint default null,
  p_preset_id bigint default null
)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  active_session public.workout_sessions;
  preset_name_snapshot text;
  created_session boolean;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into active_session
  from public.workout_sessions
  where owner_id = session_owner_id and status = 'in_progress'
  limit 1;

  if found then
    return active_session;
  end if;

  if p_gym_id is null then
    raise exception using errcode = '22023', message = 'A gym is required to start a new workout session.';
  end if;

  if not exists (
    select 1 from public.gyms where id = p_gym_id and owner_id = session_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Gym not found or not owned by the current user.';
  end if;

  if p_preset_id is not null then
    select name into preset_name_snapshot
    from public.workout_presets
    where id = p_preset_id and owner_id = session_owner_id;

    if not found then
      raise exception using errcode = '42501', message = 'Preset not found or not owned by the current user.';
    end if;

    if not exists (
      select 1 from public.workout_preset_exercises
      where preset_id = p_preset_id and owner_id = session_owner_id
    ) then
      raise exception using errcode = '22023', message = 'The selected preset has no exercises.';
    end if;
  end if;

  insert into public.workout_sessions (
    owner_id, gym_id, performed_on, status, source_preset_id, source_preset_name
  )
  values (
    session_owner_id, p_gym_id, current_date, 'in_progress', p_preset_id, preset_name_snapshot
  )
  on conflict (owner_id) where status = 'in_progress' do nothing
  returning * into active_session;
  created_session := found;

  if not created_session then
    select * into active_session
    from public.workout_sessions
    where owner_id = session_owner_id and status = 'in_progress';
    return active_session;
  end if;

  if p_preset_id is not null then
    with randomized_exercises as (
      select
        membership.exercise_id,
        row_number() over (order by random())::integer as exercise_order
      from public.workout_preset_exercises as membership
      where membership.preset_id = p_preset_id
        and membership.owner_id = session_owner_id
    ), resolved_equipment as (
      select
        re.exercise_id,
        re.exercise_order,
        (
          select se_hist.gym_equipment_id
          from public.session_exercises se_hist
          join public.workout_sessions ws_hist
            on ws_hist.id = se_hist.session_id and ws_hist.owner_id = se_hist.owner_id
          where ws_hist.owner_id = session_owner_id
            and ws_hist.gym_id = p_gym_id
            and ws_hist.status = 'completed'
            and se_hist.exercise_id = re.exercise_id
            and se_hist.gym_equipment_id is not null
          order by
            ws_hist.performed_on desc,
            ws_hist.created_at desc,
            ws_hist.id desc,
            se_hist.exercise_order desc,
            se_hist.id desc
          limit 1
        ) as default_gym_equipment_id
      from randomized_exercises re
    ), inserted_exercises as (
      insert into public.session_exercises (
        owner_id, session_id, exercise_order, exercise_id, gym_equipment_id, equipment_name_snapshot
      )
      select
        session_owner_id,
        active_session.id,
        resolved.exercise_order,
        resolved.exercise_id,
        resolved.default_gym_equipment_id,
        ge.name
      from resolved_equipment as resolved
      left join public.gym_equipment ge
        on ge.id = resolved.default_gym_equipment_id
       and ge.owner_id = session_owner_id
      returning id, exercise_id
    )
    insert into public.exercise_sets (
      owner_id, session_exercise_id, set_number, weight, reps, is_warmup, reported_rir_bucket, rir_source
    )
    select
      session_owner_id,
      inserted.id,
      generated.set_number::smallint,
      null,
      null,
      false,
      null,
      null
    from inserted_exercises as inserted
    join public.workout_preset_exercises as membership
      on membership.preset_id = p_preset_id
     and membership.owner_id = session_owner_id
     and membership.exercise_id = inserted.exercise_id
    cross join lateral generate_series(1, membership.set_count) as generated(set_number);
  end if;

  return active_session;
end;
$$;

-- Function: reorder_session_exercises
create or replace function public.reorder_session_exercises(
  p_session_id bigint,
  p_exercise_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  current_exercise_ids bigint[];
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.workout_sessions
    where id = p_session_id and owner_id = session_owner_id and status = 'in_progress'
  ) then
    raise exception using errcode = '42501', message = 'Session not found, not active, or not owned by current user.';
  end if;

  select array_agg(id order by id) into current_exercise_ids
  from public.session_exercises
  where session_id = p_session_id and owner_id = session_owner_id;

  if coalesce(cardinality(p_exercise_ids), 0) <> coalesce(cardinality(current_exercise_ids), 0)
     or exists (
       select 1 from unnest(p_exercise_ids) as passed(id)
       group by id having count(*) > 1
     )
     or exists (
       select 1 from unnest(p_exercise_ids) as passed(id)
       where passed.id is null or not (passed.id = any(current_exercise_ids))
     ) then
    raise exception using errcode = '22023', message = 'Submitted exercise IDs do not match the current session exercises.';
  end if;

  update public.session_exercises se
  set exercise_order = -1 * pos.new_order
  from (
    select id, ordinality::integer as new_order
    from unnest(p_exercise_ids) with ordinality as ord(id, ordinality)
  ) pos
  where se.id = pos.id and se.session_id = p_session_id and se.owner_id = session_owner_id;

  update public.session_exercises se
  set exercise_order = -1 * se.exercise_order
  where se.session_id = p_session_id and se.owner_id = session_owner_id and se.exercise_order < 0;
end;
$$;

-- Function: conclude_workout_session
create or replace function public.conclude_workout_session(
  p_session_id bigint
)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  concluded_session public.workout_sessions;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into concluded_session
  from public.workout_sessions
  where id = p_session_id and owner_id = session_owner_id and status = 'in_progress';

  if not found then
    raise exception using errcode = '42501', message = 'Active session not found or not owned by current user.';
  end if;

  if exists (
    select 1
    from public.exercise_sets es
    join public.session_exercises se
      on se.id = es.session_exercise_id and se.owner_id = es.owner_id
    where se.session_id = p_session_id
      and se.owner_id = session_owner_id
      and (
        (not es.is_warmup and (
          (es.weight is not null or es.reps is not null or es.reported_rir_bucket is not null)
          and (es.weight is null or es.reps is null or es.reported_rir_bucket is null)
        ))
        or
        (es.is_warmup and (
          (es.weight is not null or es.reps is not null)
          and (es.weight is null or es.reps is null)
        ))
      )
  ) then
    raise exception using errcode = '22023', message = 'Cannot conclude session: one or more sets are incomplete drafts.';
  end if;

  delete from public.exercise_sets
  where owner_id = session_owner_id
    and session_exercise_id in (
      select id from public.session_exercises
      where session_id = p_session_id and owner_id = session_owner_id
    )
    and weight is null
    and reps is null
    and reported_rir_bucket is null;

  delete from public.session_exercises
  where session_id = p_session_id
    and owner_id = session_owner_id
    and id not in (
      select distinct session_exercise_id
      from public.exercise_sets
      where owner_id = session_owner_id
    );

  with ordered as (
    select id, row_number() over (order by exercise_order) as new_order
    from public.session_exercises
    where session_id = p_session_id and owner_id = session_owner_id
  )
  update public.session_exercises se
  set exercise_order = ordered.new_order
  from ordered
  where se.id = ordered.id;

  update public.workout_sessions
  set status = 'completed'
  where id = p_session_id and owner_id = session_owner_id
  returning * into concluded_session;

  return concluded_session;
end;
$$;

revoke all on function public.create_or_get_gym_equipment(bigint, text) from public, anon;
revoke all on function public.start_or_resume_workout_session(bigint, bigint) from public, anon;
revoke all on function public.reorder_session_exercises(bigint, bigint[]) from public, anon;
revoke all on function public.conclude_workout_session(bigint) from public, anon;

grant execute on function public.create_or_get_gym_equipment(bigint, text) to authenticated;
grant execute on function public.start_or_resume_workout_session(bigint, bigint) to authenticated;
grant execute on function public.reorder_session_exercises(bigint, bigint[]) to authenticated;
grant execute on function public.conclude_workout_session(bigint) to authenticated;

comment on table public.gym_equipment is
  'Owner-scoped equipment entities associated with a specific gym.';
comment on column public.session_exercises.gym_equipment_id is
  'Foreign key to gym_equipment; deletion is restricted if referenced by historical exercises.';
comment on column public.session_exercises.equipment_name_snapshot is
  'Historical name snapshot of the equipment used, preserved even if the equipment entity is renamed.';
comment on column public.workout_sessions.source_preset_id is
  'Optional reference to the workout preset that created this session; set to null if preset is deleted.';
comment on column public.workout_sessions.source_preset_name is
  'Snapshot of the preset name at the time the session was created.';

commit;
