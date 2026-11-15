import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot, SNAPSHOT_KEY } from '../../src/mock-broker/boot.managed';
import { RESTART_PAUSE_MS } from '../../src/mock-broker/gateway';
import { TLS_READ_ONLY_ID } from '../../src/mock-broker/controls/managed';
import { resetScenario, scenario, setBrokers } from '../../src/mock-broker/fixtures';
import { setSocketGate } from '../../src/mock-broker/sdk/session';
import { START_CERTIFICATE_BYTES } from '../../src/mock-broker/gateway/tls';
import { createHash } from 'node:crypto';

/**
 * The managed demo's certificate and restart flow, end to end through the
 * page's own `fetch`: an administrator replaces the gateway certificate, adds
 * and deletes a trusted CA, flips the Demo controls' "TLS files" switch to
 * read-only and back, and restarts the gateway, after which the session is
 * gone, the page returns to the sign-in and what was changed is still there.
 * The fake's routes are covered one by one in tests/mock-broker/gateway/tls.test.ts
 * and restart.test.ts; this one proves the boot, the panel and the gateway
 * agree on a whole session. The PEM is made up and the key a throwaway string.
 */
let realFetch: typeof window.fetch;
let reloads: number;
let demos: ReturnType<typeof boot>[];
const saved = { WebSocket: window.WebSocket, EventSource: (window as any).EventSource, open: XMLHttpRequest.prototype.open };

beforeEach(() => {
    realFetch = window.fetch;
    document.body.innerHTML = '';
    sessionStorage.clear();
    resetScenario();
    reloads = 0;
    demos = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
    vi.useRealTimers();
    demos.forEach(d => d.dispose());
    window.fetch = realFetch;
    delete (window as any).solace;
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: saved.WebSocket });
    Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: saved.EventSource });
    XMLHttpRequest.prototype.open = saved.open;
    delete (navigator as any).sendBeacon;
    setSocketGate(null);
    setBrokers({});
    vi.restoreAllMocks();
});

const start = () => {
    const demo = boot({ reload: () => { reloads++; } });
    demos.push(demo);
    scenario.latencyMs = 0;
    return demo;
};
const layerTitle = () => document.querySelector('.mgw-page h1')?.textContent ?? null;
const panelButton = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('#mock-controls .mockctl-btn')).find(b => b.textContent === label)!;

const pem = (label: string, bytes: string) => `-----BEGIN ${label}-----\n${btoa(bytes)}\n-----END ${label}-----\n`;
const fp = (bytes: string) => createHash('sha256').update(bytes).digest('hex').toUpperCase().replace(/(..)(?!$)/g, '$1:');
const PAIR = { certificate: pem('CERTIFICATE', 'replacement certificate bytes'), key: pem('PRIVATE KEY', 'throwaway test key, not a key') };

const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, json: res.status === 204 ? null : await res.json() };
};
const names = (tls: { trust: { name: string }[] }) => tls.trust.map(f => f.name);

describe('managed demo -- certificates and restart', () => {
    it('replaces the certificate, adds and deletes a CA, flips the read-only switch and restarts', async () => {
        start();
        panelButton('Sign in as admin').click();
        const signedIn = reloads;

        // The gateway starts with its own certificate, both flags true and no CA.
        const first = (await api('GET', '/managed/tls')).json;
        expect([first.certificate.sha256, first.certificateWritable, first.trustWritable, first.trust])
            .toEqual([fp(START_CERTIFICATE_BYTES), true, true, []]);

        // A new certificate applies at once.
        expect((await api('POST', '/managed/tls/certificate/check', PAIR)).status).toBe(200);
        expect((await api('PUT', '/managed/tls/certificate', PAIR)).status).toBe(200);
        expect((await api('GET', '/managed/tls')).json.certificate.sha256).toBe(fp('replacement certificate bytes'));

        // CA files are added and deleted, listed by name.
        const ca = (bytes: string) => pem('CERTIFICATE', bytes);
        expect(names((await api('POST', '/managed/tls/trust', { name: 'broker-ca.crt', certificate: ca('broker ca') })).json)).toEqual(['broker-ca.crt']);
        expect(names((await api('POST', '/managed/tls/trust', { name: 'lab-ca.pem', certificate: ca('lab ca') })).json)).toEqual(['broker-ca.crt', 'lab-ca.pem']);
        expect(names((await api('DELETE', '/managed/tls/trust/broker-ca.crt')).json)).toEqual(['lab-ca.pem']);

        // The Demo controls' switch: read-only refuses the writes and keeps the files; the check still works.
        const sw = document.getElementById(TLS_READ_ONLY_ID) as HTMLSelectElement;
        sw.value = 'readonly';
        sw.dispatchEvent(new Event('change'));
        const locked = (await api('GET', '/managed/tls')).json;
        expect([locked.certificateWritable, locked.trustWritable]).toEqual([false, false]);
        const refused = { status: 409, json: { error: 'tls_read_only' } };
        expect(await api('PUT', '/managed/tls/certificate', PAIR)).toEqual(refused);
        expect(await api('POST', '/managed/tls/trust', { name: 'x.crt', certificate: ca('x') })).toEqual(refused);
        expect(await api('DELETE', '/managed/tls/trust/lab-ca.pem')).toEqual(refused);
        expect((await api('POST', '/managed/tls/certificate/check', PAIR)).status).toBe(200);
        expect(names((await api('GET', '/managed/tls')).json)).toEqual(['lab-ca.pem']);
        sw.value = 'writable';
        sw.dispatchEvent(new Event('change'));
        expect((await api('GET', '/managed/tls')).json.trustWritable).toBe(true);

        // A restart: 202, the gateway is unreachable for a moment, then the page lands on the sign-in.
        expect(await api('POST', '/managed/restart')).toEqual({ status: 202, json: { restarting: true } });
        await expect(fetch('/hosted')).rejects.toThrow(TypeError);
        expect(reloads).toBe(signedIn);
        await vi.advanceTimersByTimeAsync(RESTART_PAUSE_MS);
        expect(reloads).toBe(signedIn + 1);
        const snap = JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY)!);
        expect([snap.page, snap.gateway.cookie, snap.gateway.sessions]).toEqual(['login', null, []]);

        // The reload: signed out, and the certificate and the CA list are still the changed ones.
        document.body.innerHTML = '';
        resetScenario();
        const demo = start();
        expect(layerTitle()).toBe('Sign in');
        expect((await api('GET', '/managed/tls')).status).toBe(401);
        panelButton('Sign in as admin').click();
        expect(demo.gateway.session()).toEqual({ user: 'admin', mustChange: false });
        const after = (await api('GET', '/managed/tls')).json;
        expect([after.certificate.sha256, names(after)]).toEqual([fp('replacement certificate bytes'), ['lab-ca.pem']]);
    });
});
