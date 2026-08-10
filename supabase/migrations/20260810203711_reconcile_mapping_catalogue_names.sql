begin;

do $$
begin
  if (select count(*) from public.exercises) <> 138
    or (select count(*) from public.movement_mapping_versions where is_current) <> 1
    or (select code from public.movement_mapping_versions where is_current) <> 'exercise_definitions_2026_08_10'
    or (select count(*) from public.exercise_muscle_mapping_versions where is_current) <> 1
    or (select code from public.exercise_muscle_mapping_versions where is_current) <> 'exercise_definitions_2026_08_10'
    or not exists (select 1 from public.exercises where name = 'Curl (Cable) (EZ Bar Attachment)')
    or not exists (select 1 from public.exercises where name = 'French Press (Cable) (EZ Bar Attachment)')
    or not exists (select 1 from public.exercises where name = 'Overhead Press (Landmine) (Barbell) (Kneeling)')
    or not exists (select 1 from public.exercises where name = 'Pullover (Cable) (EZ Bar Attachment)')
    or exists (
      select 1
      from public.exercises
      where name in (
        'Curl (Cable) (EZ Bar)',
        'French Press (Cable) (EZ Bar)',
        'Overhead Press (Landmine) (Kneeling)',
        'Pullover (Cable) (EZ Bar)'
      )
    )
  then
    raise exception 'Catalogue is not in the expected authoritative workout-history state';
  end if;
end
$$;

update public.movement_mapping_versions
set source_sha256 = '93cc08e6b5c4751f7e8d3b7546a2bf4ea2fc567d25a9aea1f7c85087ceaa6c27',
    payload_sha256 = 'b9c35da6e826ad1666fc1893f69e3bbbe6bda524918f21ce6d34bd45f3965318',
    change_notes = 'Consolidates the requested exercise definitions and reconciles four source CSV labels to the authoritative workout-history/catalogue names. Movement coefficients are unchanged.'
where is_current
  and code = 'exercise_definitions_2026_08_10';

update public.exercise_muscle_mapping_versions
set payload_sha256 = '5d2aa404f975039f337aea446bf07e3fbad6c299786858fab9c62e2f0419cdf5',
    change_notes = 'Recomputed functional-composition payload identity after aligning four exercise labels with the authoritative workout-history catalogue. Scores are unchanged.'
where is_current
  and code = 'exercise_definitions_2026_08_10';

do $$
begin
  if (select source_sha256 from public.movement_mapping_versions where is_current)
       <> '93cc08e6b5c4751f7e8d3b7546a2bf4ea2fc567d25a9aea1f7c85087ceaa6c27'
    or (select payload_sha256 from public.movement_mapping_versions where is_current)
       <> 'b9c35da6e826ad1666fc1893f69e3bbbe6bda524918f21ce6d34bd45f3965318'
    or (select payload_sha256 from public.exercise_muscle_mapping_versions where is_current)
       <> '5d2aa404f975039f337aea446bf07e3fbad6c299786858fab9c62e2f0419cdf5'
    or (select count(*) from public.exercise_movement_pattern_coefficients as coefficient
        join public.movement_mapping_versions as version on version.id = coefficient.mapping_version_id
        where version.is_current) <> 5520
    or (select count(*) from public.exercise_muscle_coefficients as coefficient
        join public.exercise_muscle_mapping_versions as version on version.id = coefficient.mapping_version_id
        where version.is_current) <> 5520
  then
    raise exception 'Mapping catalogue-name provenance reconciliation failed';
  end if;
end
$$;

commit;
