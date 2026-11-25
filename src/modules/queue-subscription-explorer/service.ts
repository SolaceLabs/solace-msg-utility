import { unfilteredPrimarySempContext } from '../../core/services/sempContext';
import { visibleQueueRows } from '../../core/managed-semp-filter';
import { PAGE_DELAY_MS } from '../../core/services/semp-discovery';
import { sempErrorText, sempFailureText } from '../../core/services/semp-errors';
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

/** What a failed page says before its detail (HTTP status, gateway code, timeout). */
const FETCH_ERROR = 'Error fetching subscriptions';

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
 * In a Provisioned session each page keeps only the rows the user may see
 * (`visibleQueueRows`: a provisioned VPN and a visible queue). The RPC itself
 * still asks for every VPN, so the broker's whole subscription list reaches
 * the browser and is filtered here -- a guardrail in the app, like the queue
 * lists, not a boundary the gateway enforces.
 *
 * Mirrors the contract of `createSempDiscovery` (yields `{ ok, data | error }`),
 * including the SEMP-not-connected guard that yields a single error page
 * before any network call so callers can render a sensible error without
 * differentiating connection-state from per-request errors.
 */
export function createService(ctx: AppContext) {
    async function* fetchAllSubscriptions(): AsyncGenerator<SubFetchPage> {
        const sempCtx = unfilteredPrimarySempContext(ctx);
        if (!sempCtx) {
            yield { ok: false, error: 'SEMP Not Connected' };
            return;
        }

        let body: string | null = INITIAL_BODY;
        let pageNum = 0;
        while (body) {
            if (pageNum > 0) {
                await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
            }
            try {
                const res = await sempCtx.fetch('/SEMP', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body,
                });
                if (!res.ok) {
                    yield { ok: false, error: await sempErrorText(res, FETCH_ERROR) };
                    return;
                }
                const text = await res.text();
                const parsed = parseSubscriptionsResponse(text);
                if (!parsed.ok) {
                    yield { ok: false, error: parsed.error };
                    return;
                }
                yield { ok: true, data: visibleQueueRows(ctx.appState.managed, parsed.page.rows) };
                body = parsed.page.nextPageBody;
            } catch (e: unknown) {
                yield { ok: false, error: sempFailureText(e, FETCH_ERROR) };
                return;
            }
            pageNum++;
        }
    }

    return { fetchAllSubscriptions };
}
