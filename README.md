# Lorenzo's Lifting Ledger

A deliberately tiny, installable PWA that proves the authentication foundation for a future lifting tracker.

The current app has two states:

- signed out: **Continue with Google**
- signed in: the authenticated user's complete exercise catalogue, imported lift data, and a sign-out control

It is a static site for GitHub Pages and uses Supabase Auth plus an owner-scoped Postgres database.

## Security model

`config.js` contains a Supabase project URL and a **publishable** key. Both are designed to be public in browser apps. Never put any of these in this repository:

- a Supabase secret key or legacy `service_role` key
- a Google OAuth client secret
- database passwords
- private access tokens

All future user-owned tables must enable Row Level Security before the app writes data.

## Data model

- `data_imports` records source provenance and checksums per user.
- `exercises` is each user's private exercise-name catalogue. Distinct names remain separate and can later be mapped to a canonical exercise without rewriting history.
- `gyms` is the top-level owner-scoped gym list.
- `workout_sessions` stores each dated visit to a gym.
- `session_exercises` stores the ordered exercise occurrences, their catalogue reference, the original historical label, and any equipment ID used in that session.
- `exercise_sets` stores each numbered weight/reps pair, optional RPE, warm-up/drop-set/superset flags, and generated Brzycki/Epley estimated 1RM values with a low/high range.

Every user-data table has an `owner_id` reference to `auth.users`. Row Level Security limits select, insert, update, and delete operations to the signed-in owner. Parent/child foreign keys also include the owner ID so records cannot be connected across users. The initial CSV remains local and is ignored by Git because this repository is public.

The initial import contains 287 private exercise definitions, 11 gyms, 403 inferred sessions, 1,908 session exercises, and 4,498 sets spanning 23 January 2023 through 4 August 2026. Historical sessions are inferred from user + gym + date because the source CSV contains no workout time. A positional comparison found zero missing or mismatched rows after import.

Exercise names are currently kept distinct, including non-standard labels. Only leading, trailing, and repeated whitespace is normalized in the catalogue. The original label remains on each historical session exercise. Equipment IDs also remain on session exercises rather than exercise definitions because different machines for the same movement can have different resistance profiles.

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
python -m http.server 8000
```

Then visit `http://localhost:8000/`.

Run the repository checks with:

```powershell
npm test
```

## Files

- `index.html` — minimal app shell
- `app.js` — Supabase Google sign-in/session handling
- `config.js` — public browser configuration only
- `manifest.webmanifest` and `service-worker.js` — installable PWA metadata and offline shell
