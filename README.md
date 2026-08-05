# Lorenzo's Lifting Ledger

A deliberately tiny, installable PWA that proves the authentication foundation for a future lifting tracker.

The current app has two states:

- signed out: **Continue with Google**
- signed in: the authenticated user's imported lift data and a sign-out control

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
- `gyms` is the top-level owner-scoped gym list.
- `workout_sessions` stores each dated visit to a gym.
- `session_exercises` stores the ordered exercises and optional equipment IDs in a session.
- `exercise_sets` stores each numbered weight/reps pair, optional RPE, and warm-up, drop-set, and superset flags.

Every user-data table has an `owner_id` reference to `auth.users`. Row Level Security limits select, insert, update, and delete operations to the signed-in owner. Parent/child foreign keys also include the owner ID so records cannot be connected across users. The initial CSV remains local and is ignored by Git because this repository is public.

The initial import contains 11 gyms, 403 inferred sessions, 1,908 session exercises, and 4,498 sets spanning 23 January 2023 through 4 August 2026. Historical sessions are inferred from user + gym + date because the source CSV contains no workout time. A positional comparison found zero missing or mismatched rows after import.

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
