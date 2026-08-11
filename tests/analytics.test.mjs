import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateExerciseSources,
  calculateExposureTrend,
  calculateMuscleExposure,
  calculatePercentageChange,
  compareRecentPeriods,
  createLinearScale,
  createBucketKeys,
  filterByRange,
  getEquipmentSeriesKey,
  getDateRange,
  getRepeatedExercises,
  joinDashboardData,
  selectRepresentativeSets,
  selectRepresentativeSetsBySeries,
  workingSets,
} from "../analytics.js";

const groups = [
  { code: "chest", name: "Chest", sourceOrder: 1, muscles: [] },
  { code: "shoulders", name: "Shoulders", sourceOrder: 2, muscles: [] },
  { code: "triceps", name: "Triceps", sourceOrder: 3, muscles: [] },
];

const lookup = new Map([[1, [
  { name: "Sternocostal", relevance: 1, uiGroup: groups[0] },
  { name: "Clavicular", relevance: 0.75, uiGroup: groups[0] },
  { name: "Pec Minor", relevance: 0.25, uiGroup: groups[0] },
  { name: "Anterior Deltoid", relevance: 0.5, uiGroup: groups[1] },
  { name: "Triceps Long Head", relevance: 0.75, uiGroup: groups[2] },
]]]);

const set = (overrides = {}) => ({
  id: 1,
  session_id: 10,
  performed_on: "2026-08-10",
  exercise_id: 1,
  exercise: "Press",
  is_warmup: false,
  weight: 100,
  reps: 8,
  estimated_1rm_low: null,
  estimated_1rm_high: null,
  ...overrides,
});

test("joins dashboard records and excludes warm-ups from working sets", () => {
  const records = joinDashboardData(
    [{ id: 10, performed_on: "2026-08-10" }],
    [{ id: 20, session_id: 10, exercise_id: 1, exercise: "Press" }],
    [{ id: 1, session_exercise_id: 20, is_warmup: true }, { id: 2, session_exercise_id: 20, is_warmup: false }, { id: 3, session_exercise_id: 20, is_warmup: false, weight: null, reps: null }],
  );
  assert.equal(records.length, 3);
  assert.deepEqual(workingSets(records).map((record) => record.id), [2]);
});

test("keeps equipment identity on joined dashboard records", () => {
  const [record] = joinDashboardData(
    [{ id: 10, performed_on: "2026-08-10" }],
    [{ id: 20, session_id: 10, exercise_id: 1, exercise: "Press", equipment_id: "Machine A" }],
    [{ id: 1, session_exercise_id: 20, is_warmup: false }],
  );
  assert.equal(record.equipment_id, "Machine A");
  assert.equal(getEquipmentSeriesKey(record), "equipment-Machine A");
});

test("calculates independent detailed exposure and max-child UI group exposure", () => {
  const result = calculateMuscleExposure([set(), set({ id: 2 })], lookup, groups);
  assert.equal(result.detailedExposure.get("Sternocostal"), 2);
  assert.equal(result.detailedExposure.get("Clavicular"), 1.5);
  assert.equal(result.groupExposure.get("chest"), 2);
  assert.notEqual(result.groupExposure.get("chest"), 4);
});

test("credits one compound set independently across UI groups", () => {
  const result = calculateMuscleExposure([set()], lookup, groups);
  assert.equal(result.groupExposure.get("chest"), 1);
  assert.equal(result.groupExposure.get("shoulders"), 0.5);
  assert.equal(result.groupExposure.get("triceps"), 0.75);
});

test("attributes exercise sources as working sets times max-child group relevance", () => {
  const sources = calculateExerciseSources([set(), set({ id: 2 })], lookup, "chest");
  assert.deepEqual(sources, [{ exercise: "Press", value: 2 }]);
});

test("filters four- and eight-week ranges and creates ordered Monday buckets", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  const fourWeeks = getDateRange("4w", now);
  const eightWeeks = getDateRange("8w", now);
  assert.equal(fourWeeks.start.toISOString().slice(0, 10), "2026-07-20");
  assert.equal(eightWeeks.start.toISOString().slice(0, 10), "2026-06-22");
  assert.deepEqual(createBucketKeys(fourWeeks), ["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"]);
  assert.deepEqual(filterByRange([
    { performed_on: "2026-07-19" },
    { performed_on: "2026-07-20" },
    { performed_on: "2026-08-10" },
  ], fourWeeks), [{ performed_on: "2026-07-20" }, { performed_on: "2026-08-10" }]);
});

test("all-time range begins at the first session and trends stay chronological", () => {
  const range = getDateRange("all", new Date("2026-08-10T12:00:00Z"), [
    { performed_on: "2026-05-20" }, { performed_on: "2026-02-01" },
  ]);
  assert.equal(range.start.toISOString().slice(0, 10), "2026-02-01");
  assert.deepEqual(createBucketKeys(range), ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(calculateExposureTrend([set({ performed_on: "2026-08-10" })], lookup, "chest", range).at(-1), { key: "2026-08", value: 1 });
});

test("compares current four weeks with the previous four and preserves previous zero", () => {
  const sessions = [{ id: 1, performed_on: "2026-06-16" }, { id: 2, performed_on: "2026-08-10" }];
  const comparison = compareRecentPeriods(sessions, [set()], lookup, new Date("2026-08-10T12:00:00Z"), groups);
  assert.equal(comparison.available, true);
  assert.equal(comparison.groups.find((group) => group.code === "chest").previous, 0);
  assert.equal(comparison.groups.find((group) => group.code === "chest").delta, 1);
});

test("recent comparison reports insufficient history", () => {
  const result = compareRecentPeriods([{ id: 1, performed_on: "2026-08-01" }], [set()], lookup, new Date("2026-08-10T12:00:00Z"), groups);
  assert.deepEqual(result, { available: false });
});

test("representative set prefers e1RM midpoint, then load, then reps, and ignores warm-ups", () => {
  const records = [
    set({ id: 1, weight: 120, reps: 4 }),
    set({ id: 2, weight: 100, reps: 8, estimated_1rm_low: 130, estimated_1rm_high: 134 }),
    set({ id: 3, weight: 105, reps: 6, estimated_1rm_low: 131, estimated_1rm_high: 135 }),
    set({ id: 4, weight: 150, reps: 2, estimated_1rm_low: 160, estimated_1rm_high: 165, is_warmup: true }),
    set({ id: 5, session_id: 11, performed_on: "2026-08-03", weight: 110, reps: 6 }),
    set({ id: 6, session_id: 11, performed_on: "2026-08-03", weight: 110, reps: 7 }),
  ];
  assert.deepEqual(selectRepresentativeSets(records, "Press").map((record) => record.id), [6, 3]);
});

test("progression eligibility requires working sets in at least two sessions", () => {
  const records = [
    set({ id: 1, exercise: "Repeated", session_id: 10 }),
    set({ id: 2, exercise: "Repeated", session_id: 11 }),
    set({ id: 3, exercise: "One off", session_id: 12 }),
    set({ id: 4, exercise: "Warm-up only", session_id: 13, is_warmup: true }),
  ];
  assert.deepEqual(getRepeatedExercises(records), ["Repeated"]);
});

test("progression chooses a representative set per session and equipment series", () => {
  const records = [
    set({ id: 1, equipment_id: "Machine A", weight: 90 }),
    set({ id: 2, equipment_id: "Machine A", weight: 100 }),
    set({ id: 3, equipment_id: "Machine B", weight: 80 }),
    set({ id: 4, session_id: 11, performed_on: "2026-08-11", equipment_id: "Machine A", weight: 105 }),
  ];
  assert.deepEqual(selectRepresentativeSetsBySeries(records, "Press").map((record) => record.id), [2, 3, 4]);
});

test("handles missing RPE, e1RM, and exercise mappings without inventing values", () => {
  const records = [set({ rpe: null }), set({ id: 2, exercise_id: 99, exercise: "Unknown" })];
  const result = calculateMuscleExposure(records, lookup, groups);
  assert.equal(records[0].rpe, null);
  assert.equal(records[0].estimated_1rm_low, null);
  assert.deepEqual([...result.unmappedExercises], ["Unknown"]);
});

test("dashboard source contains no tonnage calculation", async () => {
  const source = await readFile(new URL("../analytics.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /weight\s*\*\s*(?:reps|record\.reps)|(?:reps|record\.reps)\s*\*\s*weight/i);
});

test("creates a readable linear scale for estimated one-rep-max charts", () => {
  const scale = createLinearScale([33, 88, 94, 97, 100]);
  assert.ok(scale.minimum <= 33);
  assert.ok(scale.maximum >= 100);
  assert.ok(scale.ticks.length >= 4);
  assert.equal(scale.position(scale.minimum), 0);
  assert.equal(scale.position(scale.maximum), 100);
  assert.ok(scale.position(88) > scale.position(33));
});

test("calculates recent percentage changes without infinite zero-baseline values", () => {
  assert.equal(calculatePercentageChange(15, 8), 87.5);
  assert.equal(calculatePercentageChange(6, 8), -25);
  assert.equal(calculatePercentageChange(8, 8), 0);
  assert.equal(calculatePercentageChange(5, 0), null);
});
