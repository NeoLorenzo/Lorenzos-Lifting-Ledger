do $$
begin
  if exists (
    select 1
    from public.exercises
    where name = 'Pushdown (Cable) (Bench Supported)'
       or code = 'exercise_pushdown_cable_bench_supported'
  ) then
    raise exception 'Bench-supported cable pushdown already exists';
  end if;

  if not exists (
    select 1
    from public.exercises
    where name = 'Pushdown (Cable) (EZ bar)'
  ) then
    raise exception 'Baseline cable pushdown is missing';
  end if;

  if (select count(*) from public.movement_mapping_versions where is_current) <> 1
     or (select count(*) from public.exercise_muscle_mapping_versions where is_current) <> 1
     or (select count(*) from public.exercise_muscle_relevance_versions where is_current) <> 1
  then
    raise exception 'Expected exactly one current scientific mapping version per model';
  end if;
end
$$;

create temporary table issue3_context on commit drop as
select
  (select id from public.movement_mapping_versions where is_current) as old_movement_version_id,
  (select id from public.exercise_muscle_mapping_versions where is_current) as old_derived_version_id,
  (select id from public.exercise_muscle_relevance_versions where is_current) as old_relevance_version_id,
  (select id from public.exercises where name = 'Pushdown (Cable) (EZ bar)') as base_exercise_id;

insert into public.exercises (code, name, description)
values (
  'exercise_pushdown_cable_bench_supported',
  'Pushdown (Cable) (Bench Supported)',
  'Cable triceps pushdown performed with the torso supported by a bench.'
);

update public.movement_mapping_versions
set is_current = false
where id = (select old_movement_version_id from issue3_context);

insert into public.movement_mapping_versions (
  code, name, status, is_current, methodology_revision, source_file_name, source_sha256,
  payload_sha256, exercise_count, pattern_count, cell_count, nonzero_cell_count, change_notes, published_at
)
select
  'issue3_bench_supported_pushdown_2026_09_05',
  format('Catalogue with bench-supported cable pushdown (%s by %s)', exercise_count + 1, pattern_count),
  'published',
  true,
  methodology_revision,
  'docs/scientific/issue-3-bench-supported-pushdown.json',
  '2d516c3dfd466cd33b0b0f71d564e4a62ca05af59ff11868dd355a1f56968578',
  repeat('0', 64),
  exercise_count + 1,
  pattern_count,
  cell_count + pattern_count,
  nonzero_cell_count + (
    select count(*)
    from public.exercise_movement_pattern_coefficients c
    where c.mapping_version_id = (select old_movement_version_id from issue3_context)
      and c.exercise_id = (select base_exercise_id from issue3_context)
      and c.coefficient > 0
  ),
  'Adds Pushdown (Cable) (Bench Supported). Its movement-pattern vector is inherited from Pushdown (Cable) (EZ bar): bench support changes execution context without changing the intended elbow-extension movement pattern.',
  now()
from public.movement_mapping_versions
where id = (select old_movement_version_id from issue3_context);

insert into public.exercise_movement_pattern_coefficients (
  mapping_version_id, exercise_id, movement_pattern_id, coefficient, rationale_status, rationale
)
select
  new_version.id,
  c.exercise_id,
  c.movement_pattern_id,
  c.coefficient,
  c.rationale_status,
  c.rationale
from public.exercise_movement_pattern_coefficients c
join public.movement_mapping_versions new_version
  on new_version.code = 'issue3_bench_supported_pushdown_2026_09_05'
where c.mapping_version_id = (select old_movement_version_id from issue3_context);

insert into public.exercise_movement_pattern_coefficients (
  mapping_version_id, exercise_id, movement_pattern_id, coefficient, rationale_status, rationale
)
select
  new_version.id,
  new_exercise.id,
  c.movement_pattern_id,
  c.coefficient,
  'methodology_only',
  'Inherited from Pushdown (Cable) (EZ bar): bench support changes body support/positioning but not the intended elbow-extension action.'
from public.exercise_movement_pattern_coefficients c
join public.movement_mapping_versions new_version
  on new_version.code = 'issue3_bench_supported_pushdown_2026_09_05'
cross join public.exercises new_exercise
where c.mapping_version_id = (select old_movement_version_id from issue3_context)
  and c.exercise_id = (select base_exercise_id from issue3_context)
  and new_exercise.name = 'Pushdown (Cable) (Bench Supported)';

update public.movement_mapping_versions v
set payload_sha256 = (
  select encode(
    extensions.digest(
      string_agg(
        format('%s|%s|%s', c.exercise_id, c.movement_pattern_id, c.coefficient),
        E'\n'
        order by c.exercise_id, c.movement_pattern_id
      ),
      'sha256'
    ),
    'hex'
  )
  from public.exercise_movement_pattern_coefficients c
  where c.mapping_version_id = v.id
)
where v.code = 'issue3_bench_supported_pushdown_2026_09_05';

update public.exercise_muscle_mapping_versions
set is_current = false
where id = (select old_derived_version_id from issue3_context);

insert into public.exercise_muscle_mapping_versions (
  code, name, status, is_current, exercise_pattern_version_id, pattern_muscle_version_id,
  algorithm_code, formula, payload_sha256, exercise_count, muscle_count, cell_count,
  nonzero_cell_count, over_one_cell_count, maximum_score, change_notes, published_at
)
select
  'issue3_bench_supported_pushdown_2026_09_05',
  format('Derived exercise-to-muscle matrix with bench-supported cable pushdown (%s by %s)', exercise_count + 1, muscle_count),
  'published',
  true,
  (select id from public.movement_mapping_versions where code = 'issue3_bench_supported_pushdown_2026_09_05'),
  pattern_muscle_version_id,
  algorithm_code,
  formula,
  repeat('0', 64),
  exercise_count + 1,
  muscle_count,
  cell_count + muscle_count,
  nonzero_cell_count + (
    select count(*)
    from public.exercise_muscle_coefficients c
    where c.mapping_version_id = (select old_derived_version_id from issue3_context)
      and c.exercise_id = (select base_exercise_id from issue3_context)
      and c.composition_score > 0
  ),
  over_one_cell_count + (
    select count(*)
    from public.exercise_muscle_coefficients c
    where c.mapping_version_id = (select old_derived_version_id from issue3_context)
      and c.exercise_id = (select base_exercise_id from issue3_context)
      and c.composition_score > 1
  ),
  greatest(
    maximum_score,
    (
      select max(c.composition_score)
      from public.exercise_muscle_coefficients c
      where c.mapping_version_id = (select old_derived_version_id from issue3_context)
        and c.exercise_id = (select base_exercise_id from issue3_context)
    )
  ),
  'Recomputes the current derived model for the new canonical exercise. Because its movement vector matches the existing cable pushdown, the derived muscle-composition row is identical to that baseline.',
  now()
from public.exercise_muscle_mapping_versions
where id = (select old_derived_version_id from issue3_context);

insert into public.exercise_muscle_coefficients (
  mapping_version_id, exercise_id, muscle_id, composition_score, contributing_pattern_count
)
select
  new_version.id,
  c.exercise_id,
  c.muscle_id,
  c.composition_score,
  c.contributing_pattern_count
from public.exercise_muscle_coefficients c
join public.exercise_muscle_mapping_versions new_version
  on new_version.code = 'issue3_bench_supported_pushdown_2026_09_05'
where c.mapping_version_id = (select old_derived_version_id from issue3_context);

insert into public.exercise_muscle_coefficients (
  mapping_version_id, exercise_id, muscle_id, composition_score, contributing_pattern_count
)
select
  new_version.id,
  new_exercise.id,
  c.muscle_id,
  c.composition_score,
  c.contributing_pattern_count
from public.exercise_muscle_coefficients c
join public.exercise_muscle_mapping_versions new_version
  on new_version.code = 'issue3_bench_supported_pushdown_2026_09_05'
cross join public.exercises new_exercise
where c.mapping_version_id = (select old_derived_version_id from issue3_context)
  and c.exercise_id = (select base_exercise_id from issue3_context)
  and new_exercise.name = 'Pushdown (Cable) (Bench Supported)';

update public.exercise_muscle_mapping_versions v
set payload_sha256 = (
  select encode(
    extensions.digest(
      string_agg(
        format('%s|%s|%s|%s', c.exercise_id, c.muscle_id, c.composition_score, c.contributing_pattern_count),
        E'\n'
        order by c.exercise_id, c.muscle_id
      ),
      'sha256'
    ),
    'hex'
  )
  from public.exercise_muscle_coefficients c
  where c.mapping_version_id = v.id
)
where v.code = 'issue3_bench_supported_pushdown_2026_09_05';

update public.exercise_muscle_relevance_versions
set is_current = false
where id = (select old_relevance_version_id from issue3_context);

insert into public.exercise_muscle_relevance_versions (
  code, name, status, is_current, exercise_pattern_version_id, pattern_muscle_version_id,
  source_file_name, source_sha256, documentation_file_name, documentation_sha256,
  payload_sha256, exercise_count, muscle_count, cell_count, nonzero_cell_count,
  coefficient_contract, change_notes, published_at
)
select
  'issue3_bench_supported_pushdown_2026_09_05',
  format('Exercise-to-muscle relevance with bench-supported cable pushdown (%s by %s)', exercise_count + 1, muscle_count),
  'published',
  true,
  (select id from public.movement_mapping_versions where code = 'issue3_bench_supported_pushdown_2026_09_05'),
  pattern_muscle_version_id,
  'docs/scientific/issue-3-bench-supported-pushdown.json',
  '2d516c3dfd466cd33b0b0f71d564e4a62ca05af59ff11868dd355a1f56968578',
  documentation_file_name,
  documentation_sha256,
  repeat('0', 64),
  exercise_count + 1,
  muscle_count,
  cell_count + muscle_count,
  nonzero_cell_count + (
    select count(*)
    from public.exercise_muscle_relevance_coefficients c
    where c.mapping_version_id = (select old_relevance_version_id from issue3_context)
      and c.exercise_id = (select base_exercise_id from issue3_context)
      and c.relevance > 0
  ),
  coefficient_contract,
  'Adds authored relevance for Pushdown (Cable) (Bench Supported), provisionally inheriting the existing cable-pushdown triceps relevance vector rather than inventing unsupported new coefficients.',
  now()
from public.exercise_muscle_relevance_versions
where id = (select old_relevance_version_id from issue3_context);

insert into public.exercise_muscle_relevance_coefficients (
  mapping_version_id, exercise_id, muscle_id, relevance
)
select
  new_version.id,
  c.exercise_id,
  c.muscle_id,
  c.relevance
from public.exercise_muscle_relevance_coefficients c
join public.exercise_muscle_relevance_versions new_version
  on new_version.code = 'issue3_bench_supported_pushdown_2026_09_05'
where c.mapping_version_id = (select old_relevance_version_id from issue3_context);

insert into public.exercise_muscle_relevance_coefficients (
  mapping_version_id, exercise_id, muscle_id, relevance
)
select
  new_version.id,
  new_exercise.id,
  c.muscle_id,
  c.relevance
from public.exercise_muscle_relevance_coefficients c
join public.exercise_muscle_relevance_versions new_version
  on new_version.code = 'issue3_bench_supported_pushdown_2026_09_05'
cross join public.exercises new_exercise
where c.mapping_version_id = (select old_relevance_version_id from issue3_context)
  and c.exercise_id = (select base_exercise_id from issue3_context)
  and new_exercise.name = 'Pushdown (Cable) (Bench Supported)';

update public.exercise_muscle_relevance_versions v
set payload_sha256 = (
  select encode(
    extensions.digest(
      string_agg(
        format('%s|%s|%s', c.exercise_id, c.muscle_id, c.relevance),
        E'\n'
        order by c.exercise_id, c.muscle_id
      ),
      'sha256'
    ),
    'hex'
  )
  from public.exercise_muscle_relevance_coefficients c
  where c.mapping_version_id = v.id
)
where v.code = 'issue3_bench_supported_pushdown_2026_09_05';

do $$
declare
  new_exercise_id bigint := (
    select id from public.exercises where name = 'Pushdown (Cable) (Bench Supported)'
  );
  base_exercise_id bigint := (
    select base_exercise_id from issue3_context
  );
  movement_version_id bigint := (
    select id from public.movement_mapping_versions where code = 'issue3_bench_supported_pushdown_2026_09_05'
  );
  derived_version_id bigint := (
    select id from public.exercise_muscle_mapping_versions where code = 'issue3_bench_supported_pushdown_2026_09_05'
  );
  relevance_version_id bigint := (
    select id from public.exercise_muscle_relevance_versions where code = 'issue3_bench_supported_pushdown_2026_09_05'
  );
begin
  if new_exercise_id is null
    or (select count(*) from public.movement_mapping_versions where is_current) <> 1
    or (select count(*) from public.exercise_muscle_mapping_versions where is_current) <> 1
    or (select count(*) from public.exercise_muscle_relevance_versions where is_current) <> 1
    or exists (
      select movement_pattern_id, coefficient
      from public.exercise_movement_pattern_coefficients
      where mapping_version_id = movement_version_id and exercise_id = new_exercise_id
      except
      select movement_pattern_id, coefficient
      from public.exercise_movement_pattern_coefficients
      where mapping_version_id = movement_version_id and exercise_id = base_exercise_id
    )
    or exists (
      select muscle_id, composition_score, contributing_pattern_count
      from public.exercise_muscle_coefficients
      where mapping_version_id = derived_version_id and exercise_id = new_exercise_id
      except
      select muscle_id, composition_score, contributing_pattern_count
      from public.exercise_muscle_coefficients
      where mapping_version_id = derived_version_id and exercise_id = base_exercise_id
    )
    or exists (
      select muscle_id, relevance
      from public.exercise_muscle_relevance_coefficients
      where mapping_version_id = relevance_version_id and exercise_id = new_exercise_id
      except
      select muscle_id, relevance
      from public.exercise_muscle_relevance_coefficients
      where mapping_version_id = relevance_version_id and exercise_id = base_exercise_id
    )
  then
    raise exception 'Bench-supported cable pushdown catalogue/mapping validation failed';
  end if;
end
$$;
