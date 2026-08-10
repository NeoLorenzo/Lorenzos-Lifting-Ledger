begin;

create temporary table exercise_consolidation (
  source_id bigint primary key,
  target_id bigint not null,
  source_name text not null unique,
  final_name text not null
) on commit drop;

insert into exercise_consolidation (source_id, target_id, source_name, final_name)
select source.id, target.id, mapping.source_name, mapping.final_name
from (
  values
    ('Back Extentions (Dumbbell)', 'Back Extentions (Dumbbell)', 'Back Extensions (Dumbbell)'),
    ('Back Extentions (Dumbbell) (45)', 'Back Extentions (Dumbbell)', 'Back Extensions (Dumbbell)'),
    ('Back Extentions (Dumbbell) (55)', 'Back Extentions (Dumbbell)', 'Back Extensions (Dumbbell)'),
    ('Fly (Cable) (Bent Over Standing)', 'Fly (Cable) (Bent Over Standing)', 'Chest Fly (Cable) (Bent Over Standing) (Horizontal)'),
    ('Fly (Cable) (Kneeling)', 'Fly (Cable) (Kneeling)', 'Chest Fly (Cable) (Kneeling) (Horizontal)'),
    ('Fly (Cable) (Seated)', 'Fly (Cable) (Seated)', 'Chest Fly (Cable) (Seated) (Horizontal)'),
    ('Press (Machine) (Incline) (Plate Loaded) (Close Grip)', 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)', 'Press (Machine) (Incline) (Plate Loaded) (Close Neutral Grip)'),
    ('Thinker Curls (Cable) (Unilateral)', 'Wrist Curls (Cable) (Unilateral)', 'Wrist Curls (Cable) (Unilateral)'),
    ('Wrist Curls (Cable) (Unilateral)', 'Wrist Curls (Cable) (Unilateral)', 'Wrist Curls (Cable) (Unilateral)')
) as mapping(source_name, target_name, final_name)
join public.exercises as source on source.name = mapping.source_name
join public.exercises as target on target.name = mapping.target_name;

create temporary table consolidation_counts on commit drop as
select
  (select count(*) from public.session_exercises) as session_exercise_count,
  (select count(*) from public.exercise_sets) as exercise_set_count,
  (select count(*) from public.lift_entries) as lift_entry_count;

do $$
begin
  if (select count(*) from exercise_consolidation) <> 9
    or (select count(distinct target_id) from exercise_consolidation) <> 6
    or (select count(*) from public.exercises) <> 141
    or (select count(*) from public.movement_mapping_versions where is_current) <> 1
    or (select count(*) from public.exercise_muscle_mapping_versions where is_current) <> 1
  then
    raise exception 'Unexpected exercise catalogue state before consolidation';
  end if;
end
$$;

create temporary table retained_pattern_coefficients on commit drop as
select
  coefficient.exercise_id,
  coefficient.movement_pattern_id,
  coefficient.coefficient,
  coefficient.rationale_status,
  coefficient.rationale
from public.exercise_movement_pattern_coefficients as coefficient
join public.movement_mapping_versions as version
  on version.id = coefficient.mapping_version_id
 and version.is_current
where coefficient.exercise_id not in (
  select source_id
  from exercise_consolidation
  where source_id <> target_id
);

update public.session_exercises as performed
set exercise_id = mapping.target_id,
    exercise = mapping.final_name
from exercise_consolidation as mapping
where performed.exercise_id = mapping.source_id;

update public.lift_entries as entry
set exercise = mapping.final_name
from exercise_consolidation as mapping
where entry.exercise = mapping.source_name;

delete from public.exercise_muscle_coefficients;
delete from public.exercise_muscle_mapping_versions;
delete from public.exercise_movement_pattern_coefficients;
delete from public.movement_mapping_versions;

delete from public.exercise_aliases as alias
using exercise_consolidation as mapping
where alias.exercise_id = mapping.source_id;

delete from public.exercises as exercise
using exercise_consolidation as mapping
where exercise.id = mapping.source_id
  and mapping.source_id <> mapping.target_id;

update public.exercises as exercise
set name = target.final_name,
    code = case
      when target.final_name = 'Press (Machine) (Incline) (Plate Loaded) (Close Neutral Grip)'
        then 'exercise_press_machine_incline_plate_loaded_close_neutral_grip'
      else exercise.code
    end,
    description = case
      when target.final_name = 'Press (Machine) (Incline) (Plate Loaded) (Close Neutral Grip)'
        then 'Incline plate-loaded machine press performed with a close neutral grip.'
      else exercise.description
    end
from (
  select distinct target_id, final_name
  from exercise_consolidation
) as target
where exercise.id = target.target_id;

insert into public.exercise_aliases (exercise_id, alias)
select distinct target_id, final_name
from exercise_consolidation;

update public.data_imports
set source_sha256 = '74674ae367a59d5afc3d78bc83eae1bcad50963728d561877308358ba7546964',
    canonical_sha256 = '7be8f79657f58ea9f7567de99a35611bc44aa566ed0f490a9fca557ddb2ace04'
where source_file_name = 'Lorenzo Gym Data - All Gym Data.csv'
  and source_row_count = 1936;

insert into public.movement_mapping_versions (
  code,
  name,
  status,
  is_current,
  methodology_revision,
  source_file_name,
  source_sha256,
  payload_sha256,
  exercise_count,
  pattern_count,
  cell_count,
  nonzero_cell_count,
  change_notes,
  published_at
)
values (
  'exercise_definitions_2026_08_10',
  'Consolidated 138 by 40 movement-pattern matrix',
  'published',
  true,
  'docs/MOVEMENT_PATTERN_COEFFICIENTS.md@2026-08-10-exercise-consolidation',
  'Movement Pattern Mapping Matrix - Mapping_Matrix.csv',
  '86ff8691bcc171d221704f438c54168f27b8bfdfcce4c6227359a81817f1310f',
  'b75edff4169e6f30b048339ab3c65a74543d56dd80b343c62afb87de1f843746',
  138,
  40,
  5520,
  548,
  'Renames four exercise definitions and consolidates the angled back-extension variants and Thinker Curls into their authoritative survivor exercises. Survivor coefficients are retained without averaging.',
  now()
);

insert into public.exercise_movement_pattern_coefficients (
  mapping_version_id,
  exercise_id,
  movement_pattern_id,
  coefficient,
  rationale_status,
  rationale
)
select
  version.id,
  coefficient.exercise_id,
  coefficient.movement_pattern_id,
  coefficient.coefficient,
  coefficient.rationale_status,
  coefficient.rationale
from retained_pattern_coefficients as coefficient
cross join public.movement_mapping_versions as version
where version.is_current;

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
  'exercise_definitions_2026_08_10',
  'Consolidated 138 by 40 exercise-to-muscle functional composition matrix',
  'published',
  true,
  exercise_pattern.id,
  pattern_muscle.id,
  'raw_sum_product_v1',
  'score(e,m) = sum over movement patterns p of exercise_pattern(e,p) * pattern_muscle(p,m)',
  '56a34dfe0c65f4e95d706190c05baf9defd743994225ac7e897d3cff64d9465c',
  138,
  40,
  5520,
  1152,
  91,
  2.000000,
  'Recomputed from the consolidated exercise catalogue. Raw scores remain unnormalized and are not hypertrophy-stimulus estimates.',
  now()
from public.movement_mapping_versions as exercise_pattern
cross join public.movement_muscle_mapping_versions as pattern_muscle
where exercise_pattern.is_current
  and pattern_muscle.is_current;

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
where derived_version.is_current
group by derived_version.id, exercise_pattern.exercise_id, pattern_muscle.muscle_id;

do $$
declare
  current_pattern_version_id bigint := (
    select id from public.movement_mapping_versions where is_current
  );
  current_muscle_version_id bigint := (
    select id from public.exercise_muscle_mapping_versions where is_current
  );
begin
  if (select count(*) from public.exercises) <> 138
    or (select count(distinct name) from public.exercises) <> 138
    or (select count(*) from public.exercises where code = 'exercise_press_machine_incline_plate_loaded_close_neutral_grip') <> 1
    or (select count(*) from public.session_exercises) <> (select session_exercise_count from consolidation_counts)
    or (select count(*) from public.exercise_sets) <> (select exercise_set_count from consolidation_counts)
    or (select count(*) from public.lift_entries) <> (select lift_entry_count from consolidation_counts)
    or exists (
      select 1
      from public.session_exercises as performed
      join public.exercises as exercise on exercise.id = performed.exercise_id
      where performed.exercise <> exercise.name
    )
    or exists (
      select exercise as name from public.session_exercises
      except
      select name from public.exercises
    )
    or exists (
      select name from public.exercises
      except
      select exercise as name from public.session_exercises
    )
    or exists (
      select 1 from public.exercises
      where name in (select source_name from exercise_consolidation where source_name <> final_name)
    )
    or exists (
      select 1 from public.session_exercises
      where exercise in (select source_name from exercise_consolidation where source_name <> final_name)
    )
    or exists (
      select 1 from public.exercise_aliases
      where alias in (select source_name from exercise_consolidation where source_name <> final_name)
    )
    or (select count(*) from public.movement_mapping_versions) <> 1
    or (select count(*) from public.exercise_muscle_mapping_versions) <> 1
    or (select count(*) from public.exercise_movement_pattern_coefficients where mapping_version_id = current_pattern_version_id) <> 5520
    or (select count(*) from public.exercise_movement_pattern_coefficients where mapping_version_id = current_pattern_version_id and coefficient > 0) <> 548
    or (select count(*) from public.exercise_muscle_coefficients where mapping_version_id = current_muscle_version_id) <> 5520
    or (select count(*) from public.exercise_muscle_coefficients where mapping_version_id = current_muscle_version_id and composition_score > 0) <> 1152
    or (select count(*) from public.exercise_muscle_coefficients where mapping_version_id = current_muscle_version_id and composition_score > 1) <> 91
    or (select max(composition_score) from public.exercise_muscle_coefficients where mapping_version_id = current_muscle_version_id) <> 2.000000
  then
    raise exception 'Exercise-definition consolidation validation failed';
  end if;
end
$$;

commit;
