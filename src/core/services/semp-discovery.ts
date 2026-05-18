import type { SempContext } from '../connections/types';

/**
 * Yielded page from a paginated SEMP fetch.
 * Generators emit one page at a time so the caller can render incrementally;
 * the first error terminates the stream.
 */
export type FetchPage = { ok: true; data: string[] } | { ok: false; error: string };

/** Delay between page requests to avoid overwhelming the broker. */
export const PAGE_DELAY_MS = 370;

/**
 * Pure SEMP Discovery factory.
 *
 * Both fetchers are async generators that yield one page at a time, follow
 * `meta.paging.nextPageUri` until exhausted, and stop on the first error.
 *
 * Scoped to a specific broker via the supplied SempContext. Drives the
 * primary connection by passing `primarySempContextFrom(ctx)`; queue-copy
 * will pass its destination SempContext for secondary discovery.
 *
 * Presumes the SempContext is valid — does NOT check connection state.
 * Callers gate this themselves (e.g. queue-discovery's wrapper yields a
 * "SEMP Not Connected" error page before invoking the factory).
 */
export function createSempDiscovery(sempCtx: SempContext) {

    async function* fetchPaged(
        startUrl: string,
        mapper: (item: any) => string,
        defaultError: string
    ): AsyncGenerator<FetchPage> {
        let url: string | null = startUrl;
        let pageNum = 0;
        while (url) {
            if (pageNum > 0) {
                // Throttle subsequent page requests so we don't hammer the broker.
                await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
            }
            try {
                const res = await sempCtx.fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    if (json.data) {
                        yield { ok: true, data: json.data.map(mapper) };
                    } else {
                        yield { ok: false, error: defaultError };
                        return;
                    }
                    url = json.meta?.paging?.nextPageUri || null;
                } else {
                    yield { ok: false, error: res.statusText || defaultError };
                    return;
                }
            } catch (e: any) {
                yield { ok: false, error: e.message || defaultError };
                return;
            }
            pageNum++;
        }
    }

    async function* fetchVpns(maxCount = 100): AsyncGenerator<FetchPage> {
        yield* fetchPaged(
            `${sempCtx.baseUrl}/SEMP/v2/monitor/msgVpns?count=${maxCount}`,
            (v: any) => v.msgVpnName,
            'Error fetching VPNs'
        );
    }

    async function* fetchQueues(vpnName: string, maxCount = 100): AsyncGenerator<FetchPage> {
        yield* fetchPaged(
            `${sempCtx.baseUrl}/SEMP/v2/monitor/msgVpns/${vpnName}/queues?count=${maxCount}`,
            (q: any) => q.queueName,
            'Error fetching Queues'
        );
    }

    return { fetchVpns, fetchQueues };
}
