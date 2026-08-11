create index workout_preset_exercises_preset_owner_idx
  on public.workout_preset_exercises (preset_id, owner_id);
