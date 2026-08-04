# Lorenzo's Lifting Ledger

A deliberately tiny, installable PWA that proves the authentication foundation for a future lifting tracker.

The current app has exactly two states:

- signed out: **Continue with Google**
- signed in: **Hello world** and a sign-out control

It is a static site for GitHub Pages and uses Supabase Auth. There is no application database schema yet.

## Security model

`config.js` contains a Supabase project URL and a **publishable** key. Both are designed to be public in browser apps. Never put any of these in this repository:

- a Supabase secret key or legacy `service_role` key
- a Google OAuth client secret
- database passwords
- private access tokens

All future user-owned tables must enable Row Level Security before the app writes data.

## One-time setup

1. In Google Cloud Console, create an OAuth 2.0 Client ID of type **Web application**.
2. Add `https://yfhmjwkscqbpzblrpsoy.supabase.co/auth/v1/callback` as its authorized redirect URI.
3. In Supabase, open **Authentication → Providers → Google**, enable Google, and enter the Google client ID and client secret. The secret stays in Supabase and must never be committed.
4. In Supabase, open **Authentication → URL Configuration**:
   - Site URL: `https://neolorenzo.github.io/Lorenzos-Lifting-Ledger/`
   - Redirect URL: `https://neolorenzo.github.io/Lorenzos-Lifting-Ledger/`
   - Optional local redirect: `http://localhost:8000/`
5. In the GitHub repository, enable Pages from the `main` branch and `/ (root)`.

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
