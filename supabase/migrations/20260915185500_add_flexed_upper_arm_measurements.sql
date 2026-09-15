alter table public.body_circumference_measurements
  add column measurement_state text not null default 'relaxed';

alter table public.body_circumference_measurements
  add constraint body_circumference_measurements_state_check
  check (measurement_state in ('relaxed', 'flexed'));

alter table public.body_circumference_measurements
  add constraint body_circumference_measurements_flexed_site_check
  check (
    measurement_state <> 'flexed'
    or site in ('upper_arm_left', 'upper_arm_right')
  );

comment on column public.body_circumference_measurements.measurement_state is
  'Standardized measurement condition. Existing and non-upper-arm observations are relaxed; flexed is permitted only for left/right upper arms.';

drop index if exists public.body_circumference_measurements_owner_site_measured_at_idx;

create index body_circumference_measurements_owner_site_state_measured_at_idx
  on public.body_circumference_measurements (
    owner_id,
    site,
    measurement_state,
    measured_at desc,
    id desc
  );
