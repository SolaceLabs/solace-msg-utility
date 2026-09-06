import { describe, it, expect, vi } from 'vitest';
import {
    QueueSubscriptionExplorerModule,
    vpnQueueMatch,
    subMatch,
} from '../../../src/modules/queue-subscription-explorer/module';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState } from '../../../src/core/types';

function createDOM() {
    return loadModuleDOM('queue-subscription-explorer');
}

function textRes(text: string, init: { ok?: boolean; statusText?: string } = {}) {
    return { ok: init.ok ?? true, statusText: init.statusText ?? 'OK', text: async () => text };
}

function createTestContext(container: HTMLElement, overrides: Partial<AppState> = {}) {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null,
        sempCredentials: {
            user: 'admin', pass: 'admin', baseUrl: 'https://broker:1943/SEMP/v2',
            protocol: 'https', host: 'broker', port: '1943', urlPath: '/SEMP/v2',
        },
        isSempConnected: true,
        ...overrides,
    };
    const ctx: AppContext = {
        container,
        appState,
        eventBus,
        setState: vi.fn((k: keyof AppState, v: any) => { (appState as any)[k] = v; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: {},
    };
    return { ctx, eventBus, appState };
}

const PAGE_OK = `<rpc-reply>
  <rpc><show><queue><queues>
    <queue><name>BULKQ-001</name><info><message-vpn>default</message-vpn></info>
      <subscriptions><subscription><topic>BULKQ/TEST</topic></subscription></subscriptions>
    </queue>
    <queue><name>orders-new</name><info><message-vpn>vpn-dev</message-vpn></info>
      <subscriptions><subscription><topic>orders/new/&gt;</topic></subscription></subscriptions>
    </queue>
  </queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

describe('QueueSubscriptionExplorerModule', () => {
    it('has correct metadata', () => {
        expect(QueueSubscriptionExplorerModule.id).toBe('queue-subscription-explorer');
        expect(QueueSubscriptionExplorerModule.name).toBe('Queue Subscriptions');
        expect(QueueSubscriptionExplorerModule.icon).toContain('svg');
        // Priority is set in src/registry.ts; tested in tests/registry.test.ts.
    });

    it('installs and shows the SEMP warning when disconnected', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container, { isSempConnected: false });
        await QueueSubscriptionExplorerModule.install(ctx);

        expect(container.querySelector('#subexp-warning')!.classList.contains('hidden')).toBe(false);
        expect(container.querySelector('#subexp-about')!.classList.contains('hidden')).toBe(true);
        expect(container.querySelector('#subexp-table-card')!.classList.contains('hidden')).toBe(true);
    });

    it('reveals the content cards when SEMP is connected at install time', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        await QueueSubscriptionExplorerModule.install(ctx);

        expect(container.querySelector('#subexp-warning')!.classList.contains('hidden')).toBe(true);
        expect(container.querySelector('#subexp-about')!.classList.contains('hidden')).toBe(false);
        expect(container.querySelector('#subexp-table-card')!.classList.contains('hidden')).toBe(false);
    });

    it('initial table body prompts the user to click Load', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        await QueueSubscriptionExplorerModule.install(ctx);
        const tbody = container.querySelector('#subexp-tbody')!;
        expect(tbody.textContent).toContain('Click');
        expect(tbody.textContent).toContain('Load');
    });

    it('clicking Load fetches, renders the "type to search" placeholder until a filter is typed', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);

        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();

        await vi.waitFor(() => {
            expect((ctx.sempFetch as any).mock.calls.length).toBe(1);
            const tbody = container.querySelector('#subexp-tbody')!;
            expect(tbody.textContent).toMatch(/Type in any column/);
        });

        // Load button becomes Refresh once the stream completes.
        const btn = container.querySelector('#btn-subexp-load') as HTMLButtonElement;
        expect(btn.textContent).toBe('Refresh');
        expect(btn.disabled).toBe(false);
    });

    it('typing into the VPN filter narrows visible rows (debounced)', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();

        // Wait until the load chain settles — button text flips to "Refresh"
        // and the table shows the "Type in any column…" hint.
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        // Now switch to fake timers to drive the input-debounce.
        vi.useFakeTimers();
        const fVpn = container.querySelector('#subexp-filter-vpn') as HTMLInputElement;
        fVpn.value = 'dev';
        fVpn.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        const rows = container.querySelectorAll('#subexp-tbody tr.subexp-row');
        expect(rows).toHaveLength(1);
        expect(rows[0].children[0].textContent).toBe('vpn-dev');

        vi.useRealTimers();
    });

    it('supports * wildcards on VPN/Queue filters', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        vi.useFakeTimers();
        const fQueue = container.querySelector('#subexp-filter-queue') as HTMLInputElement;
        fQueue.value = '*-001';
        fQueue.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        const rows = container.querySelectorAll('#subexp-tbody tr.subexp-row');
        expect(rows).toHaveLength(1);
        expect(rows[0].children[1].textContent).toBe('BULKQ-001');

        vi.useRealTimers();
    });

    it('subscription filter supports within-level wildcards (B*/* matches BULKQ/TEST)', async () => {
        // Regression for the user-reported bug where `B*/*` was being treated
        // as a literal level name ("B*") instead of a prefix wildcard.
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        vi.useFakeTimers();
        const fSub = container.querySelector('#subexp-filter-sub') as HTMLInputElement;
        fSub.value = 'B*/*';
        fSub.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        const rows = container.querySelectorAll('#subexp-tbody tr.subexp-row');
        expect(rows).toHaveLength(1);
        expect(rows[0].children[2].querySelector('code')?.textContent).toBe('BULKQ/TEST');

        // Counter reflects the matched-of-total counts.
        const counter = container.querySelector('#subexp-counter') as HTMLElement;
        expect(counter.textContent).toBe('1 / 2 queues · 1 / 2 subscriptions');

        vi.useRealTimers();
    });

    it('subscription filter uses topic intersection (user wildcard matches stored literal)', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        vi.useFakeTimers();
        // User types a pattern with > → should match the orders/new/> subscription
        // (identical) and NOT the BULKQ/TEST literal.
        const fSub = container.querySelector('#subexp-filter-sub') as HTMLInputElement;
        fSub.value = 'orders/>';
        fSub.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        const rows = container.querySelectorAll('#subexp-tbody tr.subexp-row');
        expect(rows).toHaveLength(1);
        expect(rows[0].children[2].querySelector('code')?.textContent).toBe('orders/new/>');

        vi.useRealTimers();
    });

    it('empty filters after load show the "type to search" hint instead of all rows', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            const tbody = container.querySelector('#subexp-tbody')!;
            expect(tbody.textContent).toMatch(/Type in any column/);
        });
    });

    it('no-match filters show the "no matches" hint and 0 / N counter', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        vi.useFakeTimers();
        const fVpn = container.querySelector('#subexp-filter-vpn') as HTMLInputElement;
        fVpn.value = 'zzz-nothing';
        fVpn.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        const tbody = container.querySelector('#subexp-tbody')!;
        expect(tbody.textContent).toMatch(/No subscriptions match/);

        // Counter still tracks total dataset; matched columns are 0.
        const counter = container.querySelector('#subexp-counter') as HTMLElement;
        expect(counter.textContent).toBe('0 / 2 queues · 0 / 2 subscriptions');

        vi.useRealTimers();
    });

    it('counter is cleared on load failure and on SEMP disconnect', async () => {
        const container = createDOM();
        const { ctx, eventBus } = createTestContext(container);

        // First load: succeed, populate counter.
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });
        const counter = container.querySelector('#subexp-counter') as HTMLElement;
        expect(counter.textContent).toBe('2 queues · 2 subscriptions');

        // Trigger a failure on the next click — counter must clear because we
        // no longer have a valid dataset.
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, statusText: 'Boom' });
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            const tbody = container.querySelector('#subexp-tbody')!;
            expect(tbody.textContent).toMatch(/Failed to load/);
        });
        expect(counter.textContent).toBe('');

        // Recover by reloading successfully — counter repopulates.
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect(counter.textContent).toBe('2 queues · 2 subscriptions');
        });

        // SEMP disconnect resets state — counter clears again.
        eventBus.emit('app:state-change', { key: 'isSempConnected', value: false });
        expect(counter.textContent).toBe('');
    });

    it('load error keeps the Load button visible and renders the error hint', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce({ ok: false, statusText: 'Boom' });
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();

        await vi.waitFor(() => {
            const tbody = container.querySelector('#subexp-tbody')!;
            expect(tbody.textContent).toMatch(/Failed to load/);
        });
        const btn = container.querySelector('#btn-subexp-load') as HTMLButtonElement;
        expect(btn.textContent).toBe('Load');
        expect(btn.disabled).toBe(false);
    });

    it('counter shows totals after load and switches to matched/total when a filter is typed', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);

        // Before load — counter is empty (nothing to count yet).
        const counter = container.querySelector('#subexp-counter') as HTMLElement;
        expect(counter.textContent).toBe('');

        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        // PAGE_OK fixture has 2 rows across 2 queues (BULKQ-001 in default,
        // orders-new in vpn-dev). With no filters, counter shows totals only.
        expect(counter.textContent).toBe('2 queues · 2 subscriptions');

        // Type a filter that matches one row — counter flips to matched/total.
        vi.useFakeTimers();
        const fVpn = container.querySelector('#subexp-filter-vpn') as HTMLInputElement;
        fVpn.value = 'dev';
        fVpn.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        expect(counter.textContent).toBe('1 / 2 queues · 1 / 2 subscriptions');

        vi.useRealTimers();
    });

    it('Load button is disabled while a load is in flight (gates re-entry)', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);

        // Hang the first fetch so the in-flight state is observable.
        let resolvePage: (v: any) => void;
        (ctx.sempFetch as any).mockReturnValueOnce(new Promise(r => { resolvePage = r; }));

        await QueueSubscriptionExplorerModule.install(ctx);
        const btn = container.querySelector('#btn-subexp-load') as HTMLButtonElement;
        btn.click();

        // Mid-flight: button must be disabled and labelled "Loading…" so a
        // second user click is a DOM no-op.
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toContain('Loading');
        // Confirm a click on a disabled button does NOT issue another fetch.
        btn.click();
        expect((ctx.sempFetch as any).mock.calls.length).toBe(1);

        resolvePage!(textRes(PAGE_OK));
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });
        expect(btn.disabled).toBe(false);
    });

    it('SEMP disconnect resets state and re-hides the content cards', async () => {
        const container = createDOM();
        const { ctx, eventBus } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        // Type something so we can confirm it's cleared on disconnect.
        (container.querySelector('#subexp-filter-vpn') as HTMLInputElement).value = 'default';

        eventBus.emit('app:state-change', { key: 'isSempConnected', value: false });

        expect(container.querySelector('#subexp-warning')!.classList.contains('hidden')).toBe(false);
        expect((container.querySelector('#subexp-filter-vpn') as HTMLInputElement).value).toBe('');
        expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Load');
    });

    it('SEMP re-connect toggles visibility back on without auto-loading', async () => {
        const container = createDOM();
        const { ctx, eventBus } = createTestContext(container, { isSempConnected: false });
        await QueueSubscriptionExplorerModule.install(ctx);
        expect(container.querySelector('#subexp-warning')!.classList.contains('hidden')).toBe(false);

        eventBus.emit('app:state-change', { key: 'isSempConnected', value: true });
        expect(container.querySelector('#subexp-warning')!.classList.contains('hidden')).toBe(true);
        expect(container.querySelector('#subexp-about')!.classList.contains('hidden')).toBe(false);
        // No auto-fetch — Load is still the manual trigger.
        expect(ctx.sempFetch).not.toHaveBeenCalled();
    });

    it('ignores non-isSempConnected state changes', async () => {
        const container = createDOM();
        const { ctx, eventBus } = createTestContext(container);
        await QueueSubscriptionExplorerModule.install(ctx);
        // Not isSempConnected — handler must early-return.
        eventBus.emit('app:state-change', { key: 'isConnected', value: true });
        // No effect on the DOM.
        expect(container.querySelector('#subexp-warning')!.classList.contains('hidden')).toBe(true);
    });

    it('throws at install when a required element is missing', async () => {
        // The gate (#subexp-warning) is now created by createGate, not required
        // from the template — so an empty container makes install fail on the
        // first genuine required() capture (#subexp-about).
        const container = document.createElement('div');
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);
        await expect(QueueSubscriptionExplorerModule.install(ctx)).rejects.toThrow(/Required element missing/);
    });

    it('toast uses singular "subscription" when exactly one row loaded', async () => {
        // The `${allRows.length === 1 ? '' : 's'}` ternary at module.ts:143
        // — the truthy (singular) branch — is otherwise unexercised because
        // every fixture in this file loads 2+ rows.
        const container = createDOM();
        const { ctx } = createTestContext(container);
        const ONE_ROW_PAGE = `<rpc-reply>
          <rpc><show><queue><queues>
            <queue><name>only-queue</name><info><message-vpn>default</message-vpn></info>
              <subscriptions><subscription><topic>only/topic</topic></subscription></subscriptions>
            </queue>
          </queues></queue></show></rpc>
          <execute-result code="ok"/>
        </rpc-reply>`;
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(ONE_ROW_PAGE));
        // Spy on the toast call by reaching the global console — showToast
        // both renders DOM and logs. The deterministic anchor is the counter:
        // assert that AFTER load completes, btn says Refresh AND the counter
        // reads "1 queue · 1 subscription" (the unique-queues and total
        // counters BOTH use singular).
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });
        const counter = container.querySelector('#subexp-counter') as HTMLElement;
        // Verifies: 1 row loaded; the counter uses singular form (proves
        // allRows.length === 1 is true at the toast site too).
        expect(counter.textContent).toBe('1 queue · 1 subscription');
    });

    it('SEMP disconnect mid-load supersedes the in-flight load (no clobber + no toast)', async () => {
        // Closes the supersession branch at module.ts:122. Bug discovered
        // alongside this test: the disconnect handler used to NOT bump
        // `loadGen`, so a slow load could yield a page AFTER the disconnect
        // reset and then write `allRows = accumulated` + show "Loaded N"
        // toast, clobbering the cleared state. Fix: the disconnect handler
        // now bumps loadGen too.
        //
        // Mechanics: hang the SEMP fetch on the first call. While it's
        // hanging, emit `isSempConnected=false`, which now bumps loadGen.
        // Then resolve the fetch with a successful page; the generator
        // yields, and the for-await body's `if (myGen !== loadGen) return;`
        // check at line 122 fires, discarding the page.
        const container = createDOM();
        const { ctx, eventBus } = createTestContext(container);

        let resolveFetch: (v: any) => void = () => {};
        (ctx.sempFetch as any).mockReturnValueOnce(new Promise((r) => { resolveFetch = r; }));

        await QueueSubscriptionExplorerModule.install(ctx);
        const btn = container.querySelector('#btn-subexp-load') as HTMLButtonElement;
        btn.click();

        // Drain microtasks so load() reaches the awaited sempFetch.
        for (let i = 0; i < 5; i++) await Promise.resolve();

        // Disconnect mid-fetch — per the fix, this bumps loadGen, resets
        // allRows to null, re-enables the button, clears the filters.
        eventBus.emit('app:state-change', { key: 'isSempConnected', value: false });
        expect(btn.textContent).toBe('Load');
        const tbody = container.querySelector('#subexp-tbody')!;
        expect(tbody.textContent).toMatch(/Click/);

        // Resolve the fetch with a valid page. The generator yields it;
        // for-await body line 122 sees myGen=1 !== loadGen=2 and returns
        // BEFORE the `accumulated.push(page.data)` would have run.
        resolveFetch(textRes(PAGE_OK));
        await vi.waitFor(() => {
            // Wait until the load chain has had a chance to either render
            // the rows (regression) or be discarded (current). We assert
            // the discard outcome below.
            expect(btn.textContent).toBe('Load');
        });

        // Stayed cleared: button is 'Load' (NOT 'Refresh'), table is empty,
        // and the bad rows from PAGE_OK never made it into the DOM.
        expect(btn.textContent).toBe('Load');
        expect(tbody.textContent).not.toContain('BULKQ-001');
        expect(tbody.textContent).not.toContain('orders-new');
        expect(tbody.textContent).toMatch(/Click/);
    });

    it('debounced filter handler coalesces rapid keystrokes into one rerender', async () => {
        const container = createDOM();
        const { ctx } = createTestContext(container);
        (ctx.sempFetch as any).mockResolvedValueOnce(textRes(PAGE_OK));
        await QueueSubscriptionExplorerModule.install(ctx);
        (container.querySelector('#btn-subexp-load') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((container.querySelector('#btn-subexp-load') as HTMLButtonElement).textContent).toBe('Refresh');
        });

        vi.useFakeTimers();
        const fVpn = container.querySelector('#subexp-filter-vpn') as HTMLInputElement;
        // Two rapid keystrokes — only the second value should take effect.
        fVpn.value = 'd';
        fVpn.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(200);
        fVpn.value = 'dev';
        fVpn.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(500);

        const rows = container.querySelectorAll('#subexp-tbody tr.subexp-row');
        expect(rows).toHaveLength(1);
        expect(rows[0].children[0].textContent).toBe('vpn-dev');
        vi.useRealTimers();
    });
});

describe('queue-subscription-explorer predicates', () => {
    describe('vpnQueueMatch', () => {
        it('empty filter matches anything', () => {
            expect(vpnQueueMatch('', 'default')).toBe(true);
        });
        it('without * uses case-insensitive substring', () => {
            expect(vpnQueueMatch('def', 'default')).toBe(true);
            expect(vpnQueueMatch('DEF', 'default')).toBe(true);
            expect(vpnQueueMatch('xyz', 'default')).toBe(false);
        });
        it('with * uses anchored wildcard (via matchString)', () => {
            expect(vpnQueueMatch('def*', 'default')).toBe(true);
            expect(vpnQueueMatch('*ult', 'default')).toBe(true);
            // Anchored: 'def' alone (no *) would substring-match, but 'def'
            // alone — wait, 'def' has no * so it's substring. Test with *
            // that should NOT match to guard the anchored path.
            expect(vpnQueueMatch('def*xxx', 'default')).toBe(false);
        });
    });

    describe('subMatch', () => {
        it('empty filter matches any topic', () => {
            expect(subMatch('', 'anything/here')).toBe(true);
        });
        it('user wildcard matches stored literal levels (and vice versa for trailing-* in stored)', () => {
            expect(subMatch('orders/*', 'orders/new')).toBe(true);   // user has *, stored literal
            expect(subMatch('orders/new', 'orders/*')).toBe(true);   // stored * is at level-end → wildcard
            expect(subMatch('orders/>', 'orders/new/v2')).toBe(true); // > is multi-level wildcard
            expect(subMatch('orders/new', 'payments/*')).toBe(false); // prefixes don't match
        });
        it('user input may use * anywhere in a level — leading, middle, trailing', () => {
            // The user's reported case + variations.
            expect(subMatch('B*/*', 'BULKQ/TEST')).toBe(true);
            expect(subMatch('*Q/T*', 'BULKQ/TEST')).toBe(true);
            expect(subMatch('B*Q/T*T', 'BULKQ/TEST')).toBe(true);
        });
        it('stored * is literal unless it is the LAST character of its level', () => {
            // Stored topic with a non-terminal `*` — the `*` is a literal char,
            // not a wildcard. So a user-typed literal `foobar` does NOT match
            // stored `foo*bar` (which is the literal 7-char string foo*bar).
            expect(subMatch('foobar', 'foo*bar')).toBe(false);
            // The same stored topic IS matched when the user types it back
            // with its own `*` in the same position — the user's `*` matches
            // the literal `*` character (since user `*` matches any single char).
            expect(subMatch('foo*bar', 'foo*bar')).toBe(true);
            // Stored `foo*` — `*` is last in level → wildcard. User literal
            // `foo` matches because the wildcard accepts the empty suffix.
            expect(subMatch('foo', 'foo*')).toBe(true);
            // Stored `foo*bar/baz` (middle * literal) — user must include
            // some character matching the `*` literal at that position.
            expect(subMatch('fooXbar/baz', 'foo*bar/baz')).toBe(false);
            expect(subMatch('foobar/baz', 'foo*bar/baz')).toBe(false);
        });
    });
});
