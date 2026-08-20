import assert from "node:assert/strict";
import test from "node:test";

import {
  SET_CLASS,
  calculateBrzycki,
  calculateEpley,
  calculateRirE1rmEstimates,
  classifySet,
  isAnalyticalWorkingSet,
} from "../set-model.js";

test("classifies warm-up, RIR 0-3 working, and 4+ high-RIR sets", () => {
  assert.equal(classifySet({ is_warmup: true, reported_rir_bucket: null }), SET_CLASS.WARMUP);
  for (const rir of [0, 1, 2, 3]) {
    assert.equal(classifySet({ is_warmup: false, reported_rir_bucket: rir }), SET_CLASS.WORKING);
  }
  assert.equal(classifySet({ is_warmup: false, reported_rir_bucket: 4 }), SET_CLASS.HIGH_RIR);
});

test("only completed RIR 0-3 sets qualify for analytics", () => {
  assert.equal(isAnalyticalWorkingSet({ is_warmup: false, reported_rir_bucket: 2, weight: 100, reps: 8 }), true);
  assert.equal(isAnalyticalWorkingSet({ is_warmup: true, reported_rir_bucket: null, weight: 100, reps: 8 }), false);
  assert.equal(isAnalyticalWorkingSet({ is_warmup: false, reported_rir_bucket: 4, weight: 100, reps: 8 }), false);
  assert.equal(isAnalyticalWorkingSet({ is_warmup: false, reported_rir_bucket: 0, weight: null, reps: null }), false);
});

test("calculates four exact Brzycki and Epley values with RIR applied only to the adjusted pair", () => {
  const result = calculateRirE1rmEstimates({ is_warmup: false, reported_rir_bucket: 2, weight: 100, reps: 8 });
  assert.deepEqual(result, {
    observedBrzycki: calculateBrzycki(100, 8),
    observedEpley: calculateEpley(100, 8),
    adjustedBrzycki: calculateBrzycki(100, 10),
    adjustedEpley: calculateEpley(100, 10),
  });
});

test("zero RIR keeps observed and adjusted formula identities coincident", () => {
  const result = calculateRirE1rmEstimates({ is_warmup: false, reported_rir_bucket: 0, weight: 80, reps: 6 });
  assert.equal(result.observedBrzycki, result.adjustedBrzycki);
  assert.equal(result.observedEpley, result.adjustedEpley);
});

test("4+ RIR cannot produce a finite progression estimate", () => {
  assert.equal(calculateRirE1rmEstimates({ is_warmup: false, reported_rir_bucket: 4, weight: 100, reps: 8 }), null);
});
