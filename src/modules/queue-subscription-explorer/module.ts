/**
 * Queue Subscription Explorer Module
 *
 * Lists every (vpn, queue, topic-subscription) triple visible to the SEMP
 * user. Three column-filter inputs combine with AND semantics. VPN/Queue use
 * substring + explicit-`*` matching; Subscription uses bidirectional Solace
 * topic intersection (* and > on either side). Priority is configured in
 * `src/registry.ts` alongside the other SEMP-only modules.
 */

import { createService, type SubscriptionRow } from './service';
import { renderRows, renderCounter, updateVisibility, uniqueQueues, EMPTY_MESSAGES } from './ui';
import { required } from '../../core/dom';
import { matchString, topicFilterMatches } from '../../core/utils';
import { INPUT_DEBOUNCE_MS } from '../../core/timing';
import { showToast } from '../../core/toast';
import { logger } from '../../core/logger';
import type { AppContext } from '../../core/types';

export const QueueSubscriptionExplorerModule = {
    name: 'Queue Subscriptions',
    id: 'queue-subscription-explorer',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus } = app;
        const service = createService(app);

        // Required elements — fail loudly at install time if any are missing.
        const elWarning = required<HTMLElement>(container, '#subexp-warning');
        const elAbout = required<HTMLElement>(container, '#subexp-about');
        const elTable = required<HTMLElement>(container, '#subexp-table-card');
        const btnLoad = required<HTMLButtonElement>(container, '#btn-subexp-load');
        const fVpn = required<HTMLInputElement>(container, '#subexp-filter-vpn');
        const fQueue = required<HTMLInputElement>(container, '#subexp-filter-queue');
        const fSub = required<HTMLInputElement>(container, '#subexp-filter-sub');
        const tbody = required<HTMLElement>(container, '#subexp-tbody');
        const counterEl = required<HTMLElement>(container, '#subexp-counter');

        // null = never loaded; [] = loaded with zero results.
        let allRows: SubscriptionRow[] | null = null;
        // Set after a load failure so `rerender()` shows the loadError empty
        // state instead of needLoad while allRows is null. Cleared on the next
        // successful load or on disconnect.
        let lastLoadError: string | null = null;
        // Generation counter — protects against an older fetch finalising state
        // when the user clicks Load again mid-stream. Same pattern as
        // queue-discovery's fetchQueuesGen.
        let loadGen = 0;
        let isLoading = false;

        function activeFilters() {
            return { vpn: fVpn.value.trim(), queue: fQueue.value.trim(), sub: fSub.value.trim() };
        }

        function applyFilters(rows: SubscriptionRow[], f: { vpn: string; queue: string; sub: string }): SubscriptionRow[] {
            return rows.filter(r =>
                vpnQueueMatch(f.vpn, r.vpn) &&
                vpnQueueMatch(f.queue, r.queue) &&
                subMatch(f.sub, r.topic)
            );
        }

        function rerender() {
            // Loading and never-loaded states show no counter — there's nothing
            // to count. The error state reuses the never-loaded code path but
            // with a different empty-row message.
            if (isLoading) {
                renderRows(tbody, [], EMPTY_MESSAGES.loading);
                renderCounter(counterEl, null);
                return;
            }
            if (allRows === null) {
                renderRows(tbody, [], lastLoadError ? EMPTY_MESSAGES.loadError : EMPTY_MESSAGES.needLoad);
                renderCounter(counterEl, null);
                return;
            }
            const totalQueues = uniqueQueues(allRows);
            const totalSubs = allRows.length;
            const f = activeFilters();
            const anyFilter = !!(f.vpn || f.queue || f.sub);
            if (!anyFilter) {
                // All filters empty → don't dump thousands of rows. Show totals
                // in the counter so the user sees what was loaded; ask them to
                // type to start narrowing.
                renderRows(tbody, [], EMPTY_MESSAGES.typing);
                renderCounter(counterEl, {
                    matchedQueues: totalQueues, totalQueues,
                    matchedSubs: totalSubs, totalSubs,
                    showMatched: false,
                });
                return;
            }
            const matched = applyFilters(allRows, f);
            renderRows(tbody, matched, EMPTY_MESSAGES.noMatch);
            renderCounter(counterEl, {
                matchedQueues: uniqueQueues(matched),
                totalQueues,
                matchedSubs: matched.length,
                totalSubs,
                showMatched: true,
            });
        }

        async function load() {
            // `loadGen` is bumped by both this entry point AND the SEMP-disconnect
            // handler. The disabled-button gate stops sync re-entry; the disconnect
            // bump invalidates an in-flight load whose pages haven't all yielded
            // yet, so the final `allRows = accumulated` write (and its success
            // toast) can't clobber the disconnect's state reset.
            const myGen = ++loadGen;
            isLoading = true;
            allRows = [];
            lastLoadError = null;
            btnLoad.disabled = true;
            btnLoad.textContent = 'Loading…';
            rerender();

            const accumulated: SubscriptionRow[] = [];
            try {
                for await (const page of service.fetchAllSubscriptions()) {
                    if (myGen !== loadGen) return; // superseded mid-stream
                    if (page.ok) {
                        accumulated.push(...page.data);
                    } else {
                        isLoading = false;
                        allRows = null;
                        lastLoadError = page.error;
                        btnLoad.disabled = false;
                        btnLoad.textContent = 'Load';
                        rerender();
                        showToast(`Failed to load subscriptions: ${page.error}`, 'error');
                        return;
                    }
                }
                /* v8 ignore start -- post-loop supersession check. The
                 * in-loop line-122 check catches all naturally-emitted
                 * disconnects (a disconnect bumps loadGen, then the next
                 * yield's iteration returns). This line covers the
                 * one-microtask window between the last yield being consumed
                 * and the generator's `{done:true}` resolution — reachable
                 * from real SDK callbacks but not robustly reproducible in
                 * jsdom. */
                if (myGen !== loadGen) return;
                /* v8 ignore stop */
                allRows = accumulated;
                isLoading = false;
                btnLoad.disabled = false;
                btnLoad.textContent = 'Refresh';
                rerender();
                showToast(`Loaded ${allRows.length} subscription${allRows.length === 1 ? '' : 's'}`, 'ok');
            } catch (e: any) {
                /* v8 ignore start -- defensive: createService's generator catches its
                 * own fetch errors and yields { ok: false }, so synchronous throws
                 * out of the for-await are not reachable through normal paths. */
                if (myGen !== loadGen) return;
                isLoading = false;
                allRows = null;
                lastLoadError = e?.message ?? 'unknown';
                btnLoad.disabled = false;
                btnLoad.textContent = 'Load';
                rerender();
                showToast(`Failed to load subscriptions: ${e?.message ?? 'unknown'}`, 'error');
                /* v8 ignore stop */
            }
        }

        // Debounced filter wiring — one timer per input, shared output: rerender.
        let filterTimer: ReturnType<typeof setTimeout> | null = null;
        function onFilterInput() {
            if (filterTimer) clearTimeout(filterTimer);
            filterTimer = setTimeout(rerender, INPUT_DEBOUNCE_MS);
        }
        fVpn.addEventListener('input', onFilterInput);
        fQueue.addEventListener('input', onFilterInput);
        fSub.addEventListener('input', onFilterInput);

        btnLoad.addEventListener('click', load);

        // Initial visibility based on current SEMP state.
        updateVisibility(elWarning, elAbout, elTable, appState.isSempConnected);

        // SEMP connect/disconnect — drop the cache + reset the table on disconnect.
        eventBus.on('app:state-change', ({ key, value }) => {
            if (key !== 'isSempConnected') return;
            const isConnected = value as boolean;
            updateVisibility(elWarning, elAbout, elTable, isConnected);
            if (!isConnected) {
                // Bump loadGen so any in-flight load is superseded — without
                // this, a slow load that yields a page after the disconnect
                // would write `allRows = accumulated` and show a misleading
                // "Loaded N" toast, clobbering the reset below.
                loadGen++;
                allRows = null;
                lastLoadError = null;
                isLoading = false;
                btnLoad.disabled = false;
                btnLoad.textContent = 'Load';
                fVpn.value = '';
                fQueue.value = '';
                fSub.value = '';
                rerender();
            }
        });

        logger.info('Queue Subscription Explorer Module Setup Complete');
    }
};

/* ---------------- pure predicates (exported for unit tests) ---------------- */

/**
 * VPN / Queue column match. Empty filter = match all. No `*` in filter →
 * case-insensitive substring match (per user choice). Filter contains `*` →
 * delegate to anchored `matchString` (same pattern queue-discovery uses on
 * its dropdown filter).
 */
export function vpnQueueMatch(filter: string, value: string): boolean {
    if (!filter) return true;
    if (!filter.includes('*')) return value.toLowerCase().includes(filter.toLowerCase());
    return matchString(value, filter);
}

/**
 * Subscription column match. Empty filter = match all. Otherwise asymmetric
 * topic-filter match: the user's input can use `*` as a wildcard anywhere in
 * a level (leading, middle, trailing); the stored subscription follows
 * Solace's stricter rule where `*` is only a wildcard when it's the last
 * character of a level (and `>` matches one or more trailing levels).
 */
export function subMatch(filter: string, topic: string): boolean {
    if (!filter) return true;
    return topicFilterMatches(filter, topic);
}
