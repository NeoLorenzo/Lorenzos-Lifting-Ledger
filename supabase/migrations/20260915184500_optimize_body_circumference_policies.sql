alter table public.body_circumference_measurements
  drop constraint body_circumference_measurements_value_check,
  add constraint body_circumference_measurements_value_check check (
    circumference_cm > 0 and circumference_cm <> 'NaN'::numeric
  );

drop policy "Owners can read body circumference measurements" on public.body_circumference_measurements;
drop policy "Owners can insert body circumference measurements" on public.body_circumference_measurements;
drop policy "Owners can update body circumference measurements" on public.body_circumference_measurements;
drop policy "Owners can delete body circumference measurements" on public.body_circumference_measurements;

create policy "Owners can read body circumference measurements"
  on public.body_circumference_measurements
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can insert body circumference measurements"
  on public.body_circumference_measurements
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update body circumference measurements"
  on public.body_circumference_measurements
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete body circumference measurements"
  on public.body_circumference_measurements
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
