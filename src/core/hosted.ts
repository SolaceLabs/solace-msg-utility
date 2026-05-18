/**
 * Hosted-mode singleton.
 *
 * When the PWA is deployed behind the Go gateway in `go-web-proxy/`, the
 * gateway exposes `/hosted` returning `true`. The connections module probes
 * this endpoint at startup and flips the singleton on; URL builders below
 * then route every broker-bound URL through the gateway proxy path scheme:
 *
 *     {pageOrigin}/{scheme}/{port}/{host}{urlPath}
 *
 * scheme ∈ { http, https, ws, wss } and the page-origin scheme is upgraded
 * to wss/ws for WebSocket connections (when the page is https/http).
 *
 * Direct mode (`hostedMode === false`, the default) preserves the original
 * `${scheme}://${host}:${port}${urlPath}` shape — same as a standalone
 * deployment without a gateway.
 *
 * Module-scoped state mirrors the precedent in `./logger.ts` (`let
 * currentLevel` + setter/getter pair).
 */
import { normalizeUrlPath } from './utils';

let hostedMode = false;

export function isHosted(): boolean {
    return hostedMode;
}

export function setHosted(v: boolean): void {
    hostedMode = v;
}

/**
 * Probe the gateway's `/hosted` endpoint. Resolves to `true` only when the
 * response is HTTP 200 and the body (trimmed, lowercased) is `'true'`. Any
 * other outcome — non-200, mismatched body, network error, throw — resolves
 * to `false` so callers can blindly `setHosted(await probeHosted())`.
 */
export async function probeHosted(): Promise<boolean> {
    try {
        const res = await fetch('/hosted', { method: 'GET', cache: 'no-store' });
        if (!res.ok) return false;
        const body = (await res.text()).trim().toLowerCase();
        return body === 'true';
    } catch {
        return false;
    }
}

/**
 * Build a broker URL appropriate for the current mode.
 *
 * Direct: `${scheme}://${host}:${port}${normalizedUrlPath}`.
 * Hosted: `${wireScheme}://${pageHost}/${scheme}/${port}/${host}${normalizedUrlPath}`,
 * where `wireScheme` is `wss`/`ws` for WebSocket connections (matching the
 * page's https/http) or `https`/`http` for plain HTTP requests.
 */
export function buildBrokerUrl(
    scheme: string,
    host: string,
    port: string | number,
    urlPath: string,
    isWebSocket = false,
): string {
    const normalized = normalizeUrlPath(urlPath);
    if (!hostedMode) {
        return `${scheme}://${host}:${port}${normalized}`;
    }
    const loc = window.location;
    const secure = loc.protocol === 'https:';
    const wireScheme = isWebSocket
        ? (secure ? 'wss' : 'ws')
        : (secure ? 'https' : 'http');
    return `${wireScheme}://${loc.host}/${scheme}/${port}/${host}${normalized}`;
}
