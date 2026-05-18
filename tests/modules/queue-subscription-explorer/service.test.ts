import { describe, it, expect, vi } from 'vitest';
import { createService } from '../../../src/modules/queue-subscription-explorer/service';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState } from '../../../src/core/types';

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
    return {
        container: document.createElement('div'),
        appState,
        eventBus,
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: {},
    };
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
        const [url, opts] = (ctx.sempFetch as any).mock.calls[0];
        // SEMP v1 endpoint is derived from the v2 baseUrl.
        expect(url).toBe('https://broker:1943/SEMP');
        expect(opts.method).toBe('POST');
        expect(opts.headers['Content-Type']).toBe('application/xml');
        expect(opts.body).toContain('<subscriptions/>');
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

    it('terminates the stream on a non-ok HTTP response', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, statusText: 'Server Error' });

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'Server Error' }]);
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

    it('falls back to a generic error when the response has no statusText', async () => {
        const ctx = createTestContext();
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, statusText: '' });

        const pages = await allPages(createService(ctx).fetchAllSubscriptions());
        expect(pages).toEqual([{ ok: false, error: 'Error fetching subscriptions' }]);
    });
});
