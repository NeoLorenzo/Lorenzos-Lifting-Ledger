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
  const byExercise = new Map();
  for (const exercise of session?.session_exercises ?? []) {
    if (exercise.exercise_id === null || exercise.exercise_id === undefined) continue;
    const key = String(exercise.exercise_id);
    const existing = byExercise.get(key);
    const setCount = Math.max(1, exercise.exercise_sets?.length ?? 1);
    if (existing) {
      existing.setCount += setCount;
    } else {
      byExercise.set(key, {
        id: exercise.exercise_id,
        name: exercise.exercises?.name ?? exercise.exercise,
        setCount,
      });
    }
  }
  return [...byExercise.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function validatePresetDraft({ presets, presetId, name, exerciseIds, setCounts = [] }) {
  const normalizedName = normalizePresetName(name);
  if (!normalizedName) return "Enter a preset name.";
  if (normalizedName.length > 100) return "Preset names can contain at most 100 characters.";
  if (!isPresetNameAvailable(presets, normalizedName, presetId)) return "You already have a preset with this name.";
  if (new Set(exerciseIds.map(String)).size === 0) return "Add at least one exercise.";
  const counts = setCounts.length ? setCounts : exerciseIds.map(() => 1);
  if (counts.length !== exerciseIds.length || counts.some((count) => !Number.isInteger(count) || count < 1 || count > 20)) {
    return "Each exercise must have between 1 and 20 sets.";
  }
  return "";
}