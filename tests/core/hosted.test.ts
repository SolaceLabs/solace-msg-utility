import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isHosted, setHosted, probeHosted, probeDeployment, buildBrokerUrl } from '../../src/core/hosted';
import { DEFAULT_CONN_CONFIG } from '../../src/core/connections/conn-modes';

// Reset the singleton between tests so a leftover flag from one test can't
// silently affect another. Mirrors the pattern used for the logger
// singleton in `tests/core/logger.test.ts`.
afterEach(() => {
    setHosted(false);
});

describe('core/hosted — isHosted / setHosted', () => {
    it('defaults to false at module load', () => {
        expect(isHosted()).toBe(false);
    });

    it('flips with setHosted', () => {
        setHosted(true);
        expect(isHosted()).toBe(true);
        setHosted(false);
        expect(isHosted()).toBe(false);
    });
});

describe('core/hosted — probeHosted', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns true for HTTP 200 with body "true"', async () => {
        (globalThis.fetch as any).mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
        await expect(probeHosted()).resolves.toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/hosted', expect.objectContaining({ method: 'GET' }));
    });

    it('is case-insensitive and tolerates surrounding whitespace', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('TRUE') });
        await expect(probeHosted()).resolves.toBe(true);

        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(' True \n') });
        await expect(probeHosted()).resolves.toBe(true);
    });

    it('returns false for HTTP 200 with body "false" or anything else', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('false') });
        await expect(probeHosted()).resolves.toBe(false);

        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });
        await expect(probeHosted()).resolves.toBe(false);

        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('<html>not-the-gateway</html>') });
        await expect(probeHosted()).resolves.toBe(false);
    });

    it('returns false for non-OK HTTP responses (e.g. 404 from a standalone PWA)', async () => {
        (globalThis.fetch as any).mockResolvedValue({ ok: false, text: () => Promise.resolve('true') });
        await expect(probeHosted()).resolves.toBe(false);
    });

    it('returns false when fetch throws (network error, blocked, etc.)', async () => {
        (globalThis.fetch as any).mockRejectedValue(new Error('Failed to fetch'));
        await expect(probeHosted()).resolves.toBe(false);
    });
});

describe('core/hosted — probeDeployment', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const ok = (body: string) => ({ ok: true, text: () => Promise.resolve(body) });

    it('parses the JSON contract into hosted + connection config', async () => {
        (globalThis.fetch as any).mockResolvedValue(ok(JSON.stringify({ hosted: true, connModes: 'both', defaultConn: 'managed' })));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: { connModes: 'both', defaultConn: 'managed' } });
    });

    it('coerces invalid config fields to the Direct-only default', async () => {
        (globalThis.fetch as any).mockResolvedValue(ok(JSON.stringify({ hosted: true, connModes: 'bogus', defaultConn: 42 })));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: DEFAULT_CONN_CONFIG });
    });

    it('treats legacy plaintext "true" as hosted with the Direct-only default (Managed needs the JSON contract)', async () => {
        (globalThis.fetch as any).mockResolvedValue(ok('true'));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: DEFAULT_CONN_CONFIG });
    });

    it('returns not-hosted (Direct only) for "false", empty body, non-OK, non-JSON, JSON without hosted:true, and throws', async () => {
        const notHosted = { hosted: false, conn: DEFAULT_CONN_CONFIG };

        (globalThis.fetch as any).mockResolvedValueOnce(ok('false'));
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        (globalThis.fetch as any).mockResolvedValueOnce(ok(''));
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('{"hosted":true}') });
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        (globalThis.fetch as any).mockResolvedValueOnce(ok('<html>not-the-gateway</html>'));
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        (globalThis.fetch as any).mockResolvedValueOnce(ok(JSON.stringify({ hosted: false, connModes: 'both' })));
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        (globalThis.fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));
        await expect(probeDeployment()).resolves.toEqual(notHosted);
    });
});

describe('core/hosted — buildBrokerUrl', () => {
    describe('direct mode (default)', () => {
        it('builds the original ${scheme}://${host}:${port}${urlPath} shape', () => {
            expect(buildBrokerUrl('wss', 'broker.test', '8080', '/solace', true))
                .toBe('wss://broker.test:8080/solace');
            expect(buildBrokerUrl('https', 'broker.test', 1943, '/api', false))
                .toBe('https://broker.test:1943/api');
        });

        it('omits the path when blank, and normalises a missing leading slash', () => {
            expect(buildBrokerUrl('wss', 'broker.test', '8080', '', true))
                .toBe('wss://broker.test:8080');
            expect(buildBrokerUrl('wss', 'broker.test', '8080', 'solace', true))
                .toBe('wss://broker.test:8080/solace');
        });
    });

    describe('hosted mode', () => {
        // jsdom's default window.location is http://localhost/, so the
        // wire-scheme branches default to ws / http. The https/wss branches
        // are exercised by overriding location below.
        beforeEach(() => {
            setHosted(true);
        });

        it('rewrites to {pageOrigin}/{scheme}/{port}/{host}{urlPath} for WebSocket on an http page (plain ws)', () => {
            expect(buildBrokerUrl('wss', 'broker.example.com', '8443', '/path', true))
                .toBe('ws://localhost:3000/wss/8443/broker.example.com/path');
            expect(buildBrokerUrl('ws', 'broker.example.com', '8443', '', true))
                .toBe('ws://localhost:3000/ws/8443/broker.example.com');
        });

        it('rewrites to plain http for SEMP on an http page', () => {
            expect(buildBrokerUrl('https', 'broker.example.com', '1943', '/api', false))
                .toBe('http://localhost:3000/https/1943/broker.example.com/api');
            expect(buildBrokerUrl('http', 'broker.example.com', '80', '', false))
                .toBe('http://localhost:3000/http/80/broker.example.com');
        });

        describe('with secure page (https)', () => {
            let originalLocation: Location;
            beforeEach(() => {
                // jsdom rejects `window.location = …` reassignment; override the
                // property via defineProperty and restore after the test so the
                // override doesn't leak into other suites.
                originalLocation = window.location;
                Object.defineProperty(window, 'location', {
                    value: { protocol: 'https:', host: 'gateway:9443' },
                    writable: true,
                    configurable: true,
                });
            });
            afterEach(() => {
                Object.defineProperty(window, 'location', {
                    value: originalLocation,
                    writable: true,
                    configurable: true,
                });
            });

            it('upgrades the wire scheme to wss for WebSocket connections', () => {
                expect(buildBrokerUrl('wss', 'broker.example.com', '8443', '/path', true))
                    .toBe('wss://gateway:9443/wss/8443/broker.example.com/path');
            });

            it('upgrades the wire scheme to https for SEMP HTTP requests', () => {
                expect(buildBrokerUrl('https', 'broker.example.com', '1943', '/api', false))
                    .toBe('https://gateway:9443/https/1943/broker.example.com/api');
            });
        });
    });
});
