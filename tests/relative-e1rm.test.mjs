import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRelativeOneRepMaxRange,
  getEffectiveRelativeMode,
  getOneRepMaxMidpoint,
  resolveOneRepMaxEstimates,
  resolveOneRepMaxRange,
} from "../relative-e1rm.js";

test("normalizes all four e1RM identities independently", () => {
  const result = resolveOneRepMaxEstimates({ observedBrzycki: 120, observedEpley: 124, adjustedBrzycki: 128, adjustedEpley: 132 }, 80, { relativeEnabled: true });
  assert.deepEqual(result.values, { observedBrzycki: 1.5, observedEpley: 1.55, adjustedBrzycki: 1.6, adjustedEpley: 1.65 });
});

test("converts both absolute e1RM bounds using body weight on the workout date", () => {
  assert.deepEqual(calculateRelativeOneRepMaxRange(120, 126, 80), { low: 1.5, high: 1.575 });
  const range = resolveOneRepMaxRange({
    low: 120, high: 126, performedOn: "2026-08-02", relativeEnabled: true,
    weightByDate: new Map([["2026-08-02", 80]]),
  });
  assert.equal(range.low, 1.5);
  assert.equal(getOneRepMaxMidpoint(range), 1.5375);
  assert.equal(range.unit, "× BW");
});

test("measured and interpolated daily-series dates both drive the same exact-date lookup", () => {
  const weights = new Map([["2026-08-01", 80], ["2026-08-02", 79.5]]);
  assert.equal(resolveOneRepMaxRange({ low: 80, high: 80, performedOn: "2026-08-01", relativeEnabled: true, weightByDate: weights }).low, 1);
  assert.equal(resolveOneRepMaxRange({ low: 79.5, high: 79.5, performedOn: "2026-08-02", relativeEnabled: true, weightByDate: weights }).low, 1);
});

test("relative mode never extrapolates or falls back to absolute values", () => {
  const result = resolveOneRepMaxRange({
    low: 100, high: 105, performedOn: "2026-07-31", relativeEnabled: true,
    weightByDate: new Map([["2026-08-01", 80]]),
  });
  assert.equal(result.available, false);
  assert.match(result.reason, /no body weight for this date/i);
  assert.equal(result.low, undefined);
});

test("absolute mode remains kilograms and dumbbell relative values remain per dumbbell", () => {
  const absolute = resolveOneRepMaxRange({ low: 40, high: 42, exerciseName: "Press (Dumbbell)" });
  assert.deepEqual(absolute, { available: true, relative: false, low: 40, high: 42, unit: "kg per dumbbell" });
  const relative = resolveOneRepMaxRange({
    low: 40, high: 42, exerciseName: "Press (Dumbbell)", performedOn: "2026-08-01",
    relativeEnabled: true, weightByDate: new Map([["2026-08-01", 80]]),
  });
  assert.equal(relative.unit, "× BW per dumbbell");
  assert.equal(relative.low, 0.5);
});

test("effective mode defaults off and cannot remain on without body-weight data", () => {
  assert.equal(getEffectiveRelativeMode(false, true), false);
  assert.equal(getEffectiveRelativeMode(true, false), false);
  assert.equal(getEffectiveRelativeMode(true, true), true);
});
