import { escapeHtml } from '../../core/utils';
import type { SubscriptionRow } from './service';

/**
 * Pure DOM helpers for the queue-subscription-explorer table. Kept separate
 * from `module.ts` so the same surface can be exercised in unit tests without
 * the module-install lifecycle.
 */

/** Empty-state messages displayed inside `<tbody>` when no rows render. */
export const EMPTY_MESSAGES = {
    needLoad: 'Click <strong>Load</strong> to fetch subscriptions from the broker.',
    typing: 'Type in any column above to start searching.',
    noMatch: 'No subscriptions match the current filters.',
    loadError: 'Failed to load. Click <strong>Refresh</strong> to retry.',
    loading: 'Loading…',
} as const;

/**
 * Render `rows` into `tbody`. When `rows` is empty, render a single
 * full-width "empty" row using `emptyHtml` (HTML, not text — callers pass
 * `EMPTY_MESSAGES.*` which embed `<strong>`).
 */
export function renderRows(tbody: HTMLElement, rows: SubscriptionRow[], emptyHtml: string): void {
    if (rows.length === 0) {
        tbody.innerHTML =
            `<tr class="subexp-empty-row"><td colspan="3">${emptyHtml}</td></tr>`;
        return;
    }
    // Bulk-build via innerHTML — simpler than createElement in a hot loop and
    // safe because every interpolated value is escaped.
    const html = rows.map(r =>
        `<tr class="subexp-row">` +
        `<td>${escapeHtml(r.vpn)}</td>` +
        `<td>${escapeHtml(r.queue)}</td>` +
        `<td><code>${escapeHtml(r.topic)}</code></td>` +
        `</tr>`
    ).join('');
    tbody.innerHTML = html;
}

/**
 * Counter payload shown next to the "Subscriptions" title. `null` clears it
 * (used while loading or before the first Load click). `showMatched` controls
 * whether the matched-of-total form (`x / y`) renders; with no filters active
 * we show just the totals so the user sees what they have to work with.
 */
export interface CounterCounts {
    matchedQueues: number;
    totalQueues: number;
    matchedSubs: number;
    totalSubs: number;
    showMatched: boolean;
}

export function renderCounter(el: HTMLElement, counts: CounterCounts | null): void {
    // Clear in all paths — we rebuild from scratch so stale child spans can't
    // leak between renders.
    el.textContent = '';
    if (!counts) return;

    const queuesText = counts.showMatched
        ? `${counts.matchedQueues} / ${counts.totalQueues} queues`
        : `${counts.totalQueues} queue${counts.totalQueues === 1 ? '' : 's'}`;
    const subsText = counts.showMatched
        ? `${counts.matchedSubs} / ${counts.totalSubs} subscriptions`
        : `${counts.totalSubs} subscription${counts.totalSubs === 1 ? '' : 's'}`;

    const qSpan = document.createElement('span');
    qSpan.className = 'subexp-counter-queues';
    qSpan.textContent = queuesText;

    const sSpan = document.createElement('span');
    sSpan.className = 'subexp-counter-subs';
    sSpan.textContent = subsText;

    el.append(qSpan, document.createTextNode(' · '), sSpan);
}

/**
 * Count the unique `(vpn, queue)` pairs in a row set. Topics under the same
 * queue collapse to one queue. Used for both "matched queues" and "total
 * queues" by feeding it different inputs.
 */
export function uniqueQueues(rows: SubscriptionRow[]): number {
    const seen = new Set<string>();
    for (const r of rows) seen.add(`${r.vpn}\0${r.queue}`);
    return seen.size;
}
