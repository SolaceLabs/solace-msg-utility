import type { SempContext } from '../connections/types';
import { sempErrorText, sempFailureText } from './semp-errors';

/**
 * Yielded page from a paginated SEMP fetch.
 * Generators emit one page at a time so the caller can render incrementally;
 * the first error terminates the stream.
 */
export type FetchPage = { ok: true; data: string[] } | { ok: false; error: string };

/** Delay between page requests to avoid overwhelming the broker. */
export const PAGE_DELAY_MS = 370;

/** A SEMP v2 list body, as far as discovery reads it. */
interface SempListBody {
    data?: unknown;
    meta?: { paging?: { nextPageUri?: string } };
}

/** One row of a SEMP v2 list (`{ msgVpnName: ... }`, `{ queueName: ... }`). */
type SempRow = Record<string, unknown>;

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
        mapper: (item: SempRow) => string,
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
                // Each request carries its own deadline (REQUEST_TIMEOUT_MS):
                // the kernel's sempFetch for the primary, the SEMP client's
                // for a secondary.
                const res = await sempCtx.fetch(path);
                if (res.ok) {
                    const json: SempListBody = await res.json();
                    if (Array.isArray(json.data)) {
                        yield { ok: true, data: (json.data as SempRow[]).map(mapper) };
                    } else {
                        yield { ok: false, error: defaultError };
                        return;
                    }
                    path = extractNextPath(json.meta?.paging?.nextPageUri);
                } else {
                    yield { ok: false, error: await sempErrorText(res, defaultError) };
                    return;
                }
            } catch (e: unknown) {
                yield { ok: false, error: sempFailureText(e, defaultError) };
                return;
            }
            pageNum++;
        }
    }

    async function* fetchVpns(maxCount = 100): AsyncGenerator<FetchPage> {
        yield* fetchPaged(
            `/SEMP/v2/monitor/msgVpns?count=${maxCount}`,
            (v) => v.msgVpnName as string,
            'Error fetching VPNs'
        );
    }

    async function* fetchQueues(vpnName: string, maxCount = 100): AsyncGenerator<FetchPage> {
        yield* fetchPaged(
            `/SEMP/v2/monitor/msgVpns/${vpnName}/queues?count=${maxCount}`,
            (q) => q.queueName as string,
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
