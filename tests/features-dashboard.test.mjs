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

test("dashboard synchronizes contextual range controls and keeps progression history compact", async () => {
  const source = await readFile(new URL("../features/dashboard.js", import.meta.url), "utf8");

  assert.match(source, /querySelectorAll\("\[data-dashboard-range\]"\)/);
  assert.match(source, /syncRangeControls\(\);/);
  assert.match(source, /button\.setAttribute\("aria-pressed", String\(button\.dataset\.dashboardRange === dashboardRange\)\)/);
  assert.match(source, /`e1RM \$\{formatOneRepMaxRange\(display\)\} \$\{display\.unit\}`/);
  assert.match(source, /`RIR \$\{record\.reported_rir_bucket\}`/);
  assert.match(source, /function formatOneRepMaxRange\(display\)/);
  assert.match(source, /date\.textContent = formatHistoryDate\(record\.performed_on\)/);
  assert.match(source, /function formatHistoryDate\(value\)/);
  assert.match(source, /padStart\(2, "0"\)/);
  assert.match(source, /\$\{formatDecimal\(Number\(record\.weight\)\)\} kg/);
  assert.match(source, /return equipmentId === null[\s\S]*: String\(equipmentId\);/);
  assert.doesNotMatch(source, /: `Equipment \$\{equipmentId\}`/);
  assert.doesNotMatch(source, /E1RM_MODELS\.map\(\(model\) => `\$\{model\.label\}:/);
});

test("dashboard muscle exposure begins unselected and supports toggle and outside deselection", async () => {
  const source = await readFile(new URL("../features/dashboard.js", import.meta.url), "utf8");

  assert.match(source, /let selectedDashboardGroup = null;/);
  assert.match(source, /selectedDashboardGroup === button\.dataset\.muscleGroup \? null : button\.dataset\.muscleGroup/);
  assert.match(source, /document\.addEventListener\("click", \(event\) => \{/);
  assert.match(source, /event\.stopPropagation\(\);/);
  assert.match(source, /muscleExposureInteraction\?\.contains\(event\.target\)/);
  assert.match(source, /selectedDashboardGroup = null;[\s\S]*renderDashboard\(\);/);
  assert.match(source, /muscleTrendPanel\.hidden = true/);
  assert.match(source, /exerciseSourcesSection\.hidden = true/);
  assert.match(source, /muscleTrendPanel\.hidden = false/);
  assert.match(source, /exerciseSourcesSection\.hidden = false/);
  assert.doesNotMatch(source, /const highestGroup =/);
});

test("contextual header swaps the one active dashboard range selector", async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="dashboard-page-range"/);
  assert.match(html, /id="contextual-dashboard-range"[\s\S]*hidden/);
  assert.match(app, /const isDashboardRangeContextual = activePageName === "my-data" && isContextual;/);
  assert.match(app, /contextualDashboardRange\.hidden = !isDashboardRangeContextual/);
  assert.match(app, /dashboardPageRange\.hidden = isDashboardRangeContextual/);
  assert.match(styles, /\.contextual-range-control/);
});

test("muscle detail sections are hidden until a group is selected", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="muscle-trend-panel"[^>]*hidden/);
  assert.match(html, /id="exercise-sources-section"[^>]*hidden/);
});
