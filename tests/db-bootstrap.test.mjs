import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("clean bootstrap uses a committed baseline and only later validated migrations", () => {
  const source = fs.readFileSync("scripts/db-bootstrap.mjs", "utf8");
  const manifest = JSON.parse(fs.readFileSync("supabase/bootstrap/baseline.json", "utf8"));

  assert.equal(manifest.cutoverMigration, "20260902120000_fix_live_workout_reorder.sql");
  assert.match(manifest.sha256, /^[0-9a-f]{64}$/);
  assert.ok(fs.existsSync(`supabase/bootstrap/${manifest.baselineFile}`));
  assert.match(source, /FILENAME_PATTERN/);
  assert.match(source, /version > cutoverVersion/);
  assert.match(source, /current_baseline\.sql/);
  assert.match(source, /db\\.migrations/);
  assert.match(source, /db\\.seed/);
  assert.match(source, /enabled = false/);
  assert.match(source, /project_id = "heracles-bootstrap"/);
  assert.match(source, /port = 55322/);
  assert.match(source, /docker\.exe/);
  assert.doesNotMatch(source, /indexOf|\.slice\(|readMigration|jsonb_array_elements|--linked/);

  const dbCheck = fs.readFileSync("scripts/db-check.mjs", "utf8");
  assert.match(dbCheck, /SUPABASE_TEST_DB_URL must target localhost/);
  assert.match(dbCheck, /searchParams\.set\("sslmode", "disable"\)/);
});
