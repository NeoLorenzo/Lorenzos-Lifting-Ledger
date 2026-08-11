import assert from "node:assert/strict";
import test from "node:test";

import {
  isPresetNameAvailable,
  normalizePresetName,
  uniqueSessionExercises,
  validatePresetDraft,
} from "../presets.js";

test("normalizes preset names and checks uniqueness case-insensitively per loaded owner", () => {
  const presets = [{ id: 1, name: "Push Day" }];
  assert.equal(normalizePresetName("  Upper   Body  "), "Upper Body");
  assert.equal(isPresetNameAvailable(presets, "push day"), false);
  assert.equal(isPresetNameAvailable(presets, "PUSH DAY", 1), true);
  assert.equal(isPresetNameAvailable(presets, "Pull Day"), true);
});

test("extracts one alphabetical exercise pool from a previous session", () => {
  const session = {
    session_exercises: [
      { exercise_id: 9, exercise: "Row", weight: 80, reps: 8 },
      { exercise_id: 2, exercise: "Bench Press", equipment_id: "A" },
      { exercise_id: 9, exercise: "Row", is_warmup: true },
    ],
  };

  assert.deepEqual(uniqueSessionExercises(session), [
    { id: 2, name: "Bench Press" },
    { id: 9, name: "Row" },
  ]);
});

test("validates preset names and requires an exercise pool", () => {
  const presets = [{ id: 1, name: "Legs" }];
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "", exerciseIds: [1] }), "Enter a preset name.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "legs", exerciseIds: [1] }), "You already have a preset with this name.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "Push", exerciseIds: [] }), "Add at least one exercise.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "Push", exerciseIds: [1, 1] }), "");
});