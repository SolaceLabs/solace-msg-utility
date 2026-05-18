import { logger } from '../logger';
import { buildBrokerUrl } from '../hosted';
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
     * `creds` are returned so the caller can route to AppState.sempCredentials if desired.
     */
    onConnected: (sempCtx: SempContext, creds: { user: string; pass: string }) => void;
    /** Fires on explicit disconnect(). */
    onDisconnected: () => void;
    /** Fires on HTTP 401 from the validation probe. */
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
 */
export function createServiceSemp(hooks: SempConnectionHooks): SempClient {
    async function connect(cfg: SempConfig, host: string, pass: string): Promise<void> {
        const baseUrl = buildBrokerUrl(cfg.protocol, host, cfg.port, cfg.urlPath, false);
        const validationUrl = `${baseUrl}/SEMP/v2/monitor/msgVpns?count=1`;
        const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${pass}`)));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            // MOCK
            if (host.includes('untrust.com')) {
                throw new Error('Certificate Not Trusted (Mock)');
            }

            const res = await fetch(validationUrl, {
                method: 'GET',
                headers: { 'Authorization': authHeader },
                signal: controller.signal
            });

            if (res.ok) {
                logger.info('SEMP Connection Established');

                // Build a SempContext bound to these creds. The caller stores
                // and reuses this for all subsequent SEMP requests against
                // this broker (primary uses it via ctx.sempFetch bridging;
                // secondary uses it directly).
                const sempFetch = (url: string, opts: RequestInit = {}) => fetch(url, {
                    ...opts,
                    headers: { ...(opts.headers || {}), Authorization: authHeader }
                });

                hooks.onConnected({ fetch: sempFetch, baseUrl }, { user: cfg.user, pass });

            } else if (res.status === 401) {
                logger.error('SEMP Auth Failed');
                hooks.onAuthFailed?.();
            } else {
                logger.error(`SEMP Error: ${res.status}`);
                hooks.onError?.({
                    message: `${res.status} ${res.statusText}`,
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
