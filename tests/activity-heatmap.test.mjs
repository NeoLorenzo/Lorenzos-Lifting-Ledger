import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACTIVITY_LEVEL_THRESHOLDS,
  ACTIVITY_WEEKS,
  activityCalendarStart,
  activityLevel,
  buildActivityCalendar,
  countWorkingSetsByDay,
} from "../features/activity-heatmap.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const working = { weight: 60, reps: 8, is_warmup: false, reported_rir_bucket: 2 };
const warmup = { weight: 40, reps: 10, is_warmup: true, reported_rir_bucket: null };
const highRir = { weight: 50, reps: 8, is_warmup: false, reported_rir_bucket: 4 };
const draft = { weight: 60, reps: null, is_warmup: false, reported_rir_bucket: null };

test("daily counts include only analytical working sets and merge sessions on the same day", () => {
  const counts = countWorkingSetsByDay([
    { performed_on: "2026-09-28", session_exercises: [{ exercise_sets: [working, working, warmup, highRir, draft] }] },
    { performed_on: "2026-09-28", session_exercises: [{ exercise_sets: [working] }, { exercise_sets: null }] },
    { performed_on: "2026-09-27", session_exercises: [{ exercise_sets: [warmup] }] },
    { performed_on: "2026-09-26", session_exercises: null },
  ]);
  assert.deepEqual([...counts], [["2026-09-28", 3]]);
});

test("shade bands are fixed set-count thresholds that match the home legend", async () => {
  assert.deepEqual(ACTIVITY_LEVEL_THRESHOLDS, [1, 8, 15, 22]);
  assert.deepEqual([0, 1, 7, 8, 14, 15, 21, 22, 60].map(activityLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  const html = await read("index.html");
  for (const label of ["No working sets", "1–7 working sets", "8–14 working sets", "15–21 working sets", "22+ working sets"]) {
    assert.ok(html.includes(`title="${label}"`), `legend is missing ${label}`);
  }
});

test("calendar spans 53 Monday-first weeks ending today with no future days", () => {
  const todayIso = "2026-09-30"; // Wednesday
  assert.equal(activityCalendarStart(todayIso), "2025-09-29");
  const calendar = buildActivityCalendar(new Map([["2026-09-30", 12], ["2025-09-29", 25], ["2025-09-28", 9]]), todayIso);
  assert.equal(calendar.columns.length, ACTIVITY_WEEKS);
  assert.equal(calendar.columns[0][0].iso, "2025-09-29");
  assert.equal(calendar.columns[0][0].weekday, 0);
  assert.ok(calendar.columns.slice(0, -1).every((week) => week.length === 7));
  const lastWeek = calendar.columns.at(-1);
  assert.deepEqual(lastWeek.map((day) => day.iso), ["2026-09-28", "2026-09-29", "2026-09-30"]);
  assert.equal(lastWeek.at(-1).isToday, true);
  assert.equal(calendar.total, 37, "days before the calendar start are not counted");
  assert.equal(calendar.activeDays, 2);
});

test("month labels start where a month begins and a clipped first month is dropped", () => {
  const full = buildActivityCalendar(new Map(), "2026-10-07");
  assert.equal(full.startIso, "2025-10-06");
  assert.deepEqual(full.months[0], { column: 0, month: 9 }, "four October weeks keep their label");
  const calendar = buildActivityCalendar(new Map(), "2026-09-30");
  assert.deepEqual(calendar.months[0], { column: 1, month: 9 }, "a one-week September stub would collide with October");
  for (let index = 1; index < calendar.months.length; index += 1) {
    assert.ok(calendar.months[index].column - calendar.months[index - 1].column >= 3);
  }
  const days = calendar.columns.flat();
  assert.equal(days.find((day) => day.iso === "2026-01-05").weekday, 0);
  assert.equal(new Set(days.map((day) => day.iso)).size, days.length);
});

test("home heatmap loads owner-scoped sessions for the calendar window", async () => {
  const app = await read("app.js");
  assert.match(app, /async function loadHomeActivity\(supabase\)[\s\S]*?\.from\("workout_sessions"\)[\s\S]*?\.eq\("owner_id", requestedUserId\)[\s\S]*?\.gte\("performed_on", activityCalendarStart\(todayIso\)\)/);
  assert.match(app, /renderHomeActivity\(countWorkingSetsByDay\(data\), todayIso\)/);
  assert.match(app, /void loadHomeActivity\(supabaseClient\);/);
});
