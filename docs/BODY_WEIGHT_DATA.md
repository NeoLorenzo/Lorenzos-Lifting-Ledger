# Body Weight Data

## Purpose and scope

The body-weight subsystem stores imported scale observations and provides a transparent daily series for My Data. Units are kilograms throughout. It does not calculate BMI, body fat, energy needs, trend weight, or relative estimated 1RM.

## CSV contract

The importer reads file contents regardless of filename or export source. Column A is a date with exact `DD/MM/YYYY` semantics, column B is a finite numeric kilogram value greater than zero, and columns C onward are ignored. One optional header and blank rows are accepted. Quoted fields, escaped quotes, UTF-8 BOM, LF, and CRLF follow ordinary CSV mechanics.

The full file is validated before persistence. Impossible dates, malformed nonblank rows, invalid weights, and duplicate calendar dates are reported with their source row and prevent all writes. The preview reports observation count, first and last measured dates, and how many dates inside that coverage will be interpolated.

## Persistence and provenance

`body_weight_measurements` contains actual imported observations only. Rows are owner-scoped with RLS, linked to a `data_imports` row whose `import_kind` is `body_weight`, and constrained to one canonical measurement per owner and date. A later valid import updates an overlapping date. An exact source reimport reuses its provenance identity and cannot duplicate the canonical measurement.

Import runs through one database function and is atomic. Dataset deletion removes only the authenticated owner's body-weight measurements and body-weight import records; workout and global reference data are outside its scope.

## Daily calculated series

For a missing calendar day strictly between observations `(d1, W1)` and `(d2, W2)`, the query returns `W(d) = W1 + (W2 - W1) × (days_from_d1 / days_between_d1_and_d2)`.

Measured days retain their imported values. Interpolated rows identify their previous and next measurements. No calculated rows are written to the measurement table, and there is no extrapolation before the first or after the last observation. One isolated measurement therefore returns only that day.

## User interface

Settings provides CSV validation and preview, import/correction, measurement count, measured coverage, and explicit confirmed deletion. My Data follows its selected date range and displays imported measurements as visible markers with a line through daily interpolated values. Accessible detail identifies every value as `Measured` or `Interpolated`; interpolated detail includes its surrounding measured observations.
