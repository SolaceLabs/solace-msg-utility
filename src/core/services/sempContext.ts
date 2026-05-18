import type { AppContext } from '../types';
import type { SempContext } from '../connections/types';
import { isHosted } from '../hosted';

/**
 * Build a SempContext from the primary connection state in AppContext.
 *
 * Returns null when SEMP isn't connected so callers can short-circuit
 * without constructing an invalid context. The primary SempContext reuses
 * `ctx.sempFetch` (the kernel-provided helper that auto-injects the auth
 * header from `appState.sempCredentials`) and the validated baseUrl.
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

/**
 * Derive the SEMP v1 endpoint URL from a SempContext whose `baseUrl` is the
 * SEMP v2 root (e.g. `https://broker.example.com:943` or with a urlPath like
 * `https://broker:943/proxy`). In direct mode, strips path/query/fragment and
 * appends `/SEMP` — the standard v1 RPC endpoint at the broker root.
 *
 * In hosted mode, the baseUrl is gateway-prefixed
 * (`https://gateway:9443/https/943/broker.example.com[/userPath]`) and the
 * proxy prefix MUST be preserved or the v1 call won't route. The whole
 * pathname is kept (minus any trailing slash), then `/SEMP` is appended.
 *
 * Used by features that POST raw `<rpc>…</rpc>` bodies (queue-copy verify,
 * queue-subscription-explorer load) since v1 is the only SEMP transport that
 * exposes some legacy fields (`<subscriptions/>`, `quota`, etc.).
 */
export function deriveSempV1Url(baseUrl: string): string {
    const u = new URL(baseUrl);
    if (isHosted()) {
        const path = u.pathname.replace(/\/$/, '');
        return `${u.protocol}//${u.host}${path}/SEMP`;
    }
    return `${u.protocol}//${u.host}/SEMP`;
}
