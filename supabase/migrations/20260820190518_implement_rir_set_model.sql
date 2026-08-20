begin;

alter table public.exercise_sets
  add column reported_rir_bucket smallint,
  add column rir_source text;

update public.exercise_sets
set reported_rir_bucket = case when is_warmup then null else 0 end,
    rir_source = case when is_warmup then null else 'historical_backfill' end;

alter table public.exercise_sets
  add constraint exercise_sets_reported_rir_bucket_check
    check (reported_rir_bucket between 0 and 4),
  add constraint exercise_sets_rir_state_check
    check (
      (is_warmup and reported_rir_bucket is null and rir_source is null)
      or
      (not is_warmup and reported_rir_bucket is not null and rir_source is not null)
    ),
  add constraint exercise_sets_rir_source_check
    check (rir_source in ('user_entered', 'historical_backfill')),
  add column estimated_1rm_brzycki_rir_adjusted numeric generated always as (
    case
      when not is_warmup and reported_rir_bucket between 0 and 3
        and weight is not null and reps + reported_rir_bucket between 1 and 36
      then round(weight * 36 / (37 - (reps + reported_rir_bucket)), 2)
      else null
    end
  ) stored,
  add column estimated_1rm_epley_rir_adjusted numeric generated always as (
    case
      when not is_warmup and reported_rir_bucket between 0 and 3
        and weight is not null and reps + reported_rir_bucket > 0
      then round(weight * (1 + (reps + reported_rir_bucket) / 30.0), 2)
      else null
    end
  ) stored;

comment on column public.exercise_sets.reported_rir_bucket is
  'Entered reps-in-reserve bucket. Stored 4 means open-ended 4+ RIR; NULL applies only to warm-ups.';
comment on column public.exercise_sets.rir_source is
  'Provenance for reported RIR: user_entered or historical_backfill.';
comment on column public.exercise_sets.rpe is
  'Legacy/deprecated RPE observation retained for historical preservation; new app writes use reported RIR.';
comment on column public.exercise_sets.estimated_1rm_brzycki_rir_adjusted is
  'Brzycki estimate using completed reps plus reported RIR 0-3; NULL for warm-ups, 4+ RIR, or outside the 1-36 rep domain.';
comment on column public.exercise_sets.estimated_1rm_epley_rir_adjusted is
  'Epley estimate using completed reps plus reported RIR 0-3; NULL for warm-ups and 4+ RIR.';

create or replace function public.start_or_resume_workout_session(p_preset_id bigint)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_owner_id uuid := (select auth.uid());
  active_session public.workout_sessions;
  created_session boolean;
begin
  if session_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_preset_id is not null and not exists (
    select 1 from public.workout_presets where id = p_preset_id and owner_id = session_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Preset not found or not owned by the current user.';
  end if;
  if p_preset_id is not null and not exists (
    select 1 from public.workout_preset_exercises where preset_id = p_preset_id and owner_id = session_owner_id
  ) then
    raise exception using errcode = '22023', message = 'The selected preset has no exercises.';
  end if;

  insert into public.workout_sessions (owner_id, gym_id, performed_on, status)
  values (session_owner_id, null, current_date, 'in_progress')
  on conflict (owner_id) where status = 'in_progress' do nothing
  returning * into active_session;
  created_session := found;
  if not created_session then
    select * into active_session from public.workout_sessions
    where owner_id = session_owner_id and status = 'in_progress';
    return active_session;
  end if;

  if p_preset_id is not null then
    with randomized_exercises as (
      select membership.exercise_id, row_number() over (order by random())::integer as exercise_order
      from public.workout_preset_exercises as membership
      where membership.preset_id = p_preset_id and membership.owner_id = session_owner_id
    ), inserted_exercises as (
      insert into public.session_exercises (owner_id, session_id, exercise_order, exercise_id)
      select session_owner_id, active_session.id, randomized.exercise_order, exercise.id
      from randomized_exercises as randomized
      join public.exercises as exercise on exercise.id = randomized.exercise_id
      returning id, exercise_id
    )
    insert into public.exercise_sets (
      owner_id, session_exercise_id, set_number, reported_rir_bucket, rir_source
    )
    select session_owner_id, inserted.id, generated.set_number::smallint, 0, 'historical_backfill'
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

comment on function public.start_or_resume_workout_session(bigint) is
  'Creates an owner-scoped session. Blank preset slots carry historical placeholder provenance until explicit user RIR is saved.';

do $$
begin
  if exists (select 1 from public.exercise_sets where is_warmup and (reported_rir_bucket is not null or rir_source is not null)) then
    raise exception 'Warm-up RIR backfill mismatch';
  end if;
  if exists (select 1 from public.exercise_sets where not is_warmup and (reported_rir_bucket <> 0 or rir_source <> 'historical_backfill')) then
    raise exception 'Working-set RIR backfill mismatch';
  end if;
end
$$;

commit;
