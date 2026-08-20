import { spawnSync } from "node:child_process";

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
if (!databaseUrl) {
  console.log("SKIP: SUPABASE_TEST_DB_URL is not set; database tests require an explicitly disposable local database.");
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("SUPABASE_TEST_DB_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}

if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
  console.error("Refusing database tests: SUPABASE_TEST_DB_URL must target localhost.");
  process.exit(1);
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCommand, ["supabase", "test", "db", "--db-url", databaseUrl], {
  encoding: "utf8",
  shell: false,
  maxBuffer: 50 * 1024 * 1024,
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
