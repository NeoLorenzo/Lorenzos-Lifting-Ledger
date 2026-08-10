# Why the App Does Not Track Tonnage

## Decision

The app must not calculate, display, or use weight × reps, tonnage, or volume load anywhere in the product.

This applies both to the hypertrophy model and to personal-statistics pages.

## Why

Tonnage is commonly calculated as:

```text
weight × reps
```

or, across multiple sets:

```text
sets × reps × weight
```

Although easy to calculate, it does not represent hypertrophic stimulus in a scientifically useful way.

It ignores many variables that determine what a muscle actually experiences, including:

- Proximity to failure
- Exercise biomechanics
- Range of motion
- External and internal moment arms
- Resistance curves
- Machine pulley and leverage ratios
- Distribution of load between different muscles
- Muscle length at which force is produced
- Technique
- Differences between exercises

For example, performing 25 repetitions with a light weight can produce substantially more tonnage than performing 8 difficult repetitions with a heavy weight. That does not imply proportionally more hypertrophic stimulus.

The problem becomes even worse when comparing exercises. A leg press may allow several times more external load than a leg extension despite this having no interpretable relationship to how much hypertrophic stimulus the quadriceps receive.

The number on a machine's weight stack is also not necessarily the force experienced by the user because machines use different lever arms, pulley arrangements, cams, and resistance profiles.

Therefore:

> Tonnage measures the amount of external mass moved repeatedly. It does not measure hypertrophic stimulus.

## Tonnage Is Not “Volume”

The app must also avoid referring to tonnage as training volume.

Within this project, hypertrophy-relevant volume should primarily refer to quantities such as the number of sufficiently hard sets performed and any derived measures built from those sets.

Calling kg × reps “volume” creates unnecessary conceptual confusion between:

- External workload
- Training volume
- Muscular stimulus

These should remain separate concepts.

## Why We Should Not Display It Anyway

Even if tonnage were displayed purely as a descriptive statistic, it would provide very little actionable information.

Metrics such as “82,430 kg lifted this month” look impressive but tell the user almost nothing about whether their training improved.

Including it merely because other lifting apps display it would add novelty slop: statistics that make the application appear more data-rich without helping the user make better decisions.

This project should not optimize for the number of graphs, records, badges, or impressive-looking statistics it can generate.

Every metric included in the app should have a defensible purpose. If a statistic does not meaningfully help the user:

- Evaluate training
- Monitor progression
- Understand hypertrophy stimulus
- Manage fatigue
- Make a better programming decision

it should not exist merely because it is easy to calculate.

## What to Track Instead

For progression, the underlying performance data are more useful:

- Load
- Repetitions
- Sets
- RIR or proximity to failure
- Exercise-specific performance trends

For hypertrophy modelling, the app should use variables explicitly designed to represent relevant training exposure rather than deriving a pseudo-stimulus metric from external tonnage.

## Rule

Never use or display weight × reps as a hypertrophy, volume, workload, progression, or personal-statistics metric.

The application should prefer fewer meaningful metrics over a larger collection of scientifically weak or purely decorative statistics.
