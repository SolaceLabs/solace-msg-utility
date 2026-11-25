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

/**
 * Deadline for one SEMP or gateway request once a connection is up (the kernel's
 * `sempFetch`, a SEMP client's later calls, `managedRequest`). A broker or a
 * gateway that accepts the connection and never answers would otherwise leave
 * the caller's UI waiting until the page is closed. The connect probe keeps its
 * own shorter deadline (`SEMP_PROBE_TIMEOUT_MS`).
 */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Deadline for the `/hosted` probe at startup. Every module installs after it,
 * so it is shorter than a request's: a stalled answer must not keep the page
 * blank for long.
 */
export const HOSTED_PROBE_TIMEOUT_MS = 10_000;

/**
 * How long a Connect pressed while the shell loader is still downloading the
 * Solace SDK (`window.solaceLibState === 'loading'`) waits for its verdict.
 * After it the normal connect runs and refuses through `onError` if the SDK
 * is still absent.
 */
export const SDK_LOAD_WAIT_MS = 30_000;

/**
 * A signal that aborts after `ms`, or as soon as the caller's own signal does
 * (queue-copy's verify passes a Cancel signal). The timeout aborts with a
 * `TimeoutError` (`isTimeoutError`), the caller's signal with its own reason.
 * An engine without `AbortSignal.any` (Chrome before 116, Firefox before 124,
 * Safari before 17.4) gets the same signal from one controller that follows
 * whichever of the two aborts first.
 */
export function deadlineSignal(caller?: AbortSignal | null, ms: number = REQUEST_TIMEOUT_MS): AbortSignal {
    const timeout = AbortSignal.timeout(ms);
    if (!caller) return timeout;
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([caller, timeout]);
    const joined = new AbortController();
    for (const s of [caller, timeout]) {
        if (s.aborted) joined.abort(s.reason);
        else s.addEventListener('abort', () => joined.abort(s.reason), { once: true });
    }
    return joined.signal;
}

/**
 * `promise`, or a rejection with a `TimeoutError` once `ms` pass without it
 * settling. For calls whose request options are part of a fixed contract
 * (`managedRequest`, the `/hosted` probe): the deadline bounds the caller's
 * wait without adding a signal to the request. The request itself is left to
 * the browser.
 */
export function raceDeadline<T>(promise: Promise<T>, ms: number = REQUEST_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DOMException(`No answer within ${ms / 1000} s.`, 'TimeoutError')), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** True for what `fetch` rejects with when a `deadlineSignal` timed out, and for a `raceDeadline` timeout. */
export function isTimeoutError(e: unknown): boolean {
    return Object(e).name === 'TimeoutError';
}
