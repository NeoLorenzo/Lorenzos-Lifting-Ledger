# Body Weight Data

## Purpose and scope

The body-weight subsystem stores raw scale observations and provides a transparent daily series for workout-date-relative e1RM. Raw observations may come from CSV imports or Apple Health synchronization. Scale observations and the daily series use kilograms. The subsystem does not calculate BMI, body fat, energy needs, trend weight, or a body-weight visualization.

## CSV contract

The CSV importer reads file contents regardless of filename or export source. Column A is a date with exact `DD/MM/YYYY` semantics, column B is a finite numeric kilogram value greater than zero, and columns C onward are ignored. One optional header and blank rows are accepted. Quoted fields, escaped quotes, UTF-8 BOM, LF, and CRLF follow ordinary CSV mechanics.

The full file is validated before persistence. Impossible dates, malformed nonblank rows, invalid weights, and duplicate calendar dates are reported with their source row and prevent all writes. The preview reports observation count, first and last measured dates, and how many dates inside that coverage will be interpolated.

CSV import semantics intentionally remain date-canonical: an owner may have at most one `csv_import` observation for a calendar date, and a later valid CSV import corrects the earlier CSV observation for an overlapping date.

## Apple Health synchronization contract

Apple Health `bodyMass` observations are stored as first-class raw measurements with `source_kind = 'apple_health'`. They do not create fake CSV provenance rows.

Each Apple Health observation supplies:

- `source_record_key` — a deterministic source identity;
- `measured_at` — the exact source timestamp;
- `measured_on` — the source measurement's local calendar date;
- `weight_kg` — the measured body mass in kilograms;
- optional `source_name` and `source_bundle_identifier` metadata.

If Apple Health exposes a stable native sample identifier, that should be used as the basis of `source_record_key`. Otherwise the caller should construct a canonical key from stable sample fields such as the `bodyMass` metric, source bundle identifier, canonical UTC sample instant, and measured value. The same source sample must always produce the same key.

`sync_apple_health_body_weight(jsonb)` validates the complete payload before inserting it. Database uniqueness on `(owner_id, source_kind, source_record_key)` makes replay idempotent: offering the same Apple Health samples again inserts zero additional rows. Reusing a source key for conflicting measurement data is rejected.

Multiple distinct Apple Health measurements may share the same calendar date. They remain separate raw observations and are not averaged, overwritten, or collapsed during ingestion.

## Persistence and provenance

`body_weight_measurements` contains actual observations only. Every row is owner-scoped with RLS and records explicit provenance through `source_kind` and `source_record_key`.

CSV-derived rows retain `import_id` and `source_row` links to a `data_imports` row whose `import_kind` is `body_weight`. Existing historical CSV rows are backfilled as `csv_import` without changing their measured dates or weights.

Apple Health rows have no `data_imports` record. Their CSV-specific `import_id` and `source_row` fields are null, while `measured_at` is required.

Dataset deletion removes the authenticated owner's raw body-weight measurements and CSV body-weight import records. Workout and global reference data are outside its scope.

## Daily calculated series

Raw same-day observations are preserved, but analytics require one weight value per calendar day. `body_weight_daily_series` therefore chooses one deterministic daily representative without modifying the source rows:

1. prefer observations with an exact `measured_at` timestamp;
2. among timestamped observations, use the latest measurement on that date;
3. use deterministic persistence ordering only as a fallback for date-only observations.

This means multiple same-day Apple Health measurements are retained while the latest timestamped measurement supplies that day's analytics value. The system does not average same-day observations.

For a missing calendar day strictly between daily representatives `(d1, W1)` and `(d2, W2)`, the query returns `W(d) = W1 + (W2 - W1) × (days_from_d1 / days_between_d1_and_d2)`.

Measured days retain their selected representative value. Interpolated rows identify their previous and next measured dates. No calculated rows are written to the measurement table, and there is no extrapolation before the first or after the last measured day. One isolated measured day therefore returns only that day.

The daily-series function accepts optional start and end dates so callers may request a bounded range while preserving the same interpolation rules.

## User interface

Settings continues to provide CSV validation and preview, import/correction, measurement count, measured coverage, latest successful CSV import time, and explicit confirmed deletion. Apple Health synchronization is an external ingestion path; this issue does not add a direct HealthKit client to the Heracles frontend. My Data does not visualize body weight.

## Relative estimated 1RM

Relative e1RM is a default-off presentation preference. It is usable only while the owner has body-weight measurements. Adding measurements makes the control available but does not enable it; deleting the dataset resets it to off.

For workout date `d`, each existing absolute e1RM formula value is transformed independently. For the four-value RIR progression model, that means completed-rep Brzycki, completed-rep Epley, reps-plus-RIR Brzycki, and reps-plus-RIR Epley are each divided by `body_weight(d)`:

- `relative_e1RM_model = absolute_e1RM_model ÷ body_weight(d)`

The result is a dimensionless multiple labelled `× BW`. It may use either a measured daily representative or a transparently interpolated daily weight. It never uses nearest-neighbour filling or extrapolation, so a workout before the first or after the last measurement reports that relative e1RM is unavailable. Absolute e1RM remains the canonical generated database value; relative values are calculated only for display. For dumbbell exercises, both absolute and relative e1RM retain the one-dumbbell convention and use `× BW per dumbbell` where needed.
