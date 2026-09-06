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
 * Pagination treats the broker-emitted `nextPageUri` as data — only its
 * `pathname + search` is extracted and passed back through `sempCtx.fetch`.
 * The closure inside the SEMP client reassembles scheme/host/port from the
 * connection form on every call, so broker-direct URLs never reach the wire
 * (critical for hosted mode behind the Go gateway, where the broker's
 * self-view points outside the gateway).
 *
 * Scoped to a specific broker via the supplied SempContext. Drives the
 * primary connection by passing `unfilteredPrimarySempContext(ctx)`; queue-copy
 * will pass its destination SempContext for secondary discovery.
 *
 * Presumes the SempContext is valid — does NOT check connection state.
 * Callers gate this themselves (e.g. queue-discovery's wrapper yields a
 * "SEMP Not Connected" error page before invoking the factory).
 */
export function createSempDiscovery(sempCtx: SempContext) {

    async function* fetchPaged(
        startPath: string,
        mapper: (item: any) => string,
        defaultError: string
    ): AsyncGenerator<FetchPage> {
        let path: string | null = startPath;
        let pageNum = 0;
        while (path) {
            if (pageNum > 0) {
                // Throttle subsequent page requests so we don't hammer the broker.
                await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
            }
            try {
                const res = await sempCtx.fetch(path);
                if (res.ok) {
                    const json = await res.json();
                    if (json.data) {
                        yield { ok: true, data: json.data.map(mapper) };
                    } else {
                        yield { ok: false, error: defaultError };
                        return;
                    }
                    path = extractNextPath(json.meta?.paging?.nextPageUri);
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
            `/SEMP/v2/monitor/msgVpns?count=${maxCount}`,
            (v: any) => v.msgVpnName,
            'Error fetching VPNs'
        );
    }

    async function* fetchQueues(vpnName: string, maxCount = 100): AsyncGenerator<FetchPage> {
        yield* fetchPaged(
            `/SEMP/v2/monitor/msgVpns/${vpnName}/queues?count=${maxCount}`,
            (q: any) => q.queueName,
            'Error fetching Queues'
        );
    }

    return { fetchVpns, fetchQueues };
}

/**
 * Extract `pathname + search` from a broker-emitted nextPageUri. Returns
 * `null` for missing or malformed input (ends the pagination stream). The
 * broker's host/port/scheme are deliberately discarded — only the path
 * component is trusted, since the SEMP client closure reassembles the full
 * URL from the connection-form values on every call.
 */
function extractNextPath(nextPageUri: string | undefined | null): string | null {
    if (!nextPageUri) return null;
    try {
        const u = new URL(nextPageUri);
        return u.pathname + u.search;
    } catch {
        return null;
    }
}
