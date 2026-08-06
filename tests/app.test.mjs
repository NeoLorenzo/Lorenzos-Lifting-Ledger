import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships an installable app shell", async () => {
  const [html, manifest, serviceWorker] = await Promise.all([
    read("index.html"),
    read("manifest.webmanifest"),
    read("service-worker.js"),
  ]);

  assert.match(html, /rel="manifest"/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Your lifts/);
  assert.match(html, /Exercise catalogue/);
  assert.match(html, /id="exercise-catalogue"/);
  assert.doesNotMatch(html, /Hello world/i);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});

test("uses Google OAuth without privileged credentials", async () => {
  const [app, config] = await Promise.all([read("app.js"), read("config.js")]);
  const assignments = config
    .split("\n")
    .filter((line) => line.startsWith("export const"))
    .join("\n");

  assert.match(app, /provider: "google"/);
  assert.match(app, /flowType: "pkce"/);
  assert.match(app, /\.from\("workout_sessions"\)/);
  assert.match(app, /\.from\("exercises"\)/);
  assert.match(app, /\.eq\("owner_id", requestedUserId\)/);
  assert.match(app, /\.order\("name", \{ ascending: true \}\)/);
  assert.match(app, /session_exercises\(id, exercise_order, exercise, equipment_id, exercise_sets/);
  assert.match(app, /is_warmup/);
  assert.match(app, /is_drop_set/);
  assert.match(app, /is_superset/);
  assert.match(app, /estimated_1rm_brzycki/);
  assert.match(app, /estimated_1rm_epley/);
  assert.match(app, /estimated_1rm_low/);
  assert.match(app, /estimated_1rm_high/);
  assert.match(app, /supabase-js@\d+\.\d+\.\d+/);
  assert.doesNotMatch(app, /supabase-js@2(?:["/])/);
  assert.doesNotMatch(assignments, /service[_-]?role/i);
  assert.doesNotMatch(assignments, /client[_-]?secret/i);
});

test("models exercises independently from performed equipment", async () => {
  const migration = await read("supabase/migrations/20260806153407_create_exercise_catalogue.sql");
  const exerciseTable = migration.match(/create table public\.exercises \(([\s\S]*?)\n\);/i)?.[1] ?? "";

  assert.match(exerciseTable, /owner_id uuid not null/);
  assert.match(exerciseTable, /canonical_exercise_id bigint/);
  assert.doesNotMatch(exerciseTable, /equipment_id/);
  assert.match(migration, /add column exercise_id bigint/);
  assert.match(migration, /references public\.exercises\(id, owner_id\)/);
  assert.match(migration, /alter column exercise_id set not null/);
  assert.match(migration, /alter table public\.exercises enable row level security/);
  assert.match(migration, /revoke all on public\.exercises from anon/);
});
