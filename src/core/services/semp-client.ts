import { logger } from '../logger';
import { buildBrokerUrl } from '../hosted';
import { basicAuthHeader, errMessage, normalizeUrlPath } from '../utils';
import { deadlineSignal } from '../timing';
import { SEMP_PROBE_TIMEOUT_MS } from '../connections/defaults';
import { relayErrorText, statusLine, sempErrorText as errorText, sempFailureText as failureText } from './semp-errors';
import type { SempConfig, SempContext } from '../connections/types';

// The error texts for SEMP answers live in ./semp-errors.ts (callers that do
// not need the client import them from there); exported here too, as part of
// the SEMP client's API.
export const sempErrorText = errorText;
export const sempFailureText = failureText;

const log = logger.withTag('semp-client');

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
     * credential, or in relay mode the gateway session has ended. In relay
     * mode it also fires on a 401 from any later request through the returned
     * `SempContext`, since the session can end at any time.
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
export function createServiceSemp(hooks: SempConnectionHooks): SempClient {
    // The last connected target, for the disconnect log line.
    let connectedTo = '(none)';

    async function connect(cfg: SempConfig, host: string, pass: string): Promise<void> {
        const relay = cfg.relayBase;
        const hosted = cfg.hosted === true;
        const baseUrl = relay ?? buildBrokerUrl(cfg.protocol, host, cfg.port, cfg.urlPath, false, hosted);
        const validationUrl = `${baseUrl}/SEMP/v2/monitor/msgVpns?count=1`;
        // Where log lines say this connection goes: the relay names the broker
        // already; a direct one adds the account.
        const target = relay ? baseUrl : `${baseUrl} as "${cfg.user}"`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SEMP_PROBE_TIMEOUT_MS);

        try {
            // Built inside the try: btoa throws on a character above U+00FF,
            // which reaches onError like any other failure. The connection
            // forms reject non-ASCII credentials before this (sempAccountError).
            const authHeader = relay ? '' : basicAuthHeader(cfg.user, pass);
            // One request shape for the probe and every later call: the session
            // cookie for the relay, the Basic header for a broker.
            const send = (url: string, opts: RequestInit = {}) => fetch(url, relay
                ? { ...opts, credentials: 'same-origin' }
                : { ...opts, headers: { ...(opts.headers || {}), Authorization: authHeader } });

            const res = await send(validationUrl, { method: 'GET', signal: controller.signal });

            if (res.ok) {
                log.info(`SEMP connected: ${target}`);
                connectedTo = target;

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
                // pathname+search from them before calling fetch(). Every call
                // has a deadline (REQUEST_TIMEOUT_MS), joined to the caller's
                // own signal when it passes one.
                const sempFetch = async (path: string, opts: RequestInit = {}) => {
                    const later = await send(
                        relay ? relay + path : buildBrokerUrl(cfg.protocol, host, cfg.port, normalizeUrlPath(cfg.urlPath) + path, false, hosted),
                        { ...opts, signal: deadlineSignal(opts.signal) },
                    );
                    // Through the relay a 401 always means the gateway session
                    // ended; a broker's own 401 reaches the caller as an answer.
                    if (relay && later.status === 401) hooks.onAuthFailed?.();
                    return later;
                };

                hooks.onConnected({ fetch: sempFetch, baseUrl }, relay ? { user: '', pass: '' } : { user: cfg.user, pass });

            } else if (res.status === 401) {
                log.error(`SEMP authentication failed (401): ${target}`);
                hooks.onAuthFailed?.();
            } else {
                const message = relay ? await relayErrorText(res) : statusLine(res);
                log.error(`SEMP connect refused: ${target}: ${message}`);
                hooks.onError?.({ message, isNetworkError: false, isTimeout: false, baseUrl });
            }

        } catch (err: unknown) {
            const isTimeout = Object(err).name === 'AbortError';
            const text = errMessage(err);
            const isNetworkError = text.includes('Failed to fetch') || text.includes('NetworkError');
            const message = isTimeout
                ? `Connection timed out (${SEMP_PROBE_TIMEOUT_MS / 1000}s). Check host and port.`
                : text;
            log.error(`SEMP connect failed: ${target}: ${message}`);

            hooks.onError?.({ message, isNetworkError, isTimeout, baseUrl });

        } finally {
            clearTimeout(timeout);
        }
    }

    async function disconnect(): Promise<void> {
        log.info(`SEMP disconnected: ${connectedTo}`);
        hooks.onDisconnected();
    }

    return { connect, disconnect };
}
