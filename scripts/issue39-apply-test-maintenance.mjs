import { readFile, rm, writeFile } from "node:fs/promises";

const appTestUrl = new URL("../tests/app.test.mjs", import.meta.url);
const documentationUrl = new URL("../docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md", import.meta.url);
const diagnosticUrl = new URL("../tests/issue39-line-ending-diagnostic.test.mjs", import.meta.url);

function replaceRequired(source, previous, replacement, label) {
  if (source.includes(previous)) return source.replace(previous, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`Issue #39 patch could not find ${label}`);
}

let appTests = await readFile(appTestUrl, "utf8");

appTests = replaceRequired(
  appTests,
  String.raw`    createHash("sha256").update(matrix).digest("hex"),
    "d02a9b06f62c634dfac77643e6f46282e0e08015d9c995fcfad63c392db8faa2",`,
  String.raw`    createHash("sha256").update(matrix.replace(/\r\n/g, "\n")).digest("hex"),
    "506cd478b08fa1289cf2c9263e92aa68296a92e82380919321f708a54d72c3b8",`,
  "the authored relevance source fingerprint assertion",
);

appTests = replaceRequired(
  appTests,
  String.raw`  assert.match(documentation, /not percentages/i);
  assert.match(documentation, /ea447d03fdc8284768512a47fb713a5670bfd7f507155df8bbf3337285b3de3f/);`,
  String.raw`  assert.match(documentation, /not percentages/i);
  assert.match(documentation, /506cd478b08fa1289cf2c9263e92aa68296a92e82380919321f708a54d72c3b8/);
  assert.match(documentation, /ea447d03fdc8284768512a47fb713a5670bfd7f507155df8bbf3337285b3de3f/);`,
  "the authored relevance provenance assertions",
);

appTests = replaceRequired(
  appTests,
  String.raw`  assert.match(app, /\.from\("session_exercises"\)[\s\S]+\.update\(\{ equipment_id: equipmentId \}\)/);
  assert.match(app, /\.from\("exercise_sets"\)[\s\S]+reported_rir_bucket: set\.reportedRirBucket/);`,
  String.raw`  assert.match(app, /import \{ persistSessionHistoryExerciseCorrection \} from "\.\/features\/session\/history-correction\.js"/);
  assert.match(app, /const savedCorrection = await persistSessionHistoryExerciseCorrection\(/);
  assert.match(app, /exercise\.equipment_id = savedCorrection\.equipment_id/);`,
  "the stale Session History direct-write assertions",
);

appTests = replaceRequired(
  appTests,
  String.raw`  const [app, analytics, dashboard, setModel, migration, designRules] = await Promise.all([
    read("app.js"), read("analytics.js"), read("features/dashboard.js"), read("set-model.js"),
    read("supabase/migrations/20260820190518_implement_rir_set_model.sql"), read("docs/DESIGN_RULES.md"),
  ]);`,
  String.raw`  const [app, analytics, dashboard, setModel, migration, designRules, historyCorrection] = await Promise.all([
    read("app.js"), read("analytics.js"), read("features/dashboard.js"), read("set-model.js"),
    read("supabase/migrations/20260820190518_implement_rir_set_model.sql"), read("docs/DESIGN_RULES.md"),
    read("features/session/history-correction.js"),
  ]);`,
  "the RIR test dependency list",
);

appTests = replaceRequired(
  appTests,
  String.raw`  assert.match(app, /rir_source: set\.isWarmup \? null : "user_entered"/);`,
  String.raw`  assert.match(historyCorrection, /is_warmup: set\.isWarmup/);
  assert.match(historyCorrection, /reported_rir_bucket: set\.reportedRirBucket/);
  assert.match(historyCorrection, /\.rpc\("update_session_history_exercise"/);`,
  "the stale RIR direct-persistence assertion",
);

await writeFile(appTestUrl, appTests, "utf8");

let documentation = await readFile(documentationUrl, "utf8");
documentation = replaceRequired(
  documentation,
  "Source CSV SHA-256: `d02a9b06f62c634dfac77643e6f46282e0e08015d9c995fcfad63c392db8faa2`.",
  "Source-text SHA-256 (UTF-8 BOM retained; CRLF normalized to LF before hashing): `506cd478b08fa1289cf2c9263e92aa68296a92e82380919321f708a54d72c3b8`.\n\nThe source-checksum metadata was corrected in September 2026 after Linux CI exposed that the originally documented value matched neither the committed bytes nor BOM, line-ending, or final-newline normalization variants. Repository history confirms that the authoritative CSV blob has been unchanged since it and this documentation were introduced together on 2026-08-10; this correction changes provenance metadata only, not any exercise–muscle coefficient.",
  "the relevance source checksum documentation",
);
await writeFile(documentationUrl, documentation, "utf8");

await rm(diagnosticUrl, { force: true });
