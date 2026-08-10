# Exercise × Muscle Functional Composition Matrix

## Purpose

This matrix is the deterministic composition of the app's current exercise-to-movement-pattern matrix and movement-pattern-to-muscle functional matrix. It connects each catalogue exercise to each canonical muscle through the movement patterns that link them.

It is a **derived functional model**. It is not a direct exercise-to-muscle hypertrophy matrix, a force-sharing model, an EMG estimate, or a prediction of muscle growth.

## Composition rule

For exercise `e` and muscle `m`:

$$
\operatorname{ExerciseMuscleScore}_{e,m}
=
\sum_p
\left(
  \operatorname{ExercisePattern}_{e,p}
  \times
  \operatorname{PatternMuscle}_{p,m}
\right)
$$

The sum includes all 40 movement patterns. This is ordinary matrix multiplication: a `138 × 40` exercise-to-pattern matrix multiplied by a `40 × 40` pattern-to-muscle matrix produces a `138 × 40` exercise-to-muscle matrix.

The current derived version contains:

- 138 exercises.
- 40 muscles.
- 5,520 explicit cells, including zeros.
- 1,152 nonzero cells.
- 91 cells above `1.0`.
- Maximum score: `2.0`.

## Why scores can exceed one

Both source matrices contain independent dimensions rather than percentages or shares of a whole. Several movement patterns within one exercise can legitimately connect to the same muscle.

For example, if two movement-pattern paths connect an exercise to a muscle, their contributions are added:

```text
(1.0 × 0.8) + (0.5 × 0.4) = 1.0
```

No row or column is normalized. Scores are not capped at `1.0`. A score above one means that multiple independently modelled pathways contribute to the raw composition; it does not mean more than 100% muscle involvement.

## Interpretation

The value is best described as a **raw exercise-to-muscle functional-composition score**.

It may be used to:

- trace which movement-pattern pathways connect an exercise to a muscle;
- compare exercises within the same version of the authored model;
- identify zero or unexpectedly weak mappings for review;
- provide a transparent input to the separate [Exercise → Muscle Hypertrophic Relevance Matrix](EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md).

It must not be presented as:

- a percentage;
- a probability;
- a force share;
- a count of sets;
- an anatomical measurement;
- an estimate of hypertrophic stimulus;
- evidence that one exercise produces a precise multiple of another exercise's growth.

## Important limits

Matrix composition carries forward the assumptions and uncertainty of both source matrices. It does not yet adjust for muscle length, joint angle, exercise-specific moment arms, biarticular interference, resistance curves, support, technique, range of motion, effort, fatigue, or longitudinal hypertrophy evidence.

The result can also count several correlated movement pathways for the same muscle. That is useful for transparent feature composition, but it prevents the raw score from being treated as a calibrated biological quantity.

## Provenance and versioning

The current version is `exercise_definitions_2026_08_10` and uses algorithm `raw_sum_product_v1`.

Its inputs are:

- Exercise-to-pattern version: `exercise_definitions_2026_08_10`.
- Pattern-to-muscle version: `initial_2026_08_10`.
- Derived payload SHA-256: `5d2aa404f975039f337aea446bf07e3fbad6c299786858fab9c62e2f0419cdf5`.

The database stores both upstream version identities on the derived version. A new exercise-to-pattern version, pattern-to-muscle version, or composition algorithm must create a new derived version rather than silently rewriting the published matrix.
