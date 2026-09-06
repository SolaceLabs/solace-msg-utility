import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installMockServer } from '../../src/mock-broker/server';
import { seed, getQueue, listQueues } from '../../src/mock-broker/broker/store';
import { createSempDiscovery } from '../../src/core/services/semp-discovery';
import { importSeed, fromB64, unpack } from '../../src/core/encode';
import { probeDeployment } from '../../src/core/hosted';
import { resolveConnTabs } from '../../src/core/connections/conn-modes';
import {
    DEMO_SITE_SEED, FAULT, ROLE, VPNS, resetScenario, scenario,
} from '../../src/mock-broker/fixtures';

/**
 * The HTTP layer is what lets the REAL semp-client, semp-discovery,
 * service-verify, hosted.ts and managed-service run in the demo. These assert
 * the response shapes those unmocked parsers depend on.
 */
let realFetch: typeof window.fetch;

beforeEach(() => {
    realFetch = window.fetch;
    resetScenario();
    scenario.latencyMs = 0;
    seed();
    installMockServer();
});

afterEach(() => {
    window.fetch = realFetch;
});

const text = (r: Response) => r.text();

describe('mock-broker/server — /hosted', () => {
    it('advertises both connection tabs so Managed is reachable in the demo', async () => {
        const body = await (await fetch('/hosted')).json();
        expect(body).toEqual({ hosted: true, connModes: 'both', defaultConn: 'direct' });
    });

    it('makes the REAL probe report hosted, so the Managed tab renders with no gateway', async () => {
        // The whole point: there is no /hosted endpoint anywhere in a demo opened
        // from disk. Asserting through the shipping probe + tab resolver — rather
        // than just the response body — is what proves the tab actually appears.
        const info = await probeDeployment();

        expect(info.hosted).toBe(true);
        expect(resolveConnTabs(info.conn)).toEqual(['direct', 'managed']);
    });

    it('never delegates /hosted or /managed to the real fetch, on any platform', async () => {
        // The demo is opened from disk, where a relative request resolves against
        // a file:// origin. These are mocked outright — reaching the real fetch
        // would mean attempting a filesystem load that cannot succeed, which is
        // what left the Managed tab missing.
        let delegated = 0;
        window.fetch = (() => { delegated++; return Promise.resolve(new Response('nope')); }) as typeof window.fetch;
        installMockServer();

        expect((await fetch('/hosted')).ok).toBe(true);
        expect((await fetch('/managed/reload', { method: 'POST' })).status).toBe(204);
        expect(delegated).toBe(0);
    });

    it('routes independently of the page origin', async () => {
        // Routing parses against a fixed base rather than window.location, so a
        // file:// page origin (and its platform-specific quirks) cannot change
        // which handler a request reaches.
        const original = window.location.href;
        const body = await (await fetch('/hosted')).json();

        expect(body.hosted).toBe(true);
        expect(window.location.href).toBe(original);   // nothing was resolved against it
    });

    it('answers a Windows file:// URL, where the drive letter lands in the path', async () => {
        // Opened from disk on Windows, `new URL('/hosted', 'file:///C:/…')`
        // resolves to file:///C:/hosted, so pathname is '/C:/hosted'. Matching
        // the pathname exactly meant the demo silently fell back to Direct-only
        // — the Managed tab never appeared. jsdom's http:// location hides this,
        // so assert the resolved shape directly.
        expect(new URL('/hosted', 'file:///C:/demo/mock.html').pathname).toBe('/C:/hosted');

        const body = await (await fetch('file:///C:/hosted')).json();
        expect(body.hosted).toBe(true);
    });

    it('answers /managed from a Windows file:// URL too', async () => {
        scenario.role = ROLE.ADMIN;
        const res = await fetch('file:///C:/managed/getConnections', { method: 'POST' });
        expect(res.status).toBe(200);
        expect((await res.json()).admin).toBe(true);
    });

    it('still reports Direct-only without the interceptor, which is the bug this fixes', async () => {
        window.fetch = (() => Promise.reject(new Error('no gateway'))) as typeof window.fetch;

        const info = await probeDeployment();

        expect(info.hosted).toBe(false);
        expect(resolveConnTabs(info.conn)).toEqual(['direct']);
    });
});

describe('mock-broker/server — SEMP v2 discovery', () => {
    /**
     * Drive the REAL discovery generator, not a hand-rolled loop over
     * `nextPageUri`. An earlier version of this suite followed the cursor
     * itself and so was more permissive than the shipping consumer: the mock
     * emitted a *relative* nextPageUri, which `extractNextPath` rejects
     * (`new URL(uri)` with no base throws), silently ending pagination after
     * page one. The demo lost the 4th and 5th queue of every VPN and nothing
     * here failed. Always page through the code that ships.
     */
    function discovery() {
        const baseUrl = 'https://broker.solace.com:1943';
        return createSempDiscovery({
            baseUrl,
            fetch: (path: string) => fetch(`${baseUrl}${path}`),
        } as any);
    }

    async function collect(pages: AsyncGenerator<any>): Promise<string[]> {
        const names: string[] = [];
        for await (const page of pages) {
            expect(page.ok).toBe(true);
            names.push(...page.data);
        }
        return names;
    }

    it('pages every VPN through the real discovery generator', async () => {
        const names = await collect(discovery().fetchVpns());

        expect(names).toEqual(VPNS.map(v => v.name));
        // More VPNs than the page size, so this only passes if paging worked.
        expect(names.length).toBeGreaterThan(3);
    });

    it('pages every queue of a VPN, including past the first page', async () => {
        const names = await collect(discovery().fetchQueues('vpn-prod'));

        expect(names).toEqual(listQueues('vpn-prod'));
        // Q/LOGS/AUDIT is 4th and Q/DENIED 5th — both beyond page one.
        expect(names).toContain('Q/LOGS/AUDIT');
        expect(names).toContain('Q/DENIED');
    });

    it('emits an absolute nextPageUri, as a real broker does', async () => {
        const page: any = await (await fetch('/SEMP/v2/monitor/msgVpns?count=3')).json();
        // extractNextPath parses this with no base, so a relative value throws
        // and ends pagination.
        expect(() => new URL(page.meta.paging.nextPageUri)).not.toThrow();
    });

    it('surfaces an armed SEMP fault as a real HTTP status', async () => {
        scenario.fault = FAULT.SEMP_UNAUTHORIZED;
        expect((await fetch('/SEMP/v2/monitor/msgVpns')).status).toBe(401);
        scenario.fault = FAULT.SEMP_ERROR;
        expect((await fetch('/SEMP/v2/monitor/msgVpns')).status).toBe(500);
    });
});

describe('mock-broker/server — SEMP v1 RPC', () => {
    const post = (body: string) => fetch('https://broker.solace.com/SEMP', { method: 'POST', body });

    it('reports the queue detail verify parses, reading real depth from the store', async () => {
        const q = getQueue('vpn-prod', 'Q/ORDER/NEW')!;
        const xml = await text(await post(
            '<rpc><show><queue><name>Q/ORDER/NEW</name><vpn-name>vpn-prod</vpn-name><detail/></queue></show></rpc>'));

        expect(xml).toContain('<execute-result code="ok"/>');
        expect(xml).toContain('<message-vpn>vpn-prod</message-vpn>');
        expect(xml).toContain(`<num-messages-spooled>${q.messages.length}</num-messages-spooled>`);
        expect(xml).toContain('<others-permission>Consume</others-permission>');
    });

    it('reproduces the broker bug the product works around: detail reports newest-msg-id 0', async () => {
        // If this returned the true value the two-call workaround in
        // service-verify.ts would never be exercised by the demo.
        const detail = await text(await post(
            '<rpc><show><queue><name>Q/ORDER/NEW</name><vpn-name>vpn-prod</vpn-name><detail/></queue></show></rpc>'));
        expect(detail).toContain('<newest-msg-id>0</newest-msg-id>');

        const newest = await text(await post(
            '<rpc><show><queue><name>Q/ORDER/NEW</name><vpn-name>vpn-prod</vpn-name><messages/><newest/><count/><num-elements>1</num-elements></queue></show></rpc>'));
        const real = getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages.slice(-1)[0].id;
        expect(newest).toContain(`<message-id>${real}</message-id>`);
    });

    it('reports a read-only queue with the permission verify normalises', async () => {
        const xml = await text(await post(
            '<rpc><show><queue><name>Q/LOGS/AUDIT</name><vpn-name>vpn-prod</vpn-name><detail/></queue></show></rpc>'));
        expect(xml).toContain('<others-permission>Read-Only</others-permission>');
    });

    it('resolves a queue by name when the caller passes vpn-name of *', async () => {
        const xml = await text(await post(
            '<rpc><show><queue><name>payments-Q</name><vpn-name>*</vpn-name><detail/></queue></show></rpc>'));
        expect(xml).toContain('<message-vpn>vpn-finance</message-vpn>');
    });

    it('fails an unknown queue through execute-result rather than a broken shape', async () => {
        const xml = await text(await post(
            '<rpc><show><queue><name>no-such-queue</name><vpn-name>*</vpn-name><detail/></queue></show></rpc>'));
        expect(xml).toContain('code="fail"');
    });

    it('pages subscriptions through more-cookie', async () => {
        const first = await text(await post(
            '<rpc><show><queue><name>*</name><vpn-name>*</vpn-name><subscriptions/><count/><num-elements>100</num-elements></queue></show></rpc>'));
        expect(first).toContain('<more-cookie>');
        expect(first).toContain('<subscription><topic>');

        const second = await text(await post(
            '<rpc><show><queue><name>*</name><vpn-name>*</vpn-name><subscriptions/><mock-page>2</mock-page></queue></show></rpc>'));
        expect(second).not.toContain('<more-cookie>');
    });
});

describe('mock-broker/server — /managed', () => {
    it('refuses getConnections with an opaque 400 while signed out', async () => {
        const res = await fetch('/managed/getConnections', { method: 'POST' });
        expect(res.status).toBe(400);
    });

    it('returns a profile whose credentials unpack with the real transform', async () => {
        // Packed for real against the demo seed, so the managed store's
        // just-in-time unpack path runs rather than being bypassed.
        scenario.role = ROLE.OPERATOR;
        const profile: any = await (await fetch('/managed/getConnections', { method: 'POST' })).json();

        expect(profile.admin).toBe(false);
        expect(profile.operate[0]).toMatchObject({ msgVpns: 'vpn-prod', queues: 'Q/ORDER/*' });

        const key = await importSeed(fromB64(DEMO_SITE_SEED));
        expect(await unpack(profile.brokers[0].semp.pass, key)).toBe('demo-semp-secret');
    });

    it('grants full entitlements to the admin identity', async () => {
        scenario.role = ROLE.ADMIN;
        const profile: any = await (await fetch('/managed/getConnections', { method: 'POST' })).json();
        expect(profile.admin).toBe(true);
        expect(profile.operate[0]).toMatchObject({ brokers: '*', msgVpns: '*', queues: '*' });
    });

    it('gives the read-only identity no operate rows', async () => {
        scenario.role = ROLE.READ_ONLY;
        const profile: any = await (await fetch('/managed/getConnections', { method: 'POST' })).json();
        expect(profile.operate).toEqual([]);
        expect(profile.readOnly).toHaveLength(1);
    });

    it('accepts reload with 204, matching the real proxy', async () => {
        expect((await fetch('/managed/reload', { method: 'POST' })).status).toBe(204);
    });
});

describe('mock-broker/server — fall-through', () => {
    it('passes an unrecognised request to the real fetch', async () => {
        let calledWith: any = null;
        window.fetch = ((input: any) => {
            calledWith = input;
            return Promise.resolve(new Response('real'));
        }) as typeof window.fetch;
        installMockServer();

        await fetch('https://example.com/not-ours');

        expect(calledWith).toBe('https://example.com/not-ours');
    });
});
