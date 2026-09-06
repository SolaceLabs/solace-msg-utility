/**
 * SEMP v2 monitor endpoints, with real cursor paging.
 *
 * `semp-discovery.ts` is not mocked any more: it runs for real against these
 * responses, following `meta.paging.nextPageUri` until it is absent. So the
 * page size is deliberately small — the demo exercises the multi-page path
 * rather than always fitting in one response.
 *
 * Mock-only.
 */
import { listQueues, listVpns } from '../broker/store';

const PAGE_SIZE = 3;

interface Page {
    data: Record<string, string>[];
    meta: { paging?: { nextPageUri: string } };
}

/**
 * `nextPageUri` must be **absolute**, exactly as a real broker emits it.
 *
 * `semp-discovery.extractNextPath` parses it with `new URL(uri)` and no base, so
 * a relative path throws, the catch returns null, and pagination silently stops
 * after page one — which hid the 4th and 5th queues of every VPN. The origin is
 * discarded by that parser (it keeps only pathname + search), so any absolute
 * origin works; echoing the request's own keeps it broker-shaped.
 */
function paginate(all: string[], field: string, origin: string, basePath: string, cursor: number): Page {
    const slice = all.slice(cursor, cursor + PAGE_SIZE);
    const next = cursor + PAGE_SIZE;
    const page: Page = { data: slice.map(v => ({ [field]: v })), meta: {} };
    if (next < all.length) {
        page.meta.paging = { nextPageUri: `${origin}${basePath}?count=${PAGE_SIZE}&cursor=${next}` };
    }
    return page;
}

/**
 * Answer a `/SEMP/v2/monitor/...` GET. Returns null when the path is not one
 * the demo serves, so the router can fall through.
 */
export function handleSempV2(url: URL): Page | null {
    const path = url.pathname;
    const cursor = Number(url.searchParams.get('cursor') ?? '0') || 0;

    if (/\/SEMP\/v2\/monitor\/msgVpns\/?$/.test(path)) {
        return paginate(listVpns(), 'msgVpnName', url.origin, path, cursor);
    }

    const queueList = /\/SEMP\/v2\/monitor\/msgVpns\/([^/]+)\/queues\/?$/.exec(path);
    if (queueList) {
        const vpn = decodeURIComponent(queueList[1]);
        return paginate(listQueues(vpn), 'queueName', url.origin, path, cursor);
    }

    return null;
}
