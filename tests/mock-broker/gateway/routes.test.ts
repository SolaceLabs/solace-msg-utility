import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { installMockServer } from '../../../src/mock-broker/server';
import { resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { createManagedService } from '../../../src/core/services/managed-service';
import { createServiceSemp } from '../../../src/core/services/semp-client';
import { createUserMgmtService } from '../../../src/modules/user-management/service';
import { createConnMgmtService } from '../../../src/modules/connection-management/service';
import { createSettingsService } from '../../../src/modules/gateway-settings/service';
import { productSources, readSource } from '../../helpers/sources';
import { contractSeed, seedContractBrokers } from './helpers';

/**
 * Every gateway route the app calls, through the services that ship, answered
 * by the fake gateway the managed demo runs on. A service that changes a path,
 * a method or a body shape fails here before it fails in managed-demo.html.
 * The scan below keeps the table whole: a `/managed/<name>` the app source
 * names with no row fails.
 *
 * tests/mock-broker/gateway/contract.test.ts holds the fake to the real
 * gateway's answers; this suite holds the app's calls to the fake.
 */
let realFetch: typeof window.fetch;
let gw: ReturnType<typeof createGateway>;

beforeEach(() => {
    realFetch = window.fetch;
    resetScenario();
    scenario.latencyMs = 0;
    seedContractBrokers();
    gw = createGateway({ seed: contractSeed() });
    installMockServer({ passthrough: () => Promise.reject(new TypeError('refused')), routes: gw.route });
    gw.setCookie(gw.openSession('admin', false));
});

afterEach(() => {
    window.fetch = realFetch;
    setBrokers({});
});

const managed = createManagedService();
const users = createUserMgmtService();
const conns = createConnMgmtService();
const settings = createSettingsService();

/** What a row's call resolves to: the service's own result, or a flag. */
type Outcome = { ok: boolean };

/** One route, named by its `/managed/<name>` segment, and the app's call to it. */
const ROWS: { segment: string; route: string; call: () => Promise<Outcome> }[] = [
    { segment: 'me', route: 'GET /managed/me', call: () => managed.me() },
    { segment: 'dial', route: 'POST /managed/dial', call: () => managed.dial('b1', 'v1') },
    {
        segment: 'smf',
        route: 'the socket path a dial names, through the SDK\'s socket gate',
        call: async () => {
            const d = await managed.dial('b1', 'v1');
            if (!d.ok || !d.data.smfPath.startsWith('/managed/smf/')) return { ok: false };
            return gw.sockets.gate({ broker: 'b1', vpn: 'v1', vpnName: d.data.vpn, user: d.data.user, pass: d.data.pass }, () => {});
        },
    },
    {
        segment: 'relay',
        route: 'GET /managed/relay/{broker}/SEMP/v2/..., the SEMP client\'s connect probe',
        call: async () => {
            let connected = false;
            const semp = createServiceSemp({ onConnected: () => { connected = true; }, onDisconnected: () => {} });
            await semp.connect({ protocol: 'https', port: '', urlPath: '', user: '', relayBase: managed.relayBase('b1') }, 'b1', '');
            return { ok: connected };
        },
    },
    { segment: 'users', route: 'GET /managed/users', call: () => users.listUsers() },
    {
        segment: 'users',
        route: 'PUT /managed/users/{name}',
        call: () => users.saveUser({
            username: 'viewer', password: '', admin: false, operate: [], readOnly: [{ brokers: 'b1', msgVpns: '*', queues: '*' }], modules: null,
        }),
    },
    { segment: 'users', route: 'DELETE /managed/users/{name}', call: () => users.deleteUser('viewer') },
    { segment: 'connections', route: 'GET /managed/connections', call: () => conns.listConnections() },
    {
        segment: 'connections',
        route: 'PUT /managed/connections/{broker}, blank passwords kept',
        call: async () => {
            const list = await conns.listConnections();
            return list.ok ? conns.saveConnection(list.data.find(c => c.broker === 'b2')!) : list;
        },
    },
    { segment: 'connections', route: 'DELETE /managed/connections/{broker}', call: () => conns.deleteConnection('b3') },
    { segment: 'settings', route: 'GET /managed/settings', call: () => settings.load() },
    {
        segment: 'settings',
        route: 'PUT /managed/settings, the file as GET gave it',
        call: async () => {
            const view = await settings.load();
            return view.ok ? settings.save(view.data.settings) : view;
        },
    },
    { segment: 'logout', route: 'POST /managed/logout', call: () => managed.logout() },
];

describe('mock-broker/gateway -- the app\'s routes', () => {
    for (const row of ROWS) {
        it(`answers ${row.route}`, async () => {
            expect(await row.call()).toMatchObject({ ok: true });
        });
    }

    it('has a row for every /managed/ name the app source uses', () => {
        const named = new Set(productSources().flatMap(f => Array.from(readSource(f).matchAll(/\/managed\/([a-z]+)/g), m => m[1])));
        const covered = new Set(ROWS.map(r => r.segment));
        expect([...named].filter(n => !covered.has(n)), 'add a row that calls the new route through its service').toEqual([]);
        // A row whose route the app no longer names is stale: drop it.
        expect([...covered].filter(c => !named.has(c))).toEqual([]);
    });
});
