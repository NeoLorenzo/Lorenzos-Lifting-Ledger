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
      { exercise_id: 9, exercise: "Row", exercise_sets: [{ id: 1 }, { id: 2 }] },
      { exercise_id: 2, exercise: "Bench Press", exercise_sets: [{ id: 3 }, { id: 4 }, { id: 5 }] },
      { exercise_id: 9, exercise: "Row", exercise_sets: [{ id: 6 }] },
    ],
  };

  assert.deepEqual(uniqueSessionExercises(session), [
    { id: 2, name: "Bench Press", setCount: 3 },
    { id: 9, name: "Row", setCount: 3 },
  ]);
});

test("validates preset names and requires an exercise pool", () => {
  const presets = [{ id: 1, name: "Legs" }];
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "", exerciseIds: [1] }), "Enter a preset name.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "legs", exerciseIds: [1] }), "You already have a preset with this name.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "Push", exerciseIds: [] }), "Add at least one exercise.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "Push", exerciseIds: [1, 1] }), "");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "Push", exerciseIds: [1], setCounts: [0] }), "Each exercise must have between 1 and 20 sets.");
  assert.equal(validatePresetDraft({ presets, presetId: null, name: "Push", exerciseIds: [1, 2], setCounts: [3, 4] }), "");
});