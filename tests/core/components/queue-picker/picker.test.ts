import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pickQueue, __resetForTest } from '../../../../src/core/components/queue-picker';
import type { SempContext } from '../../../../src/core/connections/types';
import { sempQueueSource } from '../../../../src/core/services/queue-source';
import { INPUT_DEBOUNCE_MS } from '../../../../src/core/timing';

/**
 * Picker tests. The picker is module-scoped (lazily-created dialog DOM, single
 * inflight invocation). `__resetForTest` clears the module state between tests
 * so each test exercises the lazy-create path. The picker consumes a
 * `QueueSource`; here we drive it with the real SEMP-backed `sempQueueSource`
 * over a stubbed `SempContext.fetch` (so `.fetch` mock inspection still works
 * and the source's cache key is the broker `baseUrl`), then dispatch DOM events.
 */

function makeSempCtx(overrides: Partial<SempContext> = {}): SempContext {
    return {
        fetch: vi.fn(),
        baseUrl: 'http://broker:8080',
        ...overrides,
    };
}

/** Wrap a (stubbed) SempContext in the real SEMP-backed QueueSource so the
 *  picker — which now takes a QueueSource — drives `sempCtx.fetch` exactly as
 *  before. Its `key` is `sempCtx.baseUrl`, preserving the cache semantics the
 *  tests below assert. */
function src(sempCtx: SempContext) {
    return sempQueueSource(sempCtx, 'unmanaged');
}

/** Wire the SempContext.fetch mock to return canned VPN + queue page data.
 *  Both lists return as a single page (no pagination). */
function stubVpnsAndQueues(
    sempCtx: SempContext,
    vpns: string[],
    queuesByVpn: Record<string, string[]>
): void {
    (sempCtx.fetch as any).mockImplementation(async (url: string) => {
        if (/\/msgVpns\/[^/]+\/queues/.test(url)) {
            const vpn = url.match(/\/msgVpns\/([^/]+)\/queues/)![1];
            const queues = queuesByVpn[vpn] ?? [];
            return {
                ok: true,
                json: async () => ({ data: queues.map(q => ({ queueName: q })) }),
            };
        }
        if (url.includes('/msgVpns')) {
            return {
                ok: true,
                json: async () => ({ data: vpns.map(v => ({ msgVpnName: v })) }),
            };
        }
        return { ok: false, statusText: 'Unexpected URL' };
    });
}

function getDialog(): HTMLDialogElement {
    return document.querySelector('dialog.picker-dialog') as HTMLDialogElement;
}

function $<T extends Element>(sel: string): T {
    return document.querySelector(sel) as T;
}

/** Returns the text of every dropdown option whose `display` style is NOT 'none'.
 *  Mirrors how the user perceives the list — hidden options aren't visible. */
function visibleOptions(listSel: string): string[] {
    const all = document.querySelectorAll<HTMLElement>(
        `${listSel} .picker-dropdown-option:not(.picker-dropdown-empty)`,
    );
    return Array.from(all)
        .filter((o) => o.style.display !== 'none')
        .map((o) => o.textContent ?? '');
}

/** Wait for any pending promises to settle so async generators have a chance
 *  to deliver their pages. Each page requires several microtasks to flow
 *  through (fetch → json → yield → for-await next → consumer body), so we
 *  drain generously. 20 iterations costs nothing in practice and makes
 *  tests resilient to minor ordering changes in the factory chain. */
async function flushAsync(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('core/components/queue-picker', () => {
    beforeEach(() => {
        __resetForTest();
    });

    describe('basic open / close', () => {
        it('lazily creates the dialog DOM on first invocation and shows it', async () => {
            expect(getDialog()).toBeNull();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const promise = pickQueue(src(sempCtx));
            await flushAsync();

            const d = getDialog();
            expect(d).not.toBeNull();
            expect(d.hasAttribute('open')).toBe(true);

            // Cancel to clean up the test
            $<HTMLButtonElement>('.picker-cancel').click();
            expect(await promise).toBeNull();
        });

        it('reuses the same dialog DOM across invocations (no double-attached handlers)', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v1'], { v1: ['q1'] });

            // First invocation
            let p = pickQueue(src(sempCtx));
            await flushAsync();
            const firstDialog = getDialog();
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Second invocation
            p = pickQueue(src(sempCtx));
            await flushAsync();
            expect(getDialog()).toBe(firstDialog);
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('rejects a concurrent invocation while a picker is already open', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const first = pickQueue(src(sempCtx));
            await flushAsync();

            await expect(pickQueue(src(sempCtx))).rejects.toThrow(/already open/);

            $<HTMLButtonElement>('.picker-cancel').click();
            await first;
        });
    });

    describe('VPN loading', () => {
        it('fetches VPNs on open, sorts them, and renders dropdown options', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-c', 'vpn-a', 'vpn-b'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            // Trigger focus to ensure list is shown
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const opts = document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option');
            expect(Array.from(opts).map(o => o.textContent)).toEqual(['vpn-a', 'vpn-b', 'vpn-c']);
            expect($<HTMLDivElement>('.picker-status').textContent).toContain('3 VPNs loaded');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('shows "1 VPN loaded" (singular) for a single result', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['only-vpn'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toBe('1 VPN loaded.');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('renders empty-state placeholder when no VPNs available', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const empty = $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-empty');
            expect(empty).not.toBeNull();
            expect(empty.textContent).toMatch(/no vpns available/i);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('surfaces SEMP error pages in the status line', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockResolvedValue({ ok: false, statusText: 'Forbidden' });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toContain('Failed to load VPNs');
            expect($<HTMLDivElement>('.picker-status').textContent).toContain('Forbidden');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('surfaces a thrown SempContext.fetch rejection in the status line', async () => {
            const sempCtx = makeSempCtx();
            // Throw synchronously from the mock to bypass the async-generator
            // try/catch in the discovery factory and hit the picker's outer catch.
            (sempCtx.fetch as any).mockImplementation(() => {
                throw new Error('boom');
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toContain('Failed to load VPNs');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('refresh button re-fetches VPNs', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            const callsBefore = (sempCtx.fetch as any).mock.calls.length;

            $<HTMLButtonElement>('.picker-vpn-refresh').click();
            await flushAsync();

            const callsAfter = (sempCtx.fetch as any).mock.calls.length;
            expect(callsAfter).toBeGreaterThan(callsBefore);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });

    describe('VPN selection + queue loading', () => {
        it('selecting a VPN enables the queue input + refresh and fetches queues', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a'], { 'vpn-a': ['q1', 'q2'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const vpnOpt = $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option');
            vpnOpt.click();
            await flushAsync();

            expect($<HTMLInputElement>('.picker-vpn-input').value).toBe('vpn-a');
            expect($<HTMLInputElement>('.picker-queue-input').disabled).toBe(false);
            expect($<HTMLButtonElement>('.picker-queue-refresh').disabled).toBe(false);

            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            const queueOpts = document.querySelectorAll<HTMLDivElement>('.picker-queue-list .picker-dropdown-option');
            expect(Array.from(queueOpts).map(o => o.textContent)).toEqual(['q1', 'q2']);
            expect($<HTMLDivElement>('.picker-status').textContent).toContain('2 queues loaded');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('shows singular "1 queue loaded" for a single result', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['only-q'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toBe('1 queue loaded.');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('selectVpn cache-hit branch reports the right singular/plural/empty status', async () => {
            // Distinct from the fetchQueues path tested below: this exercises
            // selectVpn's cache-hit branch's three status flavors —
            // empty (length===0), plural (length>1), and singular (length===1).
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['empty-vpn', 'pair', 'singleton'], {
                'empty-vpn': [],
                'pair': ['q-1', 'q-2'],
                'singleton': ['only'],
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const focusVpn = () => $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const clickVpnOpt = (i: number) =>
                (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[i]).click();

            // Prime caches for all three VPNs (these go through fetchQueues, not the cache-hit path).
            focusVpn(); clickVpnOpt(0); await flushAsync();
            focusVpn(); clickVpnOpt(1); await flushAsync();
            focusVpn(); clickVpnOpt(2); await flushAsync();

            // Re-select each — cache hit. Status reflects each branch of the inner ternary.
            focusVpn(); clickVpnOpt(0);
            expect($<HTMLDivElement>('.picker-status').textContent).toBe('No queues found in empty-vpn.');

            focusVpn(); clickVpnOpt(1);
            expect($<HTMLDivElement>('.picker-status').textContent).toBe('2 queues loaded.');

            focusVpn(); clickVpnOpt(2);
            expect($<HTMLDivElement>('.picker-status').textContent).toBe('1 queue loaded.');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('shows "No queues found" when the VPN has zero queues', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['empty-vpn'], { 'empty-vpn': [] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toContain('No queues found');
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            // Empty cache exists for this VPN; focus doesn't re-show because
            // there are zero entries — but the renderQueueList path still has
            // the empty-state placeholder when invoked from a focus.
            // Drive an explicit render via the input event to populate.
        });

        it('uses cached queues when re-selecting a previously-fetched VPN', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {
                'vpn-a': ['qa-1'],
                'vpn-b': ['qb-1'],
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const vpnOpts = document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option');

            // Pick vpn-a → queues fetched
            (vpnOpts[0] as HTMLDivElement).click();
            await flushAsync();
            const fetchCallsAfterA = (sempCtx.fetch as any).mock.calls.length;

            // Switch to vpn-b → queues fetched
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[1]).click();
            await flushAsync();
            const fetchCallsAfterB = (sempCtx.fetch as any).mock.calls.length;
            expect(fetchCallsAfterB).toBeGreaterThan(fetchCallsAfterA);

            // Switch back to vpn-a → no new fetch (cache hit)
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[0]).click();
            await flushAsync();
            expect((sempCtx.fetch as any).mock.calls.length).toBe(fetchCallsAfterB);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('refresh queues button drops the cache for the current VPN and re-fetches', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a'], { 'vpn-a': ['q1'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();
            const callsBefore = (sempCtx.fetch as any).mock.calls.length;

            $<HTMLButtonElement>('.picker-queue-refresh').click();
            await flushAsync();
            const callsAfter = (sempCtx.fetch as any).mock.calls.length;
            expect(callsAfter).toBeGreaterThan(callsBefore);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('surfaces queue-fetch errors in the status line', async () => {
            const sempCtx = makeSempCtx();
            // VPNs ok; queues fail.
            (sempCtx.fetch as any).mockImplementation(async (url: string) => {
                if (/\/msgVpns\/[^/]+\/queues/.test(url)) {
                    return { ok: false, statusText: 'Server Error' };
                }
                return { ok: true, json: async () => ({ data: [{ msgVpnName: 'v' }] }) };
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toContain('Failed to load queues');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('surfaces a thrown queue-fetch rejection in the status line', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockImplementation((url: string) => {
                if (/\/msgVpns\/[^/]+\/queues/.test(url)) {
                    throw new Error('queue boom');
                }
                return Promise.resolve({ ok: true, json: async () => ({ data: [{ msgVpnName: 'v' }] }) });
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            expect($<HTMLDivElement>('.picker-status').textContent).toContain('Failed to load queues');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });

    describe('queue selection + confirm', () => {
        it('selecting a queue enables Confirm; clicking Confirm resolves with the queue name', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['my-queue'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            expect($<HTMLButtonElement>('.picker-confirm').disabled).toBe(true);

            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-queue-list .picker-dropdown-option').click();

            expect($<HTMLButtonElement>('.picker-confirm').disabled).toBe(false);
            expect($<HTMLInputElement>('.picker-queue-input').value).toBe('my-queue');

            $<HTMLButtonElement>('.picker-confirm').click();
            expect(await p).toEqual({ vpn: 'v', queue: 'my-queue' });
        });

        it('confirm with no queue selected is a no-op even if dispatched', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q1'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            // Bypass the disabled attribute via dispatchEvent — `.click()` on a
            // disabled button is a jsdom no-op and would not exercise the
            // `!state.selectedQueue` short-circuit in the click handler.
            $<HTMLButtonElement>('.picker-confirm')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // Picker should still be open; cancel to clean up.
            expect(getDialog().hasAttribute('open')).toBe(true);
            $<HTMLButtonElement>('.picker-cancel').click();
            expect(await p).toBeNull();
        });
    });

    describe('cancel / close paths', () => {
        it('Cancel button resolves with null', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLButtonElement>('.picker-cancel').click();
            expect(await p).toBeNull();
        });

        it('× close button resolves with null', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLButtonElement>('.picker-close').click();
            expect(await p).toBeNull();
        });

        it('backdrop click (target === dialog, coords outside rect) resolves with null', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            // Simulate click landing on the backdrop — target === dialog AND
            // the coordinates are outside the dialog's box (the hit-test in
            // attachBackdropClose distinguishes backdrop from padding-clicks).
            const dialog = getDialog();
            dialog.getBoundingClientRect = () => ({
                left: 100, top: 100, right: 500, bottom: 400,
                x: 100, y: 100, width: 400, height: 300,
                toJSON: () => ({}),
            }) as DOMRect;
            dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 }));
            expect(await p).toBeNull();
        });

        it('programmatic dialog.close() resolves with null', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            getDialog().close();
            expect(await p).toBeNull();
        });
    });

    describe('options', () => {
        it('opts.title overrides the default title', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx), { title: 'Choose source queue' });
            await flushAsync();
            expect($<HTMLElement>('.picker-title').textContent).toBe('Choose source queue');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('opts.defaultVpn pre-selects the VPN once it loads, and auto-fetches its queues', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], { 'vpn-b': ['qb1'] });

            const p = pickQueue(src(sempCtx), { defaultVpn: 'vpn-b' });
            await flushAsync();

            expect($<HTMLInputElement>('.picker-vpn-input').value).toBe('vpn-b');
            expect($<HTMLInputElement>('.picker-queue-input').disabled).toBe(false);
            // Queue list is fetched and ready behind the scenes (cache populated).
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            await flushAsync();
            const queueOpts = document.querySelectorAll<HTMLDivElement>('.picker-queue-list .picker-dropdown-option');
            expect(Array.from(queueOpts).map(o => o.textContent)).toEqual(['qb1']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('opts.defaultVpn that does not exist in the fetched list is ignored (no auto-fetch)', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a'], {});

            const p = pickQueue(src(sempCtx), { defaultVpn: 'vpn-missing' });
            await flushAsync();

            expect($<HTMLInputElement>('.picker-queue-input').disabled).toBe(true);
            expect($<HTMLButtonElement>('.picker-queue-refresh').disabled).toBe(true);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });

    describe('filtering', () => {
        it('typing filters the VPN list (hides non-matches via display:none) after the debounce window', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-alpha', 'vpn-beta', 'vpn-gamma'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'beta';
            input.dispatchEvent(new Event('input'));

            // All options still in DOM before the debounce window passes.
            await Promise.resolve();
            const all = document.querySelectorAll<HTMLDivElement>(
                '.picker-vpn-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            expect(all.length).toBe(3);

            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            // Filter applied: only the matching option is visible.
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-beta']);
            // The other options remain in DOM, just hidden.
            expect(all.length).toBe(3);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('typing again before the debounce window cancels the prior timer', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-alpha', 'vpn-beta', 'vpn-gamma'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'al';
            input.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(50);

            input.value = 'beta';
            input.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);

            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-beta']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('hides every option when the filter excludes everything (no "no match" placeholder, mirrors discovery)', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'zzzzz';
            input.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);

            // Every option is in DOM but none visible.
            expect(visibleOptions('.picker-vpn-list')).toEqual([]);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('queue input filters via display toggle; clearing shows everything again', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['queue-1', 'queue-2'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            const qInput = $<HTMLInputElement>('.picker-queue-input');
            qInput.value = 'queue';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            expect(visibleOptions('.picker-queue-list')).toEqual(['queue-1', 'queue-2']);

            qInput.value = 'no-match';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            expect(visibleOptions('.picker-queue-list')).toEqual([]);

            // Clearing the input → everything visible again on the next filter run.
            qInput.value = '';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            expect(visibleOptions('.picker-queue-list')).toEqual(['queue-1', 'queue-2']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('VPN option with empty textContent is hidden by any non-empty filter', async () => {
            // Sibling of the queue-list COV-12 test below — same `(opt.textContent
            // || '').toLowerCase()` defensive fallback at applyVpnFilter
            // (queue-picker/index.ts:297). Mirrors the queue-list test
            // exactly so a regression in either filter is caught.
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-1', 'vpn-2'], { 'vpn-1': [], 'vpn-2': [] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            await flushAsync();

            const opts = document.querySelectorAll<HTMLDivElement>(
                '.picker-vpn-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            opts[0].textContent = '';

            const vInput = $<HTMLInputElement>('.picker-vpn-input');
            vInput.value = 'vpn';
            vInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);

            expect(opts[0].style.display).toBe('none');
            expect(opts[1].style.display).not.toBe('none');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('queue option with empty textContent is hidden by any non-empty filter (closes COV-12)', async () => {
            // The `(opt.textContent || '').toLowerCase()` fallback at
            // queue-picker/index.ts:297,307 collapses the spec-impossible
            // null and the spec-allowed empty string into one observable
            // path. Force an empty-textContent option (broker quirk:
            // queue name with whitespace-only chars stripped) and verify
            // any non-empty filter hides it without crashing.
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['queue-1', 'queue-2'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            // Mutate one rendered option to have empty textContent — simulates
            // the defensive case the `|| ''` fallback was added to absorb.
            const opts = document.querySelectorAll<HTMLDivElement>(
                '.picker-queue-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            opts[0].textContent = '';

            const qInput = $<HTMLInputElement>('.picker-queue-input');
            qInput.value = 'queue';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);

            // The empty-text option ('' includes 'queue' === false) is hidden;
            // 'queue-2' is still visible. No crash from the empty textContent.
            expect(opts[0].style.display).toBe('none');
            expect(opts[1].style.display).not.toBe('none');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('typing into the queue input again before debounce cancels the prior timer', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q-alpha', 'q-beta'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            const qInput = $<HTMLInputElement>('.picker-queue-input');
            qInput.value = 'al';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(50);
            qInput.value = 'beta';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);

            expect(visibleOptions('.picker-queue-list')).toEqual(['q-beta']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('focus on an empty input re-applies an all-visible filter', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            // Type to filter, then clear input value, then focus → should show all.
            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'a';
            input.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-a']);

            input.value = '';
            input.dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-a', 'vpn-b']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });
    });

    describe('persistent cache across pickQueue calls', () => {
        it('second open against the same baseUrl uses cached VPNs (no new fetch)', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {});

            // First open populates the cache.
            let p = pickQueue(src(sempCtx));
            await flushAsync();
            const fetchCallsAfterFirst = (sempCtx.fetch as any).mock.calls.length;
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Second open against the same broker — cache hit, no fetch.
            p = pickQueue(src(sempCtx));
            await flushAsync();
            const fetchCallsAfterSecond = (sempCtx.fetch as any).mock.calls.length;
            expect(fetchCallsAfterSecond).toBe(fetchCallsAfterFirst);

            // Cached VPN options are visible immediately on focus.
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-a', 'vpn-b']);
            // Status reflects the cached count, no "Loading…".
            expect($<HTMLDivElement>('.picker-status').textContent).toBe('2 VPNs loaded.');

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('second open against a DIFFERENT baseUrl invalidates the cache and fetches fresh', async () => {
            const sempA = makeSempCtx({ baseUrl: 'http://broker-a:8080' });
            stubVpnsAndQueues(sempA, ['vpn-a-only'], {});
            let p = pickQueue(src(sempA));
            await flushAsync();
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            const sempB = makeSempCtx({ baseUrl: 'http://broker-b:8080' });
            stubVpnsAndQueues(sempB, ['vpn-b-only'], {});
            const fetchCallsBefore = (sempB.fetch as any).mock.calls.length;
            p = pickQueue(src(sempB));
            await flushAsync();

            // Different broker → cache replaced → must fetch.
            expect((sempB.fetch as any).mock.calls.length).toBeGreaterThan(fetchCallsBefore);
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-b-only']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('refresh fetches new data and the next open reflects the refreshed cache', async () => {
            // Verifies the full refresh → cache-update loop: initial fetch
            // yields ['vpn-a'], then Refresh forces a second fetch (mocked to
            // return ['vpn-b']) which overwrites the cache. Re-opening the
            // picker should show 'vpn-b', proving the cache was updated.
            const sempCtx = makeSempCtx();
            let fetchCount = 0;
            (sempCtx.fetch as any).mockImplementation(() => {
                fetchCount++;
                const data = fetchCount === 1 ? [{ msgVpnName: 'vpn-a' }] : [{ msgVpnName: 'vpn-b' }];
                return Promise.resolve({ ok: true, json: async () => ({ data }) });
            });

            let p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLButtonElement>('.picker-vpn-refresh').click();
            await flushAsync();
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Re-open against the same broker → cache hit with the
            // refresh-updated data. 'vpn-a' is gone; 'vpn-b' is present.
            const callsBefore = fetchCount;
            p = pickQueue(src(sempCtx));
            await flushAsync();
            expect(fetchCount).toBe(callsBefore); // no new fetch — cache hit
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-b']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue cache survives across pickQueue calls — re-opening with a defaultVpn skips refetch', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a'], { 'vpn-a': ['q1', 'q2'] });

            let p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();
            const callsAfterFirst = (sempCtx.fetch as any).mock.calls.length;
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Re-open with defaultVpn='vpn-a' — both VPN list AND queue list
            // are cached; no new fetch should happen.
            p = pickQueue(src(sempCtx), { defaultVpn: 'vpn-a' });
            await flushAsync();
            expect((sempCtx.fetch as any).mock.calls.length).toBe(callsAfterFirst);
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-queue-list')).toEqual(['q1', 'q2']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue refresh button drops only the current VPN cache; other VPNs stay warm', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {
                'vpn-a': ['qa1'],
                'vpn-b': ['qb1'],
            });

            let p = pickQueue(src(sempCtx));
            await flushAsync();
            // Prime both VPN caches.
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[0]).click();
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[1]).click();
            await flushAsync();
            // Now drop just vpn-b's cache via refresh.
            $<HTMLButtonElement>('.picker-queue-refresh').click();
            await flushAsync();
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Reopen → vpn-a still cached (no fetch on selectVpn). vpn-b is
            // also re-cached because the refresh's fetch finished above.
            const callsBefore = (sempCtx.fetch as any).mock.calls.length;
            p = pickQueue(src(sempCtx), { defaultVpn: 'vpn-a' });
            await flushAsync();
            expect((sempCtx.fetch as any).mock.calls.length).toBe(callsBefore);
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-queue-list')).toEqual(['qa1']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('re-fetches when the source key changes (RBAC/provisioning edit) and reuses it when unchanged', async () => {
            // Symptom-1 regression (tests/.../picker.test.ts): the picker caches
            // by `source.key`, so a managed permission/provisioning change — which
            // flips `queueSourceFrom`'s key while the broker baseUrl is unchanged —
            // invalidates the cache and forces a re-read. Same key → cache hit.
            const listVpns = vi.fn(async function* () { yield { ok: true, data: ['v-only'] }; });
            const keyedSource = (key: string) => ({
                key,
                listVpns,
                listQueues: async function* () { yield { ok: true, data: [] as string[] }; },
            });

            // First open at key 'rbac-1' → fetches.
            let p = pickQueue(keyedSource('rbac-1'));
            await flushAsync();
            expect(listVpns).toHaveBeenCalledTimes(1);
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Re-open with the SAME key → cache hit, no new fetch.
            p = pickQueue(keyedSource('rbac-1'));
            await flushAsync();
            expect(listVpns).toHaveBeenCalledTimes(1);
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Re-open with a CHANGED key (entitlements/provisioning edited) →
            // cache miss → re-fetch, even though nothing else changed.
            p = pickQueue(keyedSource('rbac-2'));
            await flushAsync();
            expect(listVpns).toHaveBeenCalledTimes(2);
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });

    describe('chevron icon', () => {
        it('renders a chevron-down svg inside each input wrap', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, [], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const vpnIcon = document.querySelector('.picker-input-wrap .picker-select-icon svg');
            const queueIcon = document.querySelectorAll('.picker-input-wrap .picker-select-icon svg');
            expect(vpnIcon).not.toBeNull();
            expect(queueIcon.length).toBe(2);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });

    describe('focus on previously-selected input resets the filter to show all', () => {
        it('VPN input: re-focusing after selection shows the full list again', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-alpha', 'vpn-beta'], { 'vpn-alpha': [], 'vpn-beta': [] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            // Select vpn-alpha — input value is now "vpn-alpha".
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[0]).click();
            await flushAsync();
            expect($<HTMLInputElement>('.picker-vpn-input').value).toBe('vpn-alpha');

            // Re-focus VPN input — the user clicking back on the field expects
            // to see every VPN, not just "vpn-alpha". Filter is reset.
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-alpha', 'vpn-beta']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue input: re-focusing after selection shows the full list again', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q-1', 'q-2'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-queue-list .picker-dropdown-option').click();
            // Queue input value is now "q-1".

            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-queue-list')).toEqual(['q-1', 'q-2']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('VPN input: re-focusing with a non-matching typed value preserves the filter', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            // Type a partial term (no selection).
            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'a';
            input.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-a']);

            // Re-focus: input value is "a" (NOT empty, NOT a selectedVpn) —
            // the existing filter must persist.
            input.dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-vpn-list')).toEqual(['vpn-a']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });
    });

    describe('streaming page arrivals', () => {
        it('queues become visible as each SEMP page arrives, accumulating in sorted order', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            // Three pages; each yields a `nextPageUri` that the discovery factory
            // follows. The URI must keep the `/msgVpns/v/queues` segment so the
            // mock's regex still matches and returns the next page.
            const QUEUE_BASE = 'http://broker:8080/SEMP/v2/monitor/msgVpns/v/queues';
            const pages: any[] = [
                { data: [{ queueName: 'q-c' }], meta: { paging: { nextPageUri: `${QUEUE_BASE}?cursor=2` } } },
                { data: [{ queueName: 'q-a' }], meta: { paging: { nextPageUri: `${QUEUE_BASE}?cursor=3` } } },
                { data: [{ queueName: 'q-b' }] },
            ];
            let queueFetchIdx = 0;
            (sempCtx.fetch as any).mockImplementation((url: string) => {
                if (/\/msgVpns\/v\/queues/.test(url)) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => pages[queueFetchIdx++],
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ msgVpnName: 'v' }] }),
                });
            });

            const p = pickQueue(src(sempCtx));
            // Drain the VPN fetch (single page).
            for (let i = 0; i < 20; i++) await Promise.resolve();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            // Page 1 of queues fetches immediately (no inter-page throttle yet).
            for (let i = 0; i < 20; i++) await Promise.resolve();
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            expect(visibleOptions('.picker-queue-list')).toEqual(['q-c']);

            // Advance past the 370ms inter-page throttle for page 2.
            await vi.advanceTimersByTimeAsync(370);
            for (let i = 0; i < 20; i++) await Promise.resolve();
            expect(visibleOptions('.picker-queue-list')).toEqual(['q-a', 'q-c']);

            // Same again for page 3 — final accumulated list.
            await vi.advanceTimersByTimeAsync(370);
            for (let i = 0; i < 20; i++) await Promise.resolve();
            expect(visibleOptions('.picker-queue-list')).toEqual(['q-a', 'q-b', 'q-c']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });

        it('an active filter persists across page-arrival re-renders', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            const QUEUE_BASE = 'http://broker:8080/SEMP/v2/monitor/msgVpns/v/queues';
            const pages: any[] = [
                { data: [{ queueName: 'orders-eu' }], meta: { paging: { nextPageUri: `${QUEUE_BASE}?cursor=2` } } },
                { data: [{ queueName: 'logs-eu' }] },
            ];
            let queueFetchIdx = 0;
            (sempCtx.fetch as any).mockImplementation((url: string) => {
                if (/\/msgVpns\/v\/queues/.test(url)) {
                    return Promise.resolve({ ok: true, json: async () => pages[queueFetchIdx++] });
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ msgVpnName: 'v' }] }),
                });
            });

            const p = pickQueue(src(sempCtx));
            for (let i = 0; i < 20; i++) await Promise.resolve();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            for (let i = 0; i < 20; i++) await Promise.resolve();

            // Apply filter "orders" after page 1 lands.
            const qInput = $<HTMLInputElement>('.picker-queue-input');
            qInput.value = 'orders';
            qInput.dispatchEvent(new Event('input'));
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS);
            expect(visibleOptions('.picker-queue-list')).toEqual(['orders-eu']);

            // Advance past the page throttle so page 2 lands. The re-render must
            // re-apply the existing filter so "logs-eu" stays hidden.
            await vi.advanceTimersByTimeAsync(370);
            for (let i = 0; i < 20; i++) await Promise.resolve();
            expect(visibleOptions('.picker-queue-list')).toEqual(['orders-eu']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
            vi.useRealTimers();
        });
    });

    describe('outside-click hides dropdowns', () => {
        it('clicking somewhere inside the dialog but outside the VPN searchable hides the VPN list', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v1', 'v2'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const vpnList = $<HTMLDivElement>('.picker-vpn-list');
            expect(vpnList.classList.contains('show')).toBe(true);

            // Click on the status div — outside both dropdowns.
            $<HTMLDivElement>('.picker-status').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(vpnList.classList.contains('show')).toBe(false);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('clicking inside the queue searchable does NOT hide the queue list', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q1'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            const qInput = $<HTMLInputElement>('.picker-queue-input');
            qInput.dispatchEvent(new Event('focus'));
            const qList = $<HTMLDivElement>('.picker-queue-list');
            expect(qList.classList.contains('show')).toBe(true);

            qInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(qList.classList.contains('show')).toBe(true);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });

    describe('mid-fetch guards (gen-counter + state-null after close)', () => {
        it('VPN refresh during in-flight fetch invalidates the original via gen counter', async () => {
            const sempCtx = makeSempCtx();
            let resolveFirst: (v: any) => void = () => {};
            (sempCtx.fetch as any)
                .mockImplementationOnce(() => new Promise<any>(r => { resolveFirst = r; }))
                .mockImplementation(async () => ({
                    ok: true,
                    json: async () => ({ data: [{ msgVpnName: 'fresh' }] })
                }));

            const p = pickQueue(src(sempCtx));
            await Promise.resolve();

            // Refresh before first fetch resolves — increments vpnFetchGen,
            // starts a new fetch that wins.
            $<HTMLButtonElement>('.picker-vpn-refresh').click();
            await flushAsync();

            // Resolve the abandoned first fetch with a different result.
            resolveFirst({ ok: true, json: async () => ({ data: [{ msgVpnName: 'stale' }] }) });
            await flushAsync();

            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const opts = document.querySelectorAll<HTMLDivElement>(
                '.picker-vpn-list .picker-dropdown-option:not(.picker-dropdown-empty)'
            );
            // The original 'stale' result was discarded because gen had advanced.
            expect(Array.from(opts).map(o => o.textContent)).toEqual(['fresh']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('closing the picker mid-fetch makes the late response a no-op (state=null guard)', async () => {
            const sempCtx = makeSempCtx();
            let resolveFetch: (v: any) => void = () => {};
            (sempCtx.fetch as any).mockImplementation(() => new Promise<any>(r => { resolveFetch = r; }));

            const p = pickQueue(src(sempCtx));
            await Promise.resolve();

            $<HTMLButtonElement>('.picker-cancel').click();
            expect(await p).toBeNull();

            // Fetch resolves AFTER close — the for-await guard sees state===null and bails.
            resolveFetch({ ok: true, json: async () => ({ data: [{ msgVpnName: 'late' }] }) });
            await flushAsync();
            // No assertion on DOM — the picker is dismissed. We only care that
            // nothing threw and no spurious state was written.
            expect(getDialog().hasAttribute('open')).toBe(false);
        });

        it('VPN switch during queue fetch invalidates the original via queue gen counter', async () => {
            const sempCtx = makeSempCtx();
            let resolveFirstQueueFetch: (v: any) => void = () => {};
            (sempCtx.fetch as any).mockImplementation((url: string) => {
                if (/\/msgVpns\/vpn-a\/queues/.test(url)) {
                    return new Promise<any>(r => { resolveFirstQueueFetch = r; });
                }
                if (/\/msgVpns\/vpn-b\/queues/.test(url)) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({ data: [{ queueName: 'q-b' }] })
                    });
                }
                // VPN list
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ msgVpnName: 'vpn-a' }, { msgVpnName: 'vpn-b' }] })
                });
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            // Pick vpn-a → its queue fetch hangs
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[0]).click();
            await Promise.resolve();

            // Switch to vpn-b → bumps queueFetchGen, starts vpn-b fetch
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            (document.querySelectorAll<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option')[1]).click();
            await flushAsync();

            // Now resolve the abandoned vpn-a fetch — should be discarded
            resolveFirstQueueFetch({ ok: true, json: async () => ({ data: [{ queueName: 'q-a-stale' }] }) });
            await flushAsync();

            // Queue cache for vpn-b should hold q-b; vpn-a should NOT have q-a-stale
            // (the stale fetch's set() never ran because gen mismatched).
            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            const opts = document.querySelectorAll<HTMLDivElement>(
                '.picker-queue-list .picker-dropdown-option:not(.picker-dropdown-empty)'
            );
            expect(Array.from(opts).map(o => o.textContent)).toEqual(['q-b']);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('closing mid queue-fetch makes the late queue response a no-op', async () => {
            const sempCtx = makeSempCtx();
            let resolveQueues: (v: any) => void = () => {};
            (sempCtx.fetch as any).mockImplementation((url: string) => {
                if (/\/queues/.test(url)) {
                    return new Promise<any>(r => { resolveQueues = r; });
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ msgVpnName: 'v' }] })
                });
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await Promise.resolve();

            $<HTMLButtonElement>('.picker-cancel').click();
            expect(await p).toBeNull();

            // Queue fetch resolves after close — guard sees state===null and bails.
            resolveQueues({ ok: true, json: async () => ({ data: [{ queueName: 'late-q' }] }) });
            await flushAsync();
            expect(getDialog().hasAttribute('open')).toBe(false);
        });

        it('VPN fetch that throws after close does not surface a status update', async () => {
            const sempCtx = makeSempCtx();
            let rejectFetch: (e: any) => void = () => {};
            (sempCtx.fetch as any).mockImplementation(() => new Promise<any>((_resolve, reject) => { rejectFetch = reject; }));

            const p = pickQueue(src(sempCtx));
            await Promise.resolve();
            $<HTMLButtonElement>('.picker-cancel').click();
            await p;

            // Now reject — the catch's `if (state && state.vpnFetchGen === gen)` branch
            // sees state===null and short-circuits without setting status.
            rejectFetch(new Error('post-close throw'));
            await flushAsync();
            expect(getDialog().hasAttribute('open')).toBe(false);
        });
    });

    describe('input events fired before required data is loaded', () => {
        it('VPN input event before VPNs load is a no-op (state.vpns is null)', async () => {
            const sempCtx = makeSempCtx();
            (sempCtx.fetch as any).mockImplementation(() => new Promise(() => {})); // hangs

            const p = pickQueue(src(sempCtx));
            await Promise.resolve();

            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'foo';
            input.dispatchEvent(new Event('input'));

            // Handler short-circuits — list isn't shown, no debounce timer scheduled.
            expect($<HTMLDivElement>('.picker-vpn-list').classList.contains('show')).toBe(false);

            getDialog().close();
            await p;
        });

        it('queue input event before a VPN has been selected is a no-op', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            // Programmatically dispatch input on the queue input despite it being disabled
            // — exercises the !state.selectedVpn guard.
            const input = $<HTMLInputElement>('.picker-queue-input');
            input.dispatchEvent(new Event('input'));

            expect($<HTMLDivElement>('.picker-queue-list').classList.contains('show')).toBe(false);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue-refresh click before a VPN is selected is a no-op even if dispatched', async () => {
            // The button is disabled until selectVpn enables it, so .click() is a
            // jsdom no-op. dispatchEvent bypasses disabled, reaching the handler's
            // `!state.selectedVpn` guard directly.
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: [] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const beforeCalls = (sempCtx.fetch as any).mock.calls.length;
            $<HTMLButtonElement>('.picker-queue-refresh')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // No extra fetch issued — handler short-circuited on !state.selectedVpn.
            expect((sempCtx.fetch as any).mock.calls.length).toBe(beforeCalls);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue input/focus events before queues load for the chosen VPN are no-ops', async () => {
            const sempCtx = makeSempCtx();
            // VPN list resolves; queue fetch hangs.
            (sempCtx.fetch as any).mockImplementation((url: string) => {
                if (/\/queues/.test(url)) return new Promise(() => {});
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ msgVpnName: 'v' }] })
                });
            });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            // VPN selected, but the queue fetch is hanging — cache.has(vpn) is false.

            const input = $<HTMLInputElement>('.picker-queue-input');
            // Both handlers short-circuit at the `!cache.has(vpn)` check.
            input.dispatchEvent(new Event('input'));
            input.dispatchEvent(new Event('focus'));

            expect($<HTMLDivElement>('.picker-queue-list').classList.contains('show')).toBe(false);

            getDialog().close();
            await p;
        });
    });

    describe('cancel mid-typing clears pending debounce timers', () => {
        it('cancel while a VPN-filter timer is pending does not leave the timer firing', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['vpn-a', 'vpn-b'], {});

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const input = $<HTMLInputElement>('.picker-vpn-input');
            input.value = 'a';
            input.dispatchEvent(new Event('input'));
            // Timer scheduled but not yet fired.

            $<HTMLButtonElement>('.picker-cancel').click();
            // Advance past where the timer would have fired — must not throw and
            // must not invoke renderVpnList against the now-cleared state.
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS * 2);

            expect(await p).toBeNull();
            vi.useRealTimers();
        });

        it('cancel while a queue-filter timer is pending does not leave the timer firing', async () => {
            vi.useFakeTimers();
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q1', 'q2'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            $<HTMLDivElement>('.picker-vpn-list .picker-dropdown-option').click();
            await flushAsync();

            const input = $<HTMLInputElement>('.picker-queue-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            // Timer scheduled but not yet fired.

            $<HTMLButtonElement>('.picker-cancel').click();
            await vi.advanceTimersByTimeAsync(INPUT_DEBOUNCE_MS * 2);

            expect(await p).toBeNull();
            vi.useRealTimers();
        });
    });

    describe('post-close event guards', () => {
        // Realistic users can't fire events on a closed dialog — the dialog is
        // hidden. But the DOM is still there, so a stale handler (timer that
        // didn't get cleared, programmatic dispatch in a test) could still
        // reach a handler. Each handler's `!state` guard is the safety net.
        it('handlers gracefully no-op when dispatched after the picker closes', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q'] });
            const p = pickQueue(src(sempCtx));
            await flushAsync();

            // Capture references before closing — querySelector after close still
            // works (DOM persists), but doing it now mirrors real-world usage where
            // a captured ref triggers a stale event after close.
            const refs = {
                vpnInput: $<HTMLInputElement>('.picker-vpn-input'),
                vpnRefresh: $<HTMLButtonElement>('.picker-vpn-refresh'),
                queueInput: $<HTMLInputElement>('.picker-queue-input'),
                queueRefresh: $<HTMLButtonElement>('.picker-queue-refresh'),
                confirm: $<HTMLButtonElement>('.picker-confirm'),
            };

            $<HTMLButtonElement>('.picker-cancel').click();
            expect(await p).toBeNull();

            // Each of these would have null-deref'd `state.vpns` / `state.selectedVpn`
            // without the `!state` guard. Verify they're silent no-ops.
            // Use dispatchEvent (not .click()) for buttons that are still disabled
            // post-close — jsdom skips click handlers on disabled buttons, but
            // dispatchEvent fires regardless, exercising the handler's guard.
            expect(() => {
                refs.vpnInput.dispatchEvent(new Event('focus'));
                refs.vpnInput.dispatchEvent(new Event('input'));
                refs.vpnRefresh.click();
                refs.queueInput.dispatchEvent(new Event('focus'));
                refs.queueInput.dispatchEvent(new Event('input'));
                refs.queueRefresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                refs.confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }).not.toThrow();

            // Picker stays closed; nothing magically reopened it.
            expect(getDialog().hasAttribute('open')).toBe(false);
        });
    });

    describe('focus behavior', () => {
        it('VPN input focus before VPNs have loaded does not show an empty list', async () => {
            const sempCtx = makeSempCtx();
            // fetch never resolves
            (sempCtx.fetch as any).mockImplementation(() => new Promise(() => {}));

            const p = pickQueue(src(sempCtx));
            await Promise.resolve();
            $<HTMLInputElement>('.picker-vpn-input').dispatchEvent(new Event('focus'));
            const vpnList = $<HTMLDivElement>('.picker-vpn-list');
            expect(vpnList.classList.contains('show')).toBe(false);

            // Force-close to clean up — `dialog.close()` triggers our resolver.
            getDialog().close();
            await p;
        });

        it('queue input focus before a VPN has been picked does not show the list', async () => {
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            $<HTMLInputElement>('.picker-queue-input').dispatchEvent(new Event('focus'));
            const qList = $<HTMLDivElement>('.picker-queue-list');
            expect(qList.classList.contains('show')).toBe(false);

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue input focus after picking a queue (input.value === selectedQueue) re-shows all options', async () => {
            // Covers the second clause of the OR at the focus handler:
            //   `queueInput.value === '' || queueInput.value === selectedQueue`
            // After clicking a queue, both selectedQueue and queueInput.value
            // hold the queue name. Focusing the input again should re-display
            // the dropdown (via the `display: ''` reset on every option).
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q-a', 'q-b', 'q-c'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            // Pick the VPN first.
            const vpnOpt = document.querySelector<HTMLElement>(
                '.picker-vpn-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            )!;
            vpnOpt.click();
            await flushAsync();

            // Pick a queue — sets selectedQueue and queueInput.value to 'q-b'.
            const qOpts = document.querySelectorAll<HTMLElement>(
                '.picker-queue-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            const target = Array.from(qOpts).find(o => o.textContent === 'q-b')!;
            target.click();
            await flushAsync();

            const queueInput = $<HTMLInputElement>('.picker-queue-input');
            expect(queueInput.value).toBe('q-b');
            // Hide every option so we can verify the focus handler re-shows them.
            const allQOpts = document.querySelectorAll<HTMLElement>(
                '.picker-queue-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            allQOpts.forEach((o) => { o.style.display = 'none'; });

            // Focus — input.value is non-empty AND === selectedQueue → re-show.
            queueInput.dispatchEvent(new Event('focus'));
            allQOpts.forEach((o) => expect(o.style.display).toBe(''));

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });

        it('queue input focus when input.value is non-empty AND not the selectedQueue does NOT re-show options', async () => {
            // Covers the false side of the same OR: value is set to something
            // OTHER than selectedQueue (e.g. user typed mid-filter), so the
            // re-show block is skipped. Options remain whatever display the
            // filter left them at.
            const sempCtx = makeSempCtx();
            stubVpnsAndQueues(sempCtx, ['v'], { v: ['q-a', 'q-b'] });

            const p = pickQueue(src(sempCtx));
            await flushAsync();

            const vpnOpt = document.querySelector<HTMLElement>(
                '.picker-vpn-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            )!;
            vpnOpt.click();
            await flushAsync();

            // Click a queue so selectedQueue='q-a'.
            const qOpts = document.querySelectorAll<HTMLElement>(
                '.picker-queue-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            (Array.from(qOpts).find(o => o.textContent === 'q-a')!).click();
            await flushAsync();

            const queueInput = $<HTMLInputElement>('.picker-queue-input');
            // Type something different.
            queueInput.value = 'something-else';
            queueInput.dispatchEvent(new Event('input'));
            await flushAsync();
            // Mark the live options as hidden, then focus.
            const allQOpts = document.querySelectorAll<HTMLElement>(
                '.picker-queue-list .picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            allQOpts.forEach((o) => { o.style.display = 'none'; });
            queueInput.dispatchEvent(new Event('focus'));
            // The focus handler did NOT re-show — display still 'none'.
            allQOpts.forEach((o) => expect(o.style.display).toBe('none'));

            $<HTMLButtonElement>('.picker-cancel').click();
            await p;
        });
    });
});
