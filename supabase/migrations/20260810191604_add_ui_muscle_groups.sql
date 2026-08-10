begin;

create table public.ui_muscle_groups (
  id bigint generated always as identity primary key,
  source_order smallint not null unique check (source_order > 0),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null unique check (
    name <> ''
    and name = regexp_replace(btrim(name), '\s+', ' ', 'g')
  ),
  created_at timestamptz not null default now()
);

insert into public.ui_muscle_groups (source_order, code, name)
values
  (1, 'abs', 'Abs'),
  (2, 'adductors', 'Adductors'),
  (3, 'back', 'Back'),
  (4, 'biceps', 'Biceps'),
  (5, 'calves', 'Calves'),
  (6, 'chest', 'Chest'),
  (7, 'forearms', 'Forearms'),
  (8, 'glutes', 'Glutes'),
  (9, 'hamstrings', 'Hamstrings'),
  (10, 'hip_flexors', 'Hip Flexors'),
  (11, 'quads', 'Quads'),
  (12, 'shoulders', 'Shoulders'),
  (13, 'triceps', 'Triceps');

alter table public.muscles
  add column ui_muscle_group_id bigint;

with expected(muscle_code, ui_group_code) as (
  values
    ('rectus_abdominis', 'abs'),
    ('obliques', 'abs'),
    ('adductor_magnus', 'adductors'),
    ('other_hip_adductors', 'adductors'),
    ('latissimus_dorsi', 'back'),
    ('teres_major', 'back'),
    ('upper_trapezius', 'back'),
    ('middle_trapezius', 'back'),
    ('lower_trapezius', 'back'),
    ('rhomboids', 'back'),
    ('serratus_anterior', 'back'),
    ('lumbar_erector_spinae', 'back'),
    ('biceps_brachii', 'biceps'),
    ('brachialis', 'biceps'),
    ('gastrocnemius', 'calves'),
    ('soleus', 'calves'),
    ('pectoralis_major_clavicular', 'chest'),
    ('pectoralis_major_sternocostal', 'chest'),
    ('pectoralis_minor', 'chest'),
    ('brachioradialis', 'forearms'),
    ('wrist_flexors', 'forearms'),
    ('wrist_extensors', 'forearms'),
    ('finger_flexors_grip', 'forearms'),
    ('gluteus_maximus', 'glutes'),
    ('gluteus_medius_minimus', 'glutes'),
    ('biceps_femoris_long_head', 'hamstrings'),
    ('biceps_femoris_short_head', 'hamstrings'),
    ('semitendinosus', 'hamstrings'),
    ('semimembranosus', 'hamstrings'),
    ('iliopsoas', 'hip_flexors'),
    ('rectus_femoris', 'quads'),
    ('vastus_lateralis', 'quads'),
    ('vastus_medialis', 'quads'),
    ('vastus_intermedius', 'quads'),
    ('anterior_deltoid', 'shoulders'),
    ('lateral_deltoid', 'shoulders'),
    ('posterior_deltoid', 'shoulders'),
    ('triceps_brachii_long_head', 'triceps'),
    ('triceps_brachii_lateral_head', 'triceps'),
    ('triceps_brachii_medial_head', 'triceps')
)
update public.muscles as muscle
set ui_muscle_group_id = ui_group.id
from expected
join public.ui_muscle_groups as ui_group
  on ui_group.code = expected.ui_group_code
where muscle.code = expected.muscle_code;

alter table public.muscles
  alter column ui_muscle_group_id set not null,
  add constraint muscles_ui_muscle_group_id_fkey
    foreign key (ui_muscle_group_id)
    references public.ui_muscle_groups(id)
    on delete restrict;

create index muscles_ui_muscle_group_id_idx
  on public.muscles (ui_muscle_group_id, source_order);

alter table public.ui_muscle_groups enable row level security;

create policy "Authenticated users can read UI muscle groups"
  on public.ui_muscle_groups
  for select
  to authenticated
  using (true);

revoke all on table public.ui_muscle_groups from anon, authenticated;
grant select on table public.ui_muscle_groups to authenticated;

comment on table public.ui_muscle_groups is
  'Stable display-level muscle groups for labels, filters, charts, and other UI aggregation. These groups do not replace the canonical muscle entities used by the scientific model.';

comment on column public.muscles.ui_muscle_group_id is
  'Required display grouping for this canonical muscle entity. Scientific calculations continue to use the underlying muscle entity.';

do $$
begin
  if (select count(*) from public.ui_muscle_groups) <> 13
    or (select count(distinct source_order) from public.ui_muscle_groups) <> 13
    or (select count(*) from public.muscles) <> 40
    or (select count(*) from public.muscles where ui_muscle_group_id is not null) <> 40
    or (select count(distinct ui_muscle_group_id) from public.muscles) <> 13
    or exists (
      with expected(ui_group_code, member_count) as (
        values
          ('abs', 2),
          ('adductors', 2),
          ('back', 8),
          ('biceps', 2),
          ('calves', 2),
          ('chest', 3),
          ('forearms', 4),
          ('glutes', 2),
          ('hamstrings', 4),
          ('hip_flexors', 1),
          ('quads', 4),
          ('shoulders', 3),
          ('triceps', 3)
      ), actual as (
        select ui_group.code, count(muscle.id)::integer as member_count
        from public.ui_muscle_groups as ui_group
        left join public.muscles as muscle
          on muscle.ui_muscle_group_id = ui_group.id
        group by ui_group.code
      )
      select 1
      from expected
      join actual on actual.code = expected.ui_group_code
      where actual.member_count <> expected.member_count
    )
  then
    raise exception 'UI muscle-group catalogue validation failed';
  end if;
end
$$;

commit;
