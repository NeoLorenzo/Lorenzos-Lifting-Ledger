# Kleos strength export

Heracles remains the source of truth for workout sessions, exercise identity, sets, and estimated strength performance. Kleos receives only a narrow derived snapshot; it does not receive raw workout history and cannot write workout data back to Heracles.

## Qualification window

The export examines **today plus the preceding 29 calendar dates**. A set contributes only when:

- its workout session is `completed`;
- it belongs to the authorized Heracles owner;
- it is not a warm-up;
- reported RIR is 0–3;
- `estimated_1rm_high` is positive.

An exercise is exported only after it appears in at least **3 distinct qualifying workout sessions** in that window. Multiple sets from the same session still count as one session.

## Exported strength value

For each qualifying exercise, `best_1rm` is the maximum `estimated_1rm_high` in the window. `estimated_1rm_high` is Heracles's upper observed estimated-1RM value: the higher of the Brzycki and Epley estimates calculated from entered weight and completed repetitions.

It is therefore:

- calculated, not directly measured;
- based on completed repetitions rather than reps + reported RIR;
- not a confidence interval and not a claim about a person's true 1RM;
- expressed using Heracles's normal weight semantics, including weight **per dumbbell** for dumbbell exercises.

The response labels this basis as `observed_e1rm_high`.

## Security boundary

`public.get_kleos_strength_snapshot()` is executable only by the Heracles service role. Ordinary `anon` and `authenticated` Heracles clients cannot call it.

The `kleos-strength` Edge Function is the only cross-project HTTP boundary. It accepts a Kleos bearer token, validates that token against the Kleos Supabase Auth project, requires the authorized Kleos account, and only then calls the service-only export RPC. No Heracles service credential is shared with Kleos or exposed to a browser.

The endpoint returns only:

- exercise ID and name;
- `best_1rm`;
- qualifying-session count;
- date on which the selected estimate was achieved;
- estimation-basis label;
- contract metadata describing the 30-day / 3-session rule.
