import { describe, it, expect, vi } from 'vitest';
import { createSempDiscovery, PAGE_DELAY_MS } from '../../../src/core/services/semp-discovery';
import type { SempContext } from '../../../src/core/connections/types';

/**
 * Pure-factory tests. The factory takes a SempContext (a fetch closure + a
 * diagnostic baseUrl); the `fetch` API is path-only — callers pass the SEMP
 * endpoint suffix and the underlying closure assembles the full URL. These
 * tests stub `sempCtx.fetch` with vi.fn() so assertions match against the
 * paths the factory feeds in, not against the assembled wire URLs (which are
 * the SEMP client closure's responsibility, covered in semp-client tests).
 *
 * No AppContext — connection-state gating lives in queue-discovery's wrapper.
 */

function makeSempCtx(overrides: Partial<SempContext> = {}): SempContext {
    return {
        fetch: vi.fn(),
        baseUrl: 'http://broker:8080',
        ...overrides,
    };
}

async function firstPage<T>(gen: AsyncGenerator<T>): Promise<T> {
    const { value } = await gen.next();
    return value as T;
}

async function allPages<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const pages: T[] = [];
    for await (const p of gen) pages.push(p);
    return pages;
}

describe('core/services/semp-discovery', () => {
    describe('fetchVpns()', () => {
        it('yields VPN data from SEMP API', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ msgVpnName: 'vpn-b' }, { msgVpnName: 'vpn-a' }] })
            });
            const page = await firstPage(createSempDiscovery(sempCtx).fetchVpns());

            expect(page.ok).toBe(true);
            if (page.ok) expect(page.data).toEqual(['vpn-b', 'vpn-a']);  // per-page order preserved; caller sorts on accumulate
        });

        // Error paths use allPages() — pulling next() past the yielded error page
        // resumes the generator into the `return;` after each yield. asserting
        // `pages.length === 1` locks in the single-page-then-stop contract: a
        // regression that drops the `return` would emit a second page.

        it('handles SEMP API error status', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: false, statusText: 'Internal Server Error' });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
            if (!pages[0].ok) expect(pages[0].error).toBe('Internal Server Error');
        });

        it('handles OK response with no data field', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
        });

        it('handles network error', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockRejectedValue(new Error('Network error'));
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
            if (!pages[0].ok) expect(pages[0].error).toBe('Network error');
        });

        it('handles SyntaxError when broker returns 200 with non-JSON body', async () => {
            // Real-world: a misconfigured proxy or maintenance page returns HTML
            // with status 200. res.json() then throws SyntaxError. The outer
            // try/catch in fetchPaged must surface this as a normal {ok: false}
            // page rather than letting the throw propagate to the caller.
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0'))
            });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
            if (!pages[0].ok) expect(pages[0].error).toContain('Unexpected token');
        });

        it('falls back to default error when statusText is empty', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: false, statusText: '' });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            if (!pages[0].ok) expect(pages[0].error).toBe('Error fetching VPNs');
        });

        it('falls back to default error when thrown error has no message', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockRejectedValue(new Error(''));
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            if (!pages[0].ok) expect(pages[0].error).toBe('Error fetching VPNs');
        });

        it('uses custom maxCount in the path', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
            await allPages(createSempDiscovery(sempCtx).fetchVpns(50));
            expect(sempCtx.fetch).toHaveBeenCalledWith(expect.stringContaining('count=50'));
        });

        it('passes a path-only string to sempCtx.fetch (the closure assembles the URL)', async () => {
            // The factory must never construct a full URL — that's the SEMP
            // client closure's job. Anything that looks like a full URL here
            // would mean the factory is bypassing the closure's hosted-mode
            // routing and trusting broker-emitted hostnames.
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
            await allPages(createSempDiscovery(sempCtx).fetchVpns());
            const calledWith = (sempCtx.fetch as any).mock.calls[0][0];
            expect(calledWith).toBe('/SEMP/v2/monitor/msgVpns?count=100');
        });

        it('follows meta.paging.nextPageUri by extracting only its pathname+search (host/port/scheme discarded)', async () => {
            // Defense: the broker's nextPageUri points back at the broker's
            // own self-view (e.g. http://broker-internal:943/SEMP/v2/...),
            // which routes wrong in hosted mode. The factory strips that down
            // to pathname+search and feeds it back as a path; the closure
            // reassembles the URL through the correct (gateway-aware) channel.
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            const nextUri = 'http://broker-internal:943/SEMP/v2/monitor/msgVpns?cursor=abc';
            (sempCtx.fetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        data: [{ msgVpnName: 'vpn-a' }, { msgVpnName: 'vpn-b' }],
                        meta: { paging: { nextPageUri: nextUri } }
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        data: [{ msgVpnName: 'vpn-c' }]
                    })
                });

            const pagesPromise = allPages(createSempDiscovery(sempCtx).fetchVpns());
            await vi.advanceTimersByTimeAsync(PAGE_DELAY_MS);
            const pages = await pagesPromise;

            expect(pages).toHaveLength(2);
            expect(pages[0]).toEqual({ ok: true, data: ['vpn-a', 'vpn-b'] });
            expect(pages[1]).toEqual({ ok: true, data: ['vpn-c'] });
            // Second fetch hits the EXTRACTED path, not the original URI.
            expect((sempCtx.fetch as any).mock.calls[1][0]).toBe('/SEMP/v2/monitor/msgVpns?cursor=abc');
            vi.useRealTimers();
        });

        it('ends the stream when meta.paging.nextPageUri is malformed', async () => {
            // Defensive: a broken broker response shouldn't crash the
            // generator. Treat unparseable nextPageUri as end-of-stream.
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [{ msgVpnName: 'vpn-a' }],
                    meta: { paging: { nextPageUri: 'not-a-url' } }
                })
            });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchVpns());
            expect(pages).toHaveLength(1);
            expect(pages[0]).toEqual({ ok: true, data: ['vpn-a'] });
            // Only one fetch — the malformed URI ended the loop without a retry.
            expect((sempCtx.fetch as any).mock.calls).toHaveLength(1);
        });

        it('stops paginating on error mid-stream', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        data: [{ msgVpnName: 'vpn-a' }],
                        meta: { paging: { nextPageUri: 'http://broker:8080/next' } }
                    })
                })
                .mockResolvedValueOnce({ ok: false, statusText: 'Server Error' });

            const pagesPromise = allPages(createSempDiscovery(sempCtx).fetchVpns());
            await vi.advanceTimersByTimeAsync(PAGE_DELAY_MS);
            const pages = await pagesPromise;

            expect(pages).toHaveLength(2);
            expect(pages[0].ok).toBe(true);
            expect(pages[1].ok).toBe(false);
            vi.useRealTimers();
        });
    });

    describe('fetchQueues()', () => {
        it('yields queue data from SEMP API', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ queueName: 'Q-B' }, { queueName: 'Q-A' }] })
            });
            const page = await firstPage(createSempDiscovery(sempCtx).fetchQueues('default'));

            expect(page.ok).toBe(true);
            if (page.ok) expect(page.data).toEqual(['Q-B', 'Q-A']);
        });

        // See fetchVpns block above for why these use allPages() — same single-
        // page-then-stop contract being locked in.

        it('handles API error', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: false, statusText: 'Not Found' });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
        });

        it('handles OK response with no data field', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
        });

        it('handles network error', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockRejectedValue(new Error('Timeout'));
            const pages = await allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            expect(pages).toHaveLength(1);
            expect(pages[0].ok).toBe(false);
            if (!pages[0].ok) expect(pages[0].error).toBe('Timeout');
        });

        it('falls back to default error when statusText is empty', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: false, statusText: '' });
            const pages = await allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            expect(pages).toHaveLength(1);
            if (!pages[0].ok) expect(pages[0].error).toBe('Error fetching Queues');
        });

        it('falls back to default error when thrown error has no message', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockRejectedValue(new Error(''));
            const pages = await allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            expect(pages).toHaveLength(1);
            if (!pages[0].ok) expect(pages[0].error).toBe('Error fetching Queues');
        });

        it('includes VPN name in the path', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
            await allPages(createSempDiscovery(sempCtx).fetchQueues('my-vpn'));
            expect(sempCtx.fetch).toHaveBeenCalledWith(expect.stringContaining('/msgVpns/my-vpn/queues'));
        });

        it('passes a path-only string for the initial fetch', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
            await allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            const calledWith = (sempCtx.fetch as any).mock.calls[0][0];
            expect(calledWith).toBe('/SEMP/v2/monitor/msgVpns/default/queues?count=100');
        });

        it('follows meta.paging.nextPageUri across multiple pages, passing only the extracted path', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        data: [{ queueName: 'Q-1' }, { queueName: 'Q-2' }],
                        meta: { paging: { nextPageUri: 'http://broker-internal:943/SEMP/v2/monitor/msgVpns/default/queues?cursor=p2' } }
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: [{ queueName: 'Q-3' }] })
                });

            const pagesPromise = allPages(createSempDiscovery(sempCtx).fetchQueues('default'));
            await vi.advanceTimersByTimeAsync(PAGE_DELAY_MS);
            const pages = await pagesPromise;

            expect(pages).toHaveLength(2);
            expect(pages[0]).toEqual({ ok: true, data: ['Q-1', 'Q-2'] });
            expect(pages[1]).toEqual({ ok: true, data: ['Q-3'] });
            expect((sempCtx.fetch as any).mock.calls[1][0]).toBe('/SEMP/v2/monitor/msgVpns/default/queues?cursor=p2');
            vi.useRealTimers();
        });
    });
});
