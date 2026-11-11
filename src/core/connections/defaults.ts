/**
 * Shared connection constants: the one home for the limits and defaults that
 * the connection forms, the SEMP client, the managed profile and the queue
 * browser all use. Change a value here, never at a call site.
 *
 * `src/modules/connections/index.html` repeats `MAX_MESSAGES_PER_QUEUE` as the
 * Max Messages input's `max` attribute (HTML cannot import it);
 * tests/modules/connections/module.test.ts holds the two equal.
 */

/** Upper bound of the per-queue message cap (the Max Messages field). */
export const MAX_MESSAGES_PER_QUEUE = 10000;

/** The per-queue message cap a connection starts with. */
export const DEFAULT_MAX_MESSAGES_PER_QUEUE = 100;

/** Deadline for the SEMP connect probe (`GET /SEMP/v2/monitor/msgVpns?count=1`). */
export const SEMP_PROBE_TIMEOUT_MS = 15000;

/**
 * SDK connect and reconnect settings for a provisioned (managed) session: the
 * user has no Advanced Settings form there, so these are fixed.
 */
export const PROVISIONED_SDK_CONNECT = {
    connectRetries: 1,
    connectTimeout: 3000,
    reconnectRetries: 1,
    reconnectWait: 3000,
} as const;
