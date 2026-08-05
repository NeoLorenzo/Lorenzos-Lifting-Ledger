begin;

alter table public.exercise_sets
  add column estimated_1rm_brzycki numeric generated always as (
    case
      when weight is not null and reps between 1 and 36
        then round(weight * 36 / (37 - reps), 2)
      else null
    end
  ) stored,
  add column estimated_1rm_epley numeric generated always as (
    case
      when weight is not null and reps > 0
        then round(weight * (1 + reps / 30.0), 2)
      else null
    end
  ) stored,
  add column estimated_1rm_low numeric generated always as (
    case
      when weight is not null and reps between 1 and 36
        then round(least(
          weight * 36 / (37 - reps),
          weight * (1 + reps / 30.0)
        ), 2)
      else null
    end
  ) stored,
  add column estimated_1rm_high numeric generated always as (
    case
      when weight is not null and reps between 1 and 36
        then round(greatest(
          weight * 36 / (37 - reps),
          weight * (1 + reps / 30.0)
        ), 2)
      else null
    end
  ) stored;

comment on column public.exercise_sets.estimated_1rm_brzycki is
  'Brzycki estimate: weight * 36 / (37 - reps), rounded to 2 decimals; null outside 1-36 reps.';
comment on column public.exercise_sets.estimated_1rm_epley is
  'Epley estimate: weight * (1 + reps / 30), rounded to 2 decimals.';
comment on column public.exercise_sets.estimated_1rm_low is
  'Lower of the unrounded Brzycki and Epley estimates, rounded to 2 decimals.';
comment on column public.exercise_sets.estimated_1rm_high is
  'Higher of the unrounded Brzycki and Epley estimates, rounded to 2 decimals.';

do $$
begin
  if exists (
    select 1
    from public.exercise_sets
    where coalesce(weight is not null and reps between 1 and 36, false)
          is distinct from (estimated_1rm_low is not null and estimated_1rm_high is not null)
  ) then
    raise exception '1RM range eligibility mismatch';
  end if;

  if exists (
    select 1
    from public.exercise_sets
    where estimated_1rm_low > estimated_1rm_high
       or estimated_1rm_brzycki is distinct from
          case when weight is not null and reps between 1 and 36
            then round(weight * 36 / (37 - reps), 2) else null end
       or estimated_1rm_epley is distinct from
          case when weight is not null and reps > 0
            then round(weight * (1 + reps / 30.0), 2) else null end
  ) then
    raise exception '1RM formula verification failed';
  end if;
end
$$;

commit;
