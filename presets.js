export function normalizePresetName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isPresetNameAvailable(presets, name, ignoredPresetId = null) {
  const normalized = normalizePresetName(name).toLocaleLowerCase();
  return !presets.some((preset) => (
    String(preset.id) !== String(ignoredPresetId)
    && normalizePresetName(preset.name).toLocaleLowerCase() === normalized
  ));
}

export function uniqueSessionExercises(session) {
  const exercises = session?.session_exercises ?? [];
  return [...new Map(
    exercises
      .filter((exercise) => exercise.exercise_id !== null && exercise.exercise_id !== undefined)
      .map((exercise) => [String(exercise.exercise_id), {
        id: exercise.exercise_id,
        name: exercise.exercises?.name ?? exercise.exercise,
      }]),
  ).values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function validatePresetDraft({ presets, presetId, name, exerciseIds }) {
  const normalizedName = normalizePresetName(name);
  if (!normalizedName) return "Enter a preset name.";
  if (normalizedName.length > 100) return "Preset names can contain at most 100 characters.";
  if (!isPresetNameAvailable(presets, normalizedName, presetId)) return "You already have a preset with this name.";
  if (new Set(exerciseIds.map(String)).size === 0) return "Add at least one exercise.";
  return "";
}