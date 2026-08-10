# Lorenzo's Lifting Ledger

A deliberately tiny, installable PWA that proves the authentication foundation for a future lifting tracker.

The current app has two states:

- signed out: **Continue with Google**
- signed in: the global exercise catalogue, the authenticated user's imported lift data, and a sign-out control

It is a static site for GitHub Pages and uses Supabase Auth plus owner-scoped workout data and global reference data in Postgres.

## Security model

`config.js` contains a Supabase project URL and a **publishable** key. Both are designed to be public in browser apps. Never put any of these in this repository:

- a Supabase secret key or legacy `service_role` key
- a Google OAuth client secret
- database passwords
- private access tokens

All future user-owned tables must enable Row Level Security before the app writes data.

## Data model

- `data_imports` records source provenance and checksums per user.
- `exercises` is the global, app-managed exercise catalogue shared by every user.
- `exercise_aliases` maps historical or alternative labels to global exercises without displaying duplicate exercises in the catalogue.
- `movement_patterns` defines the global biomechanical dimensions used by the movement matrix.
- `movement_mapping_versions` records immutable published matrix metadata and source hashes.
- `exercise_movement_pattern_coefficients` stores every exercise-by-pattern cell for each matrix version, including explicit zeroes.
- `gyms` is the top-level owner-scoped gym list.
- `workout_sessions` stores each dated visit to a gym.
- `session_exercises` stores the ordered exercise occurrences, their catalogue reference, the original historical label, and any equipment ID used in that session.
- `exercise_sets` stores each numbered weight/reps pair, optional RPE, warm-up/drop-set/superset flags, and generated Brzycki/Epley estimated 1RM values with a low/high range.

Every user-data table has an `owner_id` reference to `auth.users`. Row Level Security limits select, insert, update, and delete operations to the signed-in owner. Parent/child foreign keys also include the owner ID so records cannot be connected across users. Global exercise and movement reference tables are readable by authenticated users but are not writable from the public client. The initial gym-data CSV remains local and is ignored by Git because this repository is public.

The current dataset contains 140 global exercise definitions, 40 movement patterns, one published 5,600-cell mapping version, 11 gyms, 404 inferred sessions, 1,909 session exercises, and 4,499 sets spanning 23 January 2023 through 4 August 2026. Historical sessions are inferred from user + gym + date because the source CSV contains no workout time. A positional comparison found zero missing or mismatched rows after import.

Exercise names are globally standardized, while aliases can resolve old import labels without creating duplicate catalogue entries. The original label remains on each historical session exercise. Equipment IDs also remain on session exercises rather than exercise definitions because different machines for the same movement can have different resistance profiles.

The movement-pattern schema, access model, import guarantees, and current follow-up work are documented in [Movement-pattern data model](docs/MOVEMENT_PATTERN_DATA_MODEL.md). Coefficient semantics and limitations are documented separately in [Movement-pattern contribution coefficients](docs/MOVEMENT_PATTERN_COEFFICIENTS.md).

Estimated 1RM values are calculated by Postgres whenever weight or reps changes. Brzycki uses `weight × 36 ÷ (37 − reps)` and Epley uses `weight × (1 + reps ÷ 30)`. The range stores the lower and higher estimates, rounded to two decimal places. Ranges remain empty when a source set has no reps or falls outside Brzycki's valid 1–36 rep domain.

## Live infrastructure

- App: <https://neolorenzo.github.io/Lorenzos-Lifting-Ledger/>
- Supabase project: `Lorenzo's Lifting Ledger` (`yfhmjwkscqbpzblrpsoy`, London)
- Production Site URL and redirect allow-list are configured in Supabase.
- GitHub Pages deploys from `main` at `/ (root)` with HTTPS enforced.

## Remaining Google setup

1. In Google Cloud Console, create an OAuth 2.0 Client ID of type **Web application**.
2. Add `https://yfhmjwkscqbpzblrpsoy.supabase.co/auth/v1/callback` as its authorized redirect URI.
3. In Supabase, open **Authentication → Providers → Google**, enable Google, and enter the Google client ID and client secret. The secret stays in Supabase and must never be committed.

## Local check

OAuth callbacks require an HTTP origin; do not open `index.html` directly from disk.

```powershell
npm run dev
```

Then visit `http://127.0.0.1:5173/`. The development server disables browser caching so frontend edits appear after a refresh.

Run the repository checks with:

```powershell
npm test
```

## Files

- `index.html` — minimal app shell
- `app.js` — Supabase Google sign-in/session handling
- `config.js` — public browser configuration only
- `manifest.webmanifest` and `service-worker.js` — installable PWA metadata and offline shell
