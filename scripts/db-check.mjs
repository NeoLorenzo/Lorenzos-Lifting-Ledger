import path from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
if (!databaseUrl) {
  console.error("Database validation was not run: SUPABASE_TEST_DB_URL is not set. Configure an explicitly disposable local Supabase/Postgres database before running database tests.");
  process.exit(1);
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

// Supabase local Postgres does not serve TLS. Keep this local-only adjustment
// after the hostname guard so it cannot alter remote connection behavior.
if (!parsed.searchParams.has("sslmode")) {
  parsed.searchParams.set("sslmode", "disable");
}

const cliPath = path.join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
const result = spawnSync(process.execPath, [cliPath, "test", "db", "--db-url", parsed.toString()], {
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
