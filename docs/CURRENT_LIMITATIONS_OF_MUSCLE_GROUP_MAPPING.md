# Current Limitations of Muscle Group Mapping

## Current approach

The anatomical muscle-mapping system uses two layers:

```text
Exercise
→ Movement Patterns
→ Muscle Functions
```

Each exercise is assigned biomechanical movement patterns, and each movement pattern is mapped to the muscles anatomically capable of contributing to that action.

This provides a useful and systematic **first-pass estimate of muscular involvement**, but it should not currently be interpreted as a precise model of hypertrophic stimulus.

The app now adds a separate exercise-specific layer:

```text
Exercise × Muscle Functional Composition
→ Exercise × Muscle Hypertrophic Relevance
```

That authored relevance layer removes incidental anatomical contributors and adjusts exercise-specific credit using joint position, muscle length, biarticular interference, support, resistance geometry, and selected longitudinal evidence. It improves practical usefulness without turning the result into a measurement of stimulus or predicted growth.

## Main limitations

### 1. Joint action does not determine muscle force

Multiple muscles can produce the same joint movement. Knowing that hip extension occurs, for example, identifies plausible contributors such as the gluteus maximus, hamstrings, and adductor magnus, but does not tell us how force is actually distributed between them.

The current coefficients therefore represent **functional anatomical contribution**, not measured muscle force.

### 2. Exercise-specific joint positions are not fully represented

Muscle leverage and force-producing capacity change with joint angle.

Two exercises can contain the same movement pattern while loading the participating muscles differently because their joint configurations differ.

### 3. Muscle length is not yet modelled

Muscle length can substantially influence hypertrophic outcomes.

For example, seated and prone leg curls both involve dynamic knee flexion, but the seated position lengthens the biarticular hamstrings and can produce different hypertrophy.

The current movement-pattern mapping cannot capture this difference by itself.

### 4. Biarticular interference is not yet modelled

Muscles crossing multiple joints can assist one movement while opposing another occurring simultaneously.

For example:

- Hamstrings extend the hip but flex the knee.
- Rectus femoris extends the knee but flexes the hip.

This means compound exercises cannot always be accurately interpreted by considering each movement pattern independently.

### 5. Dynamic and isometric involvement does not directly equal hypertrophic stimulus

The matrix distinguishes dynamic from materially significant isometric actions, which is useful biomechanically.

However, the hypertrophic significance of an isometric role depends on the actual muscular force and exercise mechanics.

For example, spinal erector loading during an RDL is much more substantial than minor stabilization occurring in many other exercises.

### 6. Resistance profiles are not represented

The current model does not account for where within an exercise's range of motion external torque is greatest.

Two exercises involving the same joint action may therefore expose a muscle to very different loading profiles.

### 7. Exercise support and stabilization can change muscular demand

Chest support, machine stabilization, unilateral loading, and body position can substantially change the demands placed on stabilizing musculature.

The movement-pattern system captures some of these differences but cannot comprehensively infer them.

### 8. The muscle taxonomy is intentionally incomplete

The project tracks 40 hypertrophy-relevant muscle entities rather than every skeletal muscle.

Small stabilizers and muscles without a useful role in the current hypertrophy model may therefore contribute to an exercise without appearing in the matrix.

Their contribution must **not** be redistributed to the tracked muscles.

### 9. The coefficients are not percentages

Movement-pattern → muscle coefficients are independent functional scores.

They do not represent:

- percentages of force;
- percentages of activation;
- percentages of hypertrophic stimulus;
- probabilities;
- normalized shares.

Rows are not expected to sum to `1`.

### 10. Exercise-specific evidence remains incomplete

The functional-composition matrix primarily represents anatomical function. The separate hypertrophic-relevance matrix now incorporates selected longitudinal evidence and exercise-specific review for cases such as:

- seated versus prone leg curls;
- overhead versus neutral-position triceps extensions;
- different knee positions during calf raises;
- isolated versus compound quadriceps exercises.

Direct longitudinal evidence is still unavailable for most exercise–muscle pairs, so many coefficients remain disciplined model estimates rather than empirically calibrated quantities.

## Appropriate current use

The functional mapping should be interpreted as:

> **A structured anatomical estimate of which tracked muscles are plausibly and meaningfully involved in an exercise.**

It is suitable for generating candidate muscle relationships and providing the foundation for later modelling.

It should **not yet be described as a validated quantitative estimate of hypertrophic stimulus or effective sets per muscle**.

The session-history UI uses the separate hypertrophic-relevance matrix to decide which muscles receive worthwhile exercise credit. Those coefficients are likewise not percentages, measured stimulus, or effective-set equivalents.

## Future refinement

The new exercise-specific relevance layer begins this refinement by incorporating:

- muscle length;
- joint position;
- moment arms and leverage;
- biarticular interference;
- resistance profiles;
- support and stabilization;
- dynamic versus isometric loading significance;
- and high-quality longitudinal hypertrophy evidence.

Future versions should revise individual coefficients as stronger exercise-specific evidence becomes available, while keeping effort, set count, load progression, technique, fatigue, and individual response as separate downstream dimensions.
