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

test("provides a dependency-free local development command", async () => {
  const [packageJson, devServer] = await Promise.all([
    read("package.json"),
    read("scripts/dev-server.mjs"),
  ]);

  assert.equal(JSON.parse(packageJson).scripts.dev, "node scripts/dev-server.mjs");
  assert.match(devServer, /Cache-Control": "no-store"/);
  assert.match(devServer, /5173/);
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
  assert.match(app, /\.eq\("is_active", true\)/);
  assert.doesNotMatch(app, /\.from\("exercises"\)[\s\S]{0,250}\.eq\("owner_id"/);
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

test("uses global versioned exercise and movement reference data", async () => {
  const [catalogueMigration, movementMigration] = await Promise.all([
    read("supabase/migrations/20260806153407_create_exercise_catalogue.sql"),
    read("supabase/migrations/20260807140438_global_exercise_and_movement_model.sql"),
  ]);

  assert.doesNotMatch(movementMigration, /add column equipment_id/);
  assert.match(movementMigration, /drop column owner_id/);
  assert.match(movementMigration, /create table public\.exercise_aliases/);
  assert.match(movementMigration, /create table public\.movement_patterns/);
  assert.match(movementMigration, /create table public\.movement_mapping_versions/);
  assert.match(movementMigration, /create table public\.exercise_movement_pattern_coefficients/);
  assert.match(movementMigration, /numeric\(4, 3\).*between 0 and 1/);
  assert.match(movementMigration, /5600/);
  assert.match(movementMigration, /where coefficient > 0/);
  assert.match(movementMigration, /grant select on public\.exercises/);
  assert.match(movementMigration, /from anon, authenticated/);
  assert.match(catalogueMigration, /alter column exercise_id set not null/);
});

test("provides accessible Home and My data navigation with user-owned charts", async () => {
  const [html, app, styles] = await Promise.all([
    read("index.html"),
    read("app.js"),
    read("styles.css"),
  ]);

  assert.match(html, /id="menu-toggle"/);
  assert.match(html, /data-page="home"[^>]*aria-current="page"/);
  assert.match(html, /data-page="my-data"/);
  assert.match(html, /How these numbers are calculated/);
  assert.match(html, /Recorded volume by month/);
  assert.match(app, /fetchOwnedRows\(supabase, "workout_sessions"/);
  assert.match(app, /fetchOwnedRows\(supabase, "session_exercises"/);
  assert.match(app, /"exercise_sets"/);
  assert.match(app, /\.eq\("owner_id", ownerId\)/);
  assert.match(app, /if \(set\.is_warmup\) continue/);
  assert.match(app, /Number\(set\.weight\) \* Number\(set\.reps\)/);
  assert.match(styles, /\.vertical-chart/);
  assert.match(styles, /\.horizontal-chart/);
});
