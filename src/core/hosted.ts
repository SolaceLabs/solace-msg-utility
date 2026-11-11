/**
 * Hosted-mode URL routing.
 *
 * When the PWA is deployed behind the Go gateway in `go-web-proxy/`, the
 * gateway exposes `/hosted` returning `{ hosted: true, ... }`. The connections
 * module probes it once at install and publishes the verdict as
 * `AppState.connConfig.hosted` -- the single home of that fact. Every reader
 * passes it in explicitly (`isHostedDeployment(appState)`, or a connection
 * config's `hosted` field for the pure service factories), so this file holds
 * no state. In hosted mode every broker-bound URL is routed through the gateway
 * proxy path scheme:
 *
 *     {pageOrigin}/{scheme}/{port}/{host}{urlPath}
 *
 * scheme in { http, https, ws, wss } and the page-origin scheme is upgraded
 * to wss/ws for WebSocket connections (when the page is https/http).
 *
 * Direct mode (not hosted, the default) preserves the original
 * `${scheme}://${host}:${port}${urlPath}` shape -- same as a standalone
 * deployment without a gateway.
 */
import { normalizeUrlPath } from './utils';
import { logger } from './logger';
import { HOSTED_PROBE_TIMEOUT_MS, raceDeadline } from './timing';
import { coerceConnConfig, DEFAULT_CONN_CONFIG, type ConnDeploymentConfig, type DeploymentConfig } from './connections/conn-modes';

const log = logger.withTag('hosted');

/** The published `/hosted` verdict: false until the probe has answered, and outside a gateway. */
export function isHostedDeployment(state: { connConfig?: DeploymentConfig }): boolean {
    return state.connConfig?.hosted === true;
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
 * non-hosted, malformed, timed-out (`HOSTED_PROBE_TIMEOUT_MS`) or network-error
 * outcome resolves to `{ hosted:false, conn: DEFAULT_CONN_CONFIG }` (Direct
 * only) -- so a static/non-hosted deployment never surfaces Managed, and a
 * stalled answer cannot keep the app from rendering. A legacy plaintext
 * `'true'` is treated as hosted with the Direct-only default (Managed requires
 * the JSON contract). Each fallback logs why: info for the ordinary no-gateway
 * answers, warn for an answer that looks broken.
 */
export async function probeDeployment(): Promise<DeploymentInfo> {
    const notHosted: DeploymentInfo = { hosted: false, conn: DEFAULT_CONN_CONFIG };
    try {
        const res = await raceDeadline(fetch('/hosted', { method: 'GET', cache: 'no-store' }), HOSTED_PROBE_TIMEOUT_MS);
        if (!res.ok) {
            log.info(`/hosted answered HTTP ${res.status}: no gateway, Direct only`);
            return notHosted;
        }
        const text = (await res.text()).trim();
        const lower = text.toLowerCase();
        if (lower === 'true') return { hosted: true, conn: DEFAULT_CONN_CONFIG }; // legacy plaintext
        if (lower === 'false' || lower === '') {
            log.info(`/hosted answered "${text}": not hosted, Direct only`);
            return notHosted;
        }
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch {
            log.warn(`/hosted answered neither JSON nor true/false; treating the page as not hosted (Direct only). Body starts: ${text.slice(0, 80)}`);
            return notHosted; // not the legacy contract and not JSON
        }
        const hosted = !!(json && typeof json === 'object' && (json as Record<string, unknown>).hosted === true);
        if (!hosted) {
            log.info('/hosted answered hosted:false: Direct only');
            return notHosted;
        }
        return { hosted: true, conn: coerceConnConfig(json) };
    } catch (e) {
        log.warn('/hosted probe failed (network error or no answer in time); treating the page as not hosted (Direct only):', e);
        return notHosted;
    }
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
export function plainSchemesUsable(hosted: boolean): boolean {
    return hosted || window.location.protocol !== 'https:';
}

/** `scheme`, or its TLS form when this page cannot use the plain one. */
export function usableScheme(scheme: string, hosted: boolean): string {
    return plainSchemesUsable(hosted) ? scheme : (TLS_FORM.get(scheme) ?? scheme);
}

/**
 * Hides the plain options (`ws`, `http`) of an editable protocol select when
 * this page cannot use them, and moves a selected one to its TLS form. Call it
 * after the `/hosted` probe, with its verdict (`isHostedDeployment`): neither
 * input changes while the page is open. The
 * options are disabled as well, so a browser that still lists a hidden option
 * cannot pick it. Options are never re-enabled: the select's own disabled
 * placeholders stay as the template has them.
 */
export function limitSchemeOptions(select: HTMLSelectElement, hosted = false): void {
    if (plainSchemesUsable(hosted)) return;
    for (const opt of Array.from(select.options)) {
        if (TLS_FORM.has(opt.value)) {
            opt.hidden = true;
            opt.disabled = true;
        }
    }
    select.value = usableScheme(select.value, hosted);
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
 * Build a broker URL appropriate for the deployment (`hosted`, from
 * `AppState.connConfig`).
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
    isWebSocket: boolean,
    hosted: boolean,
): string {
    const normalized = normalizeUrlPath(urlPath);
    if (!hosted) {
        return `${scheme}://${host}:${port}${normalized}`;
    }
    const loc = window.location;
    const secure = loc.protocol === 'https:';
    const wireScheme = isWebSocket
        ? (secure ? 'wss' : 'ws')
        : (secure ? 'https' : 'http');
    return `${wireScheme}://${loc.host}/${scheme}/${port}/${host}${normalized}`;
}
