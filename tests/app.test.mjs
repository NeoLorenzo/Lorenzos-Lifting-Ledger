import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.match(html, /data-page="session-history"/);
  assert.match(html, /data-page-panel="session-history"/);
  assert.match(html, /<h1>Session history<\/h1>/);
  assert.match(html, /id="lift-list"/);
  assert.match(html, /id="load-more"/);
  assert.ok(html.indexOf('data-page-panel="home"') < html.indexOf('data-page-panel="session-history"'));
  assert.ok(html.indexOf('data-page-panel="session-history"') < html.indexOf('id="lift-list"'));
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
  assert.match(app, /"session-history": "Session history"/);
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
  const [catalogueMigration, movementMigration, catalogueSyncMigration, muscleMigration] = await Promise.all([
    read("supabase/migrations/20260806153407_create_exercise_catalogue.sql"),
    read("supabase/migrations/20260807140438_global_exercise_and_movement_model.sql"),
    read("supabase/migrations/20260810182625_add_close_grip_incline_press.sql"),
    read("supabase/migrations/20260810183743_create_muscle_catalogue.sql"),
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
  assert.match(catalogueSyncMigration, /catalogue_sync_2026_08_10/);
  assert.match(catalogueSyncMigration, /Press \(Machine\) \(Incline\) \(Plate Loaded\) \(Close Grip\)/);
  assert.match(catalogueSyncMigration, /141/);
  assert.match(catalogueSyncMigration, /5640/);
  assert.match(muscleMigration, /create table public\.muscles/);
  assert.match(muscleMigration, /generated always as identity primary key/);
  assert.match(muscleMigration, /Authenticated users can read muscles/);
  assert.match(muscleMigration, /grant select on table public\.muscles to authenticated/);
  assert.match(muscleMigration, /from anon, authenticated/);
  assert.match(muscleMigration, /count\(\*\) from public\.muscles\) <> 40/);
  const movementMuscleMigration = await read("supabase/migrations/20260810184959_create_movement_pattern_muscle_matrix.sql");
  assert.match(movementMuscleMigration, /create table public\.movement_muscle_mapping_versions/);
  assert.match(movementMuscleMigration, /create table public\.movement_pattern_muscle_coefficients/);
  assert.match(movementMuscleMigration, /1600/);
  assert.match(movementMuscleMigration, /112/);
  assert.match(movementMuscleMigration, /coefficient between 0 and 1/);
  assert.match(movementMuscleMigration, /from anon, authenticated/);
});

test("keeps the authoritative movement-to-muscle source intact", async () => {
  const [matrix, documentation, importScript, indexMigration] = await Promise.all([
    read("Movement_Pattern_to_Muscle_Function_Matrix.csv"),
    read("Movement_Pattern_to_Muscle_Function_README.md"),
    read("scripts/prepare_movement_muscle_import.py"),
    read("supabase/migrations/20260810185010_index_movement_pattern_muscle_foreign_key.sql"),
  ]);
  const rows = matrix.trim().split(/\r?\n/).map((row) => row.split(","));
  const coefficients = rows.slice(1).flatMap((row) => row.slice(1).map(Number));

  assert.equal(rows.length, 41);
  assert.ok(rows.every((row) => row.length === 41));
  assert.equal(coefficients.length, 1600);
  assert.equal(coefficients.filter((value) => value > 0).length, 112);
  assert.ok(coefficients.every((value) => value >= 0 && value <= 1));
  assert.equal(
    createHash("sha256").update(matrix).digest("hex"),
    "c0664168df7b971c84e24d5a9cebdf04ffde3c09c5eda8726a16559e539e50e2",
  );
  assert.match(documentation, /^# Movement Pattern → Muscle Function Matrix/);
  assert.match(documentation, /not percentages/i);
  assert.match(importScript, /PATTERN_ALIASES/);
  assert.match(indexMigration, /movement_pattern_muscle_coefficients_pattern_idx/);
});

test("uses exercise-specific names without legacy muscle-group prefixes", async () => {
  const matrix = await read("Movement Pattern Mapping Matrix - Mapping_Matrix.csv");
  const names = matrix.trim().split(/\r?\n/).slice(1).map((line) => line.split(",", 1)[0]);
  const legacyPrefix = /^(?:Abs|Adductors|Back|Biceps|Calves|Chest|Forearms|Glutes|Hamstrings|Legs|Quads|Shoulders|Triceps) - /;

  assert.equal(names.length, 141);
  assert.equal(new Set(names).size, 141);
  assert.ok(names.includes("Press (Machine) (Incline) (Plate Loaded) (Close Grip)"));
  assert.equal(names.filter((name) => name.startsWith("Overhead Press")).length, 7);
  assert.equal(names.filter((name) => legacyPrefix.test(name)).length, 0);
});

test("provides meaningful My data statistics without tonnage", async () => {
  const [html, app, styles, policy] = await Promise.all([
    read("index.html"),
    read("app.js"),
    read("styles.css"),
    read("docs/WHY_THE_APP_DOES_NOT_TRACK_TONNAGE.md"),
  ]);

  assert.match(html, /id="menu-toggle"/);
  assert.match(html, /data-page="home"[^>]*aria-current="page"/);
  assert.match(html, /data-page="my-data"/);
  assert.match(html, /How these numbers are calculated/);
  assert.match(html, /Working sets by month/);
  assert.match(html, /Exercises trained/);
  assert.doesNotMatch(html, /Recorded volume|kg × reps|volume load/i);
  assert.match(app, /fetchOwnedRows\(supabase, "workout_sessions"/);
  assert.match(app, /fetchOwnedRows\(supabase, "session_exercises"/);
  assert.match(app, /"exercise_sets"/);
  assert.match(app, /\.eq\("owner_id", ownerId\)/);
  assert.match(app, /if \(set\.is_warmup\) continue/);
  assert.doesNotMatch(app, /setVolume|monthlyVolume|recordedVolume|weight\s*\*\s*reps/i);
  assert.doesNotMatch(app, /\$\{weight\}\s*×\s*\$\{reps\}/);
  assert.match(styles, /\.vertical-chart/);
  assert.match(styles, /\.horizontal-chart/);
  assert.match(policy, /Never use or display weight × reps/);
  assert.match(policy, /prefer fewer meaningful metrics/i);
});

test("provides a transparent Literature page for the app's scientific foundations", async () => {
  const [html, app, styles, literature, taxonomy] = await Promise.all([
    read("index.html"),
    read("app.js"),
    read("styles.css"),
    read("literature.js"),
    read("docs/MUSCLE_GROUP_TAXONOMY.md"),
  ]);

  assert.match(html, /data-page="literature"/);
  assert.match(html, /data-page-panel="literature"/);
  assert.match(html, /Scientific foundations/);
  assert.match(html, /How studies are judged/);
  assert.match(html, /Muscle-group taxonomy/);
  assert.match(html, /Movement-pattern coefficients/);
  assert.match(html, /Movement pattern to muscle function/);
  assert.match(html, /Why tonnage is excluded/);
  assert.match(html, /Estimated one-rep max/);
  assert.match(html, /unresolved citation placeholders/i);
  assert.match(html, /data-document="study-selection"/);
  assert.match(html, /data-document="muscle-taxonomy"/);
  assert.match(html, /data-document="movement-coefficients"/);
  assert.match(html, /data-document="movement-data-model"/);
  assert.match(html, /data-document="movement-muscle-function"/);
  assert.match(html, /data-document="no-tonnage"/);
  assert.doesNotMatch(html, /href="[^"]+\.md"/);
  assert.match(app, /literature: "Literature"/);
  assert.match(app, /openLiteratureDocument/);
  assert.match(styles, /\.literature-grid/);
  assert.match(styles, /\.evidence-badge/);
  assert.match(styles, /\.markdown-reader/);
  assert.match(literature, /MUSCLE_GROUP_TAXONOMY\.md/);
  assert.match(taxonomy, /^# Muscle Group Taxonomy for Hypertrophy Modelling/);
});

test("renders repository literature as safe in-app document pages", async () => {
  const { LITERATURE_DOCUMENTS, renderMarkdown } = await import("../literature.js");
  const rendered = renderMarkdown([
    "# Test document",
    "",
    "A **strong** statement with `code`.",
    "",
    "| Field | Meaning |",
    "| --- | --- |",
    "| One | <unsafe> |",
    "",
    "[Taxonomy](MUSCLE_GROUP_TAXONOMY.md)",
  ].join("\n"));

  assert.equal(Object.keys(LITERATURE_DOCUMENTS).length, 7);
  assert.match(rendered, /<h2 id="test-document">Test document<\/h2>/);
  assert.match(rendered, /<strong>strong<\/strong>/);
  assert.match(rendered, /<table>/);
  assert.match(rendered, /&lt;unsafe&gt;/);
  assert.match(rendered, /data-document="muscle-taxonomy"/);
  assert.doesNotMatch(rendered, /<unsafe>/);
});
