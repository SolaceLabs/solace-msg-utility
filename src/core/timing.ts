/**
 * Default debounce for user-input events that drive downstream work
 * (validation, list filtering, etc.). 500ms balances perceived
 * responsiveness against running work on every keystroke.
 *
 * Calibrated for queue-discovery's searchable dropdown filter where
 * per-keystroke filtering on hundreds of queues caused visible lag.
 * Reused as the shared default so input-driven feedback feels consistent
 * across the app.
 *
 * Callers may override per-call (e.g. queue-discovery's setupSearchableSelect
 * accepts a debounceMs arg used by tests with `0` for synchronous mode).
 */
export const INPUT_DEBOUNCE_MS = 500;
