import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { installMockServer } from '../../../src/mock-broker/server';
import { resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { createManagedService } from '../../../src/core/services/managed-service';
import { createServiceSemp } from '../../../src/core/services/semp-client';
import { createUserMgmtService } from '../../../src/modules/user-management/service';
import { createConnMgmtService } from '../../../src/modules/connection-management/service';
import { createSettingsService } from '../../../src/modules/gateway-settings/service';
import { createBackupService } from '../../../src/modules/backup/service';
import { productSources, readSource } from '../../helpers/sources';
import { contractSeed, seedContractBrokers } from './helpers';

/**
 * Every gateway route the app calls, through the services that ship, answered
 * by the fake gateway the managed demo runs on. A service that changes a path,
 * a method or a body shape fails here before it fails in provisioned-demo.html.
 * The scan below keeps the table whole: it reads each route's method and path
 * template off the service helpers, and a route with no row, or a row for a
 * route no helper calls, fails with the key named.
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
    gw = createGateway({ seed: contractSeed(), backupIter: 1000 });
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
const backup = createBackupService();
const PASS = 'a long passphrase';
const DAILY = { kind: 'daily' as const, minute: 0, hour: 2, weekday: 0, day: 0, keep: 7, passphrase: PASS };
/** A backup of the fake gateway as it stands, as the page exports one. */
const exported = async () => {
    const res = await backup.exportFile(PASS);
    if (!res.ok) throw new Error(res.code);
    return { file: res.data.content };
};

/** A route key with every `{name}` or `${expr}` path parameter as `{}`. */
const norm = (key: string) => key.replace(/\$?\{[^}]*\}/g, '{}');

/**
 * The route keys one source file calls: `managedRequest('METHOD', path)` with
 * a literal or a path helper (`const x = (id: string) => `/managed/...`)`, the
 * relay base the SEMP client appends to (GET) and the SMF socket prefix a
 * dial's answer is held to (GET, broker and VPN segments). Comments are cut
 * first so prose naming a route is not a call.
 */
function routeKeys(source: string): string[] {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    const helpers = new Map(Array.from(code.matchAll(/const (\w+) = \(\w+: string\) => `(\/managed\/[^`]*)`/g), m => [m[1], m[2]] as [string, string]));
    const keys: string[] = [];
    const call = /managedRequest(?:<(?:[^<>()]|\{[^}]*\})*>)?\(\s*'(GET|PUT|POST|DELETE)'\s*,\s*(?:(['`])([^'`]*)\2|(\w+)\()/g;
    let matched = 0;
    for (const m of code.matchAll(call)) {
        matched++;
        const path = m[3] ?? helpers.get(m[4]);
        if (path === undefined) throw new Error(`managedRequest path helper ${m[4]} is not a one-line \`/managed/...\` template: teach routeKeys to read it`);
        keys.push(norm(`${m[1]} ${path}`));
    }
    const calls = (code.match(/managedRequest(?:<[^(]*>)?\(/g) ?? []).length - (code.match(/function managedRequest\b/g) ?? []).length;
    if (calls !== matched) throw new Error(`${calls} managedRequest calls but ${matched} read: a call whose path is a variable or not a plain literal or one-line helper is not scanned; teach routeKeys to read it`);
    for (const m of code.matchAll(/`(\/managed\/relay\/[^`]*)`/g)) keys.push(norm(`GET ${m[1]}`));
    if (/'\/managed\/smf\/'/.test(code)) keys.push('GET /managed/smf/{}/{}');
    return keys;
}

/** What a row's call resolves to: the service's own result, or a flag. */
type Outcome = { ok: boolean };

/** One route, keyed by method + path template (`{x}` for a path parameter), and the app's call to it. */
const ROWS: { key: string; route: string; call: () => Promise<Outcome> }[] = [
    { key: 'GET /managed/me', route: 'GET /managed/me', call: () => managed.me() },
    { key: 'POST /managed/dial', route: 'POST /managed/dial', call: () => managed.dial('b1', 'v1') },
    {
        key: 'GET /managed/smf/{broker}/{vpn}',
        route: 'the socket path a dial names, through the SDK\'s socket gate',
        call: async () => {
            const d = await managed.dial('b1', 'v1');
            if (!d.ok || !d.data.smfPath.startsWith('/managed/smf/')) return { ok: false };
            return gw.sockets.gate({ broker: 'b1', vpn: 'v1', vpnName: d.data.vpn, user: d.data.user, pass: d.data.pass }, () => {});
        },
    },
    {
        key: 'GET /managed/relay/{broker}',
        route: 'GET /managed/relay/{broker}/SEMP/v2/..., the SEMP client\'s connect probe',
        call: async () => {
            let connected = false;
            const semp = createServiceSemp({ onConnected: () => { connected = true; }, onDisconnected: () => {} });
            await semp.connect({ protocol: 'https', port: '', urlPath: '', user: '', relayBase: managed.relayBase('b1') }, 'b1', '');
            return { ok: connected };
        },
    },
    { key: 'GET /managed/users', route: 'GET /managed/users', call: () => users.listUsers() },
    {
        key: 'PUT /managed/users/{name}',
        route: 'PUT /managed/users/{name}',
        call: () => users.saveUser({
            username: 'viewer', password: '', admin: false, operate: [], readOnly: [{ brokers: 'b1', msgVpns: '*', queues: '*' }], modules: null,
        }),
    },
    { key: 'DELETE /managed/users/{name}', route: 'DELETE /managed/users/{name}', call: () => users.deleteUser('viewer') },
    { key: 'GET /managed/connections', route: 'GET /managed/connections', call: () => conns.listConnections() },
    {
        key: 'PUT /managed/connections/{broker}',
        route: 'PUT /managed/connections/{broker}, blank passwords kept',
        call: async () => {
            const list = await conns.listConnections();
            return list.ok ? conns.saveConnection(list.data.find(c => c.broker === 'b2')!) : list;
        },
    },
    { key: 'DELETE /managed/connections/{broker}', route: 'DELETE /managed/connections/{broker}', call: () => conns.deleteConnection('b3') },
    { key: 'GET /managed/settings', route: 'GET /managed/settings', call: () => settings.load() },
    { key: 'GET /managed/client', route: 'GET /managed/client, how the gateway sees this browser', call: () => settings.client() },
    {
        key: 'PUT /managed/settings',
        route: 'PUT /managed/settings, the file as GET gave it',
        call: async () => {
            const view = await settings.load();
            return view.ok ? settings.save(view.data.settings) : view;
        },
    },
    { key: 'GET /managed/backup', route: 'GET /managed/backup', call: () => backup.status() },
    { key: 'PUT /managed/backup/schedule', route: 'PUT /managed/backup/schedule', call: () => backup.saveSchedule(DAILY) },
    {
        key: 'DELETE /managed/backup/schedule',
        route: 'DELETE /managed/backup/schedule',
        call: async () => {
            await backup.saveSchedule(DAILY);
            return backup.removeSchedule();
        },
    },
    {
        key: 'POST /managed/backup/run',
        route: 'POST /managed/backup/run',
        call: async () => {
            await backup.saveSchedule(DAILY);
            return backup.runNow();
        },
    },
    {
        key: 'GET /managed/backup/files/{name}',
        route: 'GET /managed/backup/files/{name}',
        call: async () => {
            await backup.saveSchedule(DAILY);
            const run = await backup.runNow();
            return run.ok ? backup.download(run.data.file) : run;
        },
    },
    { key: 'POST /managed/backup/export', route: 'POST /managed/backup/export', call: () => backup.exportFile(PASS) },
    { key: 'POST /managed/backup/preview', route: 'POST /managed/backup/preview', call: async () => backup.preview(await exported(), PASS) },
    {
        key: 'POST /managed/backup/import',
        route: 'POST /managed/backup/import, every section',
        call: async () => backup.importFile(await exported(), PASS, { users: 'merge', connections: 'merge', settings: 'replace' }),
    },
    { key: 'POST /managed/logout', route: 'POST /managed/logout', call: () => managed.logout() },
];

describe('mock-broker/gateway -- the app\'s routes', () => {
    for (const row of ROWS) {
        it(`answers ${row.route}`, async () => {
            expect(await row.call()).toMatchObject({ ok: true });
        });
    }

    it('has a row for every route the service helpers call, and no row for one they do not', () => {
        const called = new Set(productSources().flatMap(f => routeKeys(readSource(f))));
        const covered = new Set(ROWS.map(r => norm(r.key)));
        expect(ROWS.length, 'a key listed twice').toBe(covered.size);
        expect([...called].filter(k => !covered.has(k)), 'add a row that calls the new route through its service').toEqual([]);
        // A row whose route no helper calls is stale: drop it.
        expect([...covered].filter(k => !called.has(k))).toEqual([]);
    });
});
