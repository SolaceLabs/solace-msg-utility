import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServiceEvents } from '../../../src/modules/queue-browser/service-events';
import { state, shouldShowMessage } from '../../../src/modules/queue-browser/state.js';
import { ui } from '../../../src/modules/queue-browser/ui-core.js';
import '../../../src/modules/queue-browser/ui-forward.js';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { initDetails } from '../../../src/modules/queue-browser/ui-details';
import { createEventBus } from '../../../src/core/event-bus';
import { createSolaceMock, createMessageMock } from '../../setup';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import { stubSavePicker, blobBytes } from '../../helpers/savePicker';

function setupBrowserDOM() {
    const container = loadModuleDOM('queue-browser');
    // Pre-populate the bind input with the value the existing tests assume.
    (container.querySelector('#browser-bind-input') as HTMLInputElement).value = 'test-queue';
    ui.initElements(container);
}

// The toast container is declared once in src/index.html; the module test DOM
// lacks it. Returns it emptied so a test reads only its own toasts.
function freshToasts(): HTMLElement {
    let c = document.getElementById('toast-container');
    if (!c) {
        c = document.createElement('div');
        c.id = 'toast-container';
        document.body.appendChild(c);
    }
    c.innerHTML = '';
    return c;
}

// What the SDK's version10 profile hands getBinaryAttachment(): one char per byte.
function latin1(bytes: Uint8Array): string {
    return String.fromCharCode(...bytes);
}

// SDK SDT fields as decodeSdt reads them. The type numbers are the mock's (STRING 0, MAP 1,
// STREAM 2) plus the two scalar types the tests add to the mock's enum in beforeEach.
const SDT = { STRING: 0, MAP: 1, STREAM: 2, BOOL: 3, INT32: 4 };

const sdtField = (type: number, value: unknown) => ({ getType: () => type, getValue: () => value });

const sdtMap = (entries: [string, ReturnType<typeof sdtField>][]) => {
    const fields = new Map(entries);
    return sdtField(SDT.MAP, { getKeys: () => [...fields.keys()], getField: (k: string) => fields.get(k) });
};

const sdtStream = (items: ReturnType<typeof sdtField>[]) => {
    let at = 0;
    return sdtField(SDT.STREAM, { rewind: () => { at = 0; }, hasNext: () => at < items.length, getNext: () => items[at++] });
};

describe('queue-browser/service-events', () => {
    let solaceMock: any;
    let picker: ReturnType<typeof stubSavePicker>;

    afterEach(() => {
        picker.restore();
    });

    beforeEach(() => {
        solaceMock = createSolaceMock();
        Object.assign(solaceMock.SDTFieldType, { BOOL: SDT.BOOL, INT32: SDT.INT32 });
        picker = stubSavePicker();
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
            // The bind input held 'test-queue', the queue that came up.
            expect((document.querySelector('#browser-bind-input') as HTMLInputElement).value).toBe('');
        });

        it('leaves the bind input alone when a different queue came up', () => {
            const se = createServiceEvents();
            se.onBrowserUp('other-queue');

            expect((document.querySelector('#browser-bind-input') as HTMLInputElement).value).toBe('test-queue');
        });

        it('clears bind error for current queue', () => {
            const se = createServiceEvents();
            state.currentQueue = 'test-queue';
            se.onBrowserUp('test-queue');

            const errorEl = document.querySelector('#browser-connect-error') as HTMLElement;
            expect(errorEl.style.display).toBe('none');
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
        // The broker ended the binding for good (DOWN_ERROR): the queue must leave
        // the bound list and free its slot so the user can bind it again.
        it('drops the on-screen queue: frees its slot, leaves the bound list, clears its view and warns', () => {
            const se = createServiceEvents();
            const disconnect = vi.fn();
            se.wire({ disconnectBrowser: disconnect });
            state.browserInstances.set('orders', {});
            ui.addQueueToDropdown('orders');
            state.currentQueue = 'orders';
            const toasts = freshToasts();

            se.onBrowserDown('orders', { message: 'Permission Not Allowed' });

            const select = ui.getElements().selectBound as HTMLSelectElement;
            expect(disconnect).toHaveBeenCalledWith('orders');
            expect(Array.from(select.options).map(o => o.value)).toEqual(['']);
            expect(state.currentQueue).toBe('');
            expect(toasts.querySelector('.toast--warn')!.textContent)
                .toBe('Queue "orders" was disconnected: Permission Not Allowed. Bind it again to continue.');
        });

        it('drops an off-screen queue from the bound list and warns, leaving the queue on screen alone', () => {
            const se = createServiceEvents();
            const disconnect = vi.fn();
            se.wire({ disconnectBrowser: disconnect });
            state.browserInstances.set('audit', {});
            state.browserInstances.set('orders', {});
            ui.addQueueToDropdown('audit');
            ui.addQueueToDropdown('orders');   // auto-selects: orders is on screen
            state.currentQueue = 'orders';
            const toasts = freshToasts();

            se.onBrowserDown('audit', {});

            const select = ui.getElements().selectBound as HTMLSelectElement;
            expect(disconnect).toHaveBeenCalledWith('audit');
            expect(Array.from(select.options).map(o => o.value)).toEqual(['', 'orders']);
            expect([select.value, state.currentQueue]).toEqual(['orders', 'orders']);
            expect(toasts.querySelector('.toast--warn')!.textContent)
                .toBe('Queue "audit" was disconnected: no reason given. Bind it again to continue.');
        });

        it('ignores a DOWN for a queue that is no longer bound', () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const se = createServiceEvents();
            const disconnect = vi.fn();
            se.wire({ disconnectBrowser: disconnect });
            const toasts = freshToasts();

            se.onBrowserDown('gone', { message: 'Unknown Queue' });

            expect(disconnect).not.toHaveBeenCalled();
            expect(toasts.children.length).toBe(0);
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

    // ACK/REJECT/timeout/inflight-tracking live in src/core/services/solace-publisher
    // and are tested in tests/core/services/solace-publisher.test.ts.

    describe('onMessage()', () => {
        // `any`: tests override the SDK getters they exercise on the returned object.
        function createSolaceMessage(overrides: any = {}): any {
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

        it('decodes a UTF-8 binary attachment from the SDK Latin-1 string: shown as text, filterable, saved byte for byte', async () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const utf8 = new TextEncoder().encode('Gr\u00fc\u00dfe: 5 \u20ac');
            se.onMessage('q1', createSolaceMessage({ type: 1, binaryAttachment: latin1(utf8), gmid: 300 }));

            const stored = state.messageStore.get('q1')![0];
            expect([stored.content, stored.binary]).toEqual(['Gr\u00fc\u00dfe: 5 \u20ac', false]);

            ui.selectMessage('300');
            expect(ui.getElements().detailContent.textContent).toBe('Gr\u00fc\u00dfe: 5 \u20ac');
            expect(ui.getElements().btnCopyContent.disabled).toBe(false);

            state.activeFilters.content = 'gr\u00fc\u00dfe';
            expect(shouldShowMessage(stored)).toBe(true);

            ui.downloadMessageContent(stored);
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));
            expect(picker.names).toEqual(['solace-message-300.txt']);
            expect(picker.blobs[0].type).toBe('application/octet-stream');
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(utf8));
        });

        it('shows a non-UTF-8 binary attachment as a size placeholder the body filter never matches, and saves its original bytes', async () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            // A PNG signature byte (0x89) next to a multi-byte UTF-8 character: not valid UTF-8.
            const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, ...new TextEncoder().encode('\u20ac')]);
            const msg = createSolaceMessage({ type: 1, binaryAttachment: latin1(bytes), gmid: 301 });
            msg.getHttpContentType = () => 'image/png';
            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')![0];
            expect([stored.content, stored.binary]).toEqual(['[Binary payload: 7 bytes]', true]);

            ui.selectMessage('301');
            expect(ui.getElements().detailContent.textContent).toBe('[Binary payload: 7 bytes]');
            expect(ui.getElements().detailTypeBadge.textContent).toBe('Binary');
            expect(ui.getElements().btnCopyContent.disabled).toBe(true);

            // The placeholder text is not the payload: a search for it finds nothing.
            state.activeFilters.content = 'binary';
            expect(shouldShowMessage(stored)).toBe(false);

            // Seven bytes are too few for a PNG signature, so no kind is named and the name ends in .bin.
            ui.downloadMessageContent(stored);
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));
            expect(picker.names).toEqual(['solace-message-301.bin']);
            expect(picker.blobs[0].type).toBe('application/octet-stream');
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(bytes));
        });

        it('decodes UTF-8 XML content from the SDK byte string: shown as text, filterable, saved byte for byte', async () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const xml = '<doc>Gr\u00fc\u00dfe \u20ac</doc>';
            const utf8 = new TextEncoder().encode(xml);
            const msg = createSolaceMessage({ type: 1, xmlContent: latin1(utf8), gmid: 302 });
            msg.getHttpContentType = () => 'application/xml';
            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')![0];
            expect([stored.content, stored.binary]).toEqual([xml, false]);

            state.activeFilters.content = 'gr\u00fc\u00dfe';
            expect(shouldShowMessage(stored)).toBe(true);

            ui.downloadMessageContent(stored);
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));
            expect(picker.names).toEqual(['solace-message-302.xml']);
            expect(picker.blobs[0].type).toBe('application/octet-stream');
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(utf8));
        });

        it('decodes a map message to YAML content, keeping its decoded tree and its wire bytes, and treats it as text', async () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const wire = new Uint8Array([0x2B, 0x10, 0x00, 0xFF, 0x80]);
            const container = sdtMap([['name', sdtField(SDT.STRING, 'bob')], ['age', sdtField(SDT.INT32, 42)], ['active', sdtField(SDT.BOOL, true)]]);
            se.onMessage('q1', createSolaceMessage({ type: 2, gmid: 400, binaryAttachment: latin1(wire), sdtContainer: container }));

            const stored = state.messageStore.get('q1')![0];
            expect(stored.type).toBe('Map');
            expect(stored.content).toBe('name: bob\nage: 42\nactive: true');
            expect(stored.binary).toBe(false);
            expect(Array.from(stored.bytes as Uint8Array)).toEqual(Array.from(wire));
            expect(stored.sdt).toEqual({
                type: 'map',
                entries: [['name', { type: 'string', value: 'bob' }], ['age', { type: 'integer', value: 42 }], ['active', { type: 'boolean', value: true }]],
            });

            // The body filter reads the YAML; the details pane shows it and Copy Content stays on.
            state.activeFilters.content = 'age: 42';
            expect(shouldShowMessage(stored)).toBe(true);
            ui.selectMessage('400');
            expect(ui.getElements().detailContent.textContent).toBe('name: bob\nage: 42\nactive: true');
            expect(ui.getElements().btnCopyContent.disabled).toBe(false);
            expect(ui.getElements().btnShowContent.classList.contains('hidden')).toBe(true);

            // Download Content saves the wire bytes, not the YAML.
            ui.downloadMessageContent(stored);
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));
            expect(picker.names).toEqual(['solace-message-400.bin']);
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(wire));
        });

        it('decodes a stream message to a YAML list, nested map included, with its wire bytes', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const wire = new Uint8Array([0x2C, 0x01]);
            const container = sdtStream([sdtField(SDT.INT32, 1), sdtField(SDT.INT32, 2), sdtMap([['k', sdtField(SDT.STRING, 'v')]])]);
            se.onMessage('q1', createSolaceMessage({ type: 3, gmid: 401, binaryAttachment: latin1(wire), sdtContainer: container }));

            const stored = state.messageStore.get('q1')![0];
            expect(stored.type).toBe('Stream');
            expect(stored.content).toBe('- 1\n- 2\n-\n  k: v');
            expect(stored.binary).toBe(false);
            expect(Array.from(stored.bytes as Uint8Array)).toEqual([0x2C, 0x01]);
            expect(stored.sdt.type).toBe('stream');
            expect(stored.sdt.items).toHaveLength(3);
        });

        it('decodes a scalar container, and keeps a type it does not know as a commented null', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const wire = new Uint8Array([0x01]);
            se.onMessage('q1', createSolaceMessage({ gmid: 404, binaryAttachment: latin1(wire), sdtContainer: sdtField(SDT.INT32, 7) }));
            se.onMessage('q1', createSolaceMessage({ gmid: 405, binaryAttachment: latin1(wire), sdtContainer: sdtField(99, undefined) }));

            const [int, odd] = state.messageStore.get('q1')!;
            expect([int.content, int.sdt]).toEqual(['7', { type: 'integer', value: 7 }]);
            expect([odd.content, odd.sdt]).toEqual(['null # a field of type 99, not shown', { type: 'unsupported', name: '99' }]);
        });

        it('shows the text of an SDT string payload as it is: no decoded tree, no bytes', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            se.onMessage('q1', createSolaceMessage({ gmid: 403, sdtContainer: sdtField(SDT.STRING, 'Hello <b>World</b>: 1') }));

            const stored = state.messageStore.get('q1')![0];
            expect(stored.content).toBe('Hello <b>World</b>: 1');
            expect(stored.binary).toBe(false);
            expect('sdt' in stored).toBe(false);
            expect('bytes' in stored).toBe(false);
        });

        it('falls back to the attachment, with a warning, when a map cannot be decoded: its bytes are a binary payload', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const wire = new Uint8Array([0x00, 0xFF, 0x2B]);
            const broken = sdtField(SDT.MAP, { getKeys: () => { throw new Error('corrupt map header'); } });
            se.onMessage('q1', createSolaceMessage({ type: 2, gmid: 406, binaryAttachment: latin1(wire), sdtContainer: broken }));

            const stored = state.messageStore.get('q1')![0];
            expect([stored.content, stored.binary]).toEqual(['[Binary payload: 3 bytes]', true]);
            expect(Array.from(stored.bytes as Uint8Array)).toEqual([0x00, 0xFF, 0x2B]);
            expect('sdt' in stored).toBe(false);
            expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('A map or stream body could not be decoded (corrupt map header); showing its bytes');
        });

        it('falls back to the attachment as text when the container throws and the bytes are text', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            const broken = { getType: () => { throw new Error('bad container'); }, getValue: () => null };
            se.onMessage('q1', createSolaceMessage({ gmid: 407, binaryAttachment: 'plain words', sdtContainer: broken }));

            const stored = state.messageStore.get('q1')![0];
            expect([stored.content, stored.binary]).toEqual(['plain words', false]);
            expect('sdt' in stored).toBe(false);
            expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('bad container');
        });

        it('handles timestamp extraction', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = [];
            state.displayedMessages = [];

            // Built from local parts, as the formatter reads local time.
            const msg = createSolaceMessage({ timestamp: new Date(2026, 4, 17, 9, 30, 15).getTime(), gmid: 107 });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].date).toBe('17-May-26 09:30:15');
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

            const msg = createSolaceMessage({ timestamp: { toNumber: () => new Date(2026, 10, 3, 18, 5, 7).getTime() }, gmid: 108 });
            se.onMessage('q1', msg);
            expect(state.messageStore.get('q1')![0].date).toBe('03-Nov-26 18:05:07');
        });

        it('handles non-numeric timestamp by leaving dateMs null', () => {
            // Defensive branch in onMessage's timestamp handling -- if `ts` is a
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
            // The message is kept, with the generic type as the fallback.
            expect(state.messageStore.get('q1')).toHaveLength(1);
            expect(state.messageStore.get('q1')![0].type).toBe('Message');
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
            // The message is kept, with no usable date.
            expect(state.messageStore.get('q1')).toHaveLength(1);
            expect(state.messageStore.get('q1')![0].date).toBe('N/A');
            expect(state.messageStore.get('q1')![0].dateMs).toBeNull();
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
            expect(state.allMessages.length).toBe(0);
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
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
            // The user-properties failure names the queue and message and keeps its cause.
            expect(state.messageStore.get('q1')![0].appProperties).toEqual({});
            expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[queue-browser\] Failed to read the user properties of message 114 on queue=q1/), expect.any(Error));
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
            // The type-detection chain in onMessage falls through
            // when getType() returns something that's neither TEXT/BINARY/MAP/STREAM
            // -- typeStr starts as 'Message' and nothing reassigns
            // it. This test documents that fall-through contract AND unambiguously
            // exercises the falsy branches of the MAP and STREAM checks,
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

            expect(state.displayedMessages.map((m: any) => m.id)).toEqual(['121']);
            expect(ui.getElements().msgList.querySelector('tr[data-id="121"]')).not.toBeNull();
        });

        it('keeps a guaranteed id above 2^53 exactly: the SDK hands it back as a Long, read with toString()', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            se.onMessage('q1', createSolaceMessage({ gmid: { toString: () => '9007199254740993' } }));
            expect(state.messageStore.get('q1')![0].id).toBe('9007199254740993');
        });

        it('a message re-delivered after the SDK re-binds the browser adds no second entry or row', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = state.messageStore.get('q1')!;
            state.displayedMessages = state.allMessages;
            const addRow = vi.spyOn(ui, 'addMessageRow').mockImplementation(() => {});

            se.onMessage('q1', createSolaceMessage({ gmid: 300 }));
            // The re-bind: the browser starts again from the head of the queue.
            se.onMessage('q1', createSolaceMessage({ gmid: 300 }));
            se.onMessage('q1', createSolaceMessage({ gmid: 301 }));

            expect(state.messageStore.get('q1')!.map((m: { id: string }) => m.id)).toEqual(['300', '301']);
            expect(addRow.mock.calls.map(([m]) => (m as { id: string }).id)).toEqual(['300', '301']);
            addRow.mockRestore();
        });

        it('adds to displayed via addMessageRow when displayedMessages equals allMessages', () => {
            const se = createServiceEvents();
            state.messageStore.set('q1', []);
            state.currentQueue = 'q1';
            state.allMessages = state.messageStore.get('q1')!;
            state.displayedMessages = state.allMessages; // Same reference

            const msg = createSolaceMessage({ gmid: 200, timestamp: new Date(2026, 4, 17, 9, 30, 15).getTime() });
            se.onMessage('q1', msg);

            // The store push is the only push: displayedMessages is the same array.
            const stored = state.messageStore.get('q1')!;
            expect(stored.length).toBe(1);
            expect(state.displayedMessages).toBe(state.allMessages);
            expect(state.displayedMessages.length).toBe(1);
            // The row was added once, showing the message's id and date.
            const rows = ui.getElements().msgList.querySelectorAll('tr');
            expect(rows.length).toBe(1);
            expect(rows[0].dataset.id).toBe('200');
            expect(rows[0].textContent).toContain('17-May-26 09:30:15');
        });

        it('handles timestamp with toNumber function via createMessageMock', () => {
            const se = createServiceEvents();
            state.currentQueue = 'q1';
            state.messageStore.set('q1', []);
            state.allMessages = state.messageStore.get('q1')!;
            state.displayedMessages = state.allMessages;

            const msg = createMessageMock();
            msg.getGuaranteedMessageId.mockReturnValue(999);
            msg.getSenderTimestamp.mockReturnValue({ toNumber: () => new Date(2026, 0, 2, 3, 4, 5).getTime() });

            se.onMessage('q1', msg);

            const stored = state.messageStore.get('q1')!;
            expect(stored[0].date).toBe('02-Jan-26 03:04:05');
        });
    });

    // onSessionAck/Reject branches (correlation-key absent, generic-error
    // fallback, null-event safety) are covered by the publisher unit
    // tests in tests/core/services/solace-publisher.test.ts.

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
    });
});
