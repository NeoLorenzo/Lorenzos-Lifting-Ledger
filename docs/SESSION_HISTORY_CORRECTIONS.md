# Completed Session Corrections

Completed workout history remains canonical training data, but owners can now deliberately reopen a completed workout for structural correction or delete it from Session History.

## Reopen lifecycle

`reopen_completed_workout_session(session_id)` changes the existing completed row to `in_progress` and marks it with `is_historical_correction = true`. It does not create a replacement workout and does not change `performed_on`. The database continues to enforce at most one in-progress workout per owner, so reopening is rejected while another workout is active.

A reopened workout uses the ordinary live-workout editor and its existing structural mutations. This keeps exercise/set editing in one domain model rather than maintaining a second full historical editor. The UI identifies the session as a historical correction and does not expose the ordinary destructive Cancel action.

`cancel_workout_session` also rejects historical correction sessions at the database boundary. Finishing the correction uses `conclude_workout_session`, which returns the same row to `completed` and clears `is_historical_correction`.

## Deletion lifecycle

`delete_completed_workout_session(session_id)` only accepts an owner-scoped completed workout. Deleting the parent `workout_sessions` row relies on the existing foreign-key cascade to remove its `session_exercises` and `exercise_sets`; unrelated sessions are untouched.

Session History requires an explicit confirmation identifying the workout before invoking deletion.

## Derived views

Dashboard analytics and previous-performance queries consume completed canonical history. While a workout is reopened it is intentionally excluded from completed-history calculations; finishing the correction makes the corrected canonical data visible again. Deleting a workout invalidates the affected dashboard and previous-performance context.
