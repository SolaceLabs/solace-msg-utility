import { logger } from '../logger';
import { buildBrokerUrl, isHosted } from '../hosted';
import { solaceErrorText } from '../utils';
import type { SolaceConfig } from '../connections/types';

declare const solace: any;

/**
 * Lifecycle hooks the caller wires to whatever state/UI/event-bus it owns.
 *
 * The factory itself is pure — it knows nothing about AppContext, AppState,
 * the global event bus, or UI elements. Primary callers (connections module)
 * route these into global state + bus emits; secondary callers (future
 * queue-copy destination) route them into module-scoped state.
 */
export interface SolaceConnectionHooks {
    /**
     * Fires on session UP_NOTICE — caller receives the live session and the
     * VPN it connected to. `vpn` is passed explicitly so the caller doesn't
     * have to track per-connect closure context to bridge into module/global state.
     */
    onConnected: (session: any, vpn: string) => void;
    /** Fires on SDK DISCONNECTED — session is already torn down. */
    onDisconnected: () => void;
    /** Fires on CONNECT_FAILED_ERROR — caller decides how to surface the failure. */
    onConnectFailed?: (info: { infoStr: string }) => void;
    /** Fires on synchronous errors during connect() (e.g. session creation throws). */
    onError?: (err: Error) => void;
}

export interface SolaceClient {
    /** Initialize the SolclientFactory once. Idempotent. */
    init(): void;
    /**
     * Open a session against `host`/`pass` using `cfg`. Fires hooks asynchronously.
     *
     * `clientName` (optional) is forwarded verbatim to `SessionProperties.clientName`.
     * Callers compose the full string (including any app prefix and timestamp); the
     * factory stays unaware of naming conventions.
     */
    connect(cfg: SolaceConfig, host: string, pass: string, clientName?: string): void;
    /** Close the session if connected; no-op otherwise. */
    disconnect(): void;
    /** Dispose the session and reset internal state. */
    cleanup(): void;
}

/**
 * Probe the broker's TLS endpoint via a hidden iframe. The browser performs
 * the TLS handshake for the iframe load, which primes its cert-trust cache
 * and surfaces the interstitial for an unseen cert. Fire-and-forget: the
 * iframe cleans itself up on load, error, or timeout.
 */
function tlsHandshakeProbe(httpsUrl: string, timeoutMs = 3000): void {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'display:none;width:0;height:0;border:0;';
    iframe.src = httpsUrl;

    let settled = false;
    const cleanup = () => {
        if (settled) return;
        settled = true;
        try { iframe.remove(); } catch { /* ignore */ }
    };

    iframe.addEventListener('load', cleanup);
    iframe.addEventListener('error', cleanup);
    setTimeout(cleanup, timeoutMs);

    document.body.appendChild(iframe);
}

/**
 * Pure Solace session factory.
 *
 * Caller passes lifecycle hooks. Factory drives the SDK and routes SDK events
 * to the hooks. No AppContext, no UI, no global bus.
 */
export function createServiceSolace(hooks: SolaceConnectionHooks): SolaceClient {
    let session: any = null;
    let isInitialized = false;

    function init() {
        if (isInitialized) return;
        if (!(window as any).solace) {
            logger.warn('Solace API not loaded yet.');
            return;
        }

        try {
            const factoryProps = new solace.SolclientFactoryProperties();
            factoryProps.profile = solace.SolclientFactoryProfiles.version10;
            factoryProps.logLevel = solace.LogLevel.WARN;
            solace.SolclientFactory.init(factoryProps);
            isInitialized = true;
            logger.info('SolClientFactory Initialized.');
        } catch (e) {
            logger.error('Failed to initialize SolClientFactory:', e);
        }
    }

    function connect(cfg: SolaceConfig, host: string, pass: string, clientName?: string) {
        if (session) {
            try {
                session.disconnect();
                /* v8 ignore start -- defensive catch around an SDK contract that does not throw in jsdom.
                 * Pre-refactor coverage analysis (see git history of src/modules/connections/service-client.ts)
                 * concluded driving this path is high-cost / low-signal; that reasoning is unchanged after
                 * the move to core/services/. The explicit disconnect() throw path is still covered by
                 * tests/core/services/solace-client.test.ts › "warns and does not propagate when session.disconnect() throws".
                 */
            } catch (e) {
                // Prior session may already be disposed — expected during reconnect.
                logger.warn('[solace-client] disconnect() on stale session during reconnect:', e);
            }
            /* v8 ignore stop */
        }

        if (!(window as any).solace) {
            hooks.onError?.(new Error('Solace API not loaded.'));
            return;
        }

        // The shell's vendor loader (src/index.html) sets `solaceLibLoaded` only
        // once the SDK it loaded satisfies the minimum version — or reports no
        // version at all, which it cannot verify and therefore permits. Reaching
        // here with the flag false means the SDK IS present but is too old, so
        // this is the one place that turns that finding into a refusal: every
        // Solace session in the app is created below, and the primary (Direct and
        // Managed) and secondary (queue-copy destination) callers all render
        // `onError` already.
        if (!(window as any).solaceLibLoaded) {
            hooks.onError?.(new Error(
                'Solace Web Messaging SDK is below the required version (10.18.3) — see the banner at the top of the page.',
            ));
            return;
        }

        if (!isInitialized) init();

        // For secure WebSocket, fire a hidden-iframe TLS handshake alongside
        // the solclient connect — this primes the browser's cert-trust cache
        // so the wss:// handshake can reuse the user's accept/reject decision.
        // Skip in hosted mode: the browser only sees the gateway's TLS endpoint
        // (already trusted by the PWA load); the internal broker host is not
        // user-reachable and probing it would be wrong.
        if (cfg.protocol === 'wss' && !isHosted()) {
            tlsHandshakeProbe(buildBrokerUrl('https', host, cfg.port, cfg.urlPath, false));
        }

        try {
            const props = new solace.SessionProperties();
            props.url = buildBrokerUrl(cfg.protocol, host, cfg.port, cfg.urlPath, true);
            props.vpnName = cfg.vpn;
            props.userName = cfg.user;
            props.publisherProperties = { acknowledgeMode: solace.MessagePublisherAcknowledgeMode.PER_MESSAGE };

            if (cfg.authMode === 'oauth') {
                props.authenticationScheme = solace.AuthenticationScheme.OAUTH2;
                props.accessToken = cfg.user;
                props.idToken = pass;
            } else {
                props.authenticationScheme = solace.AuthenticationScheme.BASIC;
                props.password = pass;
            }

            // Advanced Props — required by SolaceConfig, no undefined-guard needed.
            props.connectRetries = cfg.connectRetries;
            props.connectTimeoutInMsecs = cfg.connectTimeout;
            props.reconnectRetries = cfg.reconnectRetries;
            props.reconnectRetryWaitInMsecs = cfg.reconnectWait;

            if (clientName) {
                props.clientName = clientName;
            }

            logger.info('Creating Session:', props);
            session = solace.SolclientFactory.createSession(props);

            // Event Listeners
            session.on(solace.SessionEventCode.UP_NOTICE, () => {
                logger.info('Solace Session UP');
                hooks.onConnected(session, cfg.vpn);
            });

            session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent: any) => {
                logger.error('Connection Failed:', sessionEvent);
                hooks.onConnectFailed?.({ infoStr: sessionEvent.infoStr });
                cleanup();
            });

            session.on(solace.SessionEventCode.DISCONNECTED, () => {
                logger.info('Disconnected');
                cleanup();
                hooks.onDisconnected();
            });

            session.on(solace.SessionEventCode.MESSAGE, () => {
                // Generic handler (no-op)
            });

            // Debug-log every session event so the full SDK flow is visible
            // with `?logLevel=DEBUG`. Registered AFTER the typed handlers so
            // EventEmitter semantics deliver to both — the typed handler keeps
            // driving the lifecycle hook, the debug listener carries the raw
            // sessionEvent payload. Iterates `SessionEventCode` so any future
            // codes the SDK adds are picked up automatically.
            for (const [name, code] of Object.entries(solace.SessionEventCode)) {
                session.on(code, (sessionEvent: any) => {
                    logger.debug(`[Session] ${name}`, sessionEvent);
                });
            }

            session.connect();

        } catch (e) {
            logger.error('Session Creation Error', e);
            // `onError` is typed `(err: Error) => void` and every consumer renders
            // `err.message`, so honour that here rather than trusting whatever the
            // SDK threw. Every throw site traced in the bundle throws an
            // OperationError, but a non-Error would otherwise surface to the user
            // as "Connection Failed: undefined" with the reason only in the console.
            hooks.onError?.(e instanceof Error
                ? e
                : new Error(solaceErrorText(e, 'Session creation failed.')));
            cleanup();
        }
    }

    function disconnect() {
        if (session) {
            try {
                session.disconnect();
            } catch (e) {
                // Session may already be disposed by the SDK (e.g. broker dropped us first).
                logger.warn('[solace-client] disconnect() on already-disposed session:', e);
            }
        } else {
            // No live session — internal cleanup only. We deliberately DO NOT fire
            // onDisconnected here: the connection-switch flow in the connections module
            // subscribes to `client:disconnected` *before* calling disconnect() to wait
            // for the SDK's teardown signal. Synchronously firing the hook here would
            // re-enter that listener mid-handler and break the VPN-switch sequencing.
            // Callers that need to reconcile a stuck-state slot do it themselves.
            cleanup();
        }
    }

    function cleanup() {
        if (session) {
            try {
                session.dispose();
                /* v8 ignore start -- defensive catch around an SDK contract that does not throw in jsdom.
                 * Same coverage analysis as the connect() catch above: driving this path requires
                 * order-of-operations coupling that makes the test brittle for a one-line warn whose
                 * downstream effect (session = null on the next line) happens regardless.
                 */
            } catch (e) {
                // dispose() on a never-connected or already-disposed session is benign.
                logger.warn('[solace-client] dispose() during cleanup:', e);
            }
            /* v8 ignore stop */
        }
        session = null;
    }

    return { init, connect, disconnect, cleanup };
}
