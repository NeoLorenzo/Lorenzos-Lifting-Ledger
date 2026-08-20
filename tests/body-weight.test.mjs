import assert from "node:assert/strict";
import test from "node:test";
import {
  interpolateBodyWeight,
  parseBodyWeightCsv,
  parseCsvRows,
} from "../body-weight.js";

test("parses generic CSV mechanics, optional header, BOM, blank rows and ignored columns", () => {
  const parsed = parseBodyWeightCsv('\uFEFF\r\nDate,"Weight (kg)",Notes\r\n"01/02/2024","80.25","said ""hello"""\r\n03/02/2024,79.75,ignored\r\n');
  assert.deepEqual(parsed.observations, [
    { sourceRow: 3, measuredOn: "2024-02-01", weightKg: 80.25 },
    { sourceRow: 4, measuredOn: "2024-02-03", weightKg: 79.75 },
  ]);
  assert.equal(parsed.preview.interpolatedDayCount, 1);
  assert.equal(parseCsvRows('"a\nb",2').length, 1);
});

test("accepts leap years and rejects invalid dates, values, rows, and duplicate dates", () => {
  assert.equal(parseBodyWeightCsv("29/02/2024,75").observations[0].measuredOn, "2024-02-29");
  for (const [csv, pattern] of [
    ["31/02/2026,75", /Row 1.*valid calendar date/],
    ["1/02/2026,75", /DD\/MM\/YYYY/],
    ["01/02/2026,nope", /Row 1.*greater than zero/],
    ["01/02/2026,0", /greater than zero/],
    ["01/02/2026", /expected a date/],
    ["01/02/2026,75\n01/02/2026,76", /Row 2.*duplicate date 01\/02\/2026/],
    ['"01/02/2026,75', /unterminated quoted field/],
  ]) assert.throws(() => parseBodyWeightCsv(csv), pattern);
});

test("interpolates increasing and decreasing gaps without extrapolation", () => {
  const decreasing = interpolateBodyWeight([
    { measuredOn: "2026-08-01", weightKg: 89 },
    { measuredOn: "2026-08-04", weightKg: 88.4 },
  ]);
  assert.deepEqual(decreasing.map((item) => [item.measuredOn, Number(item.weightKg.toFixed(1)), item.provenance]), [
    ["2026-08-01", 89, "measured"],
    ["2026-08-02", 88.8, "interpolated"],
    ["2026-08-03", 88.6, "interpolated"],
    ["2026-08-04", 88.4, "measured"],
  ]);
  assert.equal(decreasing[1].previousMeasuredOn, "2026-08-01");
  assert.equal(decreasing[1].nextMeasuredOn, "2026-08-04");
  assert.deepEqual(interpolateBodyWeight([{ measuredOn: "2026-08-02", weightKg: 70 }]), [
    { measuredOn: "2026-08-02", weightKg: 70, provenance: "measured" },
  ]);
  assert.equal(interpolateBodyWeight([
    { measuredOn: "2026-08-01", weightKg: 70 },
    { measuredOn: "2026-08-03", weightKg: 72 },
  ])[1].weightKg, 71);
});

test("accepts a representative MacroFactor-style two-column export", () => {
  const parsed = parseBodyWeightCsv("Date,Weight (kg)\n17/08/2026,81.2\n18/08/2026,81.0\n");
  assert.deepEqual(parsed.observations.map(({ measuredOn, weightKg }) => ({ measuredOn, weightKg })), [
    { measuredOn: "2026-08-17", weightKg: 81.2 },
    { measuredOn: "2026-08-18", weightKg: 81 },
  ]);
});
