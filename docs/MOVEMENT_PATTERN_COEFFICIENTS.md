# Movement-pattern contribution coefficients

## Purpose and status

This document defines how Lorenzo's Lifting Ledger interprets the values in the movement-pattern mapping matrix. It is the authoritative product specification for those coefficients until it is superseded by a documented revision. The same explanation must eventually be made available inside the app wherever movement-pattern data or a derived result is shown.

The coefficients are an authored biomechanical model. They are useful for organizing, comparing, and aggregating exercise participation, but they are not direct physical measurements and must not be presented with experimental precision.

## 1. What the weights mean

Each matrix value is an **independent movement-pattern contribution coefficient from 0 to 1**.

It is **not**:

- A percentage.
- A probability.
- A share of the exercise.
- Normalized across the exercise's row.
- A direct measurement of EMG, joint torque, range of motion, or mechanical work.

Instead, use this interpretation:

| Coefficient | Intended meaning |
| ---: | --- |
| **1.0** | Defining or maximal movement-pattern contribution for this exercise |
| **0.75–0.9** | Major contribution |
| **0.5–0.7** | Substantial secondary contribution |
| **0.25–0.4** | Moderate secondary contribution |
| **0.1–0.2** | Small but biomechanically meaningful contribution |
| **0** | Pattern is absent or too trivial for this model |

For example, an RDL might be represented as:

- Hip extension (dynamic): `1.0`
- Lumbar extension (isometric): `1.0`
- MCP flexion (isometric): `0.5`
- IP flexion (isometric): `0.5`
- Wrist extension (isometric): `0.2`

Those entries do **not** mean that 320% of an RDL occurs. They mean that the exercise independently scores at those levels on five different biomechanical dimensions.

## 2. Why totals can exceed 1

Movement patterns are independent dimensions, not pieces of a pie. A compound exercise can simultaneously involve a major hip action, a major knee action, an ankle action, trunk stabilization, grip stabilization, and scapular movement.

> **A row sum has no biomechanical meaning and must never be normalized, displayed as an exercise score, or used as one.**

A Meadows row with a sum of `5.70` is valid, but `5.70` is not itself a meaningful property of the exercise. The row is a **multi-axis feature vector**. Dividing every entry by the row total would incorrectly weaken exercises merely because they involve more independently modelled actions.

## 3. Comparisons within one exercise

Coefficients may be compared within an exercise to describe the intended hierarchy of its movement patterns.

For example, `Lateral Raise (Dumbbell) (Standing)` might map to:

- Glenohumeral abduction: `1.0`
- Scapular upward rotation: `0.7`
- Scapular posterior tilt: `0.3`
- Glenohumeral external rotation: `0.2`

This says that glenohumeral abduction is the defining action, upward rotation contributes substantially, and the other coupled motions make smaller contributions.

## 4. Comparisons across exercises

Coefficients in the same movement-pattern column may also be compared across exercises. The same column is intended to use the same approximate scale throughout the catalogue.

For example:

- Dumbbell lateral raise — scapular upward rotation: `0.7`
- Cable lateral raise — scapular upward rotation: `0.45`

The model therefore considers scapular upward rotation more materially involved in the modelled dumbbell execution. It does **not** claim that `0.8` literally produces twice the joint torque, range of motion, muscle activation, mechanical work, or training stimulus of `0.4`.

The scientifically defensible description is:

> **Ordinal-to-semiquantitative biomechanical coefficients intended for relative comparison and aggregation, not physical measurements.**

Because the values are expert heuristics rather than experimentally measured ratios, small numerical differences must not be presented as proven or exact.

## 5. How the coefficients are determined

Assigning a coefficient considers four questions:

1. Does the action occur at all?
2. How much joint or scapular excursion occurs?
3. How central is the action to completing the exercise?
4. For an isometric pattern, how materially loaded is the stabilization demand?

The working guide is:

- Defining joint action: around `1.0`.
- Major coupled action: approximately `0.6–0.9`.
- Meaningful secondary action: approximately `0.25–0.5`.
- Minor action that is still worth tracking: approximately `0.1–0.2`.

These bands guide expert judgement; they are not a formula that automatically determines a value.

### Dynamic and isometric patterns are different

For a **dynamic** pattern, the coefficient describes the relative biomechanical importance of an action that includes movement and therefore considers excursion as well as its role in the exercise.

For an **isometric** pattern, movement amplitude is deliberately approximately zero. Its coefficient instead represents the relative significance of stabilization or loading required to resist movement. An isometric value must not be interpreted as dynamic excursion.

## 6. Permitted downstream calculations

The app may multiply exercise volume by each movement coefficient and then aggregate each movement pattern independently.

If someone performs three sets of an exercise whose mappings are:

- Pattern A: `1.0`
- Pattern B: `0.5`
- Pattern C: `0.2`

the result is:

- Pattern A: `3 × 1.0 = 3.0` weighted sets
- Pattern B: `3 × 0.5 = 1.5` weighted sets
- Pattern C: `3 × 0.2 = 0.6` weighted sets

For movement pattern `p`, the general calculation is:

$$
\operatorname{PatternLoad}_p = \sum_e \left(\operatorname{ExerciseVolume}_e \times w_{e,p}\right)
$$

where:

- `e` identifies an exercise.
- `ExerciseVolume` is the separately defined volume input, such as completed working sets.
- `w(e,p)` is exercise `e`'s coefficient for movement pattern `p`.
- `PatternLoad` is the aggregate modelled exposure for pattern `p`.

When the volume input is sets, **weighted sets are a modelled movement-pattern exposure**, not a count of literal completed sets, a physical measurement, or a direct estimate of hypertrophy stimulus.

Aggregate each pattern separately over the chosen period, such as a training week. Never divide a coefficient or result by the exercise's row total.

## 7. Keep biomechanics separate from training context

Movement coefficients represent **biomechanical participation only**. They must not also encode:

- Effort, RIR, or RPE.
- External load.
- Number of sets or repetitions.
- Range of motion performed by a particular user.
- Execution quality.
- Muscle hypertrophy stimulus.

Those are separate inputs or models downstream. For example, a future calculation might use:

```text
sets × movement coefficient × effort modifier × user-ROM modifier
```

Each factor would require its own definition, provenance, uncertainty, and in-app explanation. Keeping them separate prevents a biomechanical mapping from silently changing when training volume or execution changes.

## 8. Matrix maintenance

Pattern columns that contain zero mappings across the entire current exercise catalogue may be omitted. They may be reintroduced when an exercise requires them.

`Sagittal Plane Radiocarpal Extension (Dynamic)` is currently omitted because none of the 140 catalogue exercises performs active wrist extension as its intended dynamic action. Reverse curls are represented by wrist-extension **isometric** demand instead. If an exercise such as a reverse wrist curl is added later, the dynamic pattern may be restored and documented.

Any future coefficient revision should record what changed, why it changed, who made the modelling decision, and whether downstream historical results need to be recalculated. The application must continue to follow [the no-magic-math rule](DESIGN_RULES.md): users should be able to understand the meaning, inputs, method, and limitations of any displayed result.
