import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260909120000_add_kleos_strength_snapshot.sql", import.meta.url),
  "utf8",
);
const edgeFunction = await readFile(
  new URL("../supabase/functions/kleos-strength/index.ts", import.meta.url),
  "utf8",
);

test("Kleos export uses completed analytical working sets in a 30-calendar-day window", () => {
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

test("raw export RPC is not exposed to ordinary Heracles clients", () => {
  assert.match(migration, /revoke all on function public\.get_kleos_strength_snapshot\(\) from anon/i);
  assert.match(migration, /revoke all on function public\.get_kleos_strength_snapshot\(\) from authenticated/i);
  assert.match(migration, /grant execute on function public\.get_kleos_strength_snapshot\(\) to service_role/i);
});

test("Edge Function validates a Kleos session before using Heracles service privileges", () => {
  assert.match(edgeFunction, /\/auth\/v1\/user/);
  assert.match(edgeFunction, /theneolorenzo@gmail\.com/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /rpc\("get_kleos_strength_snapshot"\)/);
  assert.doesNotMatch(edgeFunction, /sb_secret_/i);
});

test("export response declares its filtering and estimation contract", () => {
  assert.match(edgeFunction, /contract_version: "1\.0\.0"/);
  assert.match(edgeFunction, /window_days: 30/);
  assert.match(edgeFunction, /minimum_sessions: 3/);
  assert.match(edgeFunction, /estimation_basis: "observed_e1rm_high"/);
});
