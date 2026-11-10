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
import { coerceConnConfig, DEFAULT_CONN_CONFIG, type ConnDeploymentConfig } from './connections/conn-modes';

let hostedMode = false;

export function isHosted(): boolean {
    return hostedMode;
}

export function setHosted(v: boolean): void {
    hostedMode = v;
}

/** Result of probing the gateway `/hosted` endpoint. */
export interface DeploymentInfo {
    hosted: boolean;
    /** Which connection tabs to offer + default. Direct-only when not hosted. */
    conn: ConnDeploymentConfig;
}

/**
 * Probe the gateway's `/hosted` endpoint for hosted-mode + connection-tab config.
 *
 * The current gateway returns JSON `{ hosted:true, connModes, defaultConn }`; a
 * legacy gateway may return plaintext `'true'`/`'false'`. Any non-200,
 * non-hosted, malformed, or network-error outcome resolves to
 * `{ hosted:false, conn: DEFAULT_CONN_CONFIG }` (Direct only) — so a
 * static/non-hosted deployment never surfaces Managed. A legacy plaintext
 * `'true'` is treated as hosted with the Direct-only default (Managed requires
 * the JSON contract).
 */
export async function probeDeployment(): Promise<DeploymentInfo> {
    const notHosted: DeploymentInfo = { hosted: false, conn: DEFAULT_CONN_CONFIG };
    try {
        const res = await fetch('/hosted', { method: 'GET', cache: 'no-store' });
        if (!res.ok) return notHosted;
        const text = (await res.text()).trim();
        const lower = text.toLowerCase();
        if (lower === 'true') return { hosted: true, conn: DEFAULT_CONN_CONFIG }; // legacy plaintext
        if (lower === 'false' || lower === '') return notHosted;
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch {
            return notHosted; // not the legacy contract and not JSON
        }
        const hosted = !!(json && typeof json === 'object' && (json as Record<string, unknown>).hosted === true);
        if (!hosted) return notHosted;
        return { hosted: true, conn: coerceConnConfig(json) };
    } catch {
        return notHosted;
    }
}

/**
 * Back-compat boolean probe (hosted-mode only). Callers that also need the
 * connection-tab config should use `probeDeployment`. Any non-hosted outcome
 * resolves `false` so callers can blindly `setHosted(await probeHosted())`.
 */
export async function probeHosted(): Promise<boolean> {
    return (await probeDeployment()).hosted;
}

/** The plain broker schemes, each with the TLS scheme that replaces it. */
const TLS_FORM: ReadonlyMap<string, string> = new Map([['ws', 'wss'], ['http', 'https']]);

/**
 * Whether this page can open plain `ws://` and `http://` broker connections.
 * Hosted: always, since the browser's hop is to the gateway on the page's own
 * scheme and the gateway makes the plain one to the broker. Otherwise only on
 * a page that is not https: a browser blocks an https page's `ws://` and
 * `http://` requests as mixed content.
 */
export function plainSchemesUsable(): boolean {
    return hostedMode || window.location.protocol !== 'https:';
}

/** `scheme`, or its TLS form when this page cannot use the plain one. */
export function usableScheme(scheme: string): string {
    return plainSchemesUsable() ? scheme : (TLS_FORM.get(scheme) ?? scheme);
}

/**
 * Hides the plain options (`ws`, `http`) of an editable protocol select when
 * this page cannot use them, and moves a selected one to its TLS form. Call it
 * after the `/hosted` probe: neither input changes while the page is open. The
 * options are disabled as well, so a browser that still lists a hidden option
 * cannot pick it. Options are never re-enabled: the select's own disabled
 * placeholders stay as the template has them.
 */
export function limitSchemeOptions(select: HTMLSelectElement): void {
    if (plainSchemesUsable()) return;
    for (const opt of Array.from(select.options)) {
        if (TLS_FORM.has(opt.value)) {
            opt.hidden = true;
            opt.disabled = true;
        }
    }
    select.value = usableScheme(select.value);
}

/**
 * The WebSocket URL of a gateway path on the page's own host: `wss://` on an
 * https page, `ws://` otherwise. Managed SMF sockets use it
 * (`SolaceConfig.smfPath`), so the gateway's Origin check sees its own origin.
 */
export function gatewayWsUrl(path: string): string {
    const loc = window.location;
    return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${path}`;
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
