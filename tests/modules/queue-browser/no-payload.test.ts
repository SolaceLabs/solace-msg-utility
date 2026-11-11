import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueBrowserModule } from '../../../src/modules/queue-browser/module';
import { createServiceEvents } from '../../../src/modules/queue-browser/service-events';
import { createUiEvents } from '../../../src/modules/queue-browser/ui-events';
import { ui, els } from '../../../src/modules/queue-browser/ui-core.js';
import '../../../src/modules/queue-browser/ui-forward.js';
import { state } from '../../../src/modules/queue-browser/state.js';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import type { AppContext } from '../../../src/core/types';
import { completeContext } from '../../helpers/appContext';

/**
 * Spec for the no-payload build flavor (`VITE_SHOW_PAYLOAD=false`).
 *
 * The payload-on (default) behavior is covered by the per-source-file suites in this
 * directory; this file is the cohesive flag-off counterpart. Each block names the
 * source function whose flag-off branch it exercises. The whole module is installed in
 * `beforeEach` with the flag stubbed, so the assertions run against the real
 * payload-stripped DOM rather than a hand-rolled one.
 */
describe('queue-browser/no-payload flavor (VITE_SHOW_PAYLOAD=false)', () => {
    let ctx: AppContext;
    let container: HTMLElement;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.stubEnv('VITE_SHOW_PAYLOAD', 'false');
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        container = loadModuleDOM('queue-browser');
        document.body.appendChild(container);

        ctx = completeContext({
            container,
            appState: { activeModuleId: null, isConnected: false, selectedVpn: null, solaceConnection: null, sempCredentials: null, isSempConnected: false },
            eventBus: createEventBus(),
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
        });

        resetQueueBrowserState();
        // Real install performs the payload-DOM removal, the conditional required()
        // assertion, and the gated wiring. If any payload selector were still asserted
        // (or any removed element still wired), install would throw right here.
        await QueueBrowserModule.install(ctx);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        consoleSpy.mockRestore();
    });

    describe('module.ts install', () => {
        it('removes every payload-bearing element from the live DOM', () => {
            for (const sel of [
                '#detail-content', '#btn-copy-content', '#btn-show-raw',
                '#browser-raw-content-modal', '#raw-content-text', '#btn-raw-close',
                '#btn-browser-download-content', '#btn-browser-download-full', '#filter-content'
            ]) {
                expect(container.querySelector(sel)).toBeNull();
            }
        });

        it('keeps Forward, Delete, metadata, and the (non-body) filter modal', () => {
            expect(container.querySelector('#btn-browser-forward')).not.toBeNull();
            expect(container.querySelector('#btn-browser-delete')).not.toBeNull();
            expect(container.querySelector('#detail-properties-container')).not.toBeNull();
            expect(container.querySelector('#detail-app-properties-container')).not.toBeNull();
            expect(container.querySelector('#browser-filter-modal')).not.toBeNull();
            expect(container.querySelector('#filter-msg-id')).not.toBeNull();
        });
    });

    describe('service-events.ts onMessage', () => {
        function makeSdkMessage() {
            return {
                getType: () => 0,
                getBinaryAttachment: () => null,
                getSdtContainer: () => ({ getType: () => 0, getValue: () => 'secret body' }),
                getXmlContent: () => '',
                getSenderTimestamp: () => null,
                getGuaranteedMessageId: () => 7,
                getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
                getUserPropertyMap: () => null,
                smfHeader: { messageLength: 42 },
                dump: () => 'raw'
            };
        }

        it('never decodes the body onto the stored message object, but keeps metadata', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const msg = makeSdkMessage();

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')![0];
            expect('content' in stored).toBe(false);   // body is completely inaccessible
            expect(stored.size).toBe(42);               // size comes from smfHeader, not the body
            expect(stored.type).toBe('Text');
            expect(stored._originalMsg).toBe(msg);       // raw SDK msg retained for Forward/Delete
        });

        it('keeps a binary attachment off the stored message: no text, no bytes', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const msg = {
                ...makeSdkMessage(),
                getType: () => 1,
                getSdtContainer: () => null,
                getBinaryAttachment: () => '\x89PNG secret bytes'
            };

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')![0];
            expect(['content', 'bytes', 'binary'].filter(k => k in stored)).toEqual([]);
            expect(stored.type).toBe('Binary');
        });
    });

    describe('ui-table.ts', () => {
        it('createRowHtml omits the payload download buttons but keeps Forward/Delete', () => {
            const html = ui.createRowHtml({ id: 'm1', date: '2024-01-01', size: 10, type: 'Text' });
            expect(html).not.toContain('btn-download-content');
            expect(html).not.toContain('btn-download-full');
            expect(html).toContain('btn-forward-row');
            expect(html).toContain('btn-delete-row');
        });

        it('renderList wires Forward (no download buttons) and updateCounts still counts', () => {
            const msg = { id: 'm1', date: '', size: 0, type: 'Text' };
            state.allMessages = [msg];
            state.displayedMessages = [msg];
            ui.renderList();                       // createRowHtml + attachRowListeners, flag off
            els.countTotal.textContent = '';
            ui.updateCounts();
            expect(els.countTotal.textContent).toBe('1');

            const row = container.querySelector('#browser-msg-list tr') as HTMLElement;
            expect(row.querySelector('.btn-download-content')).toBeNull();

            const forwardSpy = vi.spyOn(ui, 'showForwardModal').mockImplementation(() => {});
            (row.querySelector('.btn-forward-row') as HTMLButtonElement).click();
            expect(forwardSpy).toHaveBeenCalledTimes(1);
            forwardSpy.mockRestore();
        });
    });

    describe('ui-details.ts', () => {
        function makeMsg(id: string) {
            const solace = (window as any).solace;
            return {
                id, type: 'Text', msgProperties: { k: 'v' }, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'dest', getType: () => solace.DestinationType.QUEUE }),
                    getReplicationGroupMessageId: () => null,
                    dump: () => 'raw'
                }
            };
        }

        it('selectMessage populates metadata without touching the removed payload nodes', () => {
            const msg = makeMsg('m1');
            state.displayedMessages = [msg];
            state.allMessages = [msg];
            ui.renderList();

            expect(() => ui.selectMessage('m1')).not.toThrow();
            expect(els.detailId.textContent).toBe('m1');
            expect(els.detailDest.textContent).toBe('dest');
        });

        it('clearDetails clears metadata without touching the removed payload nodes', () => {
            const msg = makeMsg('m1');
            state.displayedMessages = [msg];
            state.allMessages = [msg];
            ui.renderList();
            ui.selectMessage('m1');
            expect(els.detailId.textContent).toBe('m1');

            expect(() => ui.clearDetails()).not.toThrow();
            expect(els.detailId.textContent).toBe('');
            expect(els.detailDest.textContent).toBe('');
        });
    });

    describe('ui-events.ts filter handlers', () => {
        function makeUiEvents() {
            return createUiEvents(ctx, {
                createBrowser: vi.fn(),
                disconnectBrowser: vi.fn(),
                deleteMessages: vi.fn(),
                forwardMessage: vi.fn()
            } as any);
        }

        it('applyFilters reads the remaining inputs and leaves the body-content filter at its default', () => {
            const uiEvents = makeUiEvents();
            els.inputFilterId.value = 'm1';
            expect(() => uiEvents.applyFilters()).not.toThrow();
            expect(state.activeFilters.msgId).toBe('m1');
            expect(state.activeFilters.content).toBe('');
        });

        it('clearFilters resets the remaining inputs with the body input removed', () => {
            const uiEvents = makeUiEvents();
            els.inputFilterId.value = 'm1';
            state.activeFilters.msgId = 'm1';
            expect(() => uiEvents.clearFilters()).not.toThrow();
            expect(els.inputFilterId.value).toBe('');
            expect(state.activeFilters.msgId).toBe('');
            expect(state.activeFilters.content).toBe('');
        });

        it('handleDropdownChange resets the queue and filters with the body input removed', () => {
            const uiEvents = makeUiEvents();
            state.currentQueue = 'q1';
            els.inputFilterId.value = 'm1';
            state.activeFilters.msgId = 'm1';
            expect(() => uiEvents.handleDropdownChange()).not.toThrow();
            expect(state.currentQueue).toBe('');
            expect(els.inputFilterId.value).toBe('');
            expect(state.activeFilters.msgId).toBe('');
        });
    });

    describe('ui-core.ts resetQueueSelection', () => {
        it('resets the queue and filters with the body input removed', () => {
            state.currentQueue = 'q1';
            els.inputFilterId.value = 'm1';
            state.activeFilters.msgId = 'm1';
            expect(() => ui.resetQueueSelection()).not.toThrow();
            expect(state.currentQueue).toBe('');
            expect(els.inputFilterId.value).toBe('');
            expect(state.activeFilters.msgId).toBe('');
        });
    });

    describe('ui-forward.ts renderForwardList', () => {
        it('renders the message id with an empty body preview', () => {
            state.forwardQueue = [{
                originalMsg: { id: 'm1', content: 'secret body' },   // never set in the no-payload flavor; seeded to prove it is not rendered
                id: 'm1',
                correlationValue: 'c1',
                status: 'QUEUED',
                error: null
            }];

            ui.renderForwardList();

            const listHtml = els.listForwardMsgs.innerHTML;
            expect(listHtml).toContain('m1');
            expect(listHtml).not.toContain('secret body');
            expect(els.listForwardMsgs.querySelector('span.text-xs')!.textContent).toBe('');
        });
    });
});
