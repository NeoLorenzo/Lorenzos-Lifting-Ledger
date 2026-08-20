import assert from "node:assert/strict";
import test from "node:test";

// Mock minimal DOM APIs needed for feature instantiation
globalThis.document = {
  querySelector() {
    return {
      addEventListener() {}
    };
  }
};

import { createBodyWeightFeature } from "../features/body-weight.js";

test("createBodyWeightFeature API signature is correct", () => {
  const mockOptions = {
    getClient: () => ({}),
    getUserId: () => "test-user-id",
    onInvalidateE1rmPresentations: () => {}
  };
  const feature = createBodyWeightFeature(mockOptions);
  assert.equal(typeof feature.ensureState, "function");
  assert.equal(typeof feature.getState, "function");
  assert.equal(typeof feature.loadSummary, "function");
  assert.equal(typeof feature.reset, "function");
  assert.equal(typeof feature.renderChart, "function");
  assert.equal(typeof feature.resolveOneRepMaxRange, "function");
  assert.equal(typeof feature.formatOneRepMaxRange, "function");
});

test("getState returns a safe snapshot of the empty state", () => {
  const mockOptions = {
    getClient: () => ({}),
    getUserId: () => "test-user-id",
    onInvalidateE1rmPresentations: () => {}
  };
  const feature = createBodyWeightFeature(mockOptions);
  const state = feature.getState();
  assert.equal(state.loaded, false);
  assert.equal(state.hasBodyWeight, false);
  assert.equal(state.storedRelativeEnabled, false);
  assert.equal(state.effectiveRelativeEnabled, false);
  assert.ok(state.weightByDate instanceof Map);
});
