import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Session History exposes safe completed-workout lifecycle actions", async () => {
  const app = await read("app.js");

  assert.match(app, /id, performed_on, status, is_historical_correction, gyms\(name\)/);
  assert.match(app, /editButton\.textContent = "Edit workout"/);
  assert.match(app, /deleteButton\.textContent = "Delete workout"/);
  assert.match(app, /reopen_completed_workout_session/);
  assert.match(app, /delete_completed_workout_session/);
  assert.match(app, /Delete \$\{sessionDescription\}\? This permanently removes the workout and all of its exercises and sets\./);
  assert.match(app, /if \(session\.status === "completed"\) disclosure\.append\(createSessionHistoryActions\(session\)\)/);
  assert.match(app, /liveSessionFeature\.reset\(\);[\s\S]*activeSessionLoadedForUser = null;[\s\S]*await loadActiveSession\(supabaseClient\);[\s\S]*showPage\("live-session"\)/);
  assert.match(app, /await liveSessionFeature\.invalidateHistoryContext\(\);[\s\S]*resetSessionResults\(\);[\s\S]*dashboardFeature\.invalidate\(\);[\s\S]*await loadSessions\(supabaseClient\)/);
  assert.match(app, /wasHistoricalCorrection \? "session-history" : "home"/);
});

test("live workout clearly distinguishes historical correction mode and blocks destructive cancellation", async () => {
  const controller = await read("features/session/session-controller.js");

  assert.match(controller, /status, is_historical_correction, source_preset_id/);
  assert.match(controller, /title\.textContent = "Correcting workout"/);
  assert.match(controller, /Historical correction · changes update this existing workout/);
  assert.match(controller, /liveContainer\.querySelector\("\.cancel-session-button"\)\?\.remove\(\)/);
  assert.match(controller, /concludeButton\.textContent = isConcluding \? "Saving correction…" : "Save correction"/);
  assert.match(controller, /function blockHistoricalCorrectionCancellation\(\)/);
  assert.match(controller, /if \(isConcluding \|\| blockHistoricalCorrectionCancellation\(\)\) return;[\s\S]*const targetSessionId = activeSession\.id;[\s\S]*autosave\.abort\(\)/);
  assert.match(controller, /const wasHistoricalCorrection = activeSession\.is_historical_correction === true/);
  assert.match(controller, /onSessionConcluded\(concludedSessionId, wasHistoricalCorrection\)/);
});

test("database lifecycle preserves the one-active invariant, owner isolation, and cascade deletion", async () => {
  const migration = await read("supabase/migrations/20260915205000_add_completed_session_correction_lifecycle.sql");
  const dbTest = await read("supabase/tests/session_history_lifecycle.test.sql");

  assert.match(migration, /add column is_historical_correction boolean not null default false/);
  assert.match(migration, /check \(not is_historical_correction or status = 'in_progress'\)/);
  assert.match(migration, /create or replace function public\.reopen_completed_workout_session/);
  assert.match(migration, /status = 'in_progress'[\s\S]*id <> p_session_id/);
  assert.match(migration, /create or replace function public\.delete_completed_workout_session/);
  assert.match(migration, /if session_row\.is_historical_correction then[\s\S]*Historical correction sessions cannot be cancelled/);
  assert.match(migration, /set status = 'completed',[\s\S]*is_historical_correction = false/);
  assert.match(migration, /grant execute on function public\.reopen_completed_workout_session\(bigint\) to authenticated/);
  assert.match(migration, /grant execute on function public\.delete_completed_workout_session\(bigint\) to authenticated/);

  assert.match(dbTest, /reopened workout is marked as a historical correction/);
  assert.match(dbTest, /reopening preserves the original workout date/);
  assert.match(dbTest, /another completed workout cannot be reopened while a session is active/);
  assert.match(dbTest, /history deletion cascades to session exercises/);
  assert.match(dbTest, /history deletion cascades to exercise sets/);
  assert.match(dbTest, /another owner cannot reopen the workout/);
  assert.match(dbTest, /another owner cannot delete the workout/);
});
