begin;

update public.movement_muscle_mapping_versions
set methodology_revision = 'docs/MOVEMENT_PATTERN_TO_MUSCLE_FUNCTION.md@2026-08-10',
    documentation_file_name = 'docs/MOVEMENT_PATTERN_TO_MUSCLE_FUNCTION.md'
where code = 'initial_2026_08_10';

do $$
begin
  if (select count(*) from public.movement_muscle_mapping_versions where code = 'initial_2026_08_10') <> 1
    or (select methodology_revision from public.movement_muscle_mapping_versions where code = 'initial_2026_08_10')
      <> 'docs/MOVEMENT_PATTERN_TO_MUSCLE_FUNCTION.md@2026-08-10'
    or (select documentation_file_name from public.movement_muscle_mapping_versions where code = 'initial_2026_08_10')
      <> 'docs/MOVEMENT_PATTERN_TO_MUSCLE_FUNCTION.md'
  then
    raise exception 'Literature document-path reconciliation failed';
  end if;
end
$$;

commit;
