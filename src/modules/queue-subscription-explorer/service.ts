import { primarySempContextFrom, deriveSempV1Url } from '../../core/services/sempContext';
import { PAGE_DELAY_MS } from '../../core/services/semp-discovery';
import type { AppContext } from '../../core/types';
import { parseSubscriptionsResponse, type SubscriptionRow } from './parse';

export type { SubscriptionRow };

/** Yielded page from `fetchAllSubscriptions`. Mirrors `FetchPage` from semp-discovery. */
export type SubFetchPage =
    | { ok: true; data: SubscriptionRow[] }
    | { ok: false; error: string };

/** Page size used for the initial RPC. The broker keeps echoing `<more-cookie>`
 *  pages with the same chunking, so this only governs the first request. */
export const PAGE_SIZE = 100;

const INITIAL_BODY =
    `<rpc><show><queue><name>*</name><vpn-name>*</vpn-name>` +
    `<subscriptions/><count/><num-elements>${PAGE_SIZE}</num-elements></queue></show></rpc>`;

/**
 * Queue-subscription-explorer SEMP v1 service.
 *
 * `fetchAllSubscriptions()` is an async generator that POSTs the SEMP v1 RPC
 * to the broker, yields parsed `SubscriptionRow[]` per page, follows the
 * `<more-cookie>` continuation until the broker stops returning one, and
 * sleeps `PAGE_DELAY_MS` between subsequent page requests so we don't hammer
 * the broker.
 *
 * Mirrors the contract of `createSempDiscovery` (yields `{ ok, data | error }`),
 * including the SEMP-not-connected guard that yields a single error page
 * before any network call so callers can render a sensible error without
 * differentiating connection-state from per-request errors.
 */
export function createService(ctx: AppContext) {
    async function* fetchAllSubscriptions(): AsyncGenerator<SubFetchPage> {
        const sempCtx = primarySempContextFrom(ctx);
        if (!sempCtx) {
            yield { ok: false, error: 'SEMP Not Connected' };
            return;
        }
        const url = deriveSempV1Url(sempCtx.baseUrl);

        let body: string | null = INITIAL_BODY;
        let pageNum = 0;
        while (body) {
            if (pageNum > 0) {
                await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
            }
            try {
                const res = await sempCtx.fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body,
                });
                if (!res.ok) {
                    yield { ok: false, error: res.statusText || 'Error fetching subscriptions' };
                    return;
                }
                const text = await res.text();
                const parsed = parseSubscriptionsResponse(text);
                if (!parsed.ok) {
                    yield { ok: false, error: parsed.error };
                    return;
                }
                yield { ok: true, data: parsed.page.rows };
                body = parsed.page.nextPageBody;
            } catch (e: any) {
                yield { ok: false, error: e?.message || 'Error fetching subscriptions' };
                return;
            }
            pageNum++;
        }
    }

    return { fetchAllSubscriptions };
}
