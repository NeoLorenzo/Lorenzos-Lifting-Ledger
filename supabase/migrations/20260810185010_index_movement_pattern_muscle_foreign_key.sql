begin;

create index movement_pattern_muscle_coefficients_pattern_idx
  on public.movement_pattern_muscle_coefficients (
    movement_pattern_id,
    mapping_version_id,
    muscle_id
  );

commit;
