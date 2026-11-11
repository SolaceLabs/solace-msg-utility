import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServiceSemp, type SempConnectionHooks } from '../../../src/core/services/semp-client';
import { managedErrorMessage } from '../../../src/core/services/managed-api';
import { basicAuthHeader } from '../../../src/core/utils';
import { REQUEST_TIMEOUT_MS } from '../../../src/core/timing';
import type { SempConfig } from '../../../src/core/connections/types';

/**
 * Pure-factory tests. Hooks are stubbed with vi.fn() and assertions verify
 * the factory's lifecycle calls into them. UI/AppState bridging behaviors
 * live in the connections module's tests.
 */

function makeHooks(overrides: Partial<SempConnectionHooks> = {}): SempConnectionHooks {
    return {
        onConnected: vi.fn(),
        onDisconnected: vi.fn(),
        onAuthFailed: vi.fn(),
        onError: vi.fn(),
        ...overrides,
    };
}

function baseCfg(overrides: Partial<SempConfig> = {}): SempConfig {
    return {
        protocol: 'https',
        port: '8080',
        urlPath: '',
        user: 'admin',
        ...overrides,
    };
}

describe('core/services/semp-client', () => {
    beforeEach(() => {
        // Default fetch mock — individual tests override per-call.
    });

    describe('connect()', () => {
        it('fires onConnected with a SempContext + creds on 200', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'pw');

            expect(hooks.onConnected).toHaveBeenCalledWith(
                expect.objectContaining({
                    fetch: expect.any(Function),
                    baseUrl: 'https://broker.test:8080',
                }),
                { user: 'admin', pass: 'pw' }
            );
            expect(hooks.onAuthFailed).not.toHaveBeenCalled();
            expect(hooks.onError).not.toHaveBeenCalled();
        });

        it('returned SempContext.fetch assembles the URL from connection-form values and injects auth', async () => {
            // The closure captures protocol/host/port/urlPath at connect time
            // and reassembles the full URL from the caller-supplied path on
            // every call. This is the central guarantee that broker-direct
            // URLs from response bodies (nextPageUri) cannot reach the wire
            // — the closure literally cannot accept one.
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({
                onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }),
            });
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'secret');

            expect(capturedFetch).not.toBeNull();
            await capturedFetch!('/some/endpoint');

            // Assert the second fetch call (the first was the validation probe)
            // hit the assembled URL and carried the auth header derived from
            // { user: 'admin', pass: 'secret' }.
            const expectedAuth = 'Basic ' + btoa('admin:secret');
            const fetchCalls = (globalThis.fetch as any).mock.calls;
            const lastCall = fetchCalls[fetchCalls.length - 1];
            expect(lastCall[0]).toBe('https://broker.test:8080/some/endpoint');
            expect(lastCall[1].headers.Authorization).toBe(expectedAuth);
        });

        it('returned SempContext.fetch prepends the configured urlPath to the caller-supplied path', async () => {
            // The form's urlPath sits between the host:port and the SEMP
            // endpoint suffix on every call — same shape as the validation
            // probe URL, just driven by a per-call path now.
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({
                onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }),
            });
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg({ urlPath: '/api' }), 'broker.test', 'pw');

            await capturedFetch!('/SEMP/v2/monitor/msgVpns?cursor=xyz');

            const fetchCalls = (globalThis.fetch as any).mock.calls;
            const lastCall = fetchCalls[fetchCalls.length - 1];
            expect(lastCall[0]).toBe('https://broker.test:8080/api/SEMP/v2/monitor/msgVpns?cursor=xyz');
        });

        it("a broker's 401 on a later call is the caller's answer, not onAuthFailed", async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({ onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }) });
            await createServiceSemp(hooks).connect(baseCfg(), 'broker.test', 'pw');

            (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 401 });
            await expect(capturedFetch!('/SEMP/v2/monitor/msgVpns')).resolves.toMatchObject({ status: 401 });
            expect(hooks.onAuthFailed).not.toHaveBeenCalled();
        });

        it('fires onAuthFailed on 401', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'wrong');

            expect(hooks.onAuthFailed).toHaveBeenCalled();
            expect(hooks.onConnected).not.toHaveBeenCalled();
            expect(hooks.onError).not.toHaveBeenCalled();
        });

        it('fires onError on other HTTP errors with the status string', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'pw');

            expect(hooks.onError).toHaveBeenCalledWith({
                message: '500 Internal Server Error',
                isNetworkError: false,
                isTimeout: false,
                baseUrl: 'https://broker.test:8080',
            });
        });

        it('fires onError with isNetworkError=true on "Failed to fetch"', async () => {
            (globalThis.fetch as any).mockRejectedValue(new Error('Failed to fetch'));

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'pw');

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Failed to fetch',
                isNetworkError: true,
                isTimeout: false,
            }));
        });

        it('fires onError with isNetworkError=true on "NetworkError"', async () => {
            (globalThis.fetch as any).mockRejectedValue(new Error('NetworkError when attempting'));

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'pw');

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                isNetworkError: true,
            }));
        });

        it('fires onError with isNetworkError=false for generic exceptions', async () => {
            (globalThis.fetch as any).mockRejectedValue(new Error('Timeout'));

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker.test', 'pw');

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Timeout',
                isNetworkError: false,
                isTimeout: false,
            }));
        });

        it('fires onError with the bare status when an HTTP/2 answer carries no status text', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 503, statusText: '' });
            const hooks = makeHooks();
            await createServiceSemp(hooks).connect(baseCfg(), 'broker.test', 'pw');
            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: '503' }));
        });

        it('the probe and every later call send the same Basic header, built by basicAuthHeader', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({ onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }) });
            await createServiceSemp(hooks).connect(baseCfg(), 'broker.test', 'S3cret!#');
            await capturedFetch!('/SEMP');

            const headers = (globalThis.fetch as any).mock.calls.map((c: any[]) => c[1].headers.Authorization);
            expect(headers).toEqual([basicAuthHeader('admin', 'S3cret!#'), basicAuthHeader('admin', 'S3cret!#')]);
        });

        it('a credential btoa cannot encode reaches onError and sends no request', async () => {
            // The connection forms reject non-ASCII credentials first
            // (tests/modules/connections/module.test.ts > "rejects a non-ASCII
            // SEMP password inline before any request"); a caller that skips
            // that check still gets onError, not an unhandled rejection.
            const hooks = makeHooks();
            await createServiceSemp(hooks).connect(baseCfg(), 'broker.test', 'euro\u20ac');
            expect(globalThis.fetch).not.toHaveBeenCalled();
            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                isNetworkError: false, isTimeout: false, baseUrl: 'https://broker.test:8080',
            }));
            expect(hooks.onConnected).not.toHaveBeenCalled();
        });

        it("later calls carry a REQUEST_TIMEOUT_MS deadline joined to the caller's signal", async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({ onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }) });
            await createServiceSemp(hooks).connect(baseCfg(), 'broker.test', 'pw');

            const timeout = vi.spyOn(AbortSignal, 'timeout');
            const cancel = new AbortController();
            await capturedFetch!('/SEMP', { signal: cancel.signal });

            expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
            const { signal } = (globalThis.fetch as any).mock.calls.at(-1)[1];
            cancel.abort();
            expect(signal.aborted).toBe(true);
        });

        it('a later call the broker never answers rejects with a TimeoutError', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({ onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }) });
            await createServiceSemp(hooks).connect(baseCfg(), 'broker.test', 'pw');

            const deadline = new AbortController();
            vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
            (globalThis.fetch as any).mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
                init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
            }));
            const pending = capturedFetch!('/SEMP/v2/monitor/msgVpns');
            deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'));
            await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
        });

        // URL Path is appended *between* the port and the canonical
        // `/SEMP/v2/...` path so brokers behind a reverse proxy
        // (e.g. https://gateway/api/SEMP/v2/...) keep working.
        describe('URL Path append', () => {
            it('appends a populated URL Path between the port and the SEMP v2 path', async () => {
                (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

                const service = createServiceSemp(makeHooks());
                await service.connect(baseCfg({ urlPath: '/api' }), 'broker.test', 'pw');

                const calledUrl = (globalThis.fetch as any).mock.calls.at(-1)[0];
                expect(calledUrl).toBe('https://broker.test:8080/api/SEMP/v2/monitor/msgVpns?count=1');
            });

            it('normalises a path missing its leading slash', async () => {
                (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

                const service = createServiceSemp(makeHooks());
                await service.connect(baseCfg({ urlPath: 'api' }), 'broker.test', 'pw');

                const calledUrl = (globalThis.fetch as any).mock.calls.at(-1)[0];
                expect(calledUrl).toBe('https://broker.test:8080/api/SEMP/v2/monitor/msgVpns?count=1');
            });

            it('omits the path entirely when blank, leaving the original URL shape', async () => {
                (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

                const service = createServiceSemp(makeHooks());
                await service.connect(baseCfg({ urlPath: '' }), 'broker.test', 'pw');

                const calledUrl = (globalThis.fetch as any).mock.calls.at(-1)[0];
                expect(calledUrl).toBe('https://broker.test:8080/SEMP/v2/monitor/msgVpns?count=1');
            });

            it('passes the path-aware baseUrl into onConnected', async () => {
                (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

                const hooks = makeHooks();
                const service = createServiceSemp(hooks);
                await service.connect(baseCfg({ urlPath: '/api' }), 'broker.test', 'pw');

                expect(hooks.onConnected).toHaveBeenCalledWith(
                    expect.objectContaining({ baseUrl: 'https://broker.test:8080/api' }),
                    expect.anything()
                );
            });
        });

        it('aborts the in-flight fetch on 15s timeout and reports isTimeout=true', async () => {
            vi.useFakeTimers();
            // fetch stays pending until the abort signal fires
            (globalThis.fetch as any).mockImplementation((_url: string, init: any) => {
                return new Promise((_resolve, reject) => {
                    init.signal.addEventListener('abort', () => {
                        reject(new DOMException('The operation was aborted', 'AbortError'));
                    });
                });
            });

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            const connectPromise = service.connect(baseCfg(), 'broker.test', 'pw');

            // Advance past the 15s timeout — the setTimeout callback fires controller.abort()
            await vi.advanceTimersByTimeAsync(15000);
            await connectPromise;

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Connection timed out (15s). Check host and port.',
                isTimeout: true,
            }));
            vi.useRealTimers();
        });
    });

    describe('disconnect()', () => {
        it('fires onDisconnected', async () => {
            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.disconnect();
            expect(hooks.onDisconnected).toHaveBeenCalled();
        });
    });

    // A managed session's SEMP goes through the gateway's relay, which adds the
    // broker's stored account: the browser sends its session cookie only.
    describe('relay mode', () => {
        const relayCfg = () => baseCfg({ user: '', relayBase: '/managed/relay/b1' });

        it.each([false, true])('probes and fetches through the relay with no Authorization header (hosted %s)', async (hosted) => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let ctxFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({ onConnected: vi.fn((c) => { ctxFetch = c.fetch; }) });

            await createServiceSemp(hooks).connect({ ...relayCfg(), hosted }, 'b1', '');

            expect(globalThis.fetch).toHaveBeenLastCalledWith('/managed/relay/b1/SEMP/v2/monitor/msgVpns?count=1',
                { method: 'GET', signal: expect.any(AbortSignal), credentials: 'same-origin' });
            expect(hooks.onConnected).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: '/managed/relay/b1' }), { user: '', pass: '' });

            // A later call (here a SEMP v1 show) keeps its own headers and gains none.
            await ctxFetch!('/SEMP', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: '<rpc/>' });
            expect(globalThis.fetch).toHaveBeenLastCalledWith('/managed/relay/b1/SEMP',
                { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: '<rpc/>', credentials: 'same-origin', signal: expect.any(AbortSignal) });
        });

        it('a relay 401 is onAuthFailed: the gateway session has ended', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
            const hooks = makeHooks();
            await createServiceSemp(hooks).connect(relayCfg(), 'b1', '');
            expect(hooks.onAuthFailed).toHaveBeenCalled();
            expect(hooks.onError).not.toHaveBeenCalled();
        });

        it('a relay 401 on a later call is onAuthFailed too; other answers are not', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let ctxFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({ onConnected: vi.fn((c) => { ctxFetch = c.fetch; }) });
            await createServiceSemp(hooks).connect(relayCfg(), 'b1', '');

            await ctxFetch!('/SEMP/v2/monitor/msgVpns/v1/queues');
            (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 403 });
            await ctxFetch!('/SEMP/v2/monitor/msgVpns/v1/queues');
            expect(hooks.onAuthFailed).not.toHaveBeenCalled();

            const ended = { ok: false, status: 401 };
            (globalThis.fetch as any).mockResolvedValueOnce(ended);
            // The caller still gets the answer to settle its own request.
            await expect(ctxFetch!('/SEMP/v2/monitor/msgVpns/v1/queues')).resolves.toBe(ended);
            expect(hooks.onAuthFailed).toHaveBeenCalledTimes(1);
        });

        it('a later relay 401 with no onAuthFailed hook still answers the caller', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            let ctxFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            await createServiceSemp(makeHooks({ onAuthFailed: undefined, onConnected: vi.fn((c) => { ctxFetch = c.fetch; }) }))
                .connect(relayCfg(), 'b1', '');
            (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 401 });
            await expect(ctxFetch!('/SEMP/v2/monitor/msgVpns')).resolves.toMatchObject({ status: 401 });
        });

        it.each([
            [502, 'upstream_auth'],
            [502, 'upstream_unavailable'],
            [403, 'read_only'],
        ])('a %i %s refusal reports the gateway code as text', async (status, code) => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status, statusText: 'x', json: async () => ({ error: code }) });
            const hooks = makeHooks();
            await createServiceSemp(hooks).connect(relayCfg(), 'b1', '');
            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: managedErrorMessage({ ok: false, status, code }), baseUrl: '/managed/relay/b1',
            }));
        });

        it('an answer that is not the gateway JSON, or carries no code, reports the status', async () => {
            const hooks = makeHooks();
            (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new Error('html'); } });
            await createServiceSemp(hooks).connect(relayCfg(), 'b1', '');
            (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) });
            await createServiceSemp(hooks).connect(relayCfg(), 'b1', '');
            expect((hooks.onError as any).mock.calls.map((c: any[]) => c[0].message)).toEqual(['502 Bad Gateway', '500 Internal Server Error']);
        });
    });

    // Hosted mode routes the validation fetch through the gateway proxy
    // path and passes the gateway-prefixed baseUrl into onConnected.
    describe('hosted mode (cfg.hosted, from AppState.connConfig)', () => {
        it('fetches the gateway-prefixed validation URL and exposes the same prefix as baseUrl', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg({ urlPath: '/api', hosted: true }), 'broker.example.com', 'pw');

            // jsdom default location is http://localhost/, so wire scheme is http.
            const calledUrl = (globalThis.fetch as any).mock.calls.at(-1)[0];
            expect(calledUrl).toBe('http://localhost:3000/https/8080/broker.example.com/api/SEMP/v2/monitor/msgVpns?count=1');

            expect(hooks.onConnected).toHaveBeenCalledWith(
                expect.objectContaining({ baseUrl: 'http://localhost:3000/https/8080/broker.example.com/api' }),
                { user: 'admin', pass: 'pw' }
            );
        });

        it('returned SempContext.fetch routes per-call requests through the gateway proxy path', async () => {
            // The whole reason for the path-only API: every per-call request
            // (including paginated follow-ups whose path comes from a
            // broker-emitted nextPageUri) goes through the same closure that
            // reassembles the gateway-prefixed URL. Broker-direct URLs never
            // reach fetch().
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({
                onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }),
            });
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg({ hosted: true }), 'broker-internal', 'pw');

            // Simulate a pagination follow-up: caller extracted pathname+search
            // from the broker's nextPageUri.
            await capturedFetch!('/SEMP/v2/monitor/msgVpns?cursor=abc');

            const calledUrl = (globalThis.fetch as any).mock.calls.at(-1)[0];
            expect(calledUrl).toBe('http://localhost:3000/https/8080/broker-internal/SEMP/v2/monitor/msgVpns?cursor=abc');
        });
    });
});
