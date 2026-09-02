# Clean local Supabase bootstrap

The committed migration chain remains the production upgrade path. Its early migrations transform Lorenzo's historical import and owner-scoped exercise catalogue, and their integrity checks deliberately require that historical state. They are not a valid empty-database initializer.

The clean path starts from the committed `supabase/bootstrap/current_baseline.sql` snapshot. Its cutover is `20260902120000_fix_live_workout_reorder.sql`, recorded with a SHA-256 in `supabase/bootstrap/baseline.json`. The bootstrap applies only valid migration filenames whose fourteen-digit version is later than that cutover. Future ordinary migrations therefore apply automatically; regenerating the baseline is an explicit maintenance action.

Exercise numeric IDs are surrogate database identifiers, not cross-database canonical identities. The clean baseline preserves a deterministic, internally consistent ID/code mapping, but numeric IDs are not guaranteed to equal IDs historically allocated in production. Repository inspection found no frontend, API, import, URL, or integration behavior that relies on cross-database numeric exercise identity or `exercise_<id>` values.

For a disposable local database, run:

```powershell
npm run db:bootstrap
```

Docker Desktop must be running. The command starts a separate disposable local Supabase project (`heracles-bootstrap`) on PostgreSQL port `55322`, resets that database to an empty state, and loads the committed current-schema/reference-data baseline. It never stops, removes, or reads the repository's ordinary local Supabase project. It creates no auth users or personal workout/import/body-weight/preset data. It does not link to or read any remote Supabase project.

Then run database validation against that local database only:

```powershell
$env:SUPABASE_TEST_DB_URL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
npm run check:db
npm run agent:check
```

`SUPABASE_TEST_DB_URL` accepts only `localhost`, `127.0.0.1`, or `::1`. Database validation rejects remote URLs and must only target a disposable local database.

Run `npm run db:bootstrap` again whenever another genuinely empty local database is needed; its isolated `supabase db reset` recreates the disposable database before rebuilding the baseline.
