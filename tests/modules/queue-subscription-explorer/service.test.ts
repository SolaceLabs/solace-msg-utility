import { describe, it, expect, vi } from 'vitest';
import { createService } from '../../../src/modules/queue-subscription-explorer/service';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState } from '../../../src/core/types';
import { managedErrorMessage } from '../../../src/core/services/managed-api';
import { completeContext } from '../../helpers/appContext';

function createTestContext(overrides: Partial<AppState> = {}): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null,
        sempCredentials: {
            user: 'admin', pass: 'admin', baseUrl: 'https://broker:1943/SEMP/v2',
            protocol: 'https', host: 'broker', port: '1943', urlPath: '/SEMP/v2',
        },
        isSempConnected: true,
        ...overrides,
    };
    return completeContext({
        container: document.createElement('div'),
        appState,
        eventBus,
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: {},
    });
}

function textRes(text: string, init: { ok?: boolean; statusText?: string } = {}): Response {
    return {
        ok: init.ok ?? true,
        statusText: init.statusText ?? 'OK',
        text: async () => text,
    } as unknown as Response;
}

const PAGE_1_WITH_COOKIE = `<rpc-reply>
  <rpc><show><queue><queues>
    <queue><name>q1</name><info><message-vpn>default</message-vpn></info>
      <subscriptions><subscription><topic>a/b</topic></subscription></subscriptions>
    </queue>
  </queues></queue></show></rpc>
  <more-cookie><rpc><show><queue><cursor/></queue></show></rpc></more-cookie>
  <execute-result code="ok"/>
</rpc-reply>`;

const PAGE_2_FINAL = `<rpc-reply>
  <rpc><show><queue><queues>
    <queue><name>q2</name><info><message-vpn>default</message-vpn></info>
      <subscriptions><subscription><topic>c/d</topic></subscription></subscriptions>
    </queue>
  </queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

const SINGLE_PAGE = `<rpc-reply>
  <rpc><show><queue><queues>
    <queue><name>only</name><info><message-vpn>v</message-vpn></info>
      <subscriptions><subscription><topic>x</topic></subscription></subscriptions>
    </queue>
  </queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

async function allPages<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const pages: T[] = [];
    for await (const p of gen) pages.push(p);
    return pages;
}

describe('queue-subscription-explorer/service', () => {
    it('yields "SEMP Not Connected" without hitting the network', async () => {
        const ctx = createTestContext({ isSempConnected: false });
        const gen = createService(ctx).fetchAllSubscriptions();
        const first = await gen.next();
        expect(first.value).toEqual({ ok: false, error: 'SEMP Not Connected' });
        expect((await gen.next()).done).toBe(true);
        expect(ctx.sempFetch).not.toHaveBeenCalled();
    });

    it('emits one page of rows for a single-page response and stops', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(SINGLE_PAGE));

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([
            { ok: true, data: [{ vpn: 'v', queue: 'only', topic: 'x' }] },
        ]);
        expect(ctx.sempFetch).toHaveBeenCalledTimes(1);
        const [path, opts] = (ctx.sempFetch as any).mock.calls[0];
        // Path-only contract: the service passes the SEMP v1 RPC endpoint path
        // directly; the kernel's sempFetch assembles the broker URL from the
        // connection-form values and routes through the gateway when hosted.
        expect(path).toBe('/SEMP');
        expect(opts.method).toBe('POST');
        expect(opts.headers['Content-Type']).toBe('application/xml');
        expect(opts.body).toContain('<subscriptions/>');
    });

    it("keeps only the signed-in user's rows in a Provisioned session: a provisioned VPN and a visible queue", async () => {
        const PAGE = `<rpc-reply>
  <rpc><show><queue><queues>
    <queue><name>orders.new</name><info><message-vpn>orders</message-vpn></info>
      <subscriptions><subscription><topic>o/new</topic></subscription></subscriptions>
    </queue>
    <queue><name>audit.x</name><info><message-vpn>orders</message-vpn></info>
      <subscriptions><subscription><topic>o/audit</topic></subscription></subscriptions>
    </queue>
    <queue><name>orders.new</name><info><message-vpn>payments</message-vpn></info>
      <subscriptions><subscription><topic>p/new</topic></subscription></subscriptions>
    </queue>
  </queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;
        const ctx = createTestContext({
            managed: {
                admin: false, username: 'u', broker: 'b1', vpns: ['orders'], modules: ['queue-subscription-explorer'],
                operate: [{ brokers: 'b1', msgVpns: '*', queues: 'orders.*' }], readOnly: [],
            },
        });
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE));

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        // audit.x: no row's queue pattern; payments: not a provisioned VPN.
        expect(pages).toEqual([{ ok: true, data: [{ vpn: 'orders', queue: 'orders.new', topic: 'o/new' }] }]);
        // The request still asks the broker for every VPN; the browser filters.
        expect((ctx.sempFetch as any).mock.calls[0][1].body).toContain('<vpn-name>*</vpn-name>');
    });

    it('follows <more-cookie> to fetch additional pages, throttling between them', async () => {
        vi.useFakeTimers();
        const ctx = createTestContext();
        (ctx.sempFetch as any)
            .mockResolvedValueOnce(textRes(PAGE_1_WITH_COOKIE))
            .mockResolvedValueOnce(textRes(PAGE_2_FINAL));

        const gen = createService(ctx).fetchAllSubscriptions();

        // Page 1 is fetched immediately.
        const p1 = await gen.next();
        expect(p1.value).toEqual({
            ok: true,
            data: [{ vpn: 'default', queue: 'q1', topic: 'a/b' }],
        });
        expect(ctx.sempFetch).toHaveBeenCalledTimes(1);

        // Page 2 is gated behind PAGE_DELAY_MS — advance fake timers to release it.
        const p2Promise = gen.next();
        await vi.advanceTimersByTimeAsync(370);
        const p2 = await p2Promise;
        expect(p2.value).toEqual({
            ok: true,
            data: [{ vpn: 'default', queue: 'q2', topic: 'c/d' }],
        });
        expect(ctx.sempFetch).toHaveBeenCalledTimes(2);

        // Second POST body must be the more-cookie's inner <rpc> verbatim.
        const secondBody = (ctx.sempFetch as any).mock.calls[1][1].body;
        expect(secondBody).toContain('<cursor');

        const done = await gen.next();
        expect(done.done).toBe(true);

        vi.useRealTimers();
    });

    it('terminates the stream on a non-ok HTTP response, naming the status', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'Error fetching subscriptions (HTTP 500 Server Error)' }]);
    });

    it("reports a relay refusal as the gateway code's sentence", async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, status: 502, statusText: '', json: async () => ({ error: 'upstream_unavailable' }) });

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: managedErrorMessage({ ok: false, status: 502, code: 'upstream_unavailable' }) }]);
    });

    it('reports a request that timed out with the deadline', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'Error fetching subscriptions: no answer within 30 s.' }]);
    });

    it('terminates the stream on a parse-level error', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(
            `<rpc-reply><execute-result code="fail" reason="bad request"/></rpc-reply>`
        ));

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toHaveLength(1);
        expect(pages[0]).toMatchObject({ ok: false });
        if (!pages[0].ok) expect(pages[0].error).toContain('bad request');
    });

    it('terminates the stream on a network exception', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockRejectedValueOnce(new Error('connection reset'));

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'connection reset' }]);
    });

    it('falls back to a generic error when the network exception has no message', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockRejectedValueOnce({});

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'Error fetching subscriptions' }]);
    });

    it('names the bare status when an HTTP/2 response has no statusText', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, status: 403, statusText: '' });

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'Error fetching subscriptions (HTTP 403)' }]);
    });
});
