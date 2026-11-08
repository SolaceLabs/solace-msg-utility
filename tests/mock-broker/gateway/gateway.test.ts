import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGateway, DEMO_GATEWAY_MARKER } from '../../../src/mock-broker/gateway';
import { pathEscape } from '../../../src/mock-broker/gateway/router';
import { installMockServer } from '../../../src/mock-broker/server';
import { resetScenario, scenario } from '../../../src/mock-broker/fixtures';
import { createManagedService } from '../../../src/core/services/managed-service';
import { contractSeed } from './helpers';

/**
 * The fake gateway past the contract: how the page reaches it (the fetch
 * route and the cookie it holds), and what the contract cannot pin because
 * it depends on the control panel or on state the Go test does not set up.
 */
let realFetch: typeof window.fetch;
let gw: ReturnType<typeof createGateway>;

beforeEach(() => {
    realFetch = window.fetch;
    resetScenario();
    scenario.latencyMs = 0;
    gw = createGateway({ seed: contractSeed() });
    installMockServer({ passthrough: () => Promise.reject(new TypeError('refused')), routes: gw.route });
});

afterEach(() => {
    window.fetch = realFetch;
});

const call = (method: string, path: string, body?: unknown) =>
    gw.handle({ method, path, query: '', body: body === undefined ? '' : JSON.stringify(body), session: gw.openSession('admin', false) });

describe('mock-broker/gateway -- the page\'s fetch route', () => {
    it('answers the app\'s own service, with the page\'s cookie', async () => {
        const svc = createManagedService();
        expect(await svc.me()).toEqual({ ok: false, status: 401, code: 'unauthenticated', field: undefined, reason: undefined });

        gw.setCookie(gw.openSession('viewer', false));
        const me = await svc.me();
        expect(me.ok && me.data.username).toBe('viewer');
    });

    it('marks every answer, keeps it out of caches, and sends no body with a 204', async () => {
        gw.setCookie(gw.openSession('viewer', false));
        const res = await fetch('/managed/me');
        expect(res.headers.get('X-Demo-Gateway')).toBe(DEMO_GATEWAY_MARKER);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('Content-Type')).toBe('application/json');

        const out = await fetch('/managed/logout', { method: 'POST' });
        expect(out.status).toBe(204);
        expect(await out.text()).toBe('');
    });

    it('clears the cookie on logout, so the next call is signed out', async () => {
        gw.setCookie(gw.openSession('viewer', false));
        await fetch('/managed/logout', { method: 'POST' });
        expect(gw.cookie()).toBeNull();
        expect((await fetch('/managed/me')).status).toBe(401);
    });

    it('serves /hosted from the live settings', async () => {
        expect(await (await fetch('/hosted')).json()).toEqual({ hosted: true, connModes: 'both', defaultConn: 'direct' });

        gw.setCookie(gw.openSession('admin', false));
        await fetch('/managed/settings', { method: 'PUT', body: JSON.stringify({ connModes: 'provisioned', defaultConn: 'provisioned' }) });
        expect(await (await fetch('/hosted')).json()).toEqual({ hosted: true, connModes: 'provisioned', defaultConn: 'provisioned' });
    });

    it('leaves everything else to the next route', async () => {
        expect((await fetch('http:///https/1943/broker.solace.com/SEMP/v2/monitor/msgVpns')).status).toBe(200);
        await expect(fetch('https://example.com/elsewhere')).rejects.toThrow('refused');
    });
});

describe('mock-broker/gateway -- dial', () => {
    it('escapes the socket path as url.PathEscape does', () => {
        expect(pathEscape('b1')).toBe('b1');
        expect(pathEscape('a b/c;d,e?f')).toBe('a%20b%2Fc%3Bd%2Ce%3Ff');
        expect(pathEscape('k$&+:=@~')).toBe('k$&+:=@~');
        expect(pathEscape('caf\u00e9')).toBe('caf%C3%A9');
    });

    it('answers 429 with Retry-After while the panel holds the window shut', async () => {
        gw.faults.dialRateLimited = true;
        const res = await gw.handle({
            method: 'POST', path: '/managed/dial', query: '', body: '{"broker":"b1","vpn":"v1"}', session: gw.openSession('viewer', false),
        });
        expect(res).toEqual({ status: 429, json: { error: 'rate_limited' }, headers: { 'Retry-After': '60' } });
    });

    it('still answers not_found first, as the gateway checks entitlement before the window', async () => {
        gw.faults.dialRateLimited = true;
        const res = await gw.handle({
            method: 'POST', path: '/managed/dial', query: '', body: '{"broker":"b2","vpn":"v9"}', session: gw.openSession('viewer', false),
        });
        expect(res.status).toBe(404);
    });
});

describe('mock-broker/gateway -- admin routes', () => {
    it('signs out a deleted user on an admin route', async () => {
        const sid = gw.openSession('admin', false);
        gw.store.upsertUser({ username: 'other', admin: true, operate: [], readOnly: [], modules: null }, 'other-password-1');
        gw.store.deleteUser('admin');
        expect(await gw.handle({ method: 'GET', path: '/managed/users', query: '', body: '', session: sid }))
            .toEqual({ status: 401, json: { error: 'unauthenticated' } });
    });

    it('refuses a body of the wrong type, or not JSON at all', async () => {
        expect((await call('PUT', '/managed/users/x', { password: 1 })).status).toBe(400);
        expect((await call('PUT', '/managed/connections/b9', { semp: [] })).status).toBe(400);
        expect((await gw.handle({ method: 'PUT', path: '/managed/settings', query: '', body: '{', session: gw.openSession('admin', false) })).status).toBe(400);
        expect((await gw.handle({ method: 'POST', path: '/managed/dial', query: '', body: '', session: gw.openSession('admin', false) })).status).toBe(400);
    });

    it('matches a field name without regard to case, as encoding/json does', async () => {
        expect(await call('POST', '/managed/dial', { Broker: 'zz', VPN: 'v1' })).toEqual({ status: 404, json: { error: 'not_found' } });
        expect((await call('PUT', '/managed/settings', { LogLevel: 'debug', \u017fession: { IdleMinutes: 20 } })).status).toBe(200);
        expect([gw.settings.current().logLevel, gw.settings.current().session.idleMinutes]).toEqual(['debug', 20]);
        expect((await call('POST', '/managed/dial', { Brokers: 'b1' })).status).toBe(400);
    });

    it('refuses an empty name segment', async () => {
        expect(await call('DELETE', '/managed/users/')).toEqual({ status: 404, json: { error: 'not_found' } });
    });
});

describe('mock-broker/gateway -- settings', () => {
    it('saves an allow list that admits the client, masked as the gateway prints it', async () => {
        expect(await call('PUT', '/managed/settings', { access: { allow: [' 192.0.2.77/24 '] } })).toEqual({ status: 200, json: { restartRequired: [] } });
        expect(gw.settings.current().access.allow).toEqual(['192.0.2.0/24']);
    });

    it('reads a prefix as netip.ParsePrefix does: IPv6 masked and printed short, no leading zero in the bits', async () => {
        const list = ['192.0.2.0/24', '2001:0DB8:0:0:8:800:200C:417A/64', '2001:db8::1/32', 'fe80::1:0:0:1/128', '::/0'];
        expect((await call('PUT', '/managed/settings', { access: { allow: list } })).status).toBe(200);
        expect(gw.settings.current().access.allow).toEqual(['192.0.2.0/24', '2001:db8::/64', '2001:db8::/32', 'fe80::1:0:0:1/128', '::/0']);
        for (const [v, why] of [
            ['10.0.0.0/08', 'bad bits after slash: "08"'],
            ['10.0.0.0/+8', 'bad bits after slash: "+8"'],
            ['10.0.0.0/33', 'prefix length out of range'],
            ['2001:db8::/129', 'prefix length out of range'],
            ['2001:db8:/32', 'ParseAddr("2001:db8:"): unable to parse IP'],
            ['1:2:3:4:5:6:7::8/64', 'ParseAddr("1:2:3:4:5:6:7::8"): unable to parse IP'],
            ['1.2.3.4::/64', 'ParseAddr("1.2.3.4::"): unable to parse IP'],
        ]) {
            const res: any = (await call('PUT', '/managed/settings', { access: { trustedProxies: [v] } })).json;
            expect(res.reason).toBe(`key "access.trustedProxies[0]" has invalid value "${v}": want CIDR such as 10.0.0.0/8 or 192.0.2.7/32 (netip.ParsePrefix("${v}"): ${why})`);
        }
    });

    it('refuses a value that is not a CIDR, and an IPv4-mapped one', async () => {
        const bad: any = (await call('PUT', '/managed/settings', { access: { allow: ['192.0.2.7'] } })).json;
        expect(bad.reason).toMatch(/^key "access\.allow\[0\]" has invalid value "192\.0\.2\.7": want CIDR such as 10\.0\.0\.0\/8 or 192\.0\.2\.7\/32 \(/);
        const mapped: any = (await call('PUT', '/managed/settings', { access: { trustedProxies: ['::ffff:10.0.0.1/120'] } })).json;
        expect(mapped.reason).toBe('key "access.trustedProxies[0]" has invalid value "::ffff:10.0.0.1/120": use the IPv4 form');
    });

    it('treats null as no change, except that a null list empties it', async () => {
        await call('PUT', '/managed/settings', { access: { allow: ['192.0.2.0/24'] } });
        expect((await call('PUT', '/managed/settings', { logLevel: null, access: { allow: null } })).status).toBe(200);
        expect(gw.settings.current().logLevel).toBe('warn');
        expect(gw.settings.current().access.allow).toEqual([]);
    });

    it('normalises the modes, the log level and the module order', async () => {
        await call('PUT', '/managed/settings', { connModes: 'PROVISIONED', logLevel: 'DEBUG', modules: { offered: ['queue-copy', 'queue-browser'] } });
        const s = gw.settings.current();
        expect([s.connModes, s.logLevel, s.modules.offered]).toEqual(['provisioned', 'debug', ['queue-browser', 'queue-copy']]);
    });

    it('refuses connModes direct, which would end Provisioned mode and the console with it', async () => {
        const before = gw.settings.current().connModes;
        const res: any = await call('PUT', '/managed/settings', { connModes: 'direct' });
        expect(res.status).toBe(422);
        expect(res.json.field).toBe('connModes');
        expect(res.json.reason).toMatch(/set connModes: direct in config\.yaml on the gateway host and restart\.$/);
        expect(gw.settings.current().connModes).toBe(before);
    });

    it('reports a hand edit and refuses to save over it', async () => {
        gw.faults.changedOnDisk = true;
        expect(((await call('GET', '/managed/settings')).json as any).changedOnDisk).toBe(true);
        expect(await call('PUT', '/managed/settings', { logLevel: 'info' })).toEqual({ status: 409, json: { error: 'config_changed_on_disk' } });
    });

    it('answers 500 config_unreadable, with what to do, when the file cannot be read', async () => {
        gw.faults.unreadable = true;
        for (const res of [await call('GET', '/managed/settings'), await call('PUT', '/managed/settings', {})]) {
            expect(res.status).toBe(500);
            expect((res.json as any).error).toBe('config_unreadable');
            expect((res.json as any).reason).toMatch(/Fix the file on the gateway host, then reload this page\.$/);
        }
    });
});

describe('mock-broker/gateway -- sessions', () => {
    it('tells the listeners about a drop, never about an expiry', () => {
        const dropped: string[] = [];
        gw.sessions.onDrop((_id, s) => dropped.push(s.user));
        const a = gw.openSession('viewer', false);
        const b = gw.openSession('operator', false);

        gw.sessions.expire(a);
        expect(gw.sessions.get(a)).toBeNull();
        gw.sessions.dropUser('operator');
        expect(gw.sessions.get(b)).toBeNull();
        expect(dropped).toEqual(['operator']);
    });

    it('tells store listeners after each committed edit', () => {
        let changes = 0;
        gw.onStoreChange(() => changes++);
        gw.store.upsertUser({ username: 'x', admin: false, operate: [], readOnly: [], modules: null }, 'x-password-0001');
        gw.store.upsertUser({ username: 'y', admin: false, operate: [], readOnly: [], modules: null }, '');   // refused
        gw.store.deleteConnection('b2');
        expect(changes).toBe(2);
    });
});
