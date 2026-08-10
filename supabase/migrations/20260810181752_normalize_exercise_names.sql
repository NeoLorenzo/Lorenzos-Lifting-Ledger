begin;

create temporary table exercise_name_changes on commit drop as
select
  id as exercise_id,
  name as old_name,
  case
    when name like 'Shoulders - Press%'
      then 'Overhead Press' || substr(name, length('Shoulders - Press') + 1)
    else regexp_replace(
      name,
      '^(Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - ',
      ''
    )
  end as new_name
from public.exercises;

do $$
begin
  if exists (
    select new_name
    from exercise_name_changes
    group by new_name
    having count(*) > 1
  ) then
    raise exception 'Exercise-name normalization would create duplicate canonical names';
  end if;
end
$$;

update public.exercises as exercise
set name = change.new_name
from exercise_name_changes as change
where exercise.id = change.exercise_id
  and exercise.name is distinct from change.new_name;

update public.session_exercises
set exercise = case
  when exercise like 'Shoulders - Press%'
    then 'Overhead Press' || substr(exercise, length('Shoulders - Press') + 1)
  else regexp_replace(
    exercise,
    '^(Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - ',
    ''
  )
end
where exercise ~ '^(Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - ';

update public.lift_entries
set exercise = case
  when exercise like 'Shoulders - Press%'
    then 'Overhead Press' || substr(exercise, length('Shoulders - Press') + 1)
  else regexp_replace(
    exercise,
    '^(Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - ',
    ''
  )
end
where exercise ~ '^(Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - ';

-- Keep the old prefixed aliases for backwards-compatible imports, and add every
-- new canonical or historical spelling as an alias for the same stable exercise ID.
insert into public.exercise_aliases (exercise_id, alias)
select id, name
from public.exercises
on conflict (normalized_alias) do nothing;

insert into public.exercise_aliases (exercise_id, alias)
select distinct exercise_id, exercise
from public.session_exercises
where exercise_id is not null
on conflict (normalized_alias) do nothing;

update public.data_imports
set source_sha256 = '30ccadd9c7d843163090c6cf3561bf33076571b57472df906c1a7e356b37fd20',
    canonical_sha256 = 'c979a9a53e379f46cbe20599e982410763aa912bbc53bcb3d87dda95f71d8219'
where source_file_name = 'Lorenzo Gym Data - All Gym Data.csv'
  and source_row_count = 1936;

do $$
begin
  if (select count(*) from public.exercises) <> 140
    or (select count(distinct name) from public.exercises) <> 140
    or exists (
      select 1
      from public.exercises
      where name ~ '^(Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - '
    )
    or (select count(*) from public.exercises where name like 'Overhead Press%') <> 7
    or exists (
      select 1
      from public.session_exercises as performed
      join public.exercise_aliases as alias
        on alias.normalized_alias = lower(regexp_replace(btrim(performed.exercise), '\s+', ' ', 'g'))
      where alias.exercise_id <> performed.exercise_id
    )
  then
    raise exception 'Exercise-name normalization validation failed';
  end if;
end
$$;

commit;
