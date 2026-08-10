# Lorenzo's Lifting Ledger — Design Rules

## 1. No magic math, numbers, formulas, or science

No magic math/numbers/formulas/science. All of that must have explanations within the app. For example, every value in the movement-pattern mapping matrix must be explained; fatigue calculations, atrophy estimates, and similar derived values must be explained as well.

Any calculated, weighted, estimated, scored, or scientifically framed value shown by the app must let the user understand:

- What the value means in plain language.
- Why the app shows it and how it should be used.
- Which user data and assumptions produced it.
- The formula or method used, including units and the meaning of every input.
- Where fixed coefficients, thresholds, mapping weights, or defaults came from.
- Whether the value is measured, entered by the user, calculated, or estimated.
- The value's uncertainty, limitations, and cases where it may be misleading.
- The scientific source or product decision behind it, when applicable.

Explanations must be available inside the relevant app workflow, close to the value they describe. A user must not need to inspect source code, database migrations, or external spreadsheets to understand a result. Links to deeper documentation or research may supplement an explanation, but must not replace the in-app explanation.

If the app cannot explain a number honestly and clearly, it must not present that number as meaningful or authoritative.

The current interpretation, limits, and permitted uses of the movement-pattern mapping matrix are defined in [Movement-pattern contribution coefficients](MOVEMENT_PATTERN_COEFFICIENTS.md).

## 2. No tonnage or weight × reps metrics

The app must never calculate, display, or use weight × reps—also called tonnage or volume load—as a hypertrophy, training-volume, workload, progression, or personal-statistics metric.

Load and repetitions remain useful as separate, exercise-specific performance data. Hypertrophy-relevant volume should primarily refer to sufficiently hard working sets and explicitly justified measures derived from them.

The rationale and product-wide implementation rule are defined in [Why the app does not track tonnage](WHY_THE_APP_DOES_NOT_TRACK_TONNAGE.md).

## 3. Dumbbell weight is always per dumbbell

Every weight recorded or displayed for an exercise whose catalogue name contains `(Dumbbell)` must mean the weight of **one dumbbell**.

This rule applies without exception to:

- unilateral dumbbell exercises;
- bilateral dumbbell exercises;
- raw set-history displays;
- exercise-progression comparisons;
- and estimated 1RM calculations and labels.

For example, a bilateral dumbbell press performed with two 30 kg dumbbells is recorded as `30 kg`, not `60 kg`. A unilateral curl with one 15 kg dumbbell is recorded as `15 kg`.

The app must label dumbbell performance as `kg per dumbbell` wherever weight or a weight-derived estimate is displayed. It must never infer or display the combined weight of a dumbbell pair.

## 4. Color meaning must be consistent and intuitive

Exercise colors must be assigned from one shared, deterministic app-wide palette. The same exact exercise and equipment identity must keep the same color everywhere it appears. Different machines or equipment identities for the same exercise must use distinguishable colors and must be identified with a visible text key. Color must never be the only way to identify an exercise series.

Directional change colors have a fixed semantic meaning throughout the app:

- Positive increases are green.
- Negative decreases are red.
- No change or unavailable direction is neutral gray.

Every colored change must also include an explicit sign or text label, such as `+12%`, `−8%`, or `No change`, so the meaning remains accessible without color. Exercise-series palettes should avoid reusing the semantic increase and decrease colors where that would make the meaning ambiguous.
