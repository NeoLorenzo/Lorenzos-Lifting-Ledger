begin;

create table public.muscles (
  id bigint generated always as identity primary key,
  source_order smallint not null unique check (source_order > 0),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null unique check (
    name <> ''
    and name = regexp_replace(btrim(name), '\s+', ' ', 'g')
  ),
  muscle_group text not null check (
    muscle_group in (
      'chest',
      'shoulders',
      'back_scapular',
      'elbow_flexors',
      'elbow_extensors',
      'forearms_grip',
      'trunk_hip_flexors',
      'gluteal',
      'hip_adductors',
      'quadriceps',
      'hamstrings',
      'calves'
    )
  ),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.muscles (source_order, code, name, muscle_group)
values
  (1, 'pectoralis_major_clavicular', 'Pectoralis Major — Clavicular', 'chest'),
  (2, 'pectoralis_major_sternocostal', 'Pectoralis Major — Sternocostal', 'chest'),
  (3, 'pectoralis_minor', 'Pectoralis Minor', 'chest'),
  (4, 'anterior_deltoid', 'Anterior Deltoid', 'shoulders'),
  (5, 'lateral_deltoid', 'Lateral Deltoid', 'shoulders'),
  (6, 'posterior_deltoid', 'Posterior Deltoid', 'shoulders'),
  (7, 'latissimus_dorsi', 'Latissimus Dorsi', 'back_scapular'),
  (8, 'teres_major', 'Teres Major', 'back_scapular'),
  (9, 'upper_trapezius', 'Upper Trapezius', 'back_scapular'),
  (10, 'middle_trapezius', 'Middle Trapezius', 'back_scapular'),
  (11, 'lower_trapezius', 'Lower Trapezius', 'back_scapular'),
  (12, 'rhomboids', 'Rhomboids', 'back_scapular'),
  (13, 'serratus_anterior', 'Serratus Anterior', 'back_scapular'),
  (14, 'lumbar_erector_spinae', 'Lumbar Erector Spinae', 'back_scapular'),
  (15, 'biceps_brachii', 'Biceps Brachii', 'elbow_flexors'),
  (16, 'brachialis', 'Brachialis', 'elbow_flexors'),
  (17, 'brachioradialis', 'Brachioradialis', 'elbow_flexors'),
  (18, 'triceps_brachii_long_head', 'Triceps Brachii — Long Head', 'elbow_extensors'),
  (19, 'triceps_brachii_lateral_head', 'Triceps Brachii — Lateral Head', 'elbow_extensors'),
  (20, 'triceps_brachii_medial_head', 'Triceps Brachii — Medial Head', 'elbow_extensors'),
  (21, 'wrist_flexors', 'Wrist Flexors', 'forearms_grip'),
  (22, 'wrist_extensors', 'Wrist Extensors', 'forearms_grip'),
  (23, 'finger_flexors_grip', 'Finger Flexors / Grip', 'forearms_grip'),
  (24, 'rectus_abdominis', 'Rectus Abdominis', 'trunk_hip_flexors'),
  (25, 'obliques', 'Obliques', 'trunk_hip_flexors'),
  (26, 'iliopsoas', 'Iliopsoas', 'trunk_hip_flexors'),
  (27, 'gluteus_maximus', 'Gluteus Maximus', 'gluteal'),
  (28, 'gluteus_medius_minimus', 'Gluteus Medius + Minimus', 'gluteal'),
  (29, 'adductor_magnus', 'Adductor Magnus', 'hip_adductors'),
  (30, 'other_hip_adductors', 'Other Hip Adductors', 'hip_adductors'),
  (31, 'rectus_femoris', 'Rectus Femoris', 'quadriceps'),
  (32, 'vastus_lateralis', 'Vastus Lateralis', 'quadriceps'),
  (33, 'vastus_medialis', 'Vastus Medialis', 'quadriceps'),
  (34, 'vastus_intermedius', 'Vastus Intermedius', 'quadriceps'),
  (35, 'biceps_femoris_long_head', 'Biceps Femoris — Long Head', 'hamstrings'),
  (36, 'biceps_femoris_short_head', 'Biceps Femoris — Short Head', 'hamstrings'),
  (37, 'semitendinosus', 'Semitendinosus', 'hamstrings'),
  (38, 'semimembranosus', 'Semimembranosus', 'hamstrings'),
  (39, 'gastrocnemius', 'Gastrocnemius', 'calves'),
  (40, 'soleus', 'Soleus', 'calves');

alter table public.muscles enable row level security;

create policy "Authenticated users can read muscles"
  on public.muscles
  for select
  to authenticated
  using (true);

revoke all on table public.muscles from anon, authenticated;
grant select on table public.muscles to authenticated;

comment on table public.muscles is
  'Global 40-entity muscle catalogue defined by docs/MUSCLE_GROUP_TAXONOMY.md. Stable IDs and codes are intended for versioned movement-pattern-to-muscle mappings.';

do $$
begin
  if (select count(*) from public.muscles) <> 40
    or (select count(distinct source_order) from public.muscles) <> 40
    or (select min(source_order) from public.muscles) <> 1
    or (select max(source_order) from public.muscles) <> 40
    or (select count(distinct code) from public.muscles) <> 40
    or (select count(distinct name) from public.muscles) <> 40
  then
    raise exception 'Muscle catalogue validation failed';
  end if;
end
$$;

commit;
