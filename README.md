# Lorenzo's Lifting Ledger

An installable, evidence-aware lifting tracker with a public scientific overview and an authenticated personal training ledger.

The current app has two states:

- signed out: a crawlable public front page explaining the product, its training model, scientific foundations, limitations, and design decisions, with **Sign in** in the top-right
- signed in: a Home start/resume-session action, Session history, My Data, My Stuff preset management, a Literature hub, Settings for body-weight data, and a sign-out control

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
- `muscles` defines the ordered 40-entity global muscle catalogue used by the hypertrophy model.
- `movement_mapping_versions` records immutable published matrix metadata and source hashes.
- `exercise_movement_pattern_coefficients` stores every exercise-by-pattern cell for each matrix version, including explicit zeroes.
- `movement_muscle_mapping_versions` records immutable movement-pattern-to-muscle functional-matrix metadata and source hashes.
- `movement_pattern_muscle_coefficients` stores all 1,600 explicit cells in each 40-by-40 functional matrix version.
- `exercise_muscle_mapping_versions` records the exact upstream versions and composition algorithm used for each derived exercise-to-muscle matrix.
- `exercise_muscle_coefficients` stores all 5,520 explicit raw composition scores in the current 138-by-40 derived matrix.
- `exercise_muscle_relevance_versions` records immutable provenance for the authored exercise-specific hypertrophic-relevance layer.
- `exercise_muscle_relevance_coefficients` stores all 5,520 explicit relevance cells using the documented `0`, `0.25`, `0.50`, `0.75`, and `1.00` contract.
- `gyms` is the top-level owner-scoped gym list.
- `workout_sessions` stores completed and in-progress workouts. A partial unique index allows only one in-progress session per owner; blank active sessions may not have a gym yet.
- `session_exercises` stores the ordered exercise occurrences, their catalogue reference, the original historical label, and any equipment ID used in that session.
- `exercise_sets` stores each numbered weight/reps pair, optional RPE, warm-up/drop-set/superset flags, and generated Brzycki/Epley estimated 1RM values with a low/high range.
- `workout_presets` stores each owner-scoped, uniquely named reusable exercise pool.
- `workout_preset_exercises` stores unordered, deduplicated exercise references plus a reusable set count. Starting from a preset randomizes exercise order and creates blank set slots without copying load, reps, equipment, RPE, or warm-up state.
- `body_weight_measurements` stores owner-scoped imported scale observations in kilograms, with one canonical measurement per owner per date and a link to `data_imports` provenance.
- `user_settings` stores the owner-scoped, default-off `relative_e1rm_enabled` presentation preference.

Body-weight CSV imports use column A as an exact `DD/MM/YYYY` date and column B as a positive kilogram value; optional headers and additional ignored columns are supported. The filename and export source are not part of the contract. My Data calculates a daily series only between measured observations using linear interpolation: `W(d) = W1 + (W2 - W1) × (days from d1 / days between d1 and d2)`. Interpolated values remain visibly labelled as calculated, are not persisted as scale observations, and are never extrapolated. Settings supports previewing, importing/correcting, inspecting, and deleting only the signed-in user's body-weight dataset.

When explicitly enabled in Settings, existing absolute e1RM bounds are divided by the measured or interpolated body weight on each workout date and displayed as dimensionless `× BW` values. Absolute generated e1RM columns remain canonical and unchanged. Relative values are unavailable outside body-weight coverage because the app does not extrapolate. Dumbbell relative e1RM remains per dumbbell.

All dumbbell exercise weights use one product-wide convention: the stored value is always the weight of **one dumbbell**, for both unilateral and bilateral exercises. A set performed with two 30 kg dumbbells is therefore stored as `30 kg`, not `60 kg`; dumbbell e1RM values use and retain that same per-dumbbell unit.

Every user-data table has an `owner_id` reference to `auth.users`. Row Level Security limits select, insert, update, and delete operations to the signed-in owner. Parent/child foreign keys also include the owner ID so records cannot be connected across users. Global exercise and movement reference tables are readable by authenticated users but are not writable from the public client. The initial gym-data CSV remains local and is ignored by Git because this repository is public.

The current dataset contains 138 global exercise definitions, 40 movement patterns, 40 muscles, a current 5,520-cell exercise-to-pattern mapping version, a current 1,600-cell movement-pattern-to-muscle functional mapping version, a current 5,520-cell derived exercise-to-muscle composition version, a current 5,520-cell exercise-to-muscle hypertrophic-relevance version, 11 gyms, 407 inferred sessions, 1,936 session exercises, and 4,541 sets spanning 23 January 2023 through 10 August 2026. Historical sessions are inferred from user + gym + date because the source CSV contains no workout time. A positional comparison found zero missing or mismatched rows after import.

Exercise names are globally standardized, while aliases can resolve old import labels without creating duplicate catalogue entries. The original label remains on each historical session exercise. Equipment IDs also remain on session exercises rather than exercise definitions because different machines for the same movement can have different resistance profiles.

The movement-pattern schema, access model, import guarantees, and current follow-up work are documented in [Movement-pattern data model](docs/MOVEMENT_PATTERN_DATA_MODEL.md). Coefficient semantics and limitations are documented separately in [Movement-pattern contribution coefficients](docs/MOVEMENT_PATTERN_COEFFICIENTS.md). The 40-entity hypertrophy model is defined in [Muscle Group Taxonomy for Hypertrophy Modelling](docs/MUSCLE_GROUP_TAXONOMY.md). The functional link between movement patterns and muscles is documented in [Movement Pattern → Muscle Function Matrix](docs/MOVEMENT_PATTERN_TO_MUSCLE_FUNCTION.md). The deterministic matrix product is documented in [Exercise × Muscle Functional Composition Matrix](docs/EXERCISE_MUSCLE_COMPOSITION.md). The exercise-specific filtering and weighting layer is documented in [Exercise → Muscle Hypertrophic Relevance Matrix](docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md), with shared scientific limits stated in [Current Limitations of Muscle Group Mapping](docs/CURRENT_LIMITATIONS_OF_MUSCLE_GROUP_MAPPING.md).

The app intentionally does not calculate or display weight × reps, tonnage, or volume load. The scientific and product rationale is documented in [Why the app does not track tonnage](docs/WHY_THE_APP_DOES_NOT_TRACK_TONNAGE.md).

Estimated 1RM values are calculated by Postgres whenever weight or reps changes. Brzycki uses `weight × 36 ÷ (37 − reps)` and Epley uses `weight × (1 + reps ÷ 30)`. The range stores the lower and higher estimates, rounded to two decimal places. Ranges remain empty when a source set has no reps or falls outside Brzycki's valid 1–36 rep domain. Relative presentation uses `relative e1RM = absolute e1RM ÷ body weight on the workout date`; it does not store or replace those absolute estimates.

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
- `app.js` — Supabase Google sign-in/session handling, top-level orchestration
- `features/body-weight.js` — body-weight import/deletion controller, relative e1RM preference settings, and body weight chart UI
- `body-weight.js` — generic body-weight CSV parsing, validation, preview, and interpolation helpers
- `relative-e1rm.js` — pure absolute-to-relative e1RM range and effective-mode helpers
- `literature.js` — safe in-app Markdown rendering and the Literature document registry
- `config.js` — public browser configuration only
- `manifest.webmanifest` and `service-worker.js` — installable PWA metadata and offline shell
- `docs/` — all app-facing scientific methods, product decisions, model interpretations, limitations, and evidence-quality specifications surfaced through Literature; filenames use uppercase snake case
