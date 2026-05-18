import { describe, it, expect } from 'vitest';
import { renderRows, renderCounter, uniqueQueues, updateVisibility, EMPTY_MESSAGES } from '../../../src/modules/queue-subscription-explorer/ui';
import type { SubscriptionRow } from '../../../src/modules/queue-subscription-explorer/service';

function makeTbody(): HTMLElement {
    const t = document.createElement('table');
    const tbody = document.createElement('tbody');
    t.appendChild(tbody);
    return tbody;
}

describe('queue-subscription-explorer/ui', () => {
    describe('renderRows', () => {
        it('renders one <tr> per row with the three columns', () => {
            const tbody = makeTbody();
            const rows: SubscriptionRow[] = [
                { vpn: 'default', queue: 'q1', topic: 'a/b' },
                { vpn: 'vpn-dev', queue: 'q2', topic: 'c/>' },
            ];
            renderRows(tbody, rows, EMPTY_MESSAGES.typing);

            const trs = tbody.querySelectorAll('tr.subexp-row');
            expect(trs).toHaveLength(2);
            expect(trs[0].children[0].textContent).toBe('default');
            expect(trs[0].children[1].textContent).toBe('q1');
            // Topic is wrapped in <code>.
            expect(trs[0].children[2].querySelector('code')?.textContent).toBe('a/b');
            expect(trs[1].children[2].querySelector('code')?.textContent).toBe('c/>');
        });

        it('renders the empty-state row with HTML content (allows <strong>)', () => {
            const tbody = makeTbody();
            renderRows(tbody, [], EMPTY_MESSAGES.needLoad);
            const tr = tbody.querySelector('tr.subexp-empty-row');
            expect(tr).not.toBeNull();
            // The needLoad message contains a <strong> element which must
            // render as markup, not as escaped text.
            expect(tbody.querySelector('tr.subexp-empty-row strong')?.textContent).toBe('Load');
        });

        it('escapes HTML special characters in row text to prevent XSS', () => {
            const tbody = makeTbody();
            renderRows(tbody, [
                { vpn: 'v<script>', queue: 'q&1', topic: 'a/"b"' },
            ], EMPTY_MESSAGES.typing);
            // No <script> element should be created — the angle brackets are escaped.
            expect(tbody.querySelector('script')).toBeNull();
            expect(tbody.querySelectorAll('tr.subexp-row td')[0].textContent).toBe('v<script>');
            expect(tbody.querySelectorAll('tr.subexp-row td')[1].textContent).toBe('q&1');
            expect(tbody.querySelector('tr.subexp-row code')?.textContent).toBe('a/"b"');
        });

        it('replaces previously-rendered rows when re-rendered with a new list', () => {
            const tbody = makeTbody();
            renderRows(tbody, [{ vpn: 'a', queue: 'b', topic: 'c' }], EMPTY_MESSAGES.typing);
            expect(tbody.querySelectorAll('tr.subexp-row')).toHaveLength(1);
            renderRows(tbody, [], EMPTY_MESSAGES.noMatch);
            expect(tbody.querySelectorAll('tr.subexp-row')).toHaveLength(0);
            expect(tbody.querySelector('tr.subexp-empty-row td')?.textContent).toContain('No subscriptions');
        });
    });

    describe('uniqueQueues', () => {
        it('counts distinct (vpn, queue) pairs, collapsing topics under the same queue', () => {
            expect(uniqueQueues([
                { vpn: 'a', queue: 'q1', topic: 't/1' },
                { vpn: 'a', queue: 'q1', topic: 't/2' }, // same queue, different topic → 1
                { vpn: 'a', queue: 'q2', topic: 't/3' },
                { vpn: 'b', queue: 'q1', topic: 't/4' }, // same queue name in another VPN → distinct
            ])).toBe(3);
        });
        it('returns 0 for an empty input', () => {
            expect(uniqueQueues([])).toBe(0);
        });
    });

    describe('renderCounter', () => {
        it('clears the element when passed null', () => {
            const el = document.createElement('span');
            el.textContent = 'previous';
            renderCounter(el, null);
            expect(el.textContent).toBe('');
        });
        it('renders totals only when no filter is active (showMatched=false)', () => {
            const el = document.createElement('span');
            renderCounter(el, { matchedQueues: 5, totalQueues: 5, matchedSubs: 87, totalSubs: 87, showMatched: false });
            expect(el.textContent).toBe('5 queues · 87 subscriptions');
        });
        it('renders matched / total when a filter is active', () => {
            const el = document.createElement('span');
            renderCounter(el, { matchedQueues: 2, totalQueues: 5, matchedSubs: 12, totalSubs: 87, showMatched: true });
            expect(el.textContent).toBe('2 / 5 queues · 12 / 87 subscriptions');
        });
        it('uses singular "queue"/"subscription" when the count is 1', () => {
            const el = document.createElement('span');
            renderCounter(el, { matchedQueues: 1, totalQueues: 1, matchedSubs: 1, totalSubs: 1, showMatched: false });
            expect(el.textContent).toBe('1 queue · 1 subscription');
        });
        it('emits two child spans so each segment can carry its own colour', () => {
            const el = document.createElement('span');
            renderCounter(el, { matchedQueues: 3, totalQueues: 5, matchedSubs: 7, totalSubs: 9, showMatched: true });
            const qSpan = el.querySelector('.subexp-counter-queues');
            const sSpan = el.querySelector('.subexp-counter-subs');
            expect(qSpan?.textContent).toBe('3 / 5 queues');
            expect(sSpan?.textContent).toBe('7 / 9 subscriptions');
        });
        it('rebuilds cleanly across renders (no leftover children when transitioning to null)', () => {
            const el = document.createElement('span');
            renderCounter(el, { matchedQueues: 1, totalQueues: 1, matchedSubs: 1, totalSubs: 1, showMatched: false });
            expect(el.children).toHaveLength(2);
            renderCounter(el, null);
            expect(el.children).toHaveLength(0);
            expect(el.textContent).toBe('');
        });
    });

    describe('updateVisibility', () => {
        function makeTriple() {
            const warning = document.createElement('div');
            const about = document.createElement('div');
            const table = document.createElement('div');
            return { warning, about, table };
        }

        it('shows the warning and hides about+table when SEMP is disconnected', () => {
            const { warning, about, table } = makeTriple();
            warning.classList.add('hidden');
            about.classList.remove('hidden');
            table.classList.remove('hidden');
            updateVisibility(warning, about, table, false);
            expect(warning.classList.contains('hidden')).toBe(false);
            expect(about.classList.contains('hidden')).toBe(true);
            expect(table.classList.contains('hidden')).toBe(true);
        });

        it('hides the warning and reveals about+table when SEMP connects', () => {
            const { warning, about, table } = makeTriple();
            warning.classList.remove('hidden');
            about.classList.add('hidden');
            table.classList.add('hidden');
            updateVisibility(warning, about, table, true);
            expect(warning.classList.contains('hidden')).toBe(true);
            expect(about.classList.contains('hidden')).toBe(false);
            expect(table.classList.contains('hidden')).toBe(false);
        });
    });
});
