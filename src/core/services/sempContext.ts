import type { AppContext } from '../types';
import type { SempContext } from '../connections/types';

/**
 * Build a SempContext from the primary connection state in AppContext.
 *
 * Returns null when SEMP isn't connected so callers can short-circuit
 * without constructing an invalid context. The primary SempContext reuses
 * `ctx.sempFetch` (the kernel-provided helper that auto-injects the auth
 * header and assembles the full URL from connection-form values stored in
 * `appState.sempCredentials`) and the validated baseUrl as a diagnostic
 * display string.
 *
 * Modules driving discovery against the primary broker call this and
 * pass the result to `createSempDiscovery`. Secondary connections
 * (queue-copy's destination) build their own SempContext from their
 * own creds — this helper is primary-only.
 */
export function primarySempContextFrom(ctx: AppContext): SempContext | null {
    if (!ctx.appState.isSempConnected || !ctx.appState.sempCredentials) return null;
    return {
        fetch: ctx.sempFetch,
        baseUrl: ctx.appState.sempCredentials.baseUrl,
    };
}
