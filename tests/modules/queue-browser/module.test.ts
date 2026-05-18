import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueBrowserModule } from '../../../src/modules/queue-browser/module';
import { state } from '../../../src/modules/queue-browser/state.js';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import { ui, els } from '../../../src/modules/queue-browser/ui-core.js';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, EventBus } from '../../../src/core/types';

function createBrowserDOM() {
    // Load the real queue-browser template so the test DOM matches what ships.
    return loadModuleDOM('queue-browser');
}

describe('queue-browser/module', () => {
    let eventBus: EventBus;
    let ctx: AppContext;
    let container: HTMLElement;

    beforeEach(() => {
        container = createBrowserDOM();
        document.body.appendChild(container);

        eventBus = createEventBus();
        ctx = {
            container,
            appState: { activeModuleId: null, isConnected: false, selectedVpn: null, solaceConnection: null, sempCredentials: null, isSempConnected: false },
            eventBus,
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
            config: { useMocks: false }
        };

        resetQueueBrowserState();
    });

    describe('metadata', () => {
        it('has correct module properties', () => {
            expect(QueueBrowserModule.name).toBe('Queue Browser');
            expect(QueueBrowserModule.id).toBe('queue-browser');
            expect(QueueBrowserModule.icon).toContain('svg');
            // Priority is set in src/registry.ts; tested in tests/registry.test.ts.
        });
    });

    describe('install()', () => {
        it('initializes module and caches DOM elements', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            expect(cached.container).toBe(container);
            expect(cached.inputBind).toBeTruthy();
            expect(cached.btnBind).toBeTruthy();
            consoleSpy.mockRestore();
        });

        it('announces browser:available so feature-gated UI in other modules can reveal itself', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const handler = vi.fn();
            eventBus.on('browser:available', handler);

            await QueueBrowserModule.install(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
            consoleSpy.mockRestore();
        });

        it('sets initial visibility based on connection state', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ctx.appState.isConnected = false;
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            expect(cached.elPrompt.classList.contains('hidden')).toBe(false);
            expect(cached.elActiveView.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        it('bind button click triggers bind', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            cached.inputBind.value = 'test-queue';

            // Click bind — since there's no real Solace session, createBrowser will fail
            // but the handler should not throw
            cached.btnBind.click();
            consoleSpy.mockRestore();
        });

        it('Enter key on bind input triggers bind click and calls preventDefault', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            cached.inputBind.value = 'test-queue';
            const clickSpy = vi.spyOn(cached.btnBind, 'click');
            // `cancelable: true` is required for `defaultPrevented` to become observable
            // after dispatch. `bubbles: true` matches how the real browser delivers key events.
            const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
            cached.inputBind.dispatchEvent(event);

            expect(clickSpy).toHaveBeenCalledTimes(1);
            // defaultPrevented proves the entire handler body ran (preventDefault + click).
            expect(event.defaultPrevented).toBe(true);
            consoleSpy.mockRestore();
        });

        it('bind picker button starts hidden when SEMP is not connected', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ctx.appState.isSempConnected = false;
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            expect(cached.btnBindPick.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        it('bind picker button starts visible when SEMP is already connected at install', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ctx.appState.isSempConnected = true;
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            expect(cached.btnBindPick.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });

        it('semp:connected reveals the bind picker; semp:disconnected hides it', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ctx.appState.isSempConnected = false;
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            expect(cached.btnBindPick.classList.contains('hidden')).toBe(true);

            eventBus.emit('semp:connected');
            expect(cached.btnBindPick.classList.contains('hidden')).toBe(false);

            eventBus.emit('semp:disconnected');
            expect(cached.btnBindPick.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        it('shows download buttons when jszipLoaded was set before install', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const btnContent = container.querySelector('#btn-browser-download-content') as HTMLElement;
            const btnFull = container.querySelector('#btn-browser-download-full') as HTMLElement;
            btnContent.classList.add('hidden');
            btnFull.classList.add('hidden');

            (window as any).jszipLoaded = true;
            try {
                await QueueBrowserModule.install(ctx);
                expect(btnContent.classList.contains('hidden')).toBe(false);
                expect(btnFull.classList.contains('hidden')).toBe(false);
            } finally {
                delete (window as any).jszipLoaded;
                consoleSpy.mockRestore();
            }
        });

        it('keeps download buttons hidden when jszipLoaded is not set', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const btnContent = container.querySelector('#btn-browser-download-content') as HTMLElement;
            const btnFull = container.querySelector('#btn-browser-download-full') as HTMLElement;
            btnContent.classList.add('hidden');
            btnFull.classList.add('hidden');

            await QueueBrowserModule.install(ctx);
            expect(btnContent.classList.contains('hidden')).toBe(true);
            expect(btnFull.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        it('shows download buttons when jszip:loaded event fires after install', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const btnContent = container.querySelector('#btn-browser-download-content') as HTMLElement;
            const btnFull = container.querySelector('#btn-browser-download-full') as HTMLElement;
            btnContent.classList.add('hidden');
            btnFull.classList.add('hidden');

            await QueueBrowserModule.install(ctx);
            expect(btnContent.classList.contains('hidden')).toBe(true);

            eventBus.emit('jszip:loaded');
            expect(btnContent.classList.contains('hidden')).toBe(false);
            expect(btnFull.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });

        it('btnBindPick click wires to handleBindPickClick (invokes pickQueue with primary sempCtx)', async () => {
            // Closes COV-10: the click listener at module.ts:89 was
            // previously unexercised. Spy on `pickQueue` — the distinguishing
            // downstream effect of handleBindPickClick — so a regression that
            // re-wires this button to a different handler would fail.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            // Set up enough state for primarySempContextFrom to return a
            // non-null SempContext so handleBindPickClick reaches pickQueue.
            ctx.appState.isSempConnected = true;
            ctx.appState.sempCredentials = {
                user: 'u', pass: 'p', baseUrl: 'https://b:1943/SEMP/v2',
                protocol: 'https', host: 'b', port: '1943', urlPath: '/SEMP/v2',
            };
            ctx.appState.selectedVpn = 'vpn1';

            const pickerMod = await import('../../../src/core/components/queue-picker/index');
            const pickSpy = vi.spyOn(pickerMod, 'pickQueue').mockResolvedValue(null);

            await QueueBrowserModule.install(ctx);
            els.btnBindPick.click();
            await Promise.resolve(); // let the async handler reach pickQueue

            expect(pickSpy).toHaveBeenCalledTimes(1);
            expect(pickSpy).toHaveBeenCalledWith(
                expect.objectContaining({ fetch: expect.any(Function), baseUrl: expect.stringContaining('1943') }),
                expect.objectContaining({ defaultVpn: 'vpn1' }),
            );

            pickSpy.mockRestore();
            consoleSpy.mockRestore();
        });

        it('btnBrowserForward click wires to handleBulkForward (opens forward modal with selected messages)', async () => {
            // Direct spy on the distinguishing downstream effect:
            // handleBulkForward → ui.showForwardModal(messages). A regression
            // that wires this button to handleBulkDelete would not call
            // showForwardModal — it would call window.confirm + service.deleteMessages.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);
            // Spy AFTER install — initTable() assigns ui.getSelectedMessageIds during install.
            vi.spyOn(ui, 'getSelectedMessageIds').mockReturnValue(['msg-1']);
            const showForwardSpy = vi.spyOn(ui, 'showForwardModal').mockImplementation(() => {});
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            state.displayedMessages = [{ id: 'msg-1' } as any];

            els.btnBrowserForward.disabled = false;
            els.btnBrowserForward.click();

            expect(showForwardSpy).toHaveBeenCalledTimes(1);
            expect(showForwardSpy).toHaveBeenCalledWith([{ id: 'msg-1' }]);
            // Forward must NOT invoke the delete-side machinery — proves the
            // forward/delete wiring isn't crossed.
            expect(confirmSpy).not.toHaveBeenCalled();

            showForwardSpy.mockRestore();
            confirmSpy.mockRestore();
            consoleSpy.mockRestore();
        });

        it('btnBrowserDelete click wires to handleBulkDelete (prompts via window.confirm)', async () => {
            // Direct spy on the distinguishing downstream effect:
            // handleBulkDelete → window.confirm('Are you sure...'). A regression
            // that wires this button to handleBulkForward would not prompt;
            // it would open the forward modal.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);
            vi.spyOn(ui, 'getSelectedMessageIds').mockReturnValue(['msg-1', 'msg-2']);
            // Return false so the test doesn't progress into service.deleteMessages.
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const showForwardSpy = vi.spyOn(ui, 'showForwardModal').mockImplementation(() => {});

            els.btnBrowserDelete.disabled = false;
            els.btnBrowserDelete.click();

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy).toHaveBeenCalledWith(
                expect.stringContaining('delete 2 selected message(s)'),
            );
            // Delete must NOT invoke the forward modal — proves the wiring
            // isn't crossed.
            expect(showForwardSpy).not.toHaveBeenCalled();

            confirmSpy.mockRestore();
            showForwardSpy.mockRestore();
            consoleSpy.mockRestore();
        });

        it('btnBrowserDownloadContent click wires to downloadMessagesZip("content")', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);
            const downloadSpy = vi.spyOn(ui, 'downloadMessagesZip').mockResolvedValue(undefined as any);

            els.btnBrowserDownloadContent.disabled = false;
            els.btnBrowserDownloadContent.click();
            expect(downloadSpy).toHaveBeenCalledWith('content');
            downloadSpy.mockRestore();
            consoleSpy.mockRestore();
        });

        it('btnBrowserDownloadFull click wires to downloadMessagesZip("full")', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);
            const downloadSpy = vi.spyOn(ui, 'downloadMessagesZip').mockResolvedValue(undefined as any);

            els.btnBrowserDownloadFull.disabled = false;
            els.btnBrowserDownloadFull.click();
            expect(downloadSpy).toHaveBeenCalledWith('full');
            downloadSpy.mockRestore();
            consoleSpy.mockRestore();
        });

        it('btnCopyContent click wires to handleCopyContent', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            state.selectedMessage = { id: 'msg-1', content: 'hello' } as any;
            els.btnCopyContent.disabled = false;
            els.btnCopyContent.click();
            // handleCopyContent awaits ctx.copyToClipboard — a microtask flush confirms wiring
            await Promise.resolve();
            expect(ctx.copyToClipboard).toHaveBeenCalledWith('hello', els.btnCopyContent);
            consoleSpy.mockRestore();
        });

        it('unbind button click triggers unbind', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            // Add and select a queue
            const opt = document.createElement('option');
            opt.value = 'q1';
            opt.textContent = 'q1';
            els.selectBound.appendChild(opt);
            els.selectBound.selectedIndex = 1;

            els.btnUnbind.click();
            consoleSpy.mockRestore();
        });

        it('dropdown change updates queue selection', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const opt = document.createElement('option');
            opt.value = 'q1';
            opt.textContent = 'q1';
            els.selectBound.appendChild(opt);
            els.selectBound.value = 'q1';
            els.selectBound.dispatchEvent(new Event('change'));

            expect(state.currentQueue).toBe('q1');
            consoleSpy.mockRestore();
        });

        it('filter button toggles filter modal', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            // Enable filter button
            els.btnFilter.disabled = false;
            els.btnFilter.click();
            expect(els.modalFilter.open).toBe(true);

            els.btnFilter.click();
            expect(els.modalFilter.open).toBe(false);
            consoleSpy.mockRestore();
        });

        it('filter apply button triggers applyFilters', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            state.allMessages = [];
            els.btnFilterApply.click();
            consoleSpy.mockRestore();
        });

        it('filter clear button triggers clearFilters', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            state.allMessages = [];
            els.btnFilterClear.click();
            consoleSpy.mockRestore();
        });

        it('filter cancel button closes the modal', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            cached.modalFilter.showModal();
            cached.btnFilterCancel.click();
            expect(cached.modalFilter.open).toBe(false);
            consoleSpy.mockRestore();
        });

        it('mousedown on filter date inputs runs the prefill wiring', async () => {
            // Covers the two arrow wrappers at module.ts:125-126 that bridge
            // the date inputs' mousedown/focus events to
            // `uiEvents.prefillDateInputMidnight`. The function itself is
            // covered by ui-events.test.ts; this test verifies the click
            // wiring fires.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const newer = els.inputFilterNewerThan as HTMLInputElement;
            const older = els.inputFilterOlderThan as HTMLInputElement;
            newer.value = '';
            older.value = '';

            newer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            older.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

            // The function writes today's date at midnight; we only assert
            // the input is now populated (the exact canonical form is
            // jsdom-quirky — see ui-events.test.ts prefillDateInputMidnight).
            expect(newer.value).not.toBe('');
            expect(older.value).not.toBe('');
            consoleSpy.mockRestore();
        });

        it('add property filter button adds row', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            els.btnAddPropFilter.click();
            expect(els.filterPropsRows.querySelectorAll('.property-filter-row').length).toBe(1);
            consoleSpy.mockRestore();
        });

        it('check-all toggle checks/unchecks all checkboxes', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            cached.checkAll.checked = true;
            cached.checkAll.dispatchEvent(new Event('change'));

            if (cached.msgList) {
                const checked = cached.msgList.querySelectorAll('.msg-check:checked');
                expect(checked.length).toBe(1);
            }
            consoleSpy.mockRestore();
        });

        it('non-Enter keydown on bind input does not trigger bind', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const cached = ui.getElements();
            cached.inputBind.value = 'test-queue';
            const clickSpy = vi.spyOn(cached.btnBind, 'click');
            const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true });
            cached.inputBind.dispatchEvent(event);
            expect(clickSpy).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);  // handler did not call preventDefault for non-Enter
            consoleSpy.mockRestore();
        });

        it('non-Enter keydown on forward dest input does not trigger send', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const clickSpy = vi.spyOn(els.btnForwardSend, 'click');
            els.inputForwardDestName.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            expect(clickSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('forward close button closes modal', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            els.modalForward.showModal();
            els.btnForwardClose.click();
            expect(els.modalForward.open).toBe(false);
            consoleSpy.mockRestore();
        });

        it('forward cancel button closes modal', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            els.modalForward.showModal();
            els.btnForwardCancel.click();
            expect(els.modalForward.open).toBe(false);
            consoleSpy.mockRestore();
        });

        it('forward dest Enter key triggers send click and calls preventDefault', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            const clickSpy = vi.spyOn(els.btnForwardSend, 'click');
            const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
            els.inputForwardDestName.dispatchEvent(event);
            expect(clickSpy).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented).toBe(true);
            consoleSpy.mockRestore();
        });

        it('forward send click invokes uiEvents.handleForwardSend (real listener body fires)', async () => {
            // Covers the click listener body at queue-browser/module.ts:129 — i.e.
            // the `() => uiEvents.handleForwardSend()` arrow attached via
            // addEventListener. Existing tests only `vi.spyOn(btnForwardSend, 'click')`
            // which intercepts the .click() *method* without firing addEventListener
            // listeners, so the production handler at line 129 was never executed.
            // Here we dispatch a real click event so the listener actually runs.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            // Empty forwardQueue → handleForwardSend takes the early-fail path and
            // calls ui.onForwardFailure('No messages to forward.'). That side effect
            // is observable via the forward-error display element, which is what we
            // assert here — proving the line-129 handler actually ran.
            state.forwardQueue = [];
            els.elForwardError.style.display = 'none';
            els.elForwardError.textContent = '';

            els.btnForwardSend.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(els.elForwardError.style.display).toBe('block');
            expect(els.elForwardError.textContent).toContain('No messages to forward');
            consoleSpy.mockRestore();
        });

        it('forward dest-type change toggles inputForwardDestName.disabled', async () => {
            // Covers the change-listener body at queue-browser/module.ts:133.
            // The handler keeps the dest-name input synced with the dest-type
            // selection: "Original" → disabled (each message uses its own
            // destination); "Topic"/"Queue" → enabled. Without the handler,
            // the user gets a stuck-disabled or stuck-enabled input that
            // doesn't match the visible dropdown — silent UX bug.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            els.inputForwardDestType.value = 'Original';
            els.inputForwardDestType.dispatchEvent(new Event('change'));
            expect(els.inputForwardDestName.disabled).toBe(true);

            els.inputForwardDestType.value = 'Topic';
            els.inputForwardDestType.dispatchEvent(new Event('change'));
            expect(els.inputForwardDestName.disabled).toBe(false);

            consoleSpy.mockRestore();
        });

        it('listens for app:message-delete events', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            // Emit delete event — should trigger confirm dialog
            (globalThis.confirm as any).mockReturnValue(false);
            eventBus.emit('app:message-delete', { id: 'msg-1' });

            expect(globalThis.confirm).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        // Session-level ACK/REJECT listener wiring moved out of module.ts into
        // src/core/services/solace-publisher (May 2026 publisher lift). The
        // service-level client:connected handler in queue-browser/service.ts
        // now owns the publisher's lifecycle; coverage of session-switch
        // (dispose + re-create) lives in service.test.ts › "disposes the
        // prior publisher when client:connected fires with a fresh session".
        // Coverage of ACK/REJECT dispatch on the listener pair is in
        // tests/core/services/solace-publisher.test.ts.

        it('app:state-change isConnected=true shows view', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            eventBus.emit('app:state-change', { key: 'isConnected', value: true });

            expect(els.elActiveView.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });

        it('app:state-change isConnected=true populates VPN name from appState', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ctx.appState.selectedVpn = 'my-vpn';
            await QueueBrowserModule.install(ctx);

            eventBus.emit('app:state-change', { key: 'isConnected', value: true });

            expect(els.hdrVpnName.textContent).toBe('my-vpn');
            consoleSpy.mockRestore();
        });

        it('app:state-change isConnected=false disconnects and resets', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            // Seed the header first to verify it gets cleared.
            els.hdrVpnName.textContent = 'stale-vpn';
            eventBus.emit('app:state-change', { key: 'isConnected', value: false });

            expect(els.elPrompt.classList.contains('hidden')).toBe(false);
            expect(els.hdrVpnName.textContent).toBe('');
            consoleSpy.mockRestore();
        });

        it('app:state-change selectedVpn updates header without toggling visibility', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            eventBus.emit('app:state-change', { key: 'selectedVpn', value: 'vpn-new' });
            expect(els.hdrVpnName.textContent).toBe('vpn-new');

            // Clearing should blank the header.
            eventBus.emit('app:state-change', { key: 'selectedVpn', value: null });
            expect(els.hdrVpnName.textContent).toBe('');
            consoleSpy.mockRestore();
        });

        it('app:state-change with an unrelated key is a no-op', async () => {
            // Covers the false branch of `else if (key === 'selectedVpn')` at
            // queue-browser/module.ts:190 — for any key that's neither
            // 'isConnected' nor 'selectedVpn' (e.g. isSempConnected, future
            // activeModuleId), the listener body must do nothing. A regression
            // that mutated state for every key would slip through silently
            // because no other test verifies the no-op contract.
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            // Pre-set a sentinel value on the header so we can detect an
            // accidental write under the unrelated key.
            els.hdrVpnName.textContent = 'sentinel';
            const updateVisSpy = vi.spyOn(ui, 'updateVisibility');

            eventBus.emit('app:state-change', { key: 'isSempConnected', value: true } as any);

            expect(updateVisSpy).not.toHaveBeenCalled();
            expect(els.hdrVpnName.textContent).toBe('sentinel');
            updateVisSpy.mockRestore();
            consoleSpy.mockRestore();
        });

        it('client:disconnected cleans up and resets', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            eventBus.emit('client:disconnected');

            expect(els.elPrompt.classList.contains('hidden')).toBe(false);
            expect(els.elActiveView.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        // In-flight forward sweep was previously done explicitly in module.ts's
        // handleDisconnect. After the publisher lift, publisher.dispose('Client
        // disconnected.') (called from service.ts on client:disconnected and
        // app:state-change isConnected=false) resolves every in-flight send
        // promise with that error; the .then handler in handleForwardSend
        // updates the UI status. The end-to-end behavior is covered by:
        //   - service.test.ts › "disposes the prior publisher when…"
        //   - tests/core/services/solace-publisher.test.ts › "dispose()…"
        //   - tests/modules/queue-browser/ui-events.test.ts (forward send flow)

        it('browser:browse-queue switches to browser and binds', async () => {
            vi.useFakeTimers();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueBrowserModule.install(ctx);

            eventBus.emit('browser:browse-queue', { queue: 'my-queue' });

            expect(ctx.loadSelf).toHaveBeenCalled();

            // Advance timer past the 200ms setTimeout
            vi.advanceTimersByTime(250);

            expect(els.inputBind.value).toBe('my-queue');
            consoleSpy.mockRestore();
            vi.useRealTimers();
        });

        it('browser:browse-queue handles missing loadSelf', async () => {
            vi.useFakeTimers();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ctx.loadSelf = null as any;
            await QueueBrowserModule.install(ctx);

            eventBus.emit('browser:browse-queue', { queue: 'my-queue' });
            vi.advanceTimersByTime(250);

            consoleSpy.mockRestore();
            vi.useRealTimers();
        });
    });

    describe('install() with minimal DOM', () => {
        it('throws at install when required elements are missing', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const minContainer = document.createElement('div');
            minContainer.innerHTML = `
                <table><tbody id="browser-msg-list"></tbody></table>
                <span id="count-total">0</span>
                <span id="count-displayed">0</span>
                <span id="count-selected">0</span>
                <div id="detail-msg-id"></div>
                <div id="detail-destination"></div>
                <span id="detail-type-badge" class="hidden"></span>
                <span id="detail-dest-badge" class="hidden"></span>
                <div id="detail-content"></div>
                <button id="btn-show-raw" disabled></button>
                <div id="browser-connect-prompt"></div>
                <div id="browser-active-view" class="hidden"></div>
                <span id="browser-queue-name"></span>
                <span id="browser-permissions" class="hidden"></span>
            `;
            document.body.appendChild(minContainer);

            const minCtx: AppContext = {
                container: minContainer,
                appState: { activeModuleId: null, isConnected: false, selectedVpn: null, solaceConnection: null, sempCredentials: null, isSempConnected: false },
                eventBus,
                setState: vi.fn(),
                loadSelf: vi.fn(),
                sempFetch: vi.fn(),
                copyToClipboard: vi.fn(),
                config: { useMocks: false }
            };

            await expect(QueueBrowserModule.install(minCtx)).rejects.toThrow(/Required element missing/);
            consoleSpy.mockRestore();
        });

        // Note: historical null-guard tests for `msgList` and `btnForwardSend`
        // were removed — both are asserted via `required()` in module.install(),
        // so "does not throw when null" tests against a state that cannot occur
        // in production. Per CLAUDE.md anchor #5 (required-element policy): if
        // the element is required, assert it; don't add nullable guards to the
        // handlers. The missing-element path IS tested via the `install()
        // rejects with "Required element missing"` case above.
    });
});
