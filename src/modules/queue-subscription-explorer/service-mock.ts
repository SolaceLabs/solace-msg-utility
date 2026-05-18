import type { AppContext } from '../../core/types';
import type { SubFetchPage, SubscriptionRow } from './service';

export type { SubscriptionRow };
export type { SubFetchPage };

/**
 * Mock service for the demo bundle. Returns two pages of canned subscription
 * rows so the user can exercise the column filters (substring, `*`, `>`,
 * topic intersection) without a live broker. Mirrors the real service's
 * `fetchAllSubscriptions` async-generator contract.
 *
 * Yields two pages so the rerender-per-page path is exercised in the demo.
 */
export function createService(_ctx: AppContext) {
    async function* fetchAllSubscriptions(): AsyncGenerator<SubFetchPage> {
        yield {
            ok: true,
            data: [
                { vpn: 'default', queue: 'BULKQ-001', topic: 'BULKQ/TEST' },
                { vpn: 'default', queue: 'BULKQ-002', topic: 'BULKQ/TEST' },
                { vpn: 'default', queue: 'BULKQ-003', topic: 'BULKQ/TEST' },
                { vpn: 'default', queue: 'orders-new', topic: 'orders/new/*' },
                { vpn: 'default', queue: 'orders-new', topic: 'orders/new/v2/>' },
                { vpn: 'vpn-dev', queue: 'audit-log', topic: 'logs/>' },
            ]
        };
        // Tiny gap so the UI can paint between pages.
        await new Promise(r => setTimeout(r, 50));
        yield {
            ok: true,
            data: [
                { vpn: 'vpn-dev', queue: 'audit-log', topic: 'system/audit/*' },
                { vpn: 'vpn-prod', queue: 'payments-Q', topic: 'payments/inbound/*' },
                { vpn: 'vpn-prod', queue: 'payments-Q', topic: 'payments/outbound/>' },
                { vpn: 'vpn-finance', queue: 'reports-daily', topic: 'finance/reports/daily' },
            ]
        };
    }
    return { fetchAllSubscriptions };
}
