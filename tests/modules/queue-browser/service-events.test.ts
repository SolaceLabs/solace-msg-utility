import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServiceEvents } from '../../../src/modules/queue-browser/service-events';
import { state, setBrowser, addMessage } from '../../../src/modules/queue-browser/state.js';
import { ui } from '../../../src/modules/queue-browser/ui-core.js';
import '../../../src/modules/queue-browser/ui-forward.js';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { initDetails } from '../../../src/modules/queue-browser/ui-details';
import { createEventBus } from '../../../src/core/event-bus';
import { createSolaceMock, createMessageMock } from '../../setup';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';

function setupBrowserDOM() {
    const container = loadModuleDOM('queue-browser');
    // Pre-populate the bind input with the value the existing tests assume.
    (container.querySelector('#browser-bind-input') as HTMLInputElement).value = 'test-queue';
    ui.initElements(container);
}

describe('queue-browser/service-events', () => {
    let solaceMock: any;

    beforeEach(() => {
        solaceMock = createSolaceMock();
        (window as any).solace = solaceMock;
        resetQueueBrowserState();
        setupBrowserDOM();

        const eventBus = createEventBus();
        const ctx = {
            container: document.body.firstElementChild as HTMLElement,
            appState: { activeModuleId: null, isConnected: false, selectedVpn: null, solaceConnection: null, sempCredentials: null, isSempConnected: false },
            eventBus,
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
            config: {}
        } as any;
        initDetails(ctx);
        initTable(eventBus);
    });

    describe('wire()', () => {
        it('stores disconnectBrowser reference', () => {
            const se = createServiceEvents();
            const mockDisconnect = vi.fn();
            se.wire({ disconnectBrowser: mockDisconnect });

            // Trigger onConnectFailed to verify wire worked
            state.currentQueue = 'test';
            se.onConnectFailed('test', { message: 'error' });
            expect(mockDisconnect).toHaveBeenCalledWith('test');
        });
    });

    describe('onBrowserUp()', () => {
        it('adds queue to dropdown and clears input', () => {
            const se = createServiceEvents();
            se.onBrowserUp('test-queue');

            const select = document.querySelector('#browser-bound-queues') as HTMLSelectElement;
            expect(select.options.length).toBe(2);
        });

        it('clears bind error for current queue', () => {
            const se = createServiceEvents();
            state.currentQueue = 'test-queue';
            se.onBrowserUp('test-queue');

            const errorEl = document.querySelector('#browser-connect-error') as HTMLElement;
            expect(errorEl.style.display).toBe('none');
        });

        it('does not clear bind input if different queue', () => {
            const se = createServiceEvents();
            const input = document.querySelector('#browser-bind-input') as HTMLInputElement;
            input.value = 'other-queue';
            se.onBrowserUp('test-queue');
            expect(input.value).toBe('other-queue');
        });

        it('emits an ok toast including the queue name', () => {
            // Ensure the toast container exists (provided by index.html in prod;
            // test DOM is a synthesised module template, so we add it here).
            if (!document.getElementById('toast-container')) {
                const c = document.createElement('div');
                c.id = 'toast-container';
                document.body.appendChild(c);
            }
            const se = createServiceEvents();
            se.onBrowserUp('orders');

            const container = document.getElementById('toast-container')!;
            const toast = container.querySelector('.toast.toast--ok');
            expect(toast).not.toBeNull();
            expect(toast!.textContent).toContain('orders');
        });
    });

    describe('onConnectFailed()', () => {
        it('shows error and calls disconnect', () => {
            const mockDisconnect = vi.fn();
            const se = createServiceEvents();
            se.wire({ disconnectBrowser: mockDisconnect });

            se.onConnectFailed('test-queue', { message: 'Connection refused' });

            expect(mockDisconnect).toHaveBeenCalledWith('test-queue');
            const errorEl = document.querySelector('#browser-bind-error') as HTMLElement;
            expect(errorEl.style.display).toBe('block');
        });

        it('shows browser error when active queue fails', () => {
            const se = createServiceEvents();
            se.wire({ disconnectBrowser: vi.fn() });
            state.currentQueue = 'test-queue';

            se.onConnectFailed('test-queue', { message: 'error' });

            const errorEl = document.querySelector('#browser-connect-error') as HTMLElement;
            expect(errorEl.style.display).toBe('block');
        });

        it('throws if wire() was never called — surfaces missing wiring at dev time', () => {
            const se = createServiceEvents();
            // wire() omitted — should throw immediately so the missing call is obvious
            expect(() => se.onConnectFailed('test', { message: 'err' })).toThrow('wire() not called');
        });

        it('falls back to "Unknown Error" when err has no message', () => {
            const se = createServiceEvents();
            se.wire({ disconnectBrowser: vi.fn() });
            state.currentQueue = 'test-queue';

            se.onConnectFailed('test-queue', {});

            const bindErr = document.querySelector('#browser-bind-error') as HTMLElement;
            const browserErr = document.querySelector('#browser-connect-error') as HTMLElement;
            expect(bindErr.textContent).toContain('Unknown Error');
            expect(browserErr.textContent).toContain('Unknown Error');
        });
    });

    describe('onBrowserDown()', () => {
        it('shows error when active queue goes down', () => {
            const se = createServiceEvents();
            state.currentQueue = 'test-queue';
            se.onBrowserDown('test-queue', { message: 'Down error' });

            const errorEl = document.querySelector('#browser-connect-error') as HTMLElement;
            expect(errorEl.style.display).toBe('block');
        });

        it('does nothing for non-active queue', () => {
            const showSpy = vi.spyOn(ui, 'showBrowserError');
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const se = createServiceEvents();
            state.currentQueue = 'other-queue';
            se.onBrowserDown('test-queue', { message: 'err' });
            expect(showSpy).not.toHaveBeenCalled();
            // Anchor: handler ran, just took the non-active branch
            expect(errSpy).toHaveBeenCalled();
            showSpy.mockRestore();
            errSpy.mockRestore();
        });

        it('handles error object without message', () => {
            const se = createServiceEvents();
            state.currentQueue = 'test-queue';
            se.onBrowserDown('test-queue', 'raw error string');

            const errorEl = document.querySelector('#browser-connect-error') as HTMLElement;
            // Proves the `${err}` template fallback rendered when `err.message` is undefined.
            expect(errorEl.textContent).toContain('raw error string');
        });
    });

    describe('onGmDisabled()', () => {
        it('shows GM disabled error for active queue', () => {
            const se = createServiceEvents();
            state.currentQueue = 'test-queue';
            se.onGmDisabled('test-queue');

            const errorEl = document.querySelector('#browser-connect-error') as HTMLElement;
            expect(errorEl.textContent).toContain('Guaranteed Messaging');
        });

        it('does nothing for non-active queue', () => {
            const showSpy = vi.spyOn(ui, 'showBrowserError');
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const se = createServiceEvents();
            state.currentQueue = 'other';
            se.onGmDisabled('test-queue');
            expect(showSpy).not.toHaveBeenCalled();
            expect(errSpy).toHaveBeenCalled();
            showSpy.mockRestore();
            errSpy.mockRestore();
        });
    });

    // ACK/REJECT/timeout/inflight-tracking moved to src/core/services/solace-publisher
    // in the May 2026 publisher lift. Their tests now live in
    // tests/core/services/solace-publisher.test.ts.

    describe('onMessage()', () => {
        function createSolaceMessage(overrides: any = {}) {
            return {
                getType: () => overrides.type ?? 0,
                getBinaryAttachment: () => overrides.binaryAttachment ?? null,
                getSdtContainer: () => overrides.sdtContainer ?? null,
                getXmlContent: () => overrides.xmlContent ?? '',
                getSenderTimestamp: () => overrides.timestamp ?? null,
                getGuaranteedMessageId: () => ('gmid' in overrides) ? overrides.gmid : 12345,
                getDestination: () => ({ getName: () => 'test-dest', getType: () => 0 }),
                getApplicationMessageId: () => null,
                getCacheRequestId: () => null,
                getCorrelationId: () => null,
                getDeliveryCount: () => 0,
                getDeliveryMode: () => 1,
                getHttpContentEncoding: () => null,
                getHttpContentType: () => null,
                getPriority: () => null,
                getReplyTo: () => null,
                getSenderId: () => null,
                getSequenceNumber: () => null,
                getTimeToLive: () => null,
                getTopicSequenceNumber: () => null,
                getUserPropertyMap: () => null,
                smfHeader: { messageLength: 100 },
                dump: () => 'raw dump'
            };
        }

        it('processes a text message', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                type: 0,
                sdtContainer: { getType: () => 0, getValue: () => 'Hello World' },
                gmid: 100
            });

            se.onMessage('q1', msg);

            expect(state.messageStore.get('q1')!.length).toBe(1);
        });

        it('processes a binary message', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                type: 1,
                binaryAttachment: 'binary string content',
                gmid: 101
            });

            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')!.length).toBe(1);
        });

        it('handles Uint8Array binary attachment', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                binaryAttachment: new Uint8Array([72, 101, 108, 108, 111]),
                gmid: 102
            });

            se.onMessage('q1', msg);
            const stored = state.messageStore.get('q1')![0];
            expect(stored.content).toBe('Hello');
        });

        it('handles unknown binary type', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ binaryAttachment: { someObj: true }, gmid: 103 });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].content).toContain('Unknown Binary');
        });

        it('handles SDT Map and Stream types', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                sdtContainer: { getType: () => 1, getValue: () => {} },
                gmid: 104
            });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].content).toContain('SDT Map');

            state.messageStore.set('q2', []);
            state.currentQueue = 'q2';
            state.allMessages = [];
            state.displayedMessages = [];
            const msg2 = createSolaceMessage({
                sdtContainer: { getType: () => 2, getValue: () => {} },
                gmid: 105
            });
            se.onMessage('q2', msg2);
            expect(state.messageStore.get('q2')![0].content).toContain('SDT Stream');
        });

        it('handles SDT unknown type', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                sdtContainer: { getType: () => 99, getValue: () => {} },
                gmid: 106
            });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].content).toContain('SDT Unknown');
        });

        it('handles timestamp extraction', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ timestamp: 1698400000000, gmid: 107 });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].date).not.toBe('N/A');
        });

        it('silently drops a message for a queue whose messageStore entry is absent', () => {
            // The SDK can deliver a buffered MESSAGE event during the small window
            // after browser.disconnect() tears down state.messageStore. Without the
            // `if (!store) return` guard in ingestMessage, this would throw
            // TypeError on the first push().
            const se = createServiceEvents();
            state.messageStore.clear(); // no entry for 'q-gone'
            const storeSize = state.messageStore.size;

            const msg = createSolaceMessage({ gmid: 999 });
            expect(() => se.onMessage('q-gone', msg)).not.toThrow();

            // Guard returned early — no phantom entry was created.
            expect(state.messageStore.size).toBe(storeSize);
            expect(state.messageStore.has('q-gone')).toBe(false);
        });

        it('handles timestamp with toNumber function', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ timestamp: { toNumber: () => 1698400000000 }, gmid: 108 });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].date).not.toBe('N/A');
        });

        it('handles non-numeric timestamp by leaving dateMs null', () => {
            // Defensive branch at service-events.ts:154 — if `ts` is a
            // truthy non-number primitive (or `ts.toNumber()` returns a
            // non-number), the engine sets `dateMs = null` so downstream
            // age-filters can't compute against garbage. Reproduces the
            // case by handing back a truthy object whose `.toNumber()`
            // returns a string.
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                timestamp: { toNumber: () => 'not-a-number' as any },
                gmid: 200,
            });
            se.onMessage('q1', msg);
            const stored = state.messageStore.get('q1')!;
            expect(stored[0].dateMs).toBeNull();
        });

        it('handles null timestamp', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ timestamp: null, gmid: 109 });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].date).toBe('(No Timestamp)');
        });

        it('handles message type detection errors', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 110 });
            msg.getType = () => { throw new Error('type error'); };
            se.onMessage('q1', msg);
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('handles timestamp extraction error', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 111 });
            msg.getSenderTimestamp = () => { throw new Error('ts error'); };
            se.onMessage('q1', msg);
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('handles UserPropertyMap', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 112 });
            msg.getUserPropertyMap = () => ({
                getKeys: () => ['key1', 'key2'],
                getField: (k: string) => (k === 'key1' ? { getValue: () => 'val1' } : 'raw-val')
            });
            se.onMessage('q1', msg);
            const stored = state.messageStore.get('q1')![0];
            expect(stored.appProperties.key1).toBe('val1');
            expect(stored.appProperties.key2).toBe('raw-val');
        });

        it('handles message for non-active queue', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'other';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 113 });
            se.onMessage('q1', msg);

            // Should be stored but not added to displayed
            expect(state.messageStore.get('q1')!.length).toBe(1);
            expect(state.displayedMessages.length).toBe(0);
        });

        it('handles null gmid', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: null });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].id).toBe('N/A');
        });

        it('handles property extraction errors', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 114 });
            msg.getApplicationMessageId = () => { throw new Error('err'); };
            msg.getDeliveryMode = () => { throw new Error('err'); };
            msg.getUserPropertyMap = () => { throw new Error('err'); };

            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')!.length).toBe(1);
        });

        it('handles all delivery mode values', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            // DIRECT = 0
            const msg = createSolaceMessage({ gmid: 115 });
            msg.getDeliveryMode = () => 0;
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].msgProperties['Delivery Mode']).toBe('DIRECT');

            // NON_PERSISTENT = 2
            state.messageStore.set('q2', []);
            state.currentQueue = 'q2';
            state.allMessages = [];
            state.displayedMessages = [];
            const msg2 = createSolaceMessage({ gmid: 116 });
            msg2.getDeliveryMode = () => 2;
            se.onMessage('q2', msg2);
            expect(state.messageStore.get('q2')![0].msgProperties['Delivery Mode']).toBe('NON_PERSISTENT');

            // UNKNOWN = 99
            state.messageStore.set('q3', []);
            state.currentQueue = 'q3';
            state.allMessages = [];
            state.displayedMessages = [];
            const msg3 = createSolaceMessage({ gmid: 117 });
            msg3.getDeliveryMode = () => 99;
            se.onMessage('q3', msg3);
            expect(state.messageStore.get('q3')![0].msgProperties['Delivery Mode']).toBe('UNKNOWN');
        });

        it('extracts all non-null properties', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 118 });
            msg.getApplicationMessageId = () => 'app-id';
            msg.getCacheRequestId = () => 'cache-id';
            msg.getCorrelationId = () => 'corr-id';
            msg.getDeliveryCount = () => 3;
            msg.getHttpContentEncoding = () => 'gzip';
            msg.getHttpContentType = () => 'application/json';
            msg.getPriority = () => 5;
            msg.getReplyTo = () => ({ toString: () => 'reply/topic' });
            msg.getSenderId = () => 'sender-1';
            msg.getSequenceNumber = () => 42;
            msg.getTimeToLive = () => 60000;
            msg.getTopicSequenceNumber = () => 7;

            se.onMessage('q1', msg);
            const stored = state.messageStore.get('q1')![0];
            expect(stored.msgProperties['App Msg Id']).toBe('app-id');
            expect(stored.msgProperties['Cache Id']).toBe('cache-id');
            expect(stored.msgProperties['Corr Id']).toBe('corr-id');
            expect(stored.msgProperties['Delivery Count']).toBe(3);
            expect(stored.msgProperties['HTTP Encoding']).toBe('gzip');
            expect(stored.msgProperties['HTTP Type']).toBe('application/json');
            expect(stored.msgProperties['Priority']).toBe(5);
            expect(stored.msgProperties['Reply To']).toBe('reply/topic');
            expect(stored.msgProperties['Sender Id']).toBe('sender-1');
            expect(stored.msgProperties['SeqNumber']).toBe(42);
            expect(stored.msgProperties['TTL']).toBe(60000);
            expect(stored.msgProperties['TopicSeqNum']).toBe(7);
        });

        it('stores boolean flag properties only when the SDK getter returns true', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 200 });
            msg.isAcknowledgeImmediately = () => true;
            msg.isDeliverToOne = () => true;
            msg.isDiscardIndication = () => true;
            msg.isDMQEligible = () => true;
            msg.isElidingEligible = () => true;
            msg.isRedelivered = () => true;
            msg.isReplyMessage = () => true;

            se.onMessage('q1', msg);
            const stored = state.messageStore.get('q1')![0];
            expect(stored.msgProperties['AcknowledgeImmediately']).toBe(true);
            expect(stored.msgProperties['DeliverToOne']).toBe(true);
            expect(stored.msgProperties['DiscardIndication']).toBe(true);
            expect(stored.msgProperties['DMQEligible']).toBe(true);
            expect(stored.msgProperties['ElidingEligible']).toBe(true);
            expect(stored.msgProperties['Redelivered']).toBe(true);
            expect(stored.msgProperties['ReplyMessage']).toBe(true);
        });

        it('omits boolean flag properties when the SDK getter returns false', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 201 });
            msg.isAcknowledgeImmediately = () => false;
            msg.isDeliverToOne = () => false;
            msg.isDiscardIndication = () => false;
            msg.isDMQEligible = () => false;
            msg.isElidingEligible = () => false;
            msg.isRedelivered = () => false;
            msg.isReplyMessage = () => false;

            se.onMessage('q1', msg);
            const stored = state.messageStore.get('q1')![0];
            for (const key of [
                'AcknowledgeImmediately', 'DeliverToOne', 'DiscardIndication',
                'DMQEligible', 'ElidingEligible', 'Redelivered', 'ReplyMessage'
            ]) {
                expect(stored.msgProperties[key]).toBeUndefined();
            }
        });

        it('handles MAP and STREAM message types', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 119 });
            msg.getType = () => 2; // MAP
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].type).toBe('Map');

            state.messageStore.set('q2', []);
            state.currentQueue = 'q2';
            state.allMessages = [];
            state.displayedMessages = [];
            const msg2 = createSolaceMessage({ gmid: 120 });
            msg2.getType = () => 3; // STREAM
            se.onMessage('q2', msg2);
            expect(state.messageStore.get('q2')![0].type).toBe('Stream');
        });

        it('handles unknown message type by leaving typeStr at default "Message"', () => {
            // The type-detection chain at service-events.ts:165-168 falls through
            // when getType() returns something that's neither TEXT/BINARY/MAP/STREAM
            // — typeStr is initialised to 'Message' on line 163 and nothing reassigns
            // it. This test documents that fall-through contract AND unambiguously
            // exercises the falsy branches of the MAP and STREAM checks (lines 167-168),
            // which the chained else-if's basic-block layout otherwise leaves under-
            // reported in v8 coverage.
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({ gmid: 199 });
            msg.getType = () => 99; // not TEXT(0)/BINARY(1)/MAP(2)/STREAM(3)
            se.onMessage('q1', msg);

            expect(state.messageStore.get('q1')![0].type).toBe('Message');
        });

        it('adds to displayed when filter matches', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = []; // Different reference from allMessages

            state.activeFilters.content = ''; // No filter = show all

            const msg = createSolaceMessage({ gmid: 121, xmlContent: 'test content' });
            se.onMessage('q1', msg);
        });

        it('handles Uint8Array decode error', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            // ArrayBuffer
            const msg = createSolaceMessage({
                binaryAttachment: new ArrayBuffer(4),
                gmid: 122
            });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')!.length).toBe(1);
        });

        it('handles TextDecoder failure with Binary Data Error', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const origDecoder = globalThis.TextDecoder;
            globalThis.TextDecoder = vi.fn(function() {
                return { decode: () => { throw new Error('decode error'); } };
            }) as any;

            const msg = createSolaceMessage({
                binaryAttachment: new Uint8Array([0xFF, 0xFE]),
                gmid: 123
            });
            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored.length).toBe(1);
            expect(stored[0].content).toBe('[Binary Data Error]');

            globalThis.TextDecoder = origDecoder;
        });

        it('handles unknown binary data type', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createSolaceMessage({
                binaryAttachment: { weird: 'object' },
                gmid: 124
            });
            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored.length).toBe(1);
            expect(stored[0].content).toBe('[Unknown Binary Data]');
        });

        it('handles SDT Map message type via createMessageMock', () => {
            const solace = (window as any).solace;
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createMessageMock();
            msg.getType.mockReturnValue(solace.MessageType.MAP);
            msg.getSdtContainer.mockReturnValue({
                getType: () => solace.SDTFieldType.MAP,
                getValue: () => null
            });
            msg.getGuaranteedMessageId.mockReturnValue(789);

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].content).toBe('[SDT Map Data - Not Supported Yet]');
            expect(stored[0].type).toBe('Map');
        });

        it('handles SDT Stream message type via createMessageMock', () => {
            const solace = (window as any).solace;
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createMessageMock();
            msg.getType.mockReturnValue(solace.MessageType.STREAM);
            msg.getSdtContainer.mockReturnValue({
                getType: () => solace.SDTFieldType.STREAM,
                getValue: () => null
            });
            msg.getGuaranteedMessageId.mockReturnValue(790);

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].content).toBe('[SDT Stream Data - Not Supported Yet]');
            expect(stored[0].type).toBe('Stream');
        });

        it('handles SDT Unknown type via createMessageMock', () => {
            const solace = (window as any).solace;
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            const msg = createMessageMock();
            msg.getType.mockReturnValue(solace.MessageType.TEXT);
            msg.getSdtContainer.mockReturnValue({
                getType: () => 99,
                getValue: () => null
            });
            msg.getGuaranteedMessageId.mockReturnValue(791);

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].content).toBe('[SDT Unknown Data - Not Supported Yet]');
        });

        it('stores message but does not add to UI if different queue is active', () => {
            const se = createServiceEvents();
            state.currentQueue = 'other-queue';
            state.messageStore.set('q1', []);

            const msg = createMessageMock();
            msg.getGuaranteedMessageId.mockReturnValue(123);

            se.onMessage('q1', msg);

            expect(state.messageStore.get('q1')!.length).toBe(1);
            expect(state.allMessages.length).toBe(0);  // not updated for UI
        });

        it('adds to displayed via addMessageRow when displayedMessages equals allMessages', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = state.messageStore.get('q1')!;
            state.displayedMessages = state.allMessages; // Same reference

            const msg = createSolaceMessage({ gmid: 200 });
            se.onMessage('q1', msg);

            // Message should be in allMessages (via store) but not separately pushed to displayedMessages
            // since displayedMessages === allMessages, the push to store is enough
            const stored = state.messageStore.get('q1')!;
            expect(stored.length).toBe(1);
            // displayedMessages is the same reference, so it also has 1 element
            expect(state.displayedMessages.length).toBe(1);
            expect(state.displayedMessages).toBe(state.allMessages);
        });

        it('handles timestamp with toNumber function via createMessageMock', () => {
            const se = createServiceEvents();
            state.currentQueue = 'q1';
            state.messageStore.set('q1', []);
            state.allMessages = state.messageStore.get('q1')!;
            state.displayedMessages = state.allMessages;

            const msg = createMessageMock();
            msg.getGuaranteedMessageId.mockReturnValue(999);
            msg.getSenderTimestamp.mockReturnValue({ toNumber: () => 1700000000000 });

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].date).not.toBe('N/A');
            expect(stored[0].date).not.toBe('(No Timestamp)');
        });
    });

    // onSessionAck/Reject branches (correlation-key absent, generic-error
    // fallback, null-event safety) are now covered by the publisher unit
    // tests in tests/core/services/solace-publisher.test.ts. Their previous
    // wrapper here was deleted during the May 2026 publisher lift.

    describe('onConnectFailed()', () => {
        it('shows browser error when current queue matches and calls disconnectBrowser', () => {
            const se = createServiceEvents();
            const disconnectSpy = vi.fn();
            se.wire({ disconnectBrowser: disconnectSpy });
            state.currentQueue = 'q1';

            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            se.onConnectFailed('q1', new Error('test fail'));
            errorSpy.mockRestore();

            expect(disconnectSpy).toHaveBeenCalledWith('q1');
        });
    });

    describe('onMessage() additional branches', () => {
        it('handles message with no smfHeader (size = 0)', () => {
            const se = createServiceEvents();
            state.currentQueue = 'q1';
            state.messageStore.set('q1', []);

            const msg = createMessageMock();
            msg.smfHeader = null;
            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].size).toBe(0);
        });

        it('does not add to displayedMessages when filter rejects message', () => {
            const se = createServiceEvents();
            state.currentQueue = 'q1';
            state.messageStore.set('q1', []);
            state.allMessages = [];
            state.displayedMessages = [];

            state.activeFilters = {
                content: 'NOMATCH_XYZ', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', properties: [], criteria: 'AND'
            };

            const msg = createMessageMock();
            se.onMessage('q1', msg);

            expect(state.allMessages.length).toBe(1);
            expect(state.displayedMessages.length).toBe(0);
        });

        it('handles MAP message type', () => {
            const se = createServiceEvents();
            state.currentQueue = 'q1';
            state.messageStore.set('q1', []);

            const solace = (window as any).solace;
            const msg = createMessageMock();
            msg.getType = vi.fn(() => solace.MessageType.MAP);
            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].type).toBe('Map');
        });
    });
});
