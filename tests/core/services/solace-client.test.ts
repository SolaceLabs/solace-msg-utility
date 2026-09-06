import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServiceSolace, type SolaceConnectionHooks } from '../../../src/core/services/solace-client';
import { createSolaceMock } from '../../setup';
import { setLogLevel, getLogLevel } from '../../../src/core/logger';
import { LogLevel } from '../../../src/core/constants';
import { setHosted } from '../../../src/core/hosted';
import type { SolaceConfig } from '../../../src/core/connections/types';

/**
 * Pure-factory tests. The factory takes lifecycle hooks; tests stub the hooks
 * with vi.fn() and assert the hooks are invoked at the right SDK lifecycle
 * moments. No AppContext, no UI, no event bus — those concerns live in the
 * caller (connections module's bridging code, exercised in module.test.ts).
 */

function makeHooks(overrides: Partial<SolaceConnectionHooks> = {}): SolaceConnectionHooks {
    return {
        onConnected: vi.fn(),
        onDisconnected: vi.fn(),
        onConnectFailed: vi.fn(),
        onError: vi.fn(),
        ...overrides,
    };
}

function baseCfg(overrides: Partial<SolaceConfig> = {}): SolaceConfig {
    return {
        protocol: 'wss',
        port: '8080',
        urlPath: '',
        vpn: 'default',
        user: 'admin',
        authMode: 'basic',
        connectRetries: 0,
        connectTimeout: 3000,
        reconnectRetries: 1,
        reconnectWait: 3000,
        maxMessagesPerQueue: 100,
        clientNameId: 'test-client-id',
        ...overrides,
    };
}

describe('core/services/solace-client', () => {
    let solaceMock: ReturnType<typeof createSolaceMock>;

    beforeEach(() => {
        solaceMock = createSolaceMock();
        (window as any).solace = solaceMock;
    });

    describe('init()', () => {
        it('initializes SolclientFactory', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            expect(solaceMock.SolclientFactory.init).toHaveBeenCalled();
        });

        it('does not initialize twice', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.init();
            expect(solaceMock.SolclientFactory.init).toHaveBeenCalledTimes(1);
        });

        it('handles missing solace API', () => {
            (window as any).solace = undefined;
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const service = createServiceSolace(makeHooks());
            service.init();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Solace API not loaded'));
        });

        it('handles init error gracefully', () => {
            solaceMock.SolclientFactory.init.mockImplementation(() => { throw new Error('init error'); });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const service = createServiceSolace(makeHooks());
            service.init();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize'), expect.any(Error));
        });
    });

    describe('connect()', () => {
        it('creates a session with basic auth', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            expect(solaceMock.SolclientFactory.createSession).toHaveBeenCalled();
            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            expect(sessionMock.connect).toHaveBeenCalled();

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.authenticationScheme).toBe('BASIC');
            expect(propsObj.password).toBe('admin');
        });

        it('creates session with oauth auth — accessToken=user, idToken=pass', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ authMode: 'oauth', user: 'access-token-value' }), 'broker.test', 'id-token-value');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.authenticationScheme).toBe('OAUTH2');
            expect(propsObj.accessToken).toBe('access-token-value');
            expect(propsObj.idToken).toBe('id-token-value');
        });

        it('forwards a non-empty clientName argument to SessionProperties.clientName', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin', 'SolMsgUtil/20260517143025/abc-123');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.clientName).toBe('SolMsgUtil/20260517143025/abc-123');
        });

        it('leaves SessionProperties.clientName unset when no clientName is passed', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.clientName).toBeUndefined();
        });

        it('sets advanced properties on the SessionProperties object', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(
                baseCfg({ connectRetries: 5, connectTimeout: 20000, reconnectRetries: 10, reconnectWait: 5000 }),
                'broker.test', 'admin'
            );
            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.connectRetries).toBe(5);
            expect(propsObj.connectTimeoutInMsecs).toBe(20000);
            expect(propsObj.reconnectRetries).toBe(10);
            expect(propsObj.reconnectRetryWaitInMsecs).toBe(5000);
        });

        it('registers a generic debug listener for every SessionEventCode', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            const registeredCodes = sessionMock.on.mock.calls.map((c: any[]) => c[0]);
            for (const code of Object.values(solaceMock.SessionEventCode)) {
                expect(registeredCodes).toContain(code);
            }
        });

        it('debug-logs the event name and payload when a session event fires', () => {
            const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => { });
            // Generic listener emits at debug level — bump level so the call goes through.
            const prev = getLogLevel();
            setLogLevel(LogLevel.DEBUG);

            try {
                const service = createServiceSolace(makeHooks());
                service.init();
                service.connect(baseCfg(), 'broker.test', 'admin');

                const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
                // ACKNOWLEDGED_MESSAGE has no typed handler in solace-client, so the
                // only registration for this code is the generic debug listener.
                const ackHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'ACKNOWLEDGED_MESSAGE')[1];
                ackHandler({ correlationKey: 'k1' });

                expect(debugSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[Session] ACKNOWLEDGED_MESSAGE'),
                    { correlationKey: 'k1' }
                );
            } finally {
                setLogLevel(prev);
            }
        });

        it('fires onConnected with session and vpn on UP_NOTICE', () => {
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg({ vpn: 'my-vpn' }), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            const upHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'UP_NOTICE')[1];
            upHandler();

            expect(hooks.onConnected).toHaveBeenCalledWith(sessionMock, 'my-vpn');
        });

        it('fires onConnectFailed with infoStr on CONNECT_FAILED_ERROR', () => {
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            const failHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'CONNECT_FAILED_ERROR')[1];
            failHandler({ infoStr: 'Connection error to host' });

            expect(hooks.onConnectFailed).toHaveBeenCalledWith({ infoStr: 'Connection error to host' });
        });

        it('fires onDisconnected on DISCONNECTED', () => {
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            const discHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'DISCONNECTED')[1];
            discHandler();

            expect(hooks.onDisconnected).toHaveBeenCalled();
        });

        it('MESSAGE handler is a true no-op (no hooks fire)', () => {
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            const msgHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'MESSAGE')[1];
            (hooks.onConnected as any).mockClear();
            (hooks.onDisconnected as any).mockClear();

            expect(() => msgHandler()).not.toThrow();
            expect(hooks.onConnected).not.toHaveBeenCalled();
            expect(hooks.onDisconnected).not.toHaveBeenCalled();
        });

        it('disconnects existing session before connecting new one', () => {
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const firstSession = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            // Simulate UP so session is "live"
            const upHandler = firstSession.on.mock.calls.find((c: any[]) => c[0] === 'UP_NOTICE')[1];
            upHandler();

            // Connect again — factory should disconnect the stale session first.
            service.connect(baseCfg(), 'broker.test', 'admin');
            expect(firstSession.disconnect).toHaveBeenCalled();
        });

        it('fires onError when solace API not loaded during connect', () => {
            (window as any).solace = undefined;
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.connect(baseCfg(), 'test', 'admin');
            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Solace API not loaded.'
            }));
        });

        it('refuses to connect when the loaded SDK is below the required version', () => {
            // `window.solace` is present (the SDK loaded) but the shell's version
            // gate never set the flag — the SDK is too old. Refusing is the whole
            // point of the gate, so assert the session is never created, not just
            // that an error was reported.
            (window as any).solaceLibLoaded = false;
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);

            service.connect(baseCfg(), 'broker.test', 'admin');

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('10.18.3'),
            }));
            expect(solaceMock.SolclientFactory.createSession).not.toHaveBeenCalled();
        });

        it('calls init if not initialized when connecting', () => {
            const service = createServiceSolace(makeHooks());
            // No service.init() call
            service.connect(baseCfg(), 'broker.test', 'admin');
            expect(solaceMock.SolclientFactory.init).toHaveBeenCalled();
        });

        it('normalises a non-Error throw so the UI cannot render "undefined"', () => {
            // `onError` is typed `(err: Error) => void` and every consumer renders
            // `err.message`. Every throw site traced in dist/solclient.js throws an
            // OperationError, but nothing guarantees it — and a plain object would
            // otherwise reach the connect banner as "Connection Failed: undefined",
            // with the real reason only in the console.
            solaceMock.SolclientFactory.createSession.mockImplementation(() => {
                throw { code: 503, description: 'transport unavailable' };
            });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const reported = (hooks.onError as any).mock.calls[0][0];
            expect(reported).toBeInstanceOf(Error);
            expect(reported.message).toBe('Session creation failed.');
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('fires onError when session creation throws', () => {
            solaceMock.SolclientFactory.createSession.mockImplementation(() => { throw new Error('session error'); });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'session error' }));
            expect(consoleSpy).toHaveBeenCalledWith('Session Creation Error', expect.any(Error));
        });
    });

    describe('disconnect()', () => {
        it('disconnects existing session', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            // Simulate UP so we have a live session
            const upHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'UP_NOTICE')[1];
            upHandler();

            service.disconnect();
            expect(sessionMock.disconnect).toHaveBeenCalled();
        });

        it('disconnect() with no session is a synchronous internal cleanup (no hook fires)', () => {
            // Deliberately does NOT fire onDisconnected — the connections module's
            // VPN-switch flow subscribes to `client:disconnected` before calling
            // disconnect() to wait for the SDK teardown signal; firing the hook
            // synchronously here would re-enter that listener mid-handler. The
            // hook only fires when the SDK actually fires DISCONNECTED.
            const hooks = makeHooks();
            const service = createServiceSolace(hooks);
            expect(() => service.disconnect()).not.toThrow();
            expect(hooks.onDisconnected).not.toHaveBeenCalled();
        });

        it('warns and does not propagate when session.disconnect() throws', () => {
            // The SDK can throw from disconnect() when the session was already
            // torn down (broker dropped us first). The caller must not see that
            // throw — cleanup happens on the subsequent DISCONNECTED event.
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
            const upHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'UP_NOTICE')[1];
            upHandler();

            sessionMock.disconnect.mockImplementationOnce(() => { throw new Error('already disposed'); });

            expect(() => service.disconnect()).not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('disconnect() on already-disposed session'),
                expect.any(Error)
            );

            warnSpy.mockRestore();
        });
    });

    describe('TLS handshake probe', () => {
        it('injects a hidden iframe targeting the https broker URL on wss connect', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const iframe = document.querySelector('iframe[src="https://broker.test:8080"]') as HTMLIFrameElement;
            expect(iframe).toBeTruthy();
            expect(iframe.style.display).toBe('none');
        });

        it('removes the probe iframe when it loads', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const iframe = document.querySelector('iframe[src="https://broker.test:8080"]') as HTMLIFrameElement;
            iframe.dispatchEvent(new Event('load'));
            expect(document.querySelector('iframe[src="https://broker.test:8080"]')).toBeNull();
        });

        it('removes the probe iframe on timeout', () => {
            vi.useFakeTimers();
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            expect(document.querySelector('iframe[src="https://broker.test:8080"]')).toBeTruthy();
            vi.advanceTimersByTime(3000);
            expect(document.querySelector('iframe[src="https://broker.test:8080"]')).toBeNull();
            vi.useRealTimers();
        });

        it('ignores later triggers once cleanup has run', () => {
            vi.useFakeTimers();
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg(), 'broker.test', 'admin');

            const iframe = document.querySelector('iframe[src="https://broker.test:8080"]') as HTMLIFrameElement;
            iframe.dispatchEvent(new Event('load'));
            expect(document.querySelector('iframe[src="https://broker.test:8080"]')).toBeNull();
            // setTimeout fires cleanup a second time — guard should short-circuit
            expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
            expect(document.querySelector('iframe[src="https://broker.test:8080"]')).toBeNull();
            vi.useRealTimers();
        });

        it('does not inject the probe iframe for plain ws protocol', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ protocol: 'ws' }), 'broker.test', 'admin');

            expect(document.querySelector('iframe[src^="https://"]')).toBeNull();
        });
    });

    // URL Path appends after the port so brokers behind a reverse proxy (e.g.
    // `wss://gateway:443/solace`) can be reached. The same path must reach
    // both the SDK session URL *and* the TLS-trust probe iframe — otherwise
    // the probe would prime cert trust for a different origin than the
    // actual handshake target.
    describe('URL Path append', () => {
        it('appends a populated URL Path to props.url', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ urlPath: '/solace' }), 'broker.test', 'admin');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.url).toBe('wss://broker.test:8080/solace');
        });

        it('normalises a path missing its leading slash', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ urlPath: 'solace' }), 'broker.test', 'admin');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.url).toBe('wss://broker.test:8080/solace');
        });

        it('omits the path entirely when blank or whitespace', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ urlPath: '   ' }), 'broker.test', 'admin');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            expect(propsObj.url).toBe('wss://broker.test:8080');
        });

        it('routes the TLS handshake probe to the same path as the session URL', () => {
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ urlPath: '/solace' }), 'broker.test', 'admin');

            // Probe must hit https://...:port/solace — not just :port — so the
            // browser cert-trust cache is primed for the wss handshake's origin.
            expect(document.querySelector('iframe[src="https://broker.test:8080/solace"]')).toBeTruthy();
        });
    });

    // Hosted mode rewrites the SDK session URL through the gateway proxy
    // path `/{scheme}/{port}/{host}{urlPath}` and skips the TLS handshake
    // probe (the gateway is the only TLS endpoint the browser sees, and it
    // was already trusted when the PWA loaded).
    describe('hosted mode', () => {
        afterEach(() => {
            setHosted(false);
        });

        it('rewrites props.url to the gateway proxy path on an http page (plain ws)', () => {
            setHosted(true);
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ urlPath: '/solace' }), 'broker.test', 'admin');

            const propsObj = solaceMock.SessionProperties.mock.results[0].value;
            // jsdom default location is http://localhost/, so wire scheme is ws.
            expect(propsObj.url).toBe('ws://localhost:3000/wss/8080/broker.test/solace');
        });

        it('does not inject the TLS handshake probe iframe', () => {
            setHosted(true);
            const service = createServiceSolace(makeHooks());
            service.init();
            service.connect(baseCfg({ urlPath: '/solace' }), 'broker.test', 'admin');

            expect(document.querySelector('iframe[src^="https://"]')).toBeNull();
        });
    });
});
