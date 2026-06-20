/**
 * Queue Browser build-flavor flags.
 *
 * Module-local: only the queue-browser module reads these, and "payload" is a
 * queue-browser concept. (The general capability/visibility seam lives in the
 * RBAC plan's `CapabilityProvider`, not here.)
 */

/**
 * Whether this build shows the message payload body and offers actions on it.
 *
 * Default `true` = current behavior. The no-payload build sets
 * `VITE_SHOW_PAYLOAD='false'` (plumbed via `scripts/vite-build.mjs` →
 * `vite.config.ts` `define`). When `false`, the body is never decoded into
 * state, payload DOM is removed at install, and payload actions are not wired.
 *
 * Read inside the function (not a module-level const) so vitest's
 * `vi.stubEnv('VITE_SHOW_PAYLOAD', ...)` takes effect per-test.
 */
export function showPayload(): boolean {
    return import.meta.env.VITE_SHOW_PAYLOAD !== 'false';
}
