import { logger } from '../logger';
import { buildBrokerUrl } from '../hosted';
import { normalizeUrlPath } from '../utils';
import { managedErrorMessage } from './managed-api';
import type { SempConfig, SempContext } from '../connections/types';

/**
 * Lifecycle hooks the caller wires to whatever state/UI/event-bus it owns.
 *
 * The factory itself is pure — it knows nothing about AppContext, AppState,
 * the global event bus, or UI elements. Primary callers (connections module)
 * route these into global state + bus emits; secondary callers (future
 * queue-copy destination) route them into module-scoped state.
 */
export interface SempConnectionHooks {
    /**
     * Fires after credentials are validated against the SEMP endpoint.
     * `sempCtx` is bound to the just-validated creds — caller can store and reuse it.
     * `creds` are returned so the caller can route to AppState.sempCredentials if desired;
     * both are '' in relay mode, where the browser holds no SEMP credential.
     */
    onConnected: (sempCtx: SempContext, creds: { user: string; pass: string }) => void;
    /** Fires on explicit disconnect(). */
    onDisconnected: () => void;
    /**
     * Fires on HTTP 401 from the validation probe: the broker refused the
     * credential, or in relay mode the gateway session has ended.
     */
    onAuthFailed?: () => void;
    /**
     * Fires on any other failure (HTTP non-401, network, timeout, exception).
     * `baseUrl` is the URL the connect attempt was targeting, included so the
     * caller can construct a "trust this URL" help link without re-deriving it.
     */
    onError?: (info: {
        message: string;
        isNetworkError: boolean;
        isTimeout: boolean;
        baseUrl: string;
    }) => void;
}

export interface SempClient {
    /** Probe the SEMP endpoint with the given creds; fires hooks asynchronously. */
    connect(cfg: SempConfig, host: string, pass: string): Promise<void>;
    /** Notify the caller of disconnect via hook. */
    disconnect(): Promise<void>;
}

/**
 * Pure SEMP client factory.
 *
 * On `connect()`:
 *   - Validates creds via `GET /SEMP/v2/monitor/msgVpns?count=1`
 *   - On success, constructs a `SempContext` whose `fetch` injects the
 *     just-validated auth header, and passes it to `hooks.onConnected`.
 *   - 401 routes to `onAuthFailed`. Anything else routes to `onError`.
 *
 * Relay mode (`cfg.relayBase`, managed sessions): every request goes to the
 * gateway's SEMP relay with no Authorization header and the session cookie;
 * the gateway adds the broker's stored account. `host` and `pass` are unused,
 * and a failure carries the gateway's error code as text.
 */
/**
 * The text for a refused relay request: the gateway's code (`read_only`,
 * `upstream_auth`, `upstream_unavailable`, ...) as a sentence, or the bare
 * status when the body is not the gateway's JSON.
 */
async function relayErrorText(res: Response): Promise<string> {
    let code: unknown;
    try {
        code = (await res.json()).error;
    } catch {
        // Not the gateway's JSON (e.g. a reverse proxy's error page).
    }
    return typeof code === 'string'
        ? managedErrorMessage({ ok: false, status: res.status, code })
        : `${res.status} ${res.statusText}`;
}

export function createServiceSemp(hooks: SempConnectionHooks): SempClient {
    async function connect(cfg: SempConfig, host: string, pass: string): Promise<void> {
        const relay = cfg.relayBase;
        const baseUrl = relay ?? buildBrokerUrl(cfg.protocol, host, cfg.port, cfg.urlPath, false);
        const validationUrl = `${baseUrl}/SEMP/v2/monitor/msgVpns?count=1`;
        const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${pass}`)));
        // One request shape for the probe and every later call: the session
        // cookie for the relay, the Basic header for a broker.
        const send = (url: string, opts: RequestInit = {}) => fetch(url, relay
            ? { ...opts, credentials: 'same-origin' }
            : { ...opts, headers: { ...(opts.headers || {}), Authorization: authHeader } });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            // MOCK
            if (host.includes('untrust.com')) {
                throw new Error('Certificate Not Trusted (Mock)');
            }

            const res = await send(validationUrl, { method: 'GET', signal: controller.signal });

            if (res.ok) {
                logger.info('SEMP Connection Established');

                // Build a SempContext bound to these creds. The caller stores
                // and reuses this for all subsequent SEMP requests against
                // this broker (primary uses it via ctx.sempFetch bridging;
                // secondary uses it directly).
                //
                // Path-only API: callers pass the SEMP endpoint + query (e.g.
                // '/SEMP/v2/monitor/msgVpns?count=100'). The closure captures
                // the connection-form values here and rebuilds the full URL via
                // buildBrokerUrl() on every call, so hosted-mode gateway routing
                // is applied uniformly and broker-emitted URLs (nextPageUri,
                // etc.) are never used as request targets — callers extract
                // pathname+search from them before calling fetch().
                const sempFetch = (path: string, opts: RequestInit = {}) => send(
                    relay ? relay + path : buildBrokerUrl(cfg.protocol, host, cfg.port, normalizeUrlPath(cfg.urlPath) + path, false),
                    opts,
                );

                hooks.onConnected({ fetch: sempFetch, baseUrl }, relay ? { user: '', pass: '' } : { user: cfg.user, pass });

            } else if (res.status === 401) {
                logger.error('SEMP Auth Failed');
                hooks.onAuthFailed?.();
            } else {
                logger.error(`SEMP Error: ${res.status}`);
                hooks.onError?.({
                    message: relay ? await relayErrorText(res) : `${res.status} ${res.statusText}`,
                    isNetworkError: false,
                    isTimeout: false,
                    baseUrl,
                });
            }

        } catch (err: any) {
            logger.error('SEMP Network Error', err);

            const isTimeout = err.name === 'AbortError';
            const isNetworkError = !!(
                err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))
            );
            const message = isTimeout
                ? 'Connection timed out (15s). Check host and port.'
                : err.message;

            hooks.onError?.({ message, isNetworkError, isTimeout, baseUrl });

        } finally {
            clearTimeout(timeout);
        }
    }

    async function disconnect(): Promise<void> {
        logger.info('Disconnecting SEMP...');
        hooks.onDisconnected();
    }

    return { connect, disconnect };
}
