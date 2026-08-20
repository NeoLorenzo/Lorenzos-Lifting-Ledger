import assert from "node:assert/strict";
import test from "node:test";

// Mock minimal DOM APIs needed for feature instantiation
globalThis.document = {
  querySelector() {
    return {
      addEventListener() {},
      querySelectorAll() { return []; }
    };
  }
};

import { createPresetFeature } from "../features/presets.js";

test("createPresetFeature API signature is correct", () => {
  const mockOptions = {
    getClient: () => ({}),
    getUserId: () => "test-user-id",
    ensureExerciseCatalogue: async () => [],
    onStartPreset: () => {}
  };
  const feature = createPresetFeature(mockOptions);
  assert.equal(typeof feature.load, "function");
  assert.equal(typeof feature.reset, "function");
  assert.equal(typeof feature.openCreate, "function");
  assert.equal(typeof feature.openSessionPresetPicker, "function");
});
