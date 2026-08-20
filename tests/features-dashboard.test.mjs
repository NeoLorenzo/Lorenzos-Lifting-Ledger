import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDashboardFeature } from "../features/dashboard.js";

test("exports createDashboardFeature factory function", () => {
  assert.equal(typeof createDashboardFeature, "function");
});

test("createDashboardFeature returns lifecycle and invalidation API", () => {
  const feature = createDashboardFeature({
    getClient: () => null,
    getUserId: () => "user-123",
    getActivePageName: () => "home",
    ensureExerciseMuscleLookup: async () => new Map(),
    ensureBodyWeightState: async () => ({}),
    getBodyWeightState: () => ({ dailySeries: [], effectiveRelativeEnabled: false }),
    resolveOneRepMaxRange: () => null,
  });

  assert.equal(typeof feature.load, "function");
  assert.equal(typeof feature.invalidate, "function");
  assert.equal(typeof feature.reset, "function");
});

test("dashboard feature preserves pure analytics layer separation", async () => {
  const source = await readFile(new URL("../features/dashboard.js", import.meta.url), "utf8");

  assert.match(source, /import \{[\s\S]*\} from "\.\.\/analytics\.js";/);
  assert.doesNotMatch(source, /weight\s*\*\s*reps/i);
  assert.match(source, /export function createDashboardFeature/);
});
