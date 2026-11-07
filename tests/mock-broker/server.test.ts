import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installMockServer, sempHost } from '../../src/mock-broker/server';
import { handleSempV1 } from '../../src/mock-broker/server/semp-v1';
import { handleSempV2 } from '../../src/mock-broker/server/semp-v2';
import { seed, getQueue, listQueues } from '../../src/mock-broker/broker/store';
import { createSempDiscovery } from '../../src/core/services/semp-discovery';
import { probeDeployment } from '../../src/core/hosted';
import { resolveConnTabs } from '../../src/core/connections/conn-modes';
import {
    FAULT, MOCK_HOST, QUEUE_STATE, VPNS, resetScenario, scenario, setBrokers,
} from '../../src/mock-broker/fixtures';

/**
 * The HTTP layer is what lets the REAL semp-client, semp-discovery,
 * service-verify and hosted.ts run in the demo. These assert
 * the response shapes those unmocked parsers depend on.
 */
let realFetch: typeof window.fetch;

beforeEach(() => {
    realFetch = window.fetch;
    resetScenario();
    scenario.latencyMs = 0;
    seed();
    installMockServer({ passthrough: realFetch });
});

afterEach(() => {
    window.fetch = realFetch;
    setBrokers({});
});

const text = (r: Response) => r.text();
/** The demo broker as an absolute URL; SEMP is answered for this host only. */
const DEMO = 'https://broker.solace.com:1943';

describe('mock-broker/server — /hosted', () => {
    it('advertises a hosted, Direct-only deployment, like every Release bundle', async () => {
        const body = await (await fetch('/hosted')).json();
        expect(body).toEqual({ hosted: true, connModes: 'direct', defaultConn: 'direct' });
    });

    it('makes the REAL probe report hosted, so broker URLs take the gateway shape the demo answers', async () => {
        // There is no /hosted endpoint anywhere in a demo opened from disk.
        // Asserting through the shipping probe + tab resolver, rather than just
        // the response body, proves what the app will actually do with it.
        const info = await probeDeployment();

        expect(info.hosted).toBe(true);
        expect(resolveConnTabs(info.conn)).toEqual(['direct']);
    });

    it('never delegates /hosted to the real fetch, on any platform', async () => {
        // The demo is opened from disk, where a relative request resolves against
        // a file:// origin. /hosted is mocked outright: reaching the real fetch
        // would mean attempting a filesystem load that cannot succeed.
        let delegated = 0;
        installMockServer({
            passthrough: (() => { delegated++; return Promise.resolve(new Response('nope')); }) as typeof window.fetch,
        });

        expect((await fetch('/hosted')).ok).toBe(true);
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
        // the pathname exactly meant the demo silently fell back to non-hosted
        // URLs it does not answer. jsdom's http:// location hides this, so
        // assert the resolved shape directly.
        expect(new URL('/hosted', 'file:///C:/demo/mock.html').pathname).toBe('/C:/hosted');

        const body = await (await fetch('file:///C:/hosted')).json();
        expect(body.hosted).toBe(true);
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
        const page: any = await (await fetch(`${DEMO}/SEMP/v2/monitor/msgVpns?count=3`)).json();
        // extractNextPath parses this with no base, so a relative value throws
        // and ends pagination.
        expect(() => new URL(page.meta.paging.nextPageUri)).not.toThrow();
    });

    it('surfaces an armed SEMP fault as a real HTTP status', async () => {
        scenario.fault = FAULT.SEMP_UNAUTHORIZED;
        expect((await fetch(`${DEMO}/SEMP/v2/monitor/msgVpns`)).status).toBe(401);
        scenario.fault = FAULT.SEMP_ERROR;
        expect((await fetch(`${DEMO}/SEMP/v2/monitor/msgVpns`)).status).toBe(500);
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

describe('mock-broker/server — fall-through', () => {
    it('passes an unrecognised request to the passthrough its boot gave', async () => {
        let calledWith: any = null;
        installMockServer({
            passthrough: ((input: any) => {
                calledWith = input;
                return Promise.resolve(new Response('real'));
            }) as typeof window.fetch,
        });

        await fetch('https://example.com/not-ours');

        expect(calledWith).toBe('https://example.com/not-ours');
    });

    it('never calls the fetch it replaced: only the passthrough sees a miss', async () => {
        // The managed demo passes a refusal; a server that kept the original
        // fetch could still reach a network behind it.
        let replaced = 0;
        window.fetch = (() => { replaced++; return Promise.resolve(new Response('real')); }) as typeof window.fetch;
        installMockServer({ passthrough: () => Promise.reject(new TypeError('refused')) });

        await expect(fetch('https://example.com/not-ours')).rejects.toThrow('refused');
        expect(replaced).toBe(0);
    });
});

// The SDK emulator connects to the demo host only; SEMP must refuse the rest
// the same way, or a real broker typed into the form would look reachable.
describe('mock-broker/server -- the demo host only', () => {
    const v2 = '/SEMP/v2/monitor/msgVpns';

    it('reads the broker host from a hosted URL, on a served page and on file://, else from the URL', () => {
        const host = (raw: string) => sempHost(raw, new URL(raw, 'https://mock.invalid/'));
        expect(host(`https://smu.example.com/https/1943/broker.solace.com${v2}`)).toBe('broker.solace.com');
        // buildBrokerUrl on a file:// page: no page host, so a parser takes "https" for the host.
        expect(host(`http:///https/1943/broker.solace.com${v2}`)).toBe('broker.solace.com');
        expect(host(`${DEMO}${v2}`)).toBe('broker.solace.com');
        expect(host(v2)).toBe('mock.invalid');
    });

    it('answers SEMP for the demo host in every shape the app builds', async () => {
        for (const url of [`http:///https/1943/broker.solace.com${v2}`, `https://smu.example.com/https/943/broker.solace.com${v2}`, `${DEMO}${v2}`]) {
            expect((await fetch(url)).status).toBe(200);
        }
        const detail = '<rpc><show><queue><name>Q/ORDER/NEW</name><vpn-name>vpn-prod</vpn-name><detail/></queue></show></rpc>';
        expect(await text(await fetch('http:///https/1943/broker.solace.com/SEMP', { method: 'POST', body: detail })))
            .toContain('<execute-result code="ok"/>');
    });

    it('hands SEMP for any other host to the passthrough, which the demos refuse', async () => {
        const missed: string[] = [];
        installMockServer({ passthrough: ((input: any) => { missed.push(String(input)); return Promise.reject(new TypeError('refused')); }) as typeof window.fetch });
        const others = [
            `http:///https/1943/prod-broker.example.com${v2}`,
            `https://prod-broker.example.com:943${v2}`,
            `http:///https/1943/${MOCK_HOST.UNTRUSTED}${v2}`,
            v2,
        ];
        for (const url of others) await expect(fetch(url)).rejects.toThrow('refused');
        await expect(fetch('https://prod-broker.example.com/SEMP', { method: 'POST', body: '<rpc/>' })).rejects.toThrow('refused');
        expect(missed).toEqual([...others, 'https://prod-broker.example.com/SEMP']);
    });
});

describe('mock-broker/server — routes ahead of the broker', () => {
    it('answers from routes before /hosted and SEMP', async () => {
        const seen: string[] = [];
        installMockServer({
            passthrough: realFetch,
            routes: async (path) => {
                seen.push(path);
                return path === '/hosted' ? new Response('{"hosted":false}') : null;
            },
        });

        expect((await (await fetch('/hosted')).json()).hosted).toBe(false);
        // null lets the broker answer, as before.
        const page: any = await (await fetch(`${DEMO}/SEMP/v2/monitor/msgVpns`)).json();
        expect(page.data.length).toBeGreaterThan(0);
        expect(seen).toEqual(['/hosted', '/SEMP/v2/monitor/msgVpns']);
    });
});

describe('mock-broker/server — per broker', () => {
    const EAST = [
        { name: 'orders', queues: [{ name: 'orders.new', seed: 2, subscriptions: ['orders/>'], state: QUEUE_STATE.NORMAL }] },
    ];

    beforeEach(() => {
        setBrokers({ east: EAST });
        seed();
    });

    const url = (path: string) => new URL(`https://gw.invalid${path}`);

    it('lists only the named broker\'s VPNs and queues', () => {
        expect(handleSempV2(url('/SEMP/v2/monitor/msgVpns'), 'east')?.data).toEqual([{ msgVpnName: 'orders' }]);
        expect(handleSempV2(url('/SEMP/v2/monitor/msgVpns/orders/queues'), 'east')?.data).toEqual([{ queueName: 'orders.new' }]);
        // Another broker's VPN is not this broker's, whoever asks.
        expect(handleSempV2(url('/SEMP/v2/monitor/msgVpns/vpn-prod/queues'), 'east')?.data).toEqual([]);
        // Direct, the default, does not see the added broker's VPN.
        expect(handleSempV2(url('/SEMP/v2/monitor/msgVpns/orders/queues'))?.data).toEqual([]);
    });

    it('resolves v1 RPCs on the named broker only', () => {
        const detail = (name: string, vpn: string) =>
            `<rpc><show><queue><name>${name}</name><vpn-name>${vpn}</vpn-name><detail/></queue></show></rpc>`;

        expect(handleSempV1(detail('orders.new', 'orders'), 'east')).toContain('<message-vpn>orders</message-vpn>');
        expect(handleSempV1(detail('orders.new', '*'), 'east')).toContain('<message-vpn>orders</message-vpn>');
        expect(handleSempV1(detail('payments-Q', 'vpn-finance'), 'east')).toContain('code="fail"');
        expect(handleSempV1(detail('payments-Q', '*'), 'east')).toContain('code="fail"');
        expect(handleSempV1(detail('orders.new', 'orders'))).toContain('code="fail"');

        const subs = handleSempV1(
            '<rpc><show><queue><name>*</name><vpn-name>*</vpn-name><subscriptions/></queue></show></rpc>', 'east');
        expect(subs).toContain('<name>orders.new</name>');
        expect(subs).not.toContain('test-queue-1');
    });
});
