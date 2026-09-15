# Body Circumference Measurements

Heracles stores body circumference as discrete user-entered tape measurements in centimetres. These observations complement body weight and training performance; they are not body-fat or body-composition estimates.

## Standard collection conditions

For repeatability, measure in the morning while fasted and after urinating, before training. Use the same tape and posture when practical. Keep the tape level and snug against the body without compressing the skin.

## Supported sites

- **Neck:** around mid-neck, just below the laryngeal prominence, with the tape level.
- **Shoulders:** around the widest points of both shoulders and deltoids, arms relaxed.
- **Chest:** horizontally around the chest at mid-sternum level after a normal relaxed exhale.
- **Waist:** midway between the lowest rib and the top of the hip bone after a normal relaxed exhale.
- **Hips:** around the widest circumference of the hips and glutes, feet together.
- **Upper arm — left/right, relaxed:** arm relaxed, measured halfway between the shoulder tip and elbow tip.
- **Upper arm — left/right, flexed:** bend the elbow to about 90°, hold the upper arm roughly horizontal, maximally flex the upper arm, and measure around its largest circumference.
- **Forearm — left/right:** arm relaxed, around the widest part of the forearm.
- **Thigh — left/right:** leg relaxed, halfway between the groin crease and the top of the kneecap.
- **Calf — left/right:** standing with weight evenly distributed, around the widest part of the calf.

The site list is deliberately bounded. Left and right limb observations use distinct site identities. Flexed measurements are deliberately limited to the left and right upper arms; other sites retain their existing standardized protocol.

## Data semantics

`body_circumference_measurements` stores the owner, supported site, measurement state, exact observation timestamp, and raw circumference in centimetres. `measurement_state` is constrained to `relaxed` or `flexed`, with `flexed` valid only for `upper_arm_left` and `upper_arm_right`. Existing records and inserts that omit the field default to `relaxed`, preserving the meaning of measurements recorded before flexed tracking was added.

Relaxed and flexed upper-arm measurements are separate longitudinal series. A flexed observation is never compared directly with a relaxed observation as if they were the same measurement condition.

Row Level Security restricts reads and mutations to the signed-in owner.

Observations remain raw and discrete. Heracles does not fill missing dates, interpolate or extrapolate circumference values, infer body-fat percentage, or alter body-weight/workout history when circumference measurements are corrected or deleted.
