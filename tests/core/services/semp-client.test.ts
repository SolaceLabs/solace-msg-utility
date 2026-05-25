import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServiceSemp, type SempConnectionHooks } from '../../../src/core/services/semp-client';
import { setHosted } from '../../../src/core/hosted';
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

        it('fires onError for the synthetic untrust.com Certificate trip', async () => {
            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'untrust.com', 'pw');

            expect(hooks.onError).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('Certificate'),
                // "Certificate Not Trusted (Mock)" doesn't match Failed to fetch / NetworkError
                isNetworkError: false,
            }));
        });

        it('handles non-ASCII credentials and encodes them correctly in the Authorization header (UTF-8 base64)', async () => {
            // Historical ledger 5.6: btoa was failing on non-ASCII because it
            // requires Latin-1 input. The fix encodes the credentials as UTF-8
            // first then base64-wraps the bytes. The test must verify the
            // round-trip — not just that connect resolves — because a
            // regression that drops the UTF-8 encode (e.g. reverting to plain
            // `btoa(${user}:${pass})`) would still resolve fine but produce a
            // malformed header the broker would reject.
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            const service = createServiceSemp(makeHooks());
            await service.connect(baseCfg({ user: 'user' }), 'broker.test', 'pässwörd€');

            const call = (globalThis.fetch as any).mock.calls.at(-1);
            const authHeader = call[1].headers.Authorization;
            expect(authHeader).toMatch(/^Basic /);

            // UTF-8 round-trip: atob the base64 portion, treat each char-code
            // as a byte, then TextDecoder('utf-8') back to a string.
            const decoded = new TextDecoder().decode(
                Uint8Array.from(atob(authHeader.slice(6)), (c) => c.charCodeAt(0)),
            );
            expect(decoded).toBe('user:pässwörd€');
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

    // Hosted mode routes the validation fetch through the gateway proxy
    // path and passes the gateway-prefixed baseUrl into onConnected.
    describe('hosted mode', () => {
        afterEach(() => {
            setHosted(false);
        });

        it('fetches the gateway-prefixed validation URL and exposes the same prefix as baseUrl', async () => {
            setHosted(true);
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            const hooks = makeHooks();
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg({ urlPath: '/api' }), 'broker.example.com', 'pw');

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
            setHosted(true);
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            let capturedFetch: ((path: string, opts?: RequestInit) => Promise<Response>) | null = null;
            const hooks = makeHooks({
                onConnected: vi.fn((sempCtx) => { capturedFetch = sempCtx.fetch; }),
            });
            const service = createServiceSemp(hooks);
            await service.connect(baseCfg(), 'broker-internal', 'pw');

            // Simulate a pagination follow-up: caller extracted pathname+search
            // from the broker's nextPageUri.
            await capturedFetch!('/SEMP/v2/monitor/msgVpns?cursor=abc');

            const calledUrl = (globalThis.fetch as any).mock.calls.at(-1)[0];
            expect(calledUrl).toBe('http://localhost:3000/https/8080/broker-internal/SEMP/v2/monitor/msgVpns?cursor=abc');
        });
    });
});
