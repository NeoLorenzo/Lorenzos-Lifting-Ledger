begin;

do $$
begin
  if (select count(*) from public.exercises) <> 141
    or (select count(*) from public.muscles) <> 40
    or (select count(*) from public.movement_patterns) <> 40
    or (select count(*) from public.movement_mapping_versions where is_current) <> 1
    or (select count(*) from public.movement_muscle_mapping_versions where is_current) <> 1
    or (select code from public.movement_mapping_versions where is_current) <> 'catalogue_sync_2026_08_10'
    or (select code from public.movement_muscle_mapping_versions where is_current) <> 'initial_2026_08_10'
  then
    raise exception 'Unexpected source catalogue or mapping-version state';
  end if;
end
$$;

create table public.exercise_muscle_mapping_versions (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  status text not null check (status in ('draft', 'published', 'retired')),
  is_current boolean not null default false,
  exercise_pattern_version_id bigint not null
    references public.movement_mapping_versions(id) on delete restrict,
  pattern_muscle_version_id bigint not null
    references public.movement_muscle_mapping_versions(id) on delete restrict,
  algorithm_code text not null check (algorithm_code = 'raw_sum_product_v1'),
  formula text not null check (btrim(formula) <> ''),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  exercise_count integer not null check (exercise_count > 0),
  muscle_count integer not null check (muscle_count > 0),
  cell_count integer not null check (cell_count = exercise_count * muscle_count),
  nonzero_cell_count integer not null check (nonzero_cell_count between 0 and cell_count),
  over_one_cell_count integer not null check (over_one_cell_count between 0 and cell_count),
  maximum_score numeric(10, 6) not null check (maximum_score >= 0),
  change_notes text not null check (btrim(change_notes) <> ''),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check (not is_current or status = 'published'),
  check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'retired') and published_at is not null)
  )
);

create unique index exercise_muscle_mapping_versions_one_current_idx
  on public.exercise_muscle_mapping_versions (is_current)
  where is_current;

create index exercise_muscle_mapping_versions_exercise_pattern_idx
  on public.exercise_muscle_mapping_versions (exercise_pattern_version_id);

create index exercise_muscle_mapping_versions_pattern_muscle_idx
  on public.exercise_muscle_mapping_versions (pattern_muscle_version_id);

insert into public.exercise_muscle_mapping_versions (
  code,
  name,
  status,
  is_current,
  exercise_pattern_version_id,
  pattern_muscle_version_id,
  algorithm_code,
  formula,
  payload_sha256,
  exercise_count,
  muscle_count,
  cell_count,
  nonzero_cell_count,
  over_one_cell_count,
  maximum_score,
  change_notes,
  published_at
)
select
  'initial_2026_08_10',
  'Initial 141 by 40 exercise-to-muscle functional composition matrix',
  'published',
  true,
  exercise_pattern.id,
  pattern_muscle.id,
  'raw_sum_product_v1',
  'score(e,m) = sum over movement patterns p of exercise_pattern(e,p) * pattern_muscle(p,m)',
  '79840f31d889ec47f360ec630965bf11048d7f51a0671686b13811e7dd1ce979',
  141,
  40,
  5640,
  1171,
  91,
  2.000000,
  'Deterministic matrix product of the current exercise-to-pattern and pattern-to-muscle matrices. Scores remain raw sums: they are not normalized or capped, can exceed one, and are not hypertrophy-stimulus estimates.',
  now()
from public.movement_mapping_versions as exercise_pattern
cross join public.movement_muscle_mapping_versions as pattern_muscle
where exercise_pattern.is_current
  and pattern_muscle.is_current;

create table public.exercise_muscle_coefficients (
  mapping_version_id bigint not null
    references public.exercise_muscle_mapping_versions(id) on delete restrict,
  exercise_id bigint not null
    references public.exercises(id) on delete restrict,
  muscle_id bigint not null
    references public.muscles(id) on delete restrict,
  composition_score numeric(10, 6) not null check (composition_score between 0 and 40),
  contributing_pattern_count smallint not null check (contributing_pattern_count between 0 and 40),
  created_at timestamptz not null default now(),
  primary key (mapping_version_id, exercise_id, muscle_id),
  check (
    (composition_score = 0 and contributing_pattern_count = 0)
    or (composition_score > 0 and contributing_pattern_count > 0)
  )
);

create index exercise_muscle_coefficients_exercise_idx
  on public.exercise_muscle_coefficients (exercise_id, mapping_version_id, muscle_id);

create index exercise_muscle_coefficients_muscle_idx
  on public.exercise_muscle_coefficients (muscle_id, mapping_version_id, exercise_id);

create index exercise_muscle_coefficients_nonzero_idx
  on public.exercise_muscle_coefficients (mapping_version_id, exercise_id, muscle_id)
  where composition_score > 0;

insert into public.exercise_muscle_coefficients (
  mapping_version_id,
  exercise_id,
  muscle_id,
  composition_score,
  contributing_pattern_count
)
select
  derived_version.id,
  exercise_pattern.exercise_id,
  pattern_muscle.muscle_id,
  sum(exercise_pattern.coefficient * pattern_muscle.coefficient)::numeric(10, 6),
  count(*) filter (
    where exercise_pattern.coefficient > 0
      and pattern_muscle.coefficient > 0
  )::smallint
from public.exercise_muscle_mapping_versions as derived_version
join public.exercise_movement_pattern_coefficients as exercise_pattern
  on exercise_pattern.mapping_version_id = derived_version.exercise_pattern_version_id
join public.movement_pattern_muscle_coefficients as pattern_muscle
  on pattern_muscle.mapping_version_id = derived_version.pattern_muscle_version_id
 and pattern_muscle.movement_pattern_id = exercise_pattern.movement_pattern_id
where derived_version.code = 'initial_2026_08_10'
group by derived_version.id, exercise_pattern.exercise_id, pattern_muscle.muscle_id;

alter table public.exercise_muscle_mapping_versions enable row level security;
alter table public.exercise_muscle_coefficients enable row level security;

create policy "Authenticated users can read exercise muscle mapping versions"
  on public.exercise_muscle_mapping_versions
  for select to authenticated
  using (true);

create policy "Authenticated users can read exercise muscle coefficients"
  on public.exercise_muscle_coefficients
  for select to authenticated
  using (true);

revoke all on table public.exercise_muscle_mapping_versions from anon, authenticated;
revoke all on table public.exercise_muscle_coefficients from anon, authenticated;
grant select on table public.exercise_muscle_mapping_versions to authenticated;
grant select on table public.exercise_muscle_coefficients to authenticated;

comment on table public.exercise_muscle_mapping_versions is
  'Immutable provenance for derived exercise-to-muscle functional-composition matrices.';
comment on table public.exercise_muscle_coefficients is
  'Raw exercise-to-muscle matrix products. Scores are not normalized, percentages, force shares, or hypertrophy-stimulus estimates.';
comment on column public.exercise_muscle_coefficients.composition_score is
  'Sum across movement patterns of exercise-to-pattern coefficient multiplied by pattern-to-muscle coefficient. Values may exceed one.';

do $$
declare
  derived_version_id bigint := (
    select id
    from public.exercise_muscle_mapping_versions
    where code = 'initial_2026_08_10'
  );
begin
  if (select count(*) from public.exercise_muscle_coefficients where mapping_version_id = derived_version_id) <> 5640
    or (select count(*) from public.exercise_muscle_coefficients where mapping_version_id = derived_version_id and composition_score > 0) <> 1171
    or (select count(*) from public.exercise_muscle_coefficients where mapping_version_id = derived_version_id and composition_score > 1) <> 91
    or (select max(composition_score) from public.exercise_muscle_coefficients where mapping_version_id = derived_version_id) <> 2.000000
    or (select count(distinct exercise_id) from public.exercise_muscle_coefficients where mapping_version_id = derived_version_id) <> 141
    or (select count(distinct muscle_id) from public.exercise_muscle_coefficients where mapping_version_id = derived_version_id) <> 40
    or exists (
      select 1
      from public.exercise_muscle_coefficients as stored
      join public.exercise_muscle_mapping_versions as version on version.id = stored.mapping_version_id
      join public.exercise_movement_pattern_coefficients as exercise_pattern
        on exercise_pattern.mapping_version_id = version.exercise_pattern_version_id
       and exercise_pattern.exercise_id = stored.exercise_id
      join public.movement_pattern_muscle_coefficients as pattern_muscle
        on pattern_muscle.mapping_version_id = version.pattern_muscle_version_id
       and pattern_muscle.movement_pattern_id = exercise_pattern.movement_pattern_id
       and pattern_muscle.muscle_id = stored.muscle_id
      where stored.mapping_version_id = derived_version_id
      group by stored.mapping_version_id, stored.exercise_id, stored.muscle_id, stored.composition_score, stored.contributing_pattern_count
      having stored.composition_score <> sum(exercise_pattern.coefficient * pattern_muscle.coefficient)::numeric(10, 6)
        or stored.contributing_pattern_count <> count(*) filter (
          where exercise_pattern.coefficient > 0
            and pattern_muscle.coefficient > 0
        )
    )
  then
    raise exception 'Exercise-to-muscle derived matrix validation failed';
  end if;
end
$$;

commit;
