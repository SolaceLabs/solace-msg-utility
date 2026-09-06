/**
 * Error payloads, shaped like the ones the real SDK delivers.
 *
 * The SDK is not consistent, and the emulator must reproduce that rather than
 * smooth it over — an earlier version populated `message` AND `infoStr` on
 * every event, which made the demo *hide* a real defect: queue-copy read
 * `infoStr` off a QueueBrowser event, which a real broker never sets, so it
 * silently reported generic text while the queue browser showed the true
 * reason. The mock looked fine; production did not.
 *
 * Verified against the vendored SDK (`dist/solclient.js`):
 *
 * - **QueueBrowser / MessageConsumer** `CONNECT_FAILED_ERROR` and `DOWN_ERROR`
 *   emit an `OperationError` — the consumer FSM asserts `instanceof
 *   OperationError` before emitting, and `QueueBrowser` forwards it verbatim.
 *   `class OperationError extends SolaceError { constructor(message, subcode,
 *   reason) }` — so `.message`, `.subcode`, `.reason`, and **no `infoStr`**.
 * - **Session** events carry a `SessionEvent`, whose reason is on `.infoStr`
 *   (alongside `responseCode` / `errorSubcode` / `reason`).
 *
 * If a consumer reads the wrong field, the demo should show the same degraded
 * message production would. That is the point of the emulator.
 *
 * Mock-only.
 */

/** Subcodes mirroring the SDK's `ErrorSubcode` values the app may encounter. */
export const MOCK_SUBCODE = {
    UNKNOWN: 0,
    PERMISSION_DENIED: 20,
    UNKNOWN_QUEUE: 21,
} as const;

/**
 * A QueueBrowser / MessageConsumer failure: a genuine `Error` subclass, exactly
 * like the SDK's `OperationError`. Deliberately carries **no `infoStr`**.
 */
export function browserError(text: string, subcode: number = MOCK_SUBCODE.UNKNOWN): Error {
    return Object.assign(new Error(text), { subcode, reason: text });
}

/**
 * A Session failure: a `SessionEvent`-shaped object whose reason is on
 * `infoStr`. Deliberately carries **no `message`**.
 */
export function sessionError(text: string, subcode: number = MOCK_SUBCODE.UNKNOWN): Record<string, unknown> {
    return { infoStr: text, responseCode: 0, errorSubcode: subcode, reason: text };
}
