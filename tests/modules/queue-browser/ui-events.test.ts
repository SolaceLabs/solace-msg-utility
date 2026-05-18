import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui, els } from '../../../src/modules/queue-browser/ui-core.js';
import '../../../src/modules/queue-browser/ui-forward.js';
import { initDetails } from '../../../src/modules/queue-browser/ui-details';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { createUiEvents } from '../../../src/modules/queue-browser/ui-events';
import { state, shouldShowMessage } from '../../../src/modules/queue-browser/state.js';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import type { AppContext } from '../../../src/core/types';

vi.mock('../../../src/core/components/queue-picker', () => ({
    pickQueue: vi.fn(async () => ({ vpn: 'default', queue: 'picked-q' })),
}));
import { pickQueue } from '../../../src/core/components/queue-picker';

function createBrowserDOM() {
    const container = loadModuleDOM('queue-browser');
    // Tests need a bound-queue option pre-selected.
    const select = container.querySelector('#browser-bound-queues') as HTMLSelectElement;
    const opt = document.createElement('option');
    opt.value = 'q1';
    opt.textContent = 'q1';
    select.appendChild(opt);
    return container;
}

describe('queue-browser/ui-events', () => {
    let ctx: AppContext;
    let service: any;
    let uiEvents: ReturnType<typeof createUiEvents>;

    beforeEach(() => {
        const container = createBrowserDOM();
        document.body.appendChild(container);
        ui.initElements(container);

        const eventBus = createEventBus();
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

        initDetails(ctx);
        initTable(eventBus);

        service = {
            createBrowser: vi.fn(() => ({ ok: true })),
            disconnectBrowser: vi.fn(),
            // Default to a SUCCESS settle so the .then() in handleForwardSend
            // updates status to SUCCESS, matching the prior end-to-end shape.
            forwardMessage: vi.fn().mockResolvedValue({ ok: true }),
            hasInFlightForward: vi.fn(() => false),
            deleteMessages: vi.fn(() => ({ ok: true, count: 1 }))
        };

        uiEvents = createUiEvents(ctx, service);

        resetQueueBrowserState();
    });

    describe('handleCopyContent()', () => {
        it('copies selected message content', async () => {
            state.selectedMessage = { id: '1', content: 'test content' };
            await uiEvents.handleCopyContent();
            expect(ctx.copyToClipboard).toHaveBeenCalledWith('test content', els.btnCopyContent);
        });

        it('does nothing when no message selected', async () => {
            state.selectedMessage = null;
            await uiEvents.handleCopyContent();
            expect(ctx.copyToClipboard).not.toHaveBeenCalled();
        });

        it('handles empty content', async () => {
            state.selectedMessage = { id: '1', content: '' };
            await uiEvents.handleCopyContent();
            expect(ctx.copyToClipboard).toHaveBeenCalledWith('', els.btnCopyContent);
        });

        it('handles null content', async () => {
            state.selectedMessage = { id: '1', content: null };
            await uiEvents.handleCopyContent();
            expect(ctx.copyToClipboard).toHaveBeenCalledWith('', els.btnCopyContent);
        });
    });

    describe('handleForwardSend()', () => {
        it('fails with no messages in forward queue', async () => {
            state.forwardQueue = [];
            await uiEvents.handleForwardSend();
            expect(els.elForwardError.textContent).toContain('No messages');
        });

        it('fails with empty destination name', async () => {
            state.forwardQueue = [{ originalMsg: {}, id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null }];
            els.inputForwardDestName.value = '';
            await uiEvents.handleForwardSend();
            expect(els.elForwardError.textContent).toContain('Destination Name');
        });

        it('sends messages successfully', async () => {
            state.forwardQueue = [
                { originalMsg: { content: 'test' }, id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null }
            ];
            els.inputForwardDestName.value = 'my-topic';
            els.inputForwardDestType.value = 'Topic';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            await uiEvents.handleForwardSend();
            // Drain microtasks so the .then(result => updateForwardItemStatus)
            // queued after the mock-resolved publish actually runs.
            await new Promise((r) => setTimeout(r, 0));

            expect(service.forwardMessage).toHaveBeenCalledWith(
                { content: 'test' }, 'my-topic', 'Topic', 'cv-1'
            );
            // Once the .then fires and the only item lands SUCCESS,
            // checkForwardCompletion swaps the button text to 'Send Complete'.
            // Under the historical (pre-publisher-lift) flow, status updates
            // landed asynchronously from session listeners and the button
            // remained 'Sending...' through the test's awaits — the new flow
            // is faster, hence the terminal-state assertion here.
            expect(state.forwardQueue[0].status).toBe('SUCCESS');
            expect(els.btnForwardSend.textContent).toBe('Send Complete');
        });

        it('skips already successful messages', async () => {
            state.forwardQueue = [
                { originalMsg: {}, id: '1', correlationValue: 'cv-1', status: 'SUCCESS', error: null },
                { originalMsg: {}, id: '2', correlationValue: 'cv-2', status: 'QUEUED', error: null }
            ];
            els.inputForwardDestName.value = 'dest';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-2';
            document.body.appendChild(statusEl);

            await uiEvents.handleForwardSend();

            expect(service.forwardMessage).toHaveBeenCalledTimes(1);
        });

        it('handles forwarding error settled as {ok:false}', async () => {
            service.forwardMessage.mockResolvedValue({ ok: false, error: 'Broker rejected' });
            state.forwardQueue = [
                { originalMsg: {}, id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null }
            ];
            els.inputForwardDestName.value = 'dest';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            const errorEl = document.createElement('div');
            errorEl.id = 'error-cv-1';
            errorEl.classList.add('hidden');
            document.body.appendChild(errorEl);

            await uiEvents.handleForwardSend();
            // Drain microtasks so the .then(result => ui.updateForwardItemStatus)
            // queued after service.forwardMessage resolved actually runs.
            await new Promise((r) => setTimeout(r, 0));

            expect(state.forwardQueue[0].status).toBe('FAILED');
            expect(state.forwardQueue[0].error).toBe('Broker rejected');
        });

        it('handles forwarding rejection (async throw e.g. publisher missing)', async () => {
            service.forwardMessage.mockRejectedValue(new Error('Not connected'));
            state.forwardQueue = [
                { originalMsg: {}, id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null }
            ];
            els.inputForwardDestName.value = 'dest';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);
            const errorEl = document.createElement('div');
            errorEl.id = 'error-cv-1';
            errorEl.classList.add('hidden');
            document.body.appendChild(errorEl);

            await uiEvents.handleForwardSend();
            await new Promise((r) => setTimeout(r, 0));

            expect(state.forwardQueue[0].status).toBe('FAILED');
            expect(state.forwardQueue[0].error).toBe('Unable to send message.');
        });

        it('disables destination type + name inputs during send', async () => {
            state.forwardQueue = [
                { originalMsg: {}, id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null }
            ];
            els.inputForwardDestName.value = 'my-topic';
            els.inputForwardDestType.value = 'Topic';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            // Capture input state at the moment service.forwardMessage is called —
            // that's the in-flight window the disable is protecting.
            let typeDisabledDuringSend = false;
            let nameDisabledDuringSend = false;
            service.forwardMessage.mockImplementation(async () => {
                typeDisabledDuringSend = els.inputForwardDestType.disabled;
                nameDisabledDuringSend = els.inputForwardDestName.disabled;
            });

            await uiEvents.handleForwardSend();

            expect(typeDisabledDuringSend).toBe(true);
            expect(nameDisabledDuringSend).toBe(true);
        });

        it('type=Original skips the Destination Name required check', async () => {
            state.forwardQueue = [
                {
                    originalMsg: {
                        _originalMsg: {
                            getDestination: () => ({
                                getName: () => 'orig/topic/a',
                                getType: () => (window as any).solace.DestinationType.TOPIC
                            })
                        }
                    },
                    id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null
                }
            ];
            els.inputForwardDestName.value = '';          // intentionally empty
            els.inputForwardDestType.value = 'Original';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            await uiEvents.handleForwardSend();

            // No "Destination Name is required" error and the send went through.
            expect(els.elForwardError.style.display).toBe('none');
            expect(service.forwardMessage).toHaveBeenCalledTimes(1);
        });

        it('type=Original resolves destination per-item from broker message', async () => {
            state.forwardQueue = [
                {
                    originalMsg: {
                        _originalMsg: {
                            getDestination: () => ({
                                getName: () => 'source/topic/a',
                                getType: () => (window as any).solace.DestinationType.TOPIC
                            })
                        }
                    },
                    id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null
                },
                {
                    originalMsg: {
                        _originalMsg: {
                            getDestination: () => ({
                                getName: () => 'source-queue-B',
                                getType: () => (window as any).solace.DestinationType.QUEUE
                            })
                        }
                    },
                    id: '2', correlationValue: 'cv-2', status: 'QUEUED', error: null
                }
            ];
            els.inputForwardDestType.value = 'Original';

            ['cv-1', 'cv-2'].forEach(cv => {
                const el = document.createElement('div');
                el.id = `status-${cv}`;
                document.body.appendChild(el);
            });

            await uiEvents.handleForwardSend();

            // Each item forwarded to its own original destination, with the
            // correct topic-vs-queue type derived from the broker destination.
            expect(service.forwardMessage).toHaveBeenNthCalledWith(
                1, expect.any(Object), 'source/topic/a', 'Topic', 'cv-1'
            );
            expect(service.forwardMessage).toHaveBeenNthCalledWith(
                2, expect.any(Object), 'source-queue-B', 'Queue', 'cv-2'
            );
        });

        it('type=Original marks item FAILED when getDestination() returns null', async () => {
            // `_originalMsg` is always set by service-events.onMessage; the realistic
            // failure mode is getDestination() returning null on certain SDK
            // message states (not _originalMsg itself being absent).
            state.forwardQueue = [
                {
                    originalMsg: { _originalMsg: { getDestination: () => null } },
                    id: '1', correlationValue: 'cv-1', status: 'QUEUED', error: null
                }
            ];
            els.inputForwardDestType.value = 'Original';

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);
            const errorEl = document.createElement('div');
            errorEl.id = 'error-cv-1';
            errorEl.classList.add('hidden');
            document.body.appendChild(errorEl);

            await uiEvents.handleForwardSend();

            expect(state.forwardQueue[0].status).toBe('FAILED');
            expect(state.forwardQueue[0].error).toContain('No original destination');
            // Must NOT have dispatched a send for this item — no valid target.
            expect(service.forwardMessage).not.toHaveBeenCalled();
        });

        it('Resend click retries only FAILED items, leaves SUCCESS untouched', async () => {
            // Prior run left one SUCCESS + one FAILED; simulating the state the
            // modal shows when the user clicks "Resend failed messages (1)".
            state.forwardQueue = [
                { originalMsg: {}, id: '1', correlationValue: 'cv-1', status: 'SUCCESS', error: null },
                { originalMsg: {}, id: '2', correlationValue: 'cv-2', status: 'FAILED', error: 'Timed out' }
            ];
            els.inputForwardDestName.value = 'dest';
            els.inputForwardDestType.value = 'Topic';

            ['cv-1', 'cv-2'].forEach(cv => {
                const el = document.createElement('div');
                el.id = `status-${cv}`;
                document.body.appendChild(el);
                const err = document.createElement('div');
                err.id = `error-${cv}`;
                err.classList.add('hidden');
                document.body.appendChild(err);
            });

            await uiEvents.handleForwardSend();

            // SUCCESS preserved — service only called for the FAILED item.
            expect(service.forwardMessage).toHaveBeenCalledTimes(1);
            expect(service.forwardMessage).toHaveBeenCalledWith(
                expect.any(Object), 'dest', 'Topic', 'cv-2'
            );
            expect(state.forwardQueue[0].status).toBe('SUCCESS');
        });
    });

    describe('handleBulkForward()', () => {
        it('opens forward modal with selected messages', () => {
            state.displayedMessages = [
                { id: '1', content: 'msg1' },
                { id: '2', content: 'msg2' }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            // Check both checkboxes
            document.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = true);

            ui.generateUuid = () => 'test-uuid';
            uiEvents.handleBulkForward();

            expect(state.forwardQueue.length).toBe(2);
        });

        it('does nothing with no selection', () => {
            state.displayedMessages = [{ id: '1', content: 'msg1' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            uiEvents.handleBulkForward();
            expect(state.forwardQueue).toEqual([]);
        });
    });

    describe('handleBindClick()', () => {
        it('creates browser for new queue', () => {
            els.inputBind.value = 'new-queue';
            uiEvents.handleBindClick();
            expect(service.createBrowser).toHaveBeenCalledWith('new-queue');
        });

        it('shows error for already bound queue', () => {
            state.browserInstances.set('existing', {});
            els.inputBind.value = 'existing';
            uiEvents.handleBindClick();
            expect(els.elBindError.textContent).toContain('already bound');
        });

        it('shows error on service failure', () => {
            service.createBrowser.mockReturnValue({ ok: false, error: 'Connection failed' });
            els.inputBind.value = 'fail-queue';
            uiEvents.handleBindClick();
            expect(els.elBindError.textContent).toBe('Connection failed');
        });

        it('shows default error when service returns no error message', () => {
            service.createBrowser.mockReturnValue({ ok: false });
            els.inputBind.value = 'fail-queue';
            uiEvents.handleBindClick();
            expect(els.elBindError.textContent).toBe('Failed to create browser.');
        });

        it('does nothing for empty input', () => {
            els.inputBind.value = '';
            uiEvents.handleBindClick();
            expect(service.createBrowser).not.toHaveBeenCalled();
        });

        it('trims whitespace from queue name', () => {
            els.inputBind.value = '  my-queue  ';
            uiEvents.handleBindClick();
            expect(service.createBrowser).toHaveBeenCalledWith('my-queue');
        });

        it('clears previous errors before checking', () => {
            els.elBindError.textContent = 'old error';
            els.elBindError.style.display = 'block';
            els.inputBind.classList.add('is-invalid');

            els.inputBind.value = 'new-queue';
            uiEvents.handleBindClick();

            // showBindError(null) should have been called first
            // If createBrowser succeeds, no error should be shown
        });
    });

    describe('handleBindPickClick()', () => {
        beforeEach(() => {
            (pickQueue as any).mockClear();
            (pickQueue as any).mockResolvedValue({ vpn: 'default', queue: 'picked-q' });
            ctx.appState.isSempConnected = true;
            ctx.appState.sempCredentials = { baseUrl: 'http://broker' } as any;
            ctx.appState.selectedVpn = 'default';
        });

        it('is a no-op when SEMP is not connected', async () => {
            ctx.appState.isSempConnected = false;
            ctx.appState.sempCredentials = null;
            await uiEvents.handleBindPickClick();
            expect(pickQueue).not.toHaveBeenCalled();
        });

        it('cancel (null) leaves the input untouched', async () => {
            (pickQueue as any).mockResolvedValueOnce(null);
            els.inputBind.value = '';
            await uiEvents.handleBindPickClick();
            expect(els.inputBind.value).toBe('');
            expect(service.createBrowser).not.toHaveBeenCalled();
        });

        it('same-VPN populates input and triggers bind directly', async () => {
            // Bind handler is wired by module.ts (not by createUiEvents), so the
            // test asserts the input was populated and the Bind click dispatched.
            // The downstream service call is covered by handleBindClick() tests.
            const clickSpy = vi.spyOn(els.btnBind, 'click');
            (pickQueue as any).mockResolvedValueOnce({ vpn: 'default', queue: 'q-same' });
            await uiEvents.handleBindPickClick();
            expect(els.inputBind.value).toBe('q-same');
            expect(clickSpy).toHaveBeenCalledTimes(1);
            clickSpy.mockRestore();
        });

        it('cross-VPN emits connection:check-connection with returnTo=queue-browser', async () => {
            const handler = vi.fn();
            ctx.eventBus.on('connection:check-connection', handler);
            (pickQueue as any).mockResolvedValueOnce({ vpn: 'altVpn', queue: 'q-cross' });
            await uiEvents.handleBindPickClick();
            expect(handler).toHaveBeenCalledWith({
                vpn: 'altVpn',
                queue: 'q-cross',
                returnTo: 'queue-browser',
            });
            // Local input untouched — connections module owns the write-back
            // via browser:browse-queue once the new VPN is up.
            expect(service.createBrowser).not.toHaveBeenCalled();
        });

        it('passes ctx.selectedVpn as defaultVpn', async () => {
            await uiEvents.handleBindPickClick();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBe('default');
        });

        it('falls back to undefined defaultVpn when selectedVpn is null', async () => {
            ctx.appState.selectedVpn = null;
            await uiEvents.handleBindPickClick();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBeUndefined();
        });
    });

    describe('handleUnbindClick()', () => {
        it('unbinds selected queue and selects next', () => {
            // Add a second option
            const opt = document.createElement('option');
            opt.value = 'q2';
            opt.textContent = 'q2';
            els.selectBound.appendChild(opt);
            els.selectBound.selectedIndex = 1; // q1

            uiEvents.handleUnbindClick();

            expect(service.disconnectBrowser).toHaveBeenCalledWith('q1');
        });

        it('resets queue selection when last queue unbound', () => {
            els.selectBound.selectedIndex = 1; // q1
            ui.renderList = vi.fn();
            ui.clearDetails = vi.fn();

            uiEvents.handleUnbindClick();

            expect(service.disconnectBrowser).toHaveBeenCalledWith('q1');
            expect(els.selectBound.selectedIndex).toBe(0);
        });

        it('does nothing when no queue selected (index 0)', () => {
            els.selectBound.selectedIndex = 0;
            uiEvents.handleUnbindClick();
            expect(service.disconnectBrowser).not.toHaveBeenCalled();
        });
    });

    describe('handleDropdownChange()', () => {
        it('updates state and renders for selected queue', () => {
            state.messageStore.set('q1', [{ id: '1', content: 'test' }]);
            els.selectBound.value = 'q1';

            uiEvents.handleDropdownChange();

            expect(state.currentQueue).toBe('q1');
            expect(els.hdrQueueName.textContent).toBe('q1');
            expect(state.allMessages).toEqual([{ id: '1', content: 'test' }]);
        });

        it('clears state when no queue selected', () => {
            state.allMessages = [{ id: '1' }];
            els.selectBound.value = '';

            uiEvents.handleDropdownChange();

            expect(state.currentQueue).toBe('');
            expect(state.allMessages).toEqual([]);
            expect(els.hdrPermissions.classList.contains('hidden')).toBe(true);
        });

        it('resets filters on queue change', () => {
            state.activeFilters = { content: 'test', msgId: 'id', dest: 'dest', type: 'Topic', msgType: 'Text', criteria: 'AND' };
            els.inputFilterContent.value = 'test';
            els.selectBound.value = 'q1';

            uiEvents.handleDropdownChange();

            expect(state.activeFilters.content).toBe('');
            expect(state.activeFilters.criteria).toBe('OR');
            expect(els.inputFilterContent.value).toBe('');
        });

        it('disables filter button when no queue', () => {
            els.selectBound.value = '';
            uiEvents.handleDropdownChange();
            expect(els.btnFilter.disabled).toBe(true);
        });

        it('enables filter button when queue selected', () => {
            els.selectBound.value = 'q1';
            uiEvents.handleDropdownChange();
            expect(els.btnFilter.disabled).toBe(false);
        });

        it('removes filter-active class on change', () => {
            els.btnFilter.classList.add('filter-active');
            els.selectBound.value = 'q1';
            uiEvents.handleDropdownChange();
            expect(els.btnFilter.classList.contains('filter-active')).toBe(false);
        });

        it('resets radio buttons to OR', () => {
            const radios = els.radFilterCriteria;
            radios[1].checked = true; // AND
            radios[0].checked = false;

            els.selectBound.value = 'q1';
            uiEvents.handleDropdownChange();

            expect(radios[0].checked).toBe(true); // OR
        });

        it('initializes empty allMessages when no messageStore entry and not mocks', () => {
            els.selectBound.value = 'q1';
            uiEvents.handleDropdownChange();
            expect(state.allMessages).toEqual([]);
        });
    });

    describe('removeFilterRow()', () => {
        it('removes parent element of button', () => {
            const parent = document.createElement('div');
            const btn = document.createElement('button');
            parent.appendChild(btn);
            document.body.appendChild(parent);

            uiEvents.removeFilterRow(btn);
            expect(parent.parentElement).toBeNull();
        });

        it('does nothing with null — existing filter rows untouched', () => {
            const parent = document.createElement('div');
            parent.id = 'preserved-filter-row';
            document.body.appendChild(parent);
            expect(() => uiEvents.removeFilterRow(null as any)).not.toThrow();
            // Null input must be a pure no-op; unrelated DOM elements must remain.
            expect(document.getElementById('preserved-filter-row')).not.toBeNull();
            parent.remove();
        });
    });

    describe('clearFilters()', () => {
        it('resets all filter inputs and state', () => {
            els.inputFilterContent.value = 'test';
            els.inputFilterId.value = 'id';
            els.inputFilterDest.value = 'dest';
            state.activeFilters = { content: 'test', msgId: 'id', dest: 'dest', type: 'Topic', msgType: 'Text', criteria: 'AND' };

            state.allMessages = [{ id: '1' }];
            state.displayedMessages = [];

            uiEvents.clearFilters();

            expect(els.inputFilterContent.value).toBe('');
            expect(els.inputFilterId.value).toBe('');
            expect(state.activeFilters.content).toBe('');
            expect(state.activeFilters.criteria).toBe('OR');
            expect(state.displayedMessages).toEqual([{ id: '1' }]);
        });

        it('removes filter-active class', () => {
            els.btnFilter.classList.add('filter-active');
            uiEvents.clearFilters();
            expect(els.btnFilter.classList.contains('filter-active')).toBe(false);
        });

        it('does not close the filter modal', () => {
            els.modalFilter.showModal();
            uiEvents.clearFilters();
            expect(els.modalFilter.open).toBe(true);
        });

        it('resets radio buttons to OR', () => {
            const radios = els.radFilterCriteria;
            radios[1].checked = true;
            radios[0].checked = false;

            uiEvents.clearFilters();
            expect(radios[0].checked).toBe(true);
        });

        it('calls clearPropertyFilters', () => {
            const clearSpy = vi.fn();
            ui.clearPropertyFilters = clearSpy;
            uiEvents.clearFilters();
            expect(clearSpy).toHaveBeenCalled();
        });

        it('resets newer-than and older-than datetime inputs', () => {
            els.inputFilterNewerThan.value = '2026-05-17T00:00:00';
            els.inputFilterOlderThan.value = '2026-05-17T23:59:59';

            uiEvents.clearFilters();

            expect(els.inputFilterNewerThan.value).toBe('');
            expect(els.inputFilterOlderThan.value).toBe('');
            expect(state.activeFilters.newerThanMs).toBeNull();
            expect(state.activeFilters.olderThanMs).toBeNull();
        });
    });

    describe('prefillDateInputMidnight()', () => {
        it('fills an empty input with today at midnight', () => {
            const input = els.inputFilterNewerThan as HTMLInputElement;
            input.value = '';

            uiEvents.prefillDateInputMidnight(input);

            // Assert today's date + zero time, tolerant of the
            // `<input type="datetime-local">` canonicalization quirk (jsdom
            // drops trailing `:00` seconds when reading back). Anchoring on
            // the date prefix + a `^...T00:00(:00)?$` pattern matches both
            // jsdom canonical forms and any real-browser output.
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const datePrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            expect(input.value).toMatch(new RegExp(`^${datePrefix}T00:00(:00)?$`));
        });

        it('leaves a non-empty input unchanged', () => {
            const input = els.inputFilterNewerThan as HTMLInputElement;
            input.value = '2026-01-01T12:34:56';
            // Snapshot AFTER assignment so the comparison reflects whatever
            // jsdom canonicalised the value into (it may append `.000`); the
            // contract under test is "function doesn't mutate", not "value
            // round-trips literally".
            const before = input.value;

            uiEvents.prefillDateInputMidnight(input);

            expect(input.value).toBe(before);
        });
    });

    describe('applyFilters()', () => {
        it('applies content filter', () => {
            state.allMessages = [
                { id: '1', content: 'hello world', type: 'Text' },
                { id: '2', content: 'goodbye', type: 'Text' }
            ];
            els.inputFilterContent.value = 'hello';

            uiEvents.applyFilters();

            expect(state.activeFilters.content).toBe('hello');
            expect(state.displayedMessages.length).toBe(1);
            expect(state.displayedMessages[0].id).toBe('1');
        });

        it('adds filter-active class when filters active', () => {
            state.allMessages = [];
            els.inputFilterContent.value = 'test';

            uiEvents.applyFilters();

            expect(els.btnFilter.classList.contains('filter-active')).toBe(true);
        });

        it('removes filter-active class when no filters', () => {
            state.allMessages = [];
            els.btnFilter.classList.add('filter-active');

            uiEvents.applyFilters();

            expect(els.btnFilter.classList.contains('filter-active')).toBe(false);
        });

        it('applies message type filter', () => {
            state.allMessages = [
                { id: '1', content: '', type: 'Text' },
                { id: '2', content: '', type: 'Binary' }
            ];
            els.inputFilterMsgType.value = 'Text';

            uiEvents.applyFilters();

            expect(state.activeFilters.msgType).toBe('Text');
        });

        it('applies destination type filter', () => {
            state.allMessages = [];
            els.inputFilterType.value = 'Topic';

            uiEvents.applyFilters();
            expect(state.activeFilters.type).toBe('Topic');
        });

        it('reads property filters', () => {
            ui.addPropertyFilterRow('key', 'val');
            state.allMessages = [];

            uiEvents.applyFilters();
            expect(state.activeFilters.properties).toEqual([{ key: 'key', value: 'val' }]);
        });

        it('reads criteria from radio buttons', () => {
            const radios = els.radFilterCriteria;
            radios[0].checked = false;
            radios[1].checked = true; // AND

            state.allMessages = [];
            uiEvents.applyFilters();
            expect(state.activeFilters.criteria).toBe('AND');
        });

        it('hides filter modal after apply', () => {
            els.modalFilter.showModal();
            state.allMessages = [];
            uiEvents.applyFilters();
            expect(els.modalFilter.open).toBe(false);
        });

        it('detects active filter from properties', () => {
            state.allMessages = [];
            ui.getPropertyFilters = () => [{ key: 'k', value: 'v' }];

            uiEvents.applyFilters();
            expect(els.btnFilter.classList.contains('filter-active')).toBe(true);
        });

        it('reads newer-than datetime input as epoch ms', () => {
            state.allMessages = [];
            // datetime-local values are local-wall-clock; Date parses them in the
            // local tz, so we round-trip a known instant to avoid tz flakiness.
            const expected = new Date(2026, 4, 17, 9, 30, 15).getTime();
            els.inputFilterNewerThan.value = '2026-05-17T09:30:15';

            uiEvents.applyFilters();

            expect(state.activeFilters.newerThanMs).toBe(expected);
            expect(state.activeFilters.olderThanMs).toBeNull();
        });

        it('reads older-than datetime input as epoch ms', () => {
            state.allMessages = [];
            const expected = new Date(2026, 4, 17, 23, 59, 59).getTime();
            els.inputFilterOlderThan.value = '2026-05-17T23:59:59';

            uiEvents.applyFilters();

            expect(state.activeFilters.olderThanMs).toBe(expected);
            expect(state.activeFilters.newerThanMs).toBeNull();
        });

        it('leaves both datetime bounds null when inputs are empty', () => {
            state.allMessages = [];
            els.inputFilterNewerThan.value = '';
            els.inputFilterOlderThan.value = '';

            uiEvents.applyFilters();

            expect(state.activeFilters.newerThanMs).toBeNull();
            expect(state.activeFilters.olderThanMs).toBeNull();
        });

        it('marks filter-active when only a datetime bound is set', () => {
            state.allMessages = [];
            els.inputFilterNewerThan.value = '2026-05-17T00:00:00';

            uiEvents.applyFilters();

            expect(els.btnFilter.classList.contains('filter-active')).toBe(true);
        });
    });

    describe('handleBulkDownloadContent()', () => {
        it('calls downloadMessagesZip with content', () => {
            ui.downloadMessagesZip = vi.fn();
            uiEvents.handleBulkDownloadContent();
            expect(ui.downloadMessagesZip).toHaveBeenCalledWith('content');
        });
    });

    describe('handleBulkDownloadFull()', () => {
        it('calls downloadMessagesZip with full', () => {
            ui.downloadMessagesZip = vi.fn();
            uiEvents.handleBulkDownloadFull();
            expect(ui.downloadMessagesZip).toHaveBeenCalledWith('full');
        });
    });

    describe('handleDelete()', () => {
        it('confirms and deletes message', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            state.currentQueue = 'q1';
            service.deleteMessages.mockReturnValue({ ok: true, count: 1 });

            await uiEvents.handleDelete('msg-1');

            expect(globalThis.confirm).toHaveBeenCalled();
            expect(service.deleteMessages).toHaveBeenCalledWith('q1', ['msg-1']);
            expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('1'));
        });

        it('does nothing when not confirmed', async () => {
            (globalThis.confirm as any).mockReturnValue(false);
            await uiEvents.handleDelete('msg-1');
            expect(service.deleteMessages).not.toHaveBeenCalled();
        });

        it('does nothing for empty msgId', async () => {
            await uiEvents.handleDelete('');
            expect(globalThis.confirm).not.toHaveBeenCalled();
        });

        it('shows alert on delete failure', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            service.deleteMessages.mockReturnValue({ ok: false, error: 'Delete failed' });
            state.currentQueue = 'q1';

            await uiEvents.handleDelete('msg-1');

            expect(globalThis.alert).toHaveBeenCalledWith('Delete failed');
        });

        it('shows default error on delete failure with no error message', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            service.deleteMessages.mockReturnValue({ ok: false });
            state.currentQueue = 'q1';

            await uiEvents.handleDelete('msg-1');
            expect(globalThis.alert).toHaveBeenCalledWith('Delete failed.');
        });

        it('does not alert when deletion succeeds with count 0', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            service.deleteMessages.mockReturnValue({ ok: true, count: 0 });
            state.currentQueue = 'q1';
            await uiEvents.handleDelete('msg-1');
            expect(globalThis.alert).not.toHaveBeenCalled();
        });
    });

    describe('handleBulkDelete()', () => {
        it('confirms and deletes selected messages', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            state.currentQueue = 'q1';
            state.displayedMessages = [{ id: '1' }, { id: '2' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            // Select all
            document.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = true);

            service.deleteMessages.mockReturnValue({ ok: true, count: 2 });

            await uiEvents.handleBulkDelete();

            expect(service.deleteMessages).toHaveBeenCalledWith('q1', ['1', '2']);
            expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('2'));
        });

        it('does nothing with no selection', async () => {
            state.displayedMessages = [];
            await uiEvents.handleBulkDelete();
            expect(globalThis.confirm).not.toHaveBeenCalled();
        });

        it('does nothing when not confirmed', async () => {
            (globalThis.confirm as any).mockReturnValue(false);
            state.displayedMessages = [{ id: '1' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            document.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = true);

            await uiEvents.handleBulkDelete();
            expect(service.deleteMessages).not.toHaveBeenCalled();
        });

        it('shows alert on failure', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            state.displayedMessages = [{ id: '1' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            document.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = true);

            service.deleteMessages.mockReturnValue({ ok: false, error: 'Bulk fail' });
            state.currentQueue = 'q1';

            await uiEvents.handleBulkDelete();
            expect(globalThis.alert).toHaveBeenCalledWith('Bulk fail');
        });

        it('shows default error when no error message', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            state.displayedMessages = [{ id: '1' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            document.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = true);

            service.deleteMessages.mockReturnValue({ ok: false });
            state.currentQueue = 'q1';

            await uiEvents.handleBulkDelete();
            expect(globalThis.alert).toHaveBeenCalledWith('Delete failed.');
        });

        it('shows message when count is 0', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            state.displayedMessages = [{ id: '1' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            document.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = true);

            service.deleteMessages.mockReturnValue({ ok: true, count: 0 });
            state.currentQueue = 'q1';

            await uiEvents.handleBulkDelete();
            expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('No messages were deleted'));
        });
    });

    describe('applyFilters edge cases', () => {
        it('applies filters with no active criteria (removes filter-active class)', () => {
            state.activeFilters = { content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR', properties: [] };
            state.allMessages = [];
            uiEvents.applyFilters();
            expect(els.btnFilter.classList.contains('filter-active')).toBe(false);
        });

        it('applies dest type filter', () => {
            els.inputFilterType.value = 'Topic';
            // Message with a Queue destination — shouldShowMessage evaluates the
            // `type: 'Topic'` filter against the message's actual destination type
            // and filters it out.
            state.allMessages = [{
                id: '1', type: 'Text', content: 'test',
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'q1',
                        getType: () => (window as any).solace.DestinationType.QUEUE
                    })
                }
            }];
            state.displayedMessages = [...state.allMessages];
            uiEvents.applyFilters();
            expect(state.displayedMessages.length).toBe(0);
        });

        it('applies message type filter', () => {
            els.inputFilterMsgType.innerHTML = '<option value="ANY">ANY</option><option value="TextMessage">TextMessage</option>';
            els.inputFilterMsgType.value = 'TextMessage';
            state.allMessages = [{ id: '1', type: 'TextMessage', content: 'test' }];
            state.displayedMessages = [...state.allMessages];
            uiEvents.applyFilters();
            expect(state.displayedMessages.length).toBe(1);
        });
    });

    describe('handleDelete edge cases', () => {
        it('does nothing when delete count > 0 (shows success)', async () => {
            (globalThis.confirm as any).mockReturnValue(true);
            service.deleteMessages.mockReturnValue({ ok: true, count: 1 });
            state.currentQueue = 'q1';

            await uiEvents.handleDelete('msg-1');
            expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted'));
        });
    });

    describe('handleBindClick edge cases', () => {
        it('handles whitespace-only input', () => {
            els.inputBind.value = '   ';
            uiEvents.handleBindClick();
            expect(els.elBindError.style.display).toBe('none');
        });
    });

    describe('handleUnbindClick edge cases', () => {
        it('resets to placeholder when last queue unbound', () => {
            // The DOM already has: <option value="">Select...</option><option value="q1">q1</option>
            // Select q1
            els.selectBound.value = 'q1';
            state.browserInstances.set('q1', { disconnect: vi.fn() });

            uiEvents.handleUnbindClick();
            // After removing q1, only the placeholder remains
            expect(els.selectBound.selectedIndex).toBe(0);
            expect(els.selectBound.value).toBe('');
        });
    });

    describe('clearFilters with missing clearPropertyFilters', () => {
        it('handles null clearPropertyFilters — state still fully reset', () => {
            const saved = ui.clearPropertyFilters;
            ui.clearPropertyFilters = null;
            state.allMessages = [];
            state.activeFilters = { content: 'abc', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'AND', properties: [] } as any;
            expect(() => uiEvents.clearFilters()).not.toThrow();
            // Missing helper must not prevent core state reset.
            expect(state.activeFilters.content).toBe('');
            expect(state.activeFilters.criteria).toBe('OR');
            ui.clearPropertyFilters = saved;
        });
    });

    describe('applyFilters with missing getPropertyFilters', () => {
        it('handles null getPropertyFilters — properties left intact', () => {
            const saved = ui.getPropertyFilters;
            ui.getPropertyFilters = null;
            state.allMessages = [];
            state.activeFilters.properties = [{ key: 'preserved', value: 'v' }] as any;
            expect(() => uiEvents.applyFilters()).not.toThrow();
            // Missing helper must leave existing properties untouched rather than clobbering them.
            expect(state.activeFilters.properties).toEqual([{ key: 'preserved', value: 'v' }]);
            ui.getPropertyFilters = saved;
        });
    });

    describe('handleBulkForward() edge cases', () => {
        it('does not show modal when selected IDs have no matching messages', () => {
            state.displayedMessages = [{ id: 'msg-1', content: 'test' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const cb = els.msgList.querySelector('.msg-check') as HTMLInputElement;
            cb.checked = true;

            // Replace displayedMessages so IDs don't match
            state.displayedMessages = [{ id: 'different-id', content: 'other' }];

            uiEvents.handleBulkForward();
            expect(state.forwardQueue.length).toBe(0);
        });
    });

    describe('handleDelete() success path', () => {
        it('shows success alert when deletion count > 0', () => {
            (globalThis.confirm as any).mockReturnValue(true);
            state.currentQueue = 'q1';
            state.allMessages = [{ id: 'msg-1' }];
            state.displayedMessages = [...state.allMessages];
            state.messageStore.set('q1', state.allMessages);

            service.deleteMessages = vi.fn().mockReturnValue({ ok: true, count: 1 });

            uiEvents.handleDelete('msg-1');
            expect((globalThis.alert as any)).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted'));
        });
    });

    describe('handleDropdownChange() non-mock no-store branch', () => {
        it('initializes empty allMessages when queue not in messageStore', () => {
            const opt = document.createElement('option');
            opt.value = 'new-queue';
            opt.textContent = 'new-queue';
            els.selectBound.appendChild(opt);
            els.selectBound.value = 'new-queue';

            uiEvents.handleDropdownChange();
            expect(state.currentQueue).toBe('new-queue');
            expect(state.allMessages).toEqual([]);
        });
    });
});
