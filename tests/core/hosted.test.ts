import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    isHostedDeployment, probeDeployment, buildBrokerUrl, gatewayWsUrl,
    plainSchemesUsable, usableScheme, limitSchemeOptions,
} from '../../src/core/hosted';
import { DEFAULT_CONN_CONFIG } from '../../src/core/connections/conn-modes';
import { HOSTED_PROBE_TIMEOUT_MS } from '../../src/core/timing';
import { loadModuleDOM } from '../helpers/loadModuleDOM';

// The /hosted verdict has one home, AppState.connConfig.hosted: this file
// holds no state, and every reader passes the verdict in.
describe('core/hosted -- isHostedDeployment', () => {
    it('reads the published verdict, false before the probe has answered', () => {
        expect(isHostedDeployment({})).toBe(false);
        expect(isHostedDeployment({ connConfig: { ...DEFAULT_CONN_CONFIG, hosted: false } })).toBe(false);
        expect(isHostedDeployment({ connConfig: { ...DEFAULT_CONN_CONFIG, hosted: true } })).toBe(true);
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
    const notHosted = { hosted: false, conn: DEFAULT_CONN_CONFIG };

    it('parses the JSON contract into hosted + connection config', async () => {
        (globalThis.fetch as any).mockResolvedValue(ok(JSON.stringify({ hosted: true, connModes: 'both', defaultConn: 'provisioned' })));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: { connModes: 'both', defaultConn: 'provisioned' } });
        expect(globalThis.fetch).toHaveBeenCalledWith('/hosted', { method: 'GET', cache: 'no-store' });
    });

    it('coerces invalid config fields to the Direct-only default', async () => {
        (globalThis.fetch as any).mockResolvedValue(ok(JSON.stringify({ hosted: true, connModes: 'bogus', defaultConn: 42 })));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: DEFAULT_CONN_CONFIG });
    });

    it('treats legacy plaintext "true" as hosted with the Direct-only default (Managed needs the JSON contract)', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce(ok('true'));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: DEFAULT_CONN_CONFIG });
        // Case-insensitive, surrounding whitespace tolerated.
        (globalThis.fetch as any).mockResolvedValueOnce(ok(' True \n'));
        await expect(probeDeployment()).resolves.toEqual({ hosted: true, conn: DEFAULT_CONN_CONFIG });
    });

    it('an ordinary no-gateway answer ("false", empty, non-OK, hosted:false) is Direct only, logged at info', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => { });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

        (globalThis.fetch as any).mockResolvedValueOnce(ok('false'));
        await expect(probeDeployment()).resolves.toEqual(notHosted);
        (globalThis.fetch as any).mockResolvedValueOnce(ok(''));
        await expect(probeDeployment()).resolves.toEqual(notHosted);
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('{"hosted":true}') });
        await expect(probeDeployment()).resolves.toEqual(notHosted);
        (globalThis.fetch as any).mockResolvedValueOnce(ok(JSON.stringify({ hosted: false, connModes: 'both' })));
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        expect(info.mock.calls.map(c => c[0])).toEqual([
            '[hosted] /hosted answered "false": not hosted, Direct only',
            '[hosted] /hosted answered "": not hosted, Direct only',
            '[hosted] /hosted answered HTTP 404: no gateway, Direct only',
            '[hosted] /hosted answered hosted:false: Direct only',
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('an answer that looks broken (not JSON, a network error) is Direct only, with a warn saying why', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const cause = new Error('Failed to fetch');

        (globalThis.fetch as any).mockResolvedValueOnce(ok('<html>not-the-gateway</html>'));
        await expect(probeDeployment()).resolves.toEqual(notHosted);
        (globalThis.fetch as any).mockRejectedValueOnce(cause);
        await expect(probeDeployment()).resolves.toEqual(notHosted);

        expect(warn.mock.calls[0][0]).toBe('[hosted] /hosted answered neither JSON nor true/false; treating the page as not hosted (Direct only). Body starts: <html>not-the-gateway</html>');
        expect(warn.mock.calls[1]).toEqual(['[hosted] /hosted probe failed (network error or no answer in time); treating the page as not hosted (Direct only):', cause]);
    });

    it('a /hosted that never answers resolves Direct only after HOSTED_PROBE_TIMEOUT_MS, so the app still renders', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.useFakeTimers();
        (globalThis.fetch as any).mockImplementation(() => new Promise(() => { }));

        const probe = probeDeployment();
        await vi.advanceTimersByTimeAsync(HOSTED_PROBE_TIMEOUT_MS);

        await expect(probe).resolves.toEqual(notHosted);
        expect(warn.mock.calls[0][1]).toMatchObject({ name: 'TimeoutError' });
    });
});

describe('core/hosted — buildBrokerUrl', () => {
    describe('direct mode (not hosted)', () => {
        it('builds the original ${scheme}://${host}:${port}${urlPath} shape', () => {
            expect(buildBrokerUrl('wss', 'broker.test', '8080', '/solace', true, false))
                .toBe('wss://broker.test:8080/solace');
            expect(buildBrokerUrl('https', 'broker.test', 1943, '/api', false, false))
                .toBe('https://broker.test:1943/api');
        });

        it('omits the path when blank, and normalises a missing leading slash', () => {
            expect(buildBrokerUrl('wss', 'broker.test', '8080', '', true, false))
                .toBe('wss://broker.test:8080');
            expect(buildBrokerUrl('wss', 'broker.test', '8080', 'solace', true, false))
                .toBe('wss://broker.test:8080/solace');
        });
    });

    describe('hosted mode', () => {
        // jsdom's default window.location is http://localhost/, so the
        // wire-scheme branches default to ws / http. The https/wss branches
        // are exercised by overriding location below.
        it('rewrites to {pageOrigin}/{scheme}/{port}/{host}{urlPath} for WebSocket on an http page (plain ws)', () => {
            expect(buildBrokerUrl('wss', 'broker.example.com', '8443', '/path', true, true))
                .toBe('ws://localhost:3000/wss/8443/broker.example.com/path');
            expect(buildBrokerUrl('ws', 'broker.example.com', '8443', '', true, true))
                .toBe('ws://localhost:3000/ws/8443/broker.example.com');
        });

        it('rewrites to plain http for SEMP on an http page', () => {
            expect(buildBrokerUrl('https', 'broker.example.com', '1943', '/api', false, true))
                .toBe('http://localhost:3000/https/1943/broker.example.com/api');
            expect(buildBrokerUrl('http', 'broker.example.com', '80', '', false, true))
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
                expect(buildBrokerUrl('wss', 'broker.example.com', '8443', '/path', true, true))
                    .toBe('wss://gateway:9443/wss/8443/broker.example.com/path');
            });

            it('upgrades the wire scheme to https for SEMP HTTP requests', () => {
                expect(buildBrokerUrl('https', 'broker.example.com', '1943', '/api', false, true))
                    .toBe('https://gateway:9443/https/1943/broker.example.com/api');
            });

            it('gatewayWsUrl is a wss URL on the page host', () => {
                expect(gatewayWsUrl('/managed/smf/b1/v1')).toBe('wss://gateway:9443/managed/smf/b1/v1');
            });
        });
    });
});

// A managed SMF socket is a gateway path on the page's own origin, so the
// gateway's Origin check sees itself.
describe('core/hosted -- gatewayWsUrl', () => {
    it('is plain ws on an http page', () => {
        // jsdom's default location is http://localhost:3000/.
        expect(gatewayWsUrl('/managed/smf/b1/v1')).toBe('ws://localhost:3000/managed/smf/b1/v1');
    });
});

// A browser blocks an https page's ws:// and http:// requests (mixed content),
// so without the gateway the plain schemes are hidden there; hosted, the
// gateway makes the plain hop to the broker and all four stay. The selects are
// the connections template's own: Messaging (whose http/https are disabled
// placeholders) and SEMP.
describe('core/hosted -- plain schemes', () => {
    let originalLocation: Location;
    beforeEach(() => {
        originalLocation = window.location;
    });
    afterEach(() => {
        Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
    });
    function servedOver(protocol: string): void {
        Object.defineProperty(window, 'location', {
            value: { protocol, host: 'app.example', origin: `${protocol}//app.example` },
            writable: true,
            configurable: true,
        });
    }
    function selects(sol: string, semp: string): { sol: HTMLSelectElement; semp: HTMLSelectElement } {
        const dom = loadModuleDOM('connections');
        const solSel = dom.querySelector<HTMLSelectElement>('#solace-protocol')!;
        const sempSel = dom.querySelector<HTMLSelectElement>('#semp-protocol')!;
        solSel.value = sol;
        sempSel.value = semp;
        return { sol: solSel, semp: sempSel };
    }
    const option = (sel: HTMLSelectElement, value: string) => sel.querySelector<HTMLOptionElement>(`option[value="${value}"]`)!;

    it.each(['http:', 'file:'])('keeps every scheme on a %s page without the gateway', (protocol) => {
        servedOver(protocol);
        const { sol, semp } = selects('ws', 'http');
        limitSchemeOptions(sol, false);
        limitSchemeOptions(semp, false);

        expect(plainSchemesUsable(false)).toBe(true);
        expect(usableScheme('ws', false)).toBe('ws');
        expect([sol.value, semp.value]).toEqual(['ws', 'http']);
        expect(option(sol, 'ws').hidden || option(sol, 'ws').disabled).toBe(false);
        expect(option(semp, 'http').hidden || option(semp, 'http').disabled).toBe(false);
        expect(option(sol, 'http').disabled).toBe(true); // the template's placeholder stays as it is
    });

    it('hides ws and http on an https page without the gateway and moves a selected one to TLS', () => {
        servedOver('https:');
        const { sol, semp } = selects('ws', 'http');
        // No verdict passed is Direct (queue-copy's destination form calls it so).
        limitSchemeOptions(sol);
        limitSchemeOptions(semp, false);

        expect(plainSchemesUsable(false)).toBe(false);
        expect([usableScheme('ws', false), usableScheme('http', false), usableScheme('wss', false), usableScheme('https', false)])
            .toEqual(['wss', 'https', 'wss', 'https']);
        expect([sol.value, semp.value]).toEqual(['wss', 'https']);
        for (const [sel, value] of [[sol, 'ws'], [sol, 'http'], [semp, 'http']] as const) {
            expect(option(sel, value).hidden && option(sel, value).disabled).toBe(true);
        }
        expect(option(sol, 'wss').hidden || option(sol, 'wss').disabled).toBe(false);
        expect(option(semp, 'https').hidden || option(semp, 'https').disabled).toBe(false);
    });

    it('keeps every scheme on an https page behind the gateway', () => {
        servedOver('https:');
        const { sol, semp } = selects('ws', 'http');
        limitSchemeOptions(sol, true);
        limitSchemeOptions(semp, true);

        expect(plainSchemesUsable(true)).toBe(true);
        expect(usableScheme('http', true)).toBe('http');
        expect([sol.value, semp.value]).toEqual(['ws', 'http']);
        expect(option(sol, 'ws').hidden || option(sol, 'ws').disabled).toBe(false);
    });
});
