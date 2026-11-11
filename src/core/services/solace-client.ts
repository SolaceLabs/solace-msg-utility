import { logger } from '../logger';
import { buildBrokerUrl, gatewayWsUrl } from '../hosted';
import { solaceErrorText } from '../utils';
import { SDK_LOAD_WAIT_MS } from '../timing';
import type { SolaceConfig } from '../connections/types';

declare const solace: any;

const log = logger.withTag('solace-client');

/** What `connect()` reports when a connect is already in flight on this client. */
export const CONNECT_IN_PROGRESS = 'A connection attempt is already in progress.';

/**
 * The outcome of starting a connect: `ok` once the SDK session is created and
 * connecting (the result arrives later through the hooks), otherwise why it
 * did not start. Every refusal except `CONNECT_IN_PROGRESS` has also gone to
 * `onError`; that one is not, because the attempt in flight still owns the
 * caller's UI.
 */
export type ConnectStart = { ok: true } | { ok: false; error: string };

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
     *
     * Refused, with a warn, while an earlier connect on this client is still in
     * flight (`CONNECT_IN_PROGRESS`): a second session would otherwise race the
     * first, and the first one's teardown would dispose the second. A connect
     * while a session is up replaces it; the old session's late events are
     * ignored, so they cannot dispose the new session or fire its hooks.
     */
    connect(cfg: SolaceConfig, host: string, pass: string, clientName?: string): ConnectStart;
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
    // True from session creation until it comes up, fails or disconnects.
    let connecting = false;
    // Set while a connect waits for the shell loader to settle; cancels that wait.
    let cancelLibraryWait: (() => void) | null = null;

    function init() {
        if (isInitialized) return;
        if (!(window as any).solace) {
            log.warn('Solace API not loaded yet.');
            return;
        }

        try {
            const factoryProps = new solace.SolclientFactoryProperties();
            factoryProps.profile = solace.SolclientFactoryProfiles.version10;
            factoryProps.logLevel = solace.LogLevel.WARN;
            solace.SolclientFactory.init(factoryProps);
            isInitialized = true;
            log.info('SolClientFactory Initialized.');
        } catch (e) {
            log.error('Failed to initialize SolClientFactory:', e);
        }
    }

    /** Refuse to start: tell `onError` (and the caller) why. */
    function refuse(err: Error): ConnectStart {
        hooks.onError?.(err);
        return { ok: false, error: err.message };
    }

    function connect(cfg: SolaceConfig, host: string, pass: string, clientName?: string): ConnectStart {
        if (connecting) {
            log.warn(`connect to VPN "${cfg.vpn}" refused: ${CONNECT_IN_PROGRESS}`);
            return { ok: false, error: CONNECT_IN_PROGRESS };
        }

        // The shell loader (src/index.html) is still downloading the SDK: wait
        // for its verdict (bounded), then run the normal connect, whose checks
        // proceed or refuse through the hooks. The wait counts as in flight.
        if ((window as any).solaceLibState === 'loading') {
            log.info(`connect to VPN "${cfg.vpn}" waits for the Solace library to load.`);
            connecting = true;
            const proceed = () => {
                stopWaiting();
                connecting = false;
                startConnect(cfg, host, pass, clientName);
            };
            const timer = setTimeout(proceed, SDK_LOAD_WAIT_MS);
            const stopWaiting = () => {
                clearTimeout(timer);
                window.removeEventListener('Solclient:settled', proceed);
                cancelLibraryWait = null;
            };
            window.addEventListener('Solclient:settled', proceed);
            cancelLibraryWait = () => {
                stopWaiting();
                connecting = false;
            };
            return { ok: true };
        }

        return startConnect(cfg, host, pass, clientName);
    }

    function startConnect(cfg: SolaceConfig, host: string, pass: string, clientName?: string): ConnectStart {
        if (session) {
            try {
                session.disconnect();
            } catch (e) {
                // Prior session may already be disposed — expected during reconnect.
                log.warn('disconnect() on stale session during reconnect:', e);
            }
        }

        if (!(window as any).solace) {
            return refuse(new Error('Solace API not loaded.'));
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
            return refuse(new Error(
                'Solace Web Messaging SDK is below the required version (10.18.3) — see the banner at the top of the page.',
            ));
        }

        if (!isInitialized) init();

        // For secure WebSocket, fire a hidden-iframe TLS handshake alongside
        // the solclient connect — this primes the browser's cert-trust cache
        // so the wss:// handshake can reuse the user's accept/reject decision.
        // Skip in hosted mode and for a Provisioned session (smfPath): the
        // browser only sees the gateway's TLS endpoint (already trusted by the
        // PWA load); the broker host is not user-reachable, and for a
        // Provisioned session `host` is only the broker's name, so probing it
        // would send a request to another origin.
        const hosted = cfg.hosted === true;
        if (cfg.protocol === 'wss' && !hosted && !cfg.smfPath) {
            tlsHandshakeProbe(buildBrokerUrl('https', host, cfg.port, cfg.urlPath, false, false));
        }

        try {
            const props = new solace.SessionProperties();
            // A managed session connects to the gateway's SMF socket for the
            // VPN (from dial); a Direct one to the broker, relayed when hosted.
            props.url = cfg.smfPath
                ? gatewayWsUrl(cfg.smfPath)
                : buildBrokerUrl(cfg.protocol, host, cfg.port, cfg.urlPath, true, hosted);
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

            // Where this session goes, for every lifecycle line below. Never
            // `props` itself: it carries the password (BASIC), or the access
            // and id tokens (OAuth, where userName holds the access token too).
            const target = `${props.url} VPN "${cfg.vpn}"`;
            log.info('Creating Session:', {
                url: props.url,
                vpnName: props.vpnName,
                authMode: cfg.authMode,
                userName: cfg.authMode === 'oauth' ? undefined : props.userName,
                clientName: props.clientName,
                connectRetries: props.connectRetries,
                reconnectRetries: props.reconnectRetries,
            });
            const s = solace.SolclientFactory.createSession(props);
            session = s;
            connecting = true;

            // Each handler acts on its own session `s`. An event from a session
            // this client has since replaced is dropped (and that session
            // disposed), so it can neither dispose the current session nor
            // drive the caller's hooks.
            const own = (code: string, handler: (sessionEvent: any) => void) => {
                s.on(code, (sessionEvent: any) => {
                    if (session !== s) {
                        log.debug(`ignoring ${code} from a replaced session: ${target}`);
                        disposeSession(s);
                        return;
                    }
                    handler(sessionEvent);
                });
            };

            own(solace.SessionEventCode.UP_NOTICE, () => {
                connecting = false;
                log.info(`Session up: ${target}`);
                hooks.onConnected(s, cfg.vpn);
            });

            own(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
                log.error(`Connection failed: ${target}:`, sessionEvent);
                hooks.onConnectFailed?.({ infoStr: sessionEvent.infoStr });
                cleanup();
            });

            own(solace.SessionEventCode.DISCONNECTED, () => {
                log.info(`Disconnected: ${target}`);
                cleanup();
                hooks.onDisconnected();
            });

            s.on(solace.SessionEventCode.MESSAGE, () => {
                // Generic handler (no-op)
            });

            // Debug-log every session event so the full SDK flow is visible
            // with `?logLevel=DEBUG`. Registered AFTER the typed handlers so
            // EventEmitter semantics deliver to both — the typed handler keeps
            // driving the lifecycle hook, the debug listener carries the raw
            // sessionEvent payload. Iterates `SessionEventCode` so any future
            // codes the SDK adds are picked up automatically.
            for (const [name, code] of Object.entries(solace.SessionEventCode)) {
                s.on(code, (sessionEvent: any) => {
                    logger.debug(`[Session] ${name}`, sessionEvent);
                });
            }

            s.connect();
            return { ok: true };

        } catch (e) {
            log.error(`Session creation failed for VPN "${cfg.vpn}":`, e);
            // `onError` is typed `(err: Error) => void` and every consumer renders
            // `err.message`, so honour that here rather than trusting whatever the
            // SDK threw. Every throw site traced in the bundle throws an
            // OperationError, but a non-Error would otherwise surface to the user
            // as "Connection Failed: undefined" with the reason only in the console.
            const err = e instanceof Error ? e : new Error(solaceErrorText(e, 'Session creation failed.'));
            cleanup();
            return refuse(err);
        }
    }

    function disconnect() {
        if (cancelLibraryWait) cancelLibraryWait();
        if (session) {
            try {
                session.disconnect();
            } catch (e) {
                // Session may already be disposed by the SDK (e.g. broker dropped us first).
                log.warn('disconnect() on already-disposed session:', e);
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

    function disposeSession(s: any) {
        try {
            s.dispose();
            /* v8 ignore start -- SDK Session.dispose() does not throw; defensive catch on a
             * trusted contract.
             */
        } catch (e) {
            // dispose() on a never-connected or already-disposed session is benign.
            log.warn('dispose() during cleanup:', e);
        }
        /* v8 ignore stop */
    }

    function cleanup() {
        if (session) disposeSession(session);
        session = null;
        connecting = false;
    }

    /** The public cleanup also abandons a connect still waiting for the library. */
    function cleanupAll() {
        if (cancelLibraryWait) cancelLibraryWait();
        cleanup();
    }

    return { init, connect, disconnect, cleanup: cleanupAll };
}
