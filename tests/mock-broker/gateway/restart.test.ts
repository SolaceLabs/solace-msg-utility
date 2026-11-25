import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway, RESTART_PAUSE_MS } from '../../../src/mock-broker/gateway';
import { installMockServer } from '../../../src/mock-broker/server';
import { resetScenario, scenario } from '../../../src/mock-broker/fixtures';
import { contractSeed } from './helpers';
import { mockCode, stepOf } from '../../../src/mock-broker/gateway/authenticator';

/**
 * The fake gateway's restart (POST /managed/restart): the in-place restart of
 * go-web-proxy, as the demo shows it. Also the settings file without the TLS
 * paths, which are environment variables, with no restart bookkeeping, and
 * tls.insecureSkipVerify, which applies at once.
 */
let realFetch: typeof window.fetch;
let gw: ReturnType<typeof createGateway>;

beforeEach(() => {
    realFetch = window.fetch;
    resetScenario();
    scenario.latencyMs = 0;
    gw = createGateway({ seed: contractSeed() });
});

afterEach(() => {
    window.fetch = realFetch;
    vi.useRealTimers();
});

const call = (method: string, path: string, body?: unknown, who = 'admin') => gw.handle({
    method, path, query: '', body: body === undefined ? '' : JSON.stringify(body), session: who === '' ? null : gw.openSession(who, false),
});
const putSettings = (patch: object) => call('PUT', '/managed/settings', { ...patch, rev: gw.settings.rev() });
const view = async () => (await call('GET', '/managed/settings')).json as any;

describe('mock-broker/gateway -- restart', () => {
    it('answers 202 restarting to an administrator', async () => {
        expect(await call('POST', '/managed/restart')).toEqual({ status: 202, json: { restarting: true } });
    });

    it('is for administrators: no session is 401 and a user without the flag is 403, and nothing ends', async () => {
        const viewer = gw.openSession('viewer', false);
        expect((await call('POST', '/managed/restart', undefined, '')).status).toBe(401);
        expect(await gw.handle({ method: 'POST', path: '/managed/restart', query: '', body: '', session: viewer })).toEqual({ status: 403, json: { error: 'forbidden' } });
        expect(gw.sessions.get(viewer)).not.toBeNull();
    });

    it('ends every session and the half-finished sign-in, and signs the page out', async () => {
        const a = gw.openSession('admin', false);
        const b = gw.openSession('viewer', false);
        gw.setCookie(a);
        gw.settings.save({ login: { twoFactor: 'mandatory' } }, gw.settings.rev());
        const admin = contractSeed()['msg-utility-users'].find(u => u.username === 'admin')!;
        expect(gw.signIn(admin.username, admin.password)).toEqual({ ok: true, step: 'enrol' });
        expect(gw.ticket()).not.toBeNull();
        const c = gw.openSession('admin', false);
        const gone = gw.openSession('operator', false);
        gw.sessions.expire(gone);   // gone already: no drop to report
        const dropped: string[] = [];
        gw.sessions.onDrop((_id, s) => dropped.push(s.user));

        expect((await gw.handle({ method: 'POST', path: '/managed/restart', query: '', body: '', session: c })).status).toBe(202);
        expect([gw.sessions.get(a), gw.sessions.get(b), gw.sessions.get(c)]).toEqual([null, null, null]);
        expect(dropped.sort()).toEqual(['admin', 'viewer']);
        expect([gw.ticket(), gw.cookie(), gw.session()]).toEqual([null, null, null]);
        expect(gw.tickets.dump()).toEqual([]);
    });

    it('starts the sign-in lockouts and the code-replay record empty, as a new process does', async () => {
        const users = contractSeed()['msg-utility-users'];
        const pw = (name: string) => users.find(u => u.username === name)!.password;
        gw.settings.save({ login: { twoFactor: 'mandatory' } }, gw.settings.rev());
        expect(gw.signIn('operator', pw('operator'))).toEqual({ ok: true, step: 'enrol' });
        const secret = gw.ticket()!.secret;
        const code = mockCode(secret, stepOf(Date.now()));
        expect(gw.confirmTwoFactor(code).ok).toBe(true);
        for (let i = 0; i < 5; i++) gw.throttle.failed('viewer');
        expect(gw.signIn('viewer', pw('viewer'))).toMatchObject({ ok: false });

        expect((await call('POST', '/managed/restart')).status).toBe(202);
        expect(gw.throttle.dump()).toEqual({ users: [], client: null });
        expect(gw.snapshot().lastSteps).toEqual([]);
        // The code that confirmed is no longer a replay, and the locked account signs in.
        expect(gw.signIn('operator', pw('operator'))).toEqual({ ok: true, step: 'code' });
        expect(gw.submitCode(code)).toMatchObject({ ok: true });
        expect(gw.signIn('viewer', pw('viewer'))).toMatchObject({ ok: true });
    });

    it('starts the request budget and the connect windows empty, as a new process does', async () => {
        await putSettings({ session: { connectsPerMinute: 1 }, login: { unauthenticatedPerMinute: 1 } });
        const dial = () => call('POST', '/managed/dial', { broker: 'b1', vpn: 'v1' }, 'viewer');
        const anonymous = () => call('GET', '/managed/me', undefined, '');
        expect([(await dial()).status, (await dial()).status]).toEqual([200, 429]);
        expect([(await anonymous()).status, (await anonymous()).status]).toEqual([401, 429]);

        expect((await call('POST', '/managed/restart')).status).toBe(202);
        expect((await dial()).status).toBe(200);
        expect((await anonymous()).status).toBe(401);
    });

    describe('the pause before the gateway is back', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            installMockServer({ passthrough: () => Promise.reject(new TypeError('refused')), routes: gw.route });
            gw.setCookie(gw.openSession('admin', false));
        });

        it('refuses connections for RESTART_PAUSE_MS, then answers again and tells the listeners once', async () => {
            const back: string[] = [];
            gw.onRestart(() => back.push('back'));
            expect((await fetch('/managed/restart', { method: 'POST' })).status).toBe(202);
            expect(gw.cookie()).toBeNull();

            await expect(fetch('/hosted')).rejects.toThrow(TypeError);
            await expect(fetch('/managed/me')).rejects.toThrow(TypeError);
            await vi.advanceTimersByTimeAsync(RESTART_PAUSE_MS - 1);
            await expect(fetch('/hosted')).rejects.toThrow(TypeError);
            expect(back).toEqual([]);

            await vi.advanceTimersByTimeAsync(1);
            expect(back).toEqual(['back']);
            expect((await fetch('/hosted')).status).toBe(200);
            expect((await fetch('/managed/me')).status).toBe(401);   // the old session is gone
        });

        it('has the gateway answering by the time a listener runs', async () => {
            let status = 0;
            gw.onRestart(() => { void fetch('/hosted').then(r => { status = r.status; }); });
            await fetch('/managed/restart', { method: 'POST' });
            await vi.advanceTimersByTimeAsync(RESTART_PAUSE_MS);
            expect(status).toBe(200);
        });
    });
});

describe('mock-broker/gateway -- settings without the TLS paths', () => {
    const LEGACY = { certFile: '/old/tls.crt', keyFile: '/old/tls.key', trustDir: '/old/trust', insecureSkipVerify: true };

    it('shows the two tls keys, and neither a host-only nor a restart-only list', async () => {
        const v = await view();
        expect(v.settings.tls).toEqual({ insecureSkipVerify: false, standardRoots: true });
        expect(Object.keys(v).sort()).toEqual(['catalog', 'changedOnDisk', 'rev', 'settings']);
    });

    it('applies tls.insecureSkipVerify on a save, and answers the new rev alone', async () => {
        const res = await putSettings({ tls: { insecureSkipVerify: true } });
        expect(res).toEqual({ status: 200, json: { rev: '2' } });
        expect(gw.settings.current().tls.insecureSkipVerify).toBe(true);
    });

    it.each(['certFile', 'keyFile', 'trustDir'])('refuses a save that names tls.%s, as it does any unknown key', async key => {
        const res = await putSettings({ tls: { [key]: '/elsewhere' } });
        expect(res).toEqual({ status: 400, json: { error: 'bad_request' } });
        expect(gw.settings.rev()).toBe('1');
    });

    it('reads a seed that still holds the paths and drops them', async () => {
        const seed = contractSeed();
        (seed.settings as { tls: object }).tls = { ...LEGACY };
        const old = createGateway({ seed });
        expect(old.settings.current().tls).toEqual({ insecureSkipVerify: true, standardRoots: true });
        expect(old.settings.dump().tls).toEqual({ insecureSkipVerify: true, standardRoots: true });
    });

    it('drops the TLS paths a restored snapshot holds', () => {
        const snap = JSON.parse(JSON.stringify(gw.snapshot()));
        snap.settings.tls = { ...LEGACY };
        const again = createGateway({ seed: contractSeed() });
        again.restore(snap);
        expect(again.settings.current().tls).toEqual({ insecureSkipVerify: true, standardRoots: true });
        expect(again.snapshot().settings.tls).toEqual({ insecureSkipVerify: true, standardRoots: true });
    });
});
