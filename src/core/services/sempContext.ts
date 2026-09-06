import type { AppContext } from '../types';
import type { SempContext } from '../connections/types';
import { filterSempFetch } from '../managed-semp-filter';

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
 * In a managed (RBAC) session (`appState.managed` set), the fetch is wrapped by
 * `filterSempFetch` so SEMP queue-list responses are RBAC-filtered and VPN-list
 * responses are bounded to the provisioned set — a fetch-layer guardrail. The
 * queue-picker's primary VPN scoping now comes from `queueSourceFrom` (the
 * provisioned set, no SEMP call); this wrapper is the defense-in-depth backstop
 * plus the live queue filter. Non-managed variants get the plain `ctx.sempFetch`.
 *
 * Modules driving discovery against the primary broker call this and
 * pass the result to `createSempDiscovery`. Secondary connections
 * (queue-copy's destination) build their own SempContext from their
 * own creds — this helper is primary-only.
 *
 * ---
 * WHY "unfiltered": the wrapper rewrites ONLY the two SEMP **v2 monitor list**
 * response shapes. Every other call — most importantly the **v1 RPC**
 * (`POST /SEMP`) — passes through untouched, so a consumer of this context can
 * reach broker data that no entitlement filter covers. Treat the returned
 * context as unfiltered unless you know your call is one of those two shapes.
 *
 * Sanctioned consumers (a new one needs design sign-off):
 *   - `queue-source.ts`                      — wraps it in an entitlement-typed source
 *   - `queue-copy` verify (`ui-modal.ts`)    — v1 RPC, run only on a source the
 *                                              modal's source gate has already validated
 *   - `queue-subscription-explorer`          — v1 RPC; gated out of managed sessions
 *                                              by `MODULE_REQUIREMENTS` in `core/rbac.ts`
 *   - `queue-discovery`                      — vestigial; gated the same way
 *
 * Fully typing this seam with `Access` is the later capability-layer change.
 */
export function unfilteredPrimarySempContext(ctx: AppContext): SempContext | null {
    if (!ctx.appState.isSempConnected || !ctx.appState.sempCredentials) return null;
    const managed = ctx.appState.managed;
    return {
        fetch: managed ? filterSempFetch(ctx.sempFetch, managed) : ctx.sempFetch,
        baseUrl: ctx.appState.sempCredentials.baseUrl,
    };
}
