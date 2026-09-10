import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const baseMigration = await readFile(
  new URL("../supabase/migrations/20260909120000_add_kleos_strength_snapshot.sql", import.meta.url),
  "utf8",
);
const equipmentMigration = await readFile(
  new URL("../supabase/migrations/20260909200000_add_kleos_strength_equipment.sql", import.meta.url),
  "utf8",
);
const bodyWeightMigration = await readFile(
  new URL("../supabase/migrations/20260910161000_extend_kleos_physical_snapshot.sql", import.meta.url),
  "utf8",
);
const migration = `${baseMigration}\n${equipmentMigration}\n${bodyWeightMigration}`;
const edgeFunction = await readFile(
  new URL("../supabase/functions/kleos-strength/index.ts", import.meta.url),
  "utf8",
);

test("Kleos export uses completed analytical working sets in a 30-calendar-day window", () => {
  assert.match(migration, /ws\.owner_id = p_owner_id/i);
  assert.match(migration, /ws\.status = 'completed'/i);
  assert.match(migration, /ws\.performed_on >= current_date - 29/i);
  assert.match(migration, /not es\.is_warmup/i);
  assert.match(migration, /es\.reported_rir_bucket between 0 and 3/i);
  assert.match(migration, /es\.estimated_1rm_high > 0/i);
});

test("Kleos export requires three distinct sessions and selects the maximum observed e1RM", () => {
  assert.match(migration, /count\(distinct candidate_sets\.session_id\)/i);
  assert.match(migration, /having count\(distinct candidate_sets\.session_id\) >= 3/i);
  assert.match(migration, /order by[\s\S]*candidate_sets\.estimated_1rm desc/i);
  assert.match(migration, /'observed_e1rm_high'::text as estimation_basis/i);
});

test("Kleos export carries the historical equipment snapshot from the winning set", () => {
  assert.match(equipmentMigration, /se\.equipment_name_snapshot/i);
  assert.match(bodyWeightMigration, /se\.equipment_name_snapshot/i);
  assert.match(bodyWeightMigration, /weighted_winners\.equipment_name/i);
});

test("Kleos export normalizes the same winning e1RM against workout-date body weight", () => {
  assert.match(bodyWeightMigration, /body_weight_kg_at_achieved numeric/i);
  assert.match(bodyWeightMigration, /body_weight_kind text/i);
  assert.match(bodyWeightMigration, /best_1rm_relative_bw numeric/i);
  assert.match(bodyWeightMigration, /estimated_1rm \/ weighted_winners\.resolved_body_weight_kg/i);
  assert.match(bodyWeightMigration, /then 'measured'::text/i);
  assert.match(bodyWeightMigration, /then 'interpolated'::text/i);
  assert.match(bodyWeightMigration, /previous_measured_on is not null and next_measured_on is not null/i);
});

test("current body weight export uses the latest actual daily representative", () => {
  assert.match(bodyWeightMigration, /create function public\.get_kleos_current_body_weight/i);
  assert.match(bodyWeightMigration, /select distinct on \(measurement\.measured_on\)/i);
  assert.match(bodyWeightMigration, /measurement\.measured_at desc nulls last/i);
  assert.match(bodyWeightMigration, /order by daily_body_weight\.measured_on desc/i);
  assert.match(bodyWeightMigration, /limit 1/i);
});

test("raw export RPCs are service-only security invokers", () => {
  assert.match(migration, /security invoker/i);
  assert.match(bodyWeightMigration, /revoke all on function public\.get_kleos_strength_snapshot\(uuid\) from authenticated/i);
  assert.match(bodyWeightMigration, /grant execute on function public\.get_kleos_strength_snapshot\(uuid\) to service_role/i);
  assert.match(bodyWeightMigration, /revoke all on function public\.get_kleos_current_body_weight\(uuid\) from authenticated/i);
  assert.match(bodyWeightMigration, /grant execute on function public\.get_kleos_current_body_weight\(uuid\) to service_role/i);
  assert.doesNotMatch(bodyWeightMigration, /from auth\.users/i);
});

test("Edge Function validates the forwarded user token through the Kleos gateway before using Heracles service privileges", () => {
  assert.match(edgeFunction, /verify-heracles-caller/);
  assert.match(edgeFunction, /Authorization: authorization/);
  assert.match(edgeFunction, /payload\?\.authorized === true/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /auth\.admin\.listUsers/);
  assert.match(edgeFunction, /rpc\("get_kleos_strength_snapshot"[\s\S]*p_owner_id: owner\.id/);
  assert.match(edgeFunction, /rpc\("get_kleos_current_body_weight"[\s\S]*p_owner_id: owner\.id/);
  assert.doesNotMatch(edgeFunction, /sb_(?:publishable|secret)_/i);
});

test("export response declares the bodyweight-aware contract", () => {
  assert.match(edgeFunction, /contract_version: "1\.2\.0"/);
  assert.match(edgeFunction, /window_days: 30/);
  assert.match(edgeFunction, /minimum_sessions: 3/);
  assert.match(edgeFunction, /estimation_basis: "observed_e1rm_high"/);
  assert.match(edgeFunction, /current_body_weight: currentBodyWeight/);
});
