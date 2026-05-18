/**
 * Tunable constants for the queue-copy module.
 *
 * Single source of truth so production and mock builds stay aligned (an
 * earlier 30s/60s drift on `IDLE_TIMEOUT_MS` between `service-copy.ts` and
 * `service-copy-mock.ts` was the motivating bug for this file).
 *
 * Consumers should import from here (or from the re-export barrel lines in
 * `service-copy.ts` / `service-verify.ts` for backward compatibility with
 * existing test imports). Full semantic docstrings stay in the consuming
 * files where they're most relevant; this file is the value registry.
 */

/**
 * Idle threshold for the copy engine. Reset on every MESSAGE event; when it
 * fires without a fresh MESSAGE, the engine treats the queue as drained and
 * enters the stop sequence with `stopReason='idle'`.
 */
export const IDLE_TIMEOUT_MS = 30_000;

/**
 * Backpressure: pause the source QueueBrowser when in-flight publishes reach
 * this count. Solace's per-session publish window defaults to ~50 unACK'd
 * messages; HIGH is set well below that so SDK transport bursts that briefly
 * exceed HIGH before `browser.stop()` takes effect don't push past the broker
 * limit.
 */
export const PUBLISH_CONCURRENCY_HIGH = 20;

/**
 * Backpressure: resume the source QueueBrowser once in-flight drops to this
 * count. Hysteresis between HIGH and LOW prevents pause→resume→pause flapping
 * within a single MESSAGE delivery batch.
 */
export const PUBLISH_CONCURRENCY_LOW = 10;

/**
 * QueueBrowser-fallback verify: deadline for the temporary browser to bind.
 * Fires when the broker doesn't respond with either UP or fail within the
 * window.
 */
export const BIND_PROBE_TIMEOUT_MS = 10_000;

/**
 * QueueBrowser-fallback verify: idle window after the last MESSAGE event
 * before declaring the source queue drained and settling the result.
 */
export const ACCUMULATE_IDLE_MS = 2_000;
