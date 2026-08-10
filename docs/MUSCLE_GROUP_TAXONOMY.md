# Muscle Group Taxonomy for Hypertrophy Modelling

## 1. Purpose

This document defines the set of muscle groups and muscle subdivisions used by the project when mapping resistance-training exercises and movement patterns to muscular hypertrophy stimulus.

The goal is not to model every anatomically named skeletal muscle. The goal is to represent muscles at the **highest level of anatomical resolution that is useful and scientifically defensible for resistance-training hypertrophy modelling**.

The taxonomy therefore attempts to avoid two opposite errors:

1. **Under-segmentation** — grouping muscles together despite evidence that exercises can stimulate them differently.
2. **False precision** — splitting muscles or regions when there is insufficient evidence that the distinction can be meaningfully modelled from resistance-training data.

The project should favor anatomical distinctions that are supported by:

- different joint functions;
- different joint-crossing anatomy;
- substantially different muscle lengths under different exercise configurations;
- evidence of differential hypertrophy between exercises or training conditions;
- or sufficiently strong anatomical/functional differences to make differential loading highly plausible.

Where evidence is insufficient, muscles should remain grouped.

---

# 2. General selection rule

A muscle or muscle subdivision should receive its own entity when at least one of the following is true:

### A. It is a distinct anatomical muscle with meaningfully different function

Examples:

- Soleus versus gastrocnemius
- Brachialis versus biceps brachii
- Rectus femoris versus the vasti

### B. The subdivision crosses different joints

This is particularly important because changing the position of one joint can change muscle length and force production independently of other muscles performing the same movement.

Examples:

- Rectus femoris crosses the hip and knee; the vasti only cross the knee.
- Triceps long head crosses the shoulder and elbow; the lateral and medial heads only cross the elbow.
- Gastrocnemius crosses the knee and ankle; soleus only crosses the ankle.
- Biceps femoris short head crosses only the knee, whereas the other major hamstrings cross the hip and knee.

These differences can create meaningfully different hypertrophic responses to exercise selection.

### C. Longitudinal resistance-training studies show differential hypertrophy

This is the strongest justification for maintaining separate entities.

For example, seated versus prone leg curls can produce different hypertrophy across the individual hamstrings, supporting a muscle-specific rather than generic "hamstrings" model.

### D. The distinction materially improves exercise modelling

A subdivision should not be included merely because anatomy textbooks name it separately.

The distinction must potentially change the estimated stimulus produced by exercises in the catalogue.

---

# 3. Canonical muscle taxonomy

The project will initially model the following **40 muscle entities**.

## Chest

1. Pectoralis Major — Clavicular
2. Pectoralis Major — Sternocostal
3. Pectoralis Minor

## Shoulders

4. Anterior Deltoid
5. Lateral Deltoid
6. Posterior Deltoid

## Back and scapular musculature

7. Latissimus Dorsi
8. Teres Major
9. Upper Trapezius
10. Middle Trapezius
11. Lower Trapezius
12. Rhomboids
13. Serratus Anterior
14. Lumbar Erector Spinae

## Elbow flexors

15. Biceps Brachii
16. Brachialis
17. Brachioradialis

## Elbow extensors

18. Triceps Brachii — Long Head
19. Triceps Brachii — Lateral Head
20. Triceps Brachii — Medial Head

## Forearms and grip

21. Wrist Flexors
22. Wrist Extensors
23. Finger Flexors / Grip

## Trunk and hip flexors

24. Rectus Abdominis
25. Obliques
26. Iliopsoas

## Gluteal musculature

27. Gluteus Maximus
28. Gluteus Medius + Minimus

## Hip adductors

29. Adductor Magnus
30. Other Hip Adductors

## Quadriceps

31. Rectus Femoris
32. Vastus Lateralis
33. Vastus Medialis
34. Vastus Intermedius

## Hamstrings

35. Biceps Femoris — Long Head
36. Biceps Femoris — Short Head
37. Semitendinosus
38. Semimembranosus

## Calves

39. Gastrocnemius
40. Soleus

---

# 4. Chest

## Pectoralis major

The pectoralis major should not be represented as one completely homogeneous entity.

The two primary regions relevant to resistance training are:

- **Clavicular portion**
- **Sternocostal portion**

Their fibre orientations differ substantially, meaning that changing the direction of humeral movement and pressing angle changes their mechanical contribution.

This distinction is especially relevant for comparing horizontal presses with incline presses and low-to-high versus horizontal or high-to-low fly movements.

Research examining pressing angles has repeatedly demonstrated spatial differences in pectoralis major excitation, supporting the functional distinction between clavicular and sternocostal portions. While acute activation evidence alone does not establish differential hypertrophy, the underlying anatomy makes the distinction relevant enough to preserve in the model.

### Decision

Model separately:

- Pectoralis Major — Clavicular
- Pectoralis Major — Sternocostal

Do **not** create entities such as:

- Inner chest
- Outer chest
- Middle chest
- Upper-inner chest

These are not sufficiently distinct anatomical muscles for the purposes of this model.

---

# 5. Pectoralis minor

Pectoralis minor is anatomically and functionally distinct from pectoralis major.

Its principal actions concern scapular movement rather than humeral adduction.

Because the project's movement-pattern model includes scapulothoracic actions such as depression, protraction, and downward rotation, pectoralis minor can theoretically receive meaningful load independently of pectoralis major.

### Decision

Maintain **Pectoralis Minor** as its own entity.

Its contribution to most conventional hypertrophy exercises is likely to be substantially smaller than that of pectoralis major, but grouping the two would be anatomically incorrect.

---

# 6. Deltoids

The deltoid should be divided into:

- Anterior Deltoid
- Lateral Deltoid
- Posterior Deltoid

This is one of the most useful subdivisions in resistance-training modelling.

The three portions have markedly different fibre orientations and movement functions:

- anterior fibres contribute strongly to shoulder flexion;
- lateral fibres contribute strongly to abduction;
- posterior fibres contribute strongly to horizontal abduction and shoulder extension.

The exercise catalogue contains movements specifically designed around these differences, including presses, lateral raises, and rear-delt flies.

### Decision

Model all three deltoid portions separately.

Further subdivision into individual anatomical segments is currently unnecessary.

---

# 7. Trapezius

The trapezius should be divided into:

- Upper Trapezius
- Middle Trapezius
- Lower Trapezius

These regions have substantially different fibre orientations and scapular functions.

The upper trapezius contributes strongly to scapular upward rotation and clavicular/scapular elevation.

The middle trapezius contributes strongly to scapular retraction.

The lower trapezius contributes to scapular upward rotation, posterior tilt, and depression.

Because the movement-pattern matrix explicitly distinguishes these scapular actions, collapsing the trapezius into one entity would remove useful information.

### Decision

Model upper, middle, and lower trapezius separately.

---

# 8. Rhomboids

Rhomboid major and rhomboid minor are anatomically separate muscles, but their functions and loading during conventional resistance exercises are extremely similar.

Both primarily contribute to:

- scapular retraction;
- scapular downward rotation;
- scapular stabilization.

The exercise catalogue does not provide a defensible method of selectively estimating hypertrophic stimulus to rhomboid major versus minor.

### Decision

Combine:

> **Rhomboids**

Do not separately model rhomboid major and rhomboid minor unless future evidence provides an actionable reason to do so.

---

# 9. Serratus anterior

Serratus anterior should remain separate because it performs scapular functions that are distinct from the trapezius and rhomboids.

It contributes importantly to:

- scapular protraction;
- upward rotation;
- posterior tilt;
- maintaining the scapula against the thorax.

Exercises permitting substantial scapular movement, particularly certain pressing and overhead movements, may therefore stimulate it differently from exercises in which the scapula is constrained.

### Decision

Include **Serratus Anterior**.

---

# 10. Latissimus dorsi

Latissimus dorsi is a large muscle with broad attachment sites and evidence of regionally heterogeneous function.

Different portions may contribute differently depending on arm path.

However, the evidence base does not currently justify assigning confident hypertrophy coefficients to separate `"upper"`, `"middle"`, and `"lower"` lat entities across the project's exercises.

Separating these regions would currently introduce more precision than the available longitudinal evidence supports.

### Decision

Use one entity:

> **Latissimus Dorsi**

Regional lat modelling can be reconsidered if sufficiently strong longitudinal evidence becomes available.

---

# 11. Teres major

Teres major assists shoulder extension and adduction and therefore overlaps functionally with latissimus dorsi.

It is nevertheless a separate anatomical muscle with different attachment geometry.

Because some shoulder-extension and adduction patterns may load teres major meaningfully, treating all such force production as `"lat stimulus"` would be anatomically incomplete.

### Decision

Include **Teres Major** separately.

---

# 12. Lumbar erector spinae

The lumbar erectors should be represented as a dedicated entity because several exercises in the catalogue impose substantial spinal-extension torque even when the lumbar spine remains approximately static.

Examples include:

- RDLs
- unsupported bent-over rows
- back extensions
- Meadows rows

This is precisely why the movement-pattern system distinguishes **dynamic** and **isometric** lumbar actions.

Trying to separate iliocostalis, longissimus, multifidus, and related spinal extensors would create excessive complexity without corresponding confidence in exercise-specific hypertrophy assignment.

### Decision

Use:

> **Lumbar Erector Spinae**

as a functional hypertrophy group.

---

# 13. Elbow flexors

The primary elbow flexors should be represented as:

- Biceps Brachii
- Brachialis
- Brachioradialis

These muscles have sufficiently different anatomy and dependence on forearm position that grouping them as `"biceps"` would lose meaningful exercise information.

Brachioradialis becomes particularly relevant during neutral and pronated elbow flexion.

Brachialis contributes strongly to elbow flexion regardless of radioulnar position.

Biceps brachii has a particularly strong relationship with supinated elbow flexion and also crosses the shoulder.

### Decision

Include all three separately.

---

# 14. Biceps brachii heads

Although biceps brachii contains distinct long and short heads, they should **not initially be separated**.

There are anatomical and regional differences, but current longitudinal resistance-training evidence is not strong enough to confidently assign materially different stimulus coefficients to long versus short head across the exercise catalogue.

Resistance-training studies do demonstrate **regional hypertrophy** within the elbow flexors, showing that muscle growth can vary along the length of a muscle. However, regional hypertrophy should not automatically be interpreted as clean long-head versus short-head hypertrophy.

### Decision

Use:

> **Biceps Brachii**

as one entity.

Do not currently use:

- Biceps Long Head
- Biceps Short Head

This can be revisited if sufficiently direct evidence develops.

---

# 15. Triceps

The triceps should be divided into:

- Long Head
- Lateral Head
- Medial Head

The long head is particularly important to separate because it crosses both the shoulder and elbow, whereas the lateral and medial heads do not.

This means shoulder position alters long-head length independently of the monoarticular triceps heads.

Longitudinal evidence supports the practical importance of this distinction. Overhead elbow-extension training has produced substantially greater hypertrophy of the triceps, particularly the long head, than elbow extension performed with the arm in a neutral position.

The differing functional roles of the individual triceps heads with shoulder position are also supported by biomechanical evidence.

### Decision

Model:

- Triceps — Long Head
- Triceps — Lateral Head
- Triceps — Medial Head

This allows shoulder position to influence estimated triceps stimulus rather than treating every elbow-extension exercise identically.

---

# 16. Forearms and grip

The forearm should not be represented as a single `"forearms"` muscle.

The current exercise catalogue contains movements that meaningfully distinguish:

- wrist flexion;
- wrist extension;
- gripping/finger flexion.

Therefore use:

- Wrist Flexors
- Wrist Extensors
- Finger Flexors / Grip

The last category combines the major finger-flexor contribution to grip rather than attempting to separately model every intrinsic and extrinsic hand muscle.

### Decision

Use three functional groups:

> Wrist Flexors
> Wrist Extensors
> Finger Flexors / Grip

Further subdivision is currently unnecessary.

---

# 17. Rectus abdominis

Rectus abdominis is the principal muscle entity required for loaded spinal-flexion exercises such as machine crunches.

Although anatomical intersections divide the muscle visually, there is not a sufficient basis for modelling `"upper abs"` and `"lower abs"` as independent hypertrophy muscles in the application.

Regional activation differences can occur, but this does not justify treating the rectus abdominis as separate muscles.

### Decision

Use:

> **Rectus Abdominis**

as one entity.

---

# 18. Obliques

The internal and external obliques are anatomically separate and have different rotational roles.

However, the current exercise catalogue contains very little direct rotational or lateral-flexion training.

Their primary relevance is likely to arise from trunk stabilization during unilateral exercises.

Separating internal and external obliques would therefore add considerable complexity without meaningfully improving the current hypertrophy model.

### Decision

Use:

> **Obliques**

as one combined group for now.

---

# 19. Iliopsoas

Hip flexion is not performed solely by rectus femoris.

The iliacus and psoas major collectively form the iliopsoas and are major hip flexors.

Because decline weighted sit-ups and other potential movements can involve meaningful hip flexion, a dedicated hip-flexor entity is useful.

Trying to distinguish iliacus from psoas major is unnecessary for the current exercise catalogue.

### Decision

Use:

> **Iliopsoas**

as one entity.

---

# 20. Gluteus maximus

Gluteus maximus should clearly remain its own muscle entity.

It is a major hip extensor and can receive substantial hypertrophic stimulus from:

- hip thrusts;
- squats;
- split squats;
- leg presses;
- other hip-extension patterns.

Squat-depth research using MRI has demonstrated substantial gluteus maximus hypertrophy and greater growth following deeper squat training.

### Decision

Include:

> **Gluteus Maximus**

---

# 21. Gluteus medius and minimus

Gluteus medius and minimus are distinct anatomical muscles, but the current exercise catalogue contains no direct hip-abduction exercises designed to selectively distinguish them.

Their primary relevance within the catalogue is stabilization of the pelvis and femur during unilateral lower-body exercises.

Separating them would therefore imply a degree of exercise-specific precision that the current model cannot justify.

### Decision

Combine:

> **Gluteus Medius + Minimus**

This can be revisited if dedicated hip-abduction exercises are introduced.

---

# 22. Hip adductors

The hip adductors should not all be collapsed into one entity.

The most important distinction is:

- Adductor Magnus
- Other Hip Adductors

## Adductor magnus

Adductor magnus is unusual because substantial portions contribute to hip extension as well as hip adduction.

This makes it relevant not only to adductor-machine training but also to deep squat and similar hip-extension exercises.

Longitudinal MRI research has demonstrated substantial adductor growth from squat training, particularly with deeper squatting.

This makes a dedicated adductor magnus entity particularly valuable.

## Other hip adductors

The remaining adductor musculature can be grouped because the current exercise catalogue provides little basis for confidently distinguishing hypertrophy among:

- adductor longus;
- adductor brevis;
- gracilis;
- pectineus.

### Decision

Use:

- **Adductor Magnus**
- **Other Hip Adductors**

---

# 23. Quadriceps

The quadriceps should be divided into all four major constituent muscles:

- Rectus Femoris
- Vastus Lateralis
- Vastus Medialis
- Vastus Intermedius

This is one of the strongest cases for muscle-specific modelling.

## Rectus femoris versus vasti

Rectus femoris crosses both the hip and knee.

The vasti cross only the knee.

This means hip position and multi-joint exercise selection can affect rectus femoris differently from the vasti.

Longitudinal studies directly support this distinction.

Squat training has demonstrated nonuniform hypertrophy across the quadriceps muscles.

Direct comparisons between squat and leg-extension training also show that exercise selection can produce differing rectus femoris and vastus lateralis hypertrophy.

Hip position during knee extension can also alter rectus femoris hypertrophy relative to other quadriceps regions.

### Decision

All four quadriceps muscles remain separate entities.

This distinction is sufficiently well supported that a generic `"quads"` entity would discard meaningful information.

---

# 24. Hamstrings

The hamstrings should be divided into:

- Biceps Femoris — Long Head
- Biceps Femoris — Short Head
- Semitendinosus
- Semimembranosus

This is another particularly strong case for individual-muscle modelling.

## Joint-crossing differences

Biceps femoris short head crosses only the knee.

The other three major hamstrings cross both the hip and knee.

Therefore changing hip position during knee flexion substantially alters the length of the biarticular hamstrings without doing the same thing to biceps femoris short head.

## Longitudinal evidence

A direct comparison of seated and prone leg-curl training found greater overall hamstring hypertrophy in the seated condition, with responses differing among individual hamstring muscles.

Exercise selection has also been shown to produce muscle-specific hamstring hypertrophy, including differences in biceps femoris long-head development.

### Decision

Model all four major hamstring muscles separately.

A single `"hamstrings"` entity would remove one of the clearest sources of exercise-specific hypertrophy differences in the lower body.

---

# 25. Calves

The calves should be divided into:

- Gastrocnemius
- Soleus

This distinction is strongly justified anatomically and experimentally.

Gastrocnemius crosses both the knee and ankle.

Soleus crosses only the ankle.

Consequently, knee position changes gastrocnemius length substantially while producing much less change in soleus length.

A 12-week within-subject training study directly compared calf raises with the knee extended versus flexed and found substantially greater gastrocnemius hypertrophy with the knee extended, whereas soleus hypertrophy was much less affected by knee position.

This provides direct longitudinal evidence that the two muscles should not be treated as one generic calf unit.

### Decision

Use:

- **Gastrocnemius**
- **Soleus**

The medial and lateral heads of gastrocnemius should remain combined for now because the current model cannot confidently assign exercise-specific stimulus between them.

---

# 26. Why some anatomical muscles are intentionally omitted

The human musculoskeletal system contains far more muscles than the 40 entities above.

The project intentionally excludes many small muscles because they fail the usefulness criterion.

Examples include:

- rotator-cuff muscles;
- intrinsic hand muscles;
- small intrinsic spinal muscles;
- tensor fasciae latae;
- sartorius;
- popliteus;
- plantaris;
- individual intrinsic foot muscles.

This does not mean these muscles are inactive during resistance training.

It means that:

1. they are not primary hypertrophy targets of the current exercise catalogue;
2. exercise-specific stimulus cannot currently be estimated with useful confidence;
3. modelling them would add complexity without improving the app's primary hypertrophy calculations.

The taxonomy should expand only when a new entity adds actionable information.

---

# 27. Regional hypertrophy versus separate muscle entities

The project should distinguish between:

### Different muscles or heads

and

### Different regions of the same muscle

Regional hypertrophy is real. Resistance training can produce nonuniform growth along the length of a muscle. Quadriceps studies, for example, demonstrate proximal-distal differences depending on exercise and range of motion.

However:

> **Evidence of regional hypertrophy does not automatically justify creating separate muscle entities.**

For example:

- proximal rectus femoris;
- middle rectus femoris;
- distal rectus femoris;

are regions of one muscle, not three independent muscles.

Creating regional entities would substantially increase model complexity and require exercise-specific regional hypertrophy coefficients that are currently unavailable for most exercises.

### Project rule

Regional hypertrophy should inform the evidence underlying exercise recommendations, but anatomical regions should **not presently become independent muscle entities** unless there is a compelling modelling reason.

---

# 28. Evidence threshold for future additions

A proposed new muscle subdivision should not be added simply because:

- it has a separate anatomical name;
- an EMG study reports different activation;
- bodybuilders commonly discuss targeting it;
- an exercise is marketed as targeting it.

A new entity should preferably satisfy at least two of the following:

1. Distinct anatomical muscle or head.
2. Meaningfully different joint-crossing anatomy.
3. Meaningfully different mechanical function.
4. Longitudinal evidence of differential hypertrophy.
5. Exercise catalogue contains movements capable of differentially loading it.
6. Separating it improves downstream stimulus estimation.

The stronger the longitudinal evidence, the lower the need for inference from the other criteria.

---

# 29. Current taxonomy summary

The current canonical taxonomy is:

```text
Chest
- Pectoralis Major — Clavicular
- Pectoralis Major — Sternocostal
- Pectoralis Minor

Shoulders
- Anterior Deltoid
- Lateral Deltoid
- Posterior Deltoid

Back / Scapula
- Latissimus Dorsi
- Teres Major
- Upper Trapezius
- Middle Trapezius
- Lower Trapezius
- Rhomboids
- Serratus Anterior
- Lumbar Erector Spinae

Elbow Flexors
- Biceps Brachii
- Brachialis
- Brachioradialis

Elbow Extensors
- Triceps — Long Head
- Triceps — Lateral Head
- Triceps — Medial Head

Forearms / Grip
- Wrist Flexors
- Wrist Extensors
- Finger Flexors / Grip

Core / Hip Flexors
- Rectus Abdominis
- Obliques
- Iliopsoas

Glutes
- Gluteus Maximus
- Gluteus Medius + Minimus

Adductors
- Adductor Magnus
- Other Hip Adductors

Quadriceps
- Rectus Femoris
- Vastus Lateralis
- Vastus Medialis
- Vastus Intermedius

Hamstrings
- Biceps Femoris — Long Head
- Biceps Femoris — Short Head
- Semitendinosus
- Semimembranosus

Calves
- Gastrocnemius
- Soleus
```

**Total: 40 muscle entities.**

---

# 30. UI muscle groups

The 40 canonical muscle entities above remain the resolution used by the scientific model. For labels, filters, charts, and other interface elements, each entity is also assigned to exactly one larger **UI muscle group**.

UI muscle groups are display aggregations only. They must not replace the underlying entities in exercise-to-muscle calculations or be interpreted as evidence that all members receive the same stimulus.

| UI muscle group | Underlying muscle entities |
| --- | --- |
| Abs | Rectus Abdominis; Obliques |
| Adductors | Adductor Magnus; Other Hip Adductors |
| Back | Latissimus Dorsi; Teres Major; Upper Trapezius; Middle Trapezius; Lower Trapezius; Rhomboids; Serratus Anterior; Lumbar Erector Spinae |
| Biceps | Biceps Brachii; Brachialis |
| Calves | Gastrocnemius; Soleus |
| Chest | Pectoralis Major — Clavicular; Pectoralis Major — Sternocostal; Pectoralis Minor |
| Forearms | Brachioradialis; Wrist Flexors; Wrist Extensors; Finger Flexors / Grip |
| Glutes | Gluteus Maximus; Gluteus Medius + Minimus |
| Hamstrings | Biceps Femoris — Long Head; Biceps Femoris — Short Head; Semitendinosus; Semimembranosus |
| Hip Flexors | Iliopsoas |
| Quads | Rectus Femoris; Vastus Lateralis; Vastus Medialis; Vastus Intermedius |
| Shoulders | Anterior Deltoid; Lateral Deltoid; Posterior Deltoid |
| Triceps | Triceps Brachii — Long Head; Triceps Brachii — Lateral Head; Triceps Brachii — Medial Head |

In the backend, `ui_muscle_groups` stores the 13 display groups and `muscles.ui_muscle_group_id` stores the required many-to-one relationship. The foreign key is deliberately separate from the older functional taxonomy label on each muscle.

---

# 31. Final principle

The muscle taxonomy should represent the **maximum useful resolution supported by anatomy and resistance-training evidence**, not the maximum possible anatomical resolution.

The model should therefore become more granular only when that granularity improves the accuracy of exercise-to-muscle stimulus estimation.

The governing rule is:

> **Separate muscles when exercise selection can plausibly produce meaningfully different hypertrophic outcomes; combine them when the distinction cannot yet be modelled with sufficient confidence.**

This taxonomy should remain revisable as better longitudinal hypertrophy evidence becomes available.
