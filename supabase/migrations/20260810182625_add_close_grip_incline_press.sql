begin;

do $$
begin
  if exists (
    select 1
    from public.exercises
    where name = 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)'
  ) then
    raise exception 'Close-grip incline plate-loaded press already exists in the catalogue';
  end if;

  if (select count(*) from public.exercises) <> 140
    or (select count(distinct exercise) from public.session_exercises) <> 141
    or (select count(*) from public.session_exercises where exercise = 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)') <> 1
  then
    raise exception 'Unexpected catalogue or workout-history state';
  end if;
end
$$;

create temporary table prior_mapping_version on commit drop as
select id
from public.movement_mapping_versions
where is_current;

insert into public.exercises (code, name, description)
values (
  'exercise_press_machine_incline_plate_loaded_close_grip',
  'Press (Machine) (Incline) (Plate Loaded) (Close Grip)',
  'Incline plate-loaded machine press performed with a close grip.'
);

update public.exercise_aliases
set exercise_id = (
  select id
  from public.exercises
  where name = 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)'
)
where normalized_alias in (
  'press (machine) (incline) (plate loaded) (close grip)',
  'chest - press (machine) (incline) (plate loaded) (close grip)'
);

update public.session_exercises
set exercise_id = (
  select id
  from public.exercises
  where name = 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)'
)
where exercise = 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)';

update public.movement_mapping_versions
set is_current = false
where id = (select id from prior_mapping_version);

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
  'catalogue_sync_2026_08_10',
  'Catalogue-synchronized 141 by 40 movement-pattern matrix',
  'published',
  true,
  'docs/MOVEMENT_PATTERN_COEFFICIENTS.md@2026-08-10',
  'Movement Pattern Mapping Matrix - Mapping_Matrix.csv',
  '6edfd9b03fc1613a6acb9e0685b35c1b6be15f939302b623c012a3db59b8dbf8',
  'a46333e27ca6c7ea3da81dfeb7583cf2a0048de8a5d6099d7e7aa4eb4843e51c',
  141,
  40,
  5640,
  559,
  'Adds the close-grip incline plate-loaded machine press required by authoritative workout history. Its coefficients provisionally inherit the otherwise identical machine variant pending exercise-specific biomechanical review.',
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
  current_version.id,
  coefficient.exercise_id,
  coefficient.movement_pattern_id,
  coefficient.coefficient,
  coefficient.rationale_status,
  coefficient.rationale
from public.exercise_movement_pattern_coefficients as coefficient
join prior_mapping_version as prior on prior.id = coefficient.mapping_version_id
cross join public.movement_mapping_versions as current_version
where current_version.code = 'catalogue_sync_2026_08_10';

insert into public.exercise_movement_pattern_coefficients (
  mapping_version_id,
  exercise_id,
  movement_pattern_id,
  coefficient,
  rationale_status,
  rationale
)
select
  current_version.id,
  close_grip.id,
  coefficient.movement_pattern_id,
  coefficient.coefficient,
  'methodology_only',
  'Provisionally inherited from Press (Machine) (Incline) (Plate Loaded), which models the same machine press joint actions. The close-grip variant requires exercise-specific biomechanical review.'
from public.exercise_movement_pattern_coefficients as coefficient
join prior_mapping_version as prior on prior.id = coefficient.mapping_version_id
join public.exercises as base
  on base.id = coefficient.exercise_id
 and base.name = 'Press (Machine) (Incline) (Plate Loaded)'
cross join public.exercises as close_grip
cross join public.movement_mapping_versions as current_version
where close_grip.name = 'Press (Machine) (Incline) (Plate Loaded) (Close Grip)'
  and current_version.code = 'catalogue_sync_2026_08_10';

do $$
declare
  current_version_id bigint := (
    select id
    from public.movement_mapping_versions
    where is_current
  );
begin
  if (select count(*) from public.exercises) <> 141
    or (select count(distinct name) from public.exercises) <> 141
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
      select 1
      from public.session_exercises as performed
      join public.exercises as exercise on exercise.id = performed.exercise_id
      where performed.exercise <> exercise.name
    )
    or (select count(*) from public.exercise_movement_pattern_coefficients where mapping_version_id = current_version_id) <> 5640
    or (select count(*) from public.exercise_movement_pattern_coefficients where mapping_version_id = current_version_id and coefficient > 0) <> 559
  then
    raise exception 'Close-grip catalogue and mapping-matrix validation failed';
  end if;
end
$$;

commit;
