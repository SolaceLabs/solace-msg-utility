import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ui, els } from '../../../src/modules/queue-browser/ui-core.js';
import { initDetails } from '../../../src/modules/queue-browser/ui-details';
import { state } from '../../../src/modules/queue-browser/state.js';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import type { AppContext } from '../../../src/core/types';
import { completeContext } from '../../helpers/appContext';
import { stubSavePicker, blobBytes } from '../../helpers/savePicker';

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

function createBrowserDOM() {
    return loadModuleDOM('queue-browser');
}

describe('queue-browser/ui-details', () => {
    let ctx: AppContext;
    let container: HTMLElement;

    beforeEach(() => {
        container = createBrowserDOM();
        document.body.appendChild(container);
        ui.initElements(container);

        const eventBus = createEventBus();
        ctx = completeContext({
            container,
            appState: { activeModuleId: null, isConnected: false, selectedVpn: null, solaceConnection: null, sempCredentials: null, isSempConnected: false },
            eventBus,
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
        });

        initDetails(ctx);
        initTable(eventBus);

        resetQueueBrowserState();
    });

    describe('triggerDownload()', () => {
        it('wraps the text in a blob of the given type and hands it to triggerDownloadBlob', async () => {
            const saved = vi.spyOn(ui, 'triggerDownloadBlob').mockImplementation(() => {});
            ui.triggerDownload('test.txt', 'hello', 'text/plain');

            expect(saved).toHaveBeenCalledTimes(1);
            const [blob, filename] = saved.mock.calls[0] as [Blob, string];
            expect(filename).toBe('test.txt');
            expect(blob.type).toBe('text/plain');
            expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(new TextEncoder().encode('hello')));
            saved.mockRestore();
        });
    });

    describe('downloadMessageContent()', () => {
        let picker: ReturnType<typeof stubSavePicker>;
        let errorCalls: unknown[][];
        let restoreError: () => void;

        beforeEach(() => {
            picker = stubSavePicker();
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            errorCalls = spy.mock.calls;
            restoreError = () => spy.mockRestore();
        });

        afterEach(() => {
            picker.restore();
            restoreError();
        });

        it('returns early for null message', () => {
            ui.downloadMessageContent(null);
            expect(picker.names).toEqual([]);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        });

        it('saves text as application/octet-stream under a name that takes its extension from what the text is', async () => {
            ui.downloadMessageContent({ id: 'msg-2', content: '{"a":1}', msgProperties: {} });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));

            expect(picker.names).toEqual(['solace-message-msg-2.json']);
            expect(picker.blobs[0].type).toBe('application/octet-stream');
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(new TextEncoder().encode('{"a":1}')));
        });

        it('takes the extension from the HTTP Type when it lists one', async () => {
            ui.downloadMessageContent({ id: 'msg-5', content: 'a,b\n1,2', msgProperties: { 'HTTP Type': 'text/csv' } });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));
            expect(picker.names).toEqual(['solace-message-msg-5.csv']);
        });

        it('saves empty content as an empty .txt file', async () => {
            ui.downloadMessageContent({ id: 'msg-2', content: '', msgProperties: {} });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));

            expect(picker.names).toEqual(['solace-message-msg-2.txt']);
            expect(picker.blobs[0].size).toBe(0);
        });

        it('sanitizes the message id in the file name', async () => {
            ui.downloadMessageContent({ id: 'msg/special:chars!', content: 'test', msgProperties: {} });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));

            // `/`, `:`, `!` are stripped by the id sanitiser in contentFileName.
            expect(picker.names).toEqual(['solace-message-msgspecialchars.txt']);
        });

        it('saves a recognised binary attachment byte for byte, with its kind\'s extension, never typed as the HTTP Type', async () => {
            const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xE2, 0xE3]);
            ui.downloadMessageContent({
                id: 'msg-3', content: '[Binary payload: 10 bytes]', bytes, binary: true,
                msgProperties: { 'HTTP Type': 'image/png' }
            });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));

            expect(picker.names).toEqual(['solace-message-msg-3.png']);
            expect(picker.blobs[0].type).toBe('application/octet-stream');
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(bytes));
        });

        it('saves a binary attachment no signature names as .bin', async () => {
            ui.downloadMessageContent({
                id: 'msg-4', content: '[Binary payload: 1 byte]', bytes: new Uint8Array([0x00]), binary: true,
                msgProperties: {}
            });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));
            expect(picker.names).toEqual(['solace-message-msg-4.bin']);
        });

        it('saves a map or stream as its wire bytes, not the YAML shown, as .bin', async () => {
            const wire = new Uint8Array([0x2B, 0x10, 0x00, 0xFF]);
            ui.downloadMessageContent({
                id: 'msg-6', content: 'a: 1', bytes: wire, binary: false,
                sdt: { type: 'map', entries: [['a', { type: 'integer', value: 1 }]] },
                msgProperties: { 'HTTP Type': 'application/json' }
            });
            await vi.waitFor(() => expect(picker.blobs).toHaveLength(1));

            expect(picker.names).toEqual(['solace-message-msg-6.bin']);
            expect(await blobBytes(picker.blobs[0])).toEqual(Array.from(wire));
        });

        it('shows an error toast naming the file and the cause when the save fails', async () => {
            picker.restore();
            picker = stubSavePicker({ writeError: new Error('disk full') });
            const toasts = freshToasts();

            ui.downloadMessageContent({ id: 'msg-7', content: 'x', msgProperties: {} });

            await vi.waitFor(() => expect(toasts.querySelector('.toast--error')).not.toBeNull());
            expect(toasts.querySelector('.toast--error')!.textContent).toBe('Could not save solace-message-msg-7.txt: disk full');
            expect(errorCalls.length).toBeGreaterThan(0);
        });

        it('shows no toast when the user cancels the save dialog', async () => {
            picker.restore();
            picker = stubSavePicker({ cancel: true });
            const toasts = freshToasts();

            ui.downloadMessageContent({ id: 'msg-8', content: 'x', msgProperties: {} });
            await vi.waitFor(() => expect(picker.names).toEqual(['solace-message-msg-8.txt']));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(toasts.children).toHaveLength(0);
            expect(picker.blobs).toEqual([]);
        });
    });

    describe('getFullMessageJson()', () => {
        it('returns null for null message', () => {
            expect(ui.getFullMessageJson(null)).toBeNull();
        });

        it('builds full message JSON with properties', () => {
            const msg = {
                id: 'msg-1',
                type: 'Text',
                content: 'payload',
                msgProperties: { key: 'val' },
                appProperties: { app: 'prop' }
            };
            const result = ui.getFullMessageJson(msg);
            expect(result.messageProperties.messageType).toBe('Text');
            expect(result.applicationProperties).toEqual({ app: 'prop' });
            expect(result.payload).toBe('payload');
            expect(result).not.toHaveProperty('payloadEncoding');
            expect(result.messageProperties.destination.name).toBe('Unknown');
        });

        it('carries a binary payload as base64, flagged with payloadEncoding', () => {
            const msg = {
                id: 'msg-1', type: 'Binary', content: '[Binary payload: 4 bytes]',
                bytes: new Uint8Array([0x89, 0x50, 0x4E, 0x47]), binary: true,
                msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => null }
            };
            const result = ui.getFullMessageJson(msg);
            expect([result.payload, result.payloadEncoding]).toEqual(['iVBORw==', 'base64']);
            expect(result).not.toHaveProperty('payloadDecoded');
        });

        it('carries a map as its wire bytes in base64, with its decoded fields beside them', () => {
            const wire = new Uint8Array([0x2B, 0x10, 0x00, 0xFF]);
            const msg = {
                id: 'msg-1', type: 'Map', content: 'a: 1', bytes: wire, binary: false,
                sdt: {
                    type: 'map',
                    entries: [
                        ['a', { type: 'integer', value: 1 }],
                        ['big', { type: 'integer', value: '9223372036854775807' }],
                        ['raw', { type: 'bytes', value: new Uint8Array([1, 2, 3]) }],
                        ['list', { type: 'stream', items: [{ type: 'float', value: NaN }, { type: 'destination', kind: 'topic', name: 'a/b' }] }],
                    ],
                },
                msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => null }
            };
            const result = ui.getFullMessageJson(msg);

            expect([result.payload, result.payloadEncoding]).toEqual(['KxAA/w==', 'base64']);
            expect(result.payloadDecoded).toEqual({
                a: 1, big: '9223372036854775807', raw: { base64: 'AQID' }, list: ['NaN', { topic: 'a/b' }],
            });
        });

        it('carries a stream the same way', () => {
            const msg = {
                id: 'msg-1', type: 'Stream', content: '- x', bytes: new Uint8Array([0x2C]), binary: false,
                sdt: { type: 'stream', items: [{ type: 'string', value: 'x' }] },
                msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => null }
            };
            const result = ui.getFullMessageJson(msg);
            expect([result.payload, result.payloadEncoding, result.payloadDecoded]).toEqual(['LA==', 'base64', ['x']]);
        });

        it('extracts destination from _originalMsg with Topic type', () => {
            const solace = (window as any).solace;
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'my-topic',
                        getType: () => solace.DestinationType.TOPIC
                    })
                }
            };
            const result = ui.getFullMessageJson(msg);
            expect(result.messageProperties.destination.name).toBe('my-topic');
            expect(result.messageProperties.destination.type).toBe('Topic');
        });

        it('extracts destination with Queue type', () => {
            const solace = (window as any).solace;
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'my-queue',
                        getType: () => solace.DestinationType.QUEUE
                    })
                }
            };
            const result = ui.getFullMessageJson(msg);
            expect(result.messageProperties.destination.type).toBe('Queue');
        });

        it('uses toString for unknown destination type', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'dest',
                        getType: () => 99
                    })
                }
            };
            const result = ui.getFullMessageJson(msg);
            expect(result.messageProperties.destination.type).toBe('99');
        });

        it('handles null destination from _originalMsg', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => null }
            };
            const result = ui.getFullMessageJson(msg);
            expect(result.messageProperties.destination.name).toBe('Unknown');
        });

        it('handles getDestination throwing error', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => { throw new Error('fail'); } }
            };
            const result = ui.getFullMessageJson(msg);
            expect(result.messageProperties.destination.name).toBe('Unknown');
            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    describe('downloadMessageFull()', () => {
        it('returns early for null message', () => {
            ui.downloadMessageFull(null);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        });
    });

    describe('selectMessage()', () => {
        it('highlights row and populates detail panel', () => {
            const solace = (window as any).solace;
            const msg = {
                id: 'msg-1', type: 'Text', content: 'Hello',
                msgProperties: { key: 'val' }, appProperties: { app: 'prop' },
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'my-dest', getType: () => solace.DestinationType.TOPIC }),
                    getReplicationGroupMessageId: () => ({ toString: () => 'rmid-123' }),
                    dump: () => 'raw dump text'
                }
            };
            state.displayedMessages = [msg];
            state.allMessages = [msg];
            ui.renderList();

            ui.selectMessage('msg-1');

            expect(els.detailId.textContent).toBe('msg-1');
            expect(els.detailDest.textContent).toBe('my-dest');
            expect(els.detailTypeBadge.textContent).toBe('Text');
            expect(els.detailTypeBadge.classList.contains('hidden')).toBe(false);
            expect(els.detailDestBadge.textContent).toBe('Topic');
            expect(els.detailReplMsgId.textContent).toBe('rmid-123');
            expect(els.detailContent.textContent).toBe('Hello');
            expect(els.btnShowRaw.disabled).toBe(false);
            expect(els.btnCopyContent.disabled).toBe(false);
            expect(state.selectedMessage).toBe(msg);
        });

        it('highlights correct row and deselects others', () => {
            const msg1 = { id: '1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => ({ getName: () => 'd', getType: () => 0 }), getReplicationGroupMessageId: () => null, dump: () => '' } };
            const msg2 = { id: '2', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: { getDestination: () => ({ getName: () => 'd', getType: () => 0 }), getReplicationGroupMessageId: () => null, dump: () => '' } };
            state.displayedMessages = [msg1, msg2];
            state.allMessages = [msg1, msg2];
            ui.renderList();

            ui.selectMessage('1');
            ui.selectMessage('2');

            const rows = els.msgList.querySelectorAll('tr');
            expect(rows[0].classList.contains('selected')).toBe(false);
            expect(rows[1].classList.contains('selected')).toBe(true);
        });

        it('handles Queue destination type', () => {
            const solace = (window as any).solace;
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'q', getType: () => solace.DestinationType.QUEUE }),
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailDestBadge.textContent).toBe('Queue');
        });

        it('handles null destination from _originalMsg', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => null,
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailDest.textContent).toBe('N/A');
            expect(els.detailDestBadge.textContent).toBe('Unknown');
        });

        it('handles _originalMsg without getReplicationGroupMessageId', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
                    dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailReplMsgId.textContent).toBe('N/A');
        });

        it('handles getReplicationGroupMessageId returning null', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
                    getReplicationGroupMessageId: () => null,
                    dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailReplMsgId.textContent).toBe('N/A');
        });

        it('handles getReplicationGroupMessageId throwing error', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
                    getReplicationGroupMessageId: () => { throw new Error('fail'); },
                    dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailReplMsgId.textContent).toBe('N/A');
        });

        it('enables copy dest button and wires onclick', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'dest', getType: () => 0 }),
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');

            expect(els.btnCopyDest.disabled).toBe(false);
            els.btnCopyDest.click();
            expect(ctx.copyToClipboard).toHaveBeenCalledTimes(1);
            expect(ctx.copyToClipboard).toHaveBeenCalledWith('dest', els.btnCopyDest);
        });

        it('enables copy repl-msg-id button and wires onclick', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'dest', getType: () => 0 }),
                    getReplicationGroupMessageId: () => ({ toString: () => 'rmid' }),
                    dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');

            expect(els.btnCopyReplMsgId.disabled).toBe(false);
            els.btnCopyReplMsgId.click();
            expect(ctx.copyToClipboard).toHaveBeenCalledTimes(1);
            expect(ctx.copyToClipboard).toHaveBeenCalledWith('rmid', els.btnCopyReplMsgId);
        });

        it('does nothing if message not found', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');

            ui.selectMessage('nonexistent');
            expect(els.detailId.textContent).toBe('msg-1');
            expect(state.selectedMessage).toBe(msg);
        });

        it('wires showRaw button onclick', () => {
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
                    getReplicationGroupMessageId: () => null,
                    dump: () => 'raw text'
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');

            els.btnShowRaw.click();
            expect(els.rawContentText.textContent).toBe('raw text');
            expect(els.modalRaw.open).toBe(true);
        });
    });

    describe('binary payload tools', () => {
        const originalMsg = {
            getDestination: () => ({ getName: () => 'd', getType: () => 0 }),
            getReplicationGroupMessageId: () => null,
            dump: () => '',
        };
        const u32be = (n: number): number[] => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];

        /** A PNG's signature and IHDR chunk header declaring `w` x `h`, then a few bytes of data. */
        const png = (w: number, h: number): Uint8Array => Uint8Array.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...u32be(13), 0x49, 0x48, 0x44, 0x52, ...u32be(w), ...u32be(h), 8, 6, 0, 0, 0,
        ]);
        const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

        const textMsg = (id: string) => ({ id, type: 'Text', content: 'hello', binary: false, msgProperties: {}, appProperties: {}, _originalMsg: originalMsg });
        const binaryMsg = (id: string, bytes: Uint8Array) => ({
            id, type: 'Binary', content: `[Binary payload: ${bytes.length} bytes]`, bytes, binary: true,
            msgProperties: {}, appProperties: {}, _originalMsg: originalMsg,
        });
        const show = (...msgs: any[]) => {
            state.displayedMessages = msgs;
            state.allMessages = msgs;
            ui.renderList();
        };
        const isHidden = (el: Element) => el.classList.contains('hidden');
        const useUrl = (url: string) => (URL.createObjectURL as any).mockReturnValue(url);

        it('shows no Show content button or note for a text message, and revokes nothing', () => {
            show(textMsg('t1'), textMsg('t2'));
            ui.selectMessage('t1');
            ui.selectMessage('t2');

            for (const el of [els.btnShowContent, els.detailBinaryNote, els.detailPreview]) expect(isHidden(el)).toBe(true);
            expect(isHidden(els.detailContent)).toBe(false);
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        });

        it('offers an image Show content in the Content Preview header, and decodes nothing until it is clicked', () => {
            show(binaryMsg('b1', png(640, 480)));
            ui.selectMessage('b1');

            expect(els.btnShowContent.closest('.detail-header-row')).not.toBeNull();
            expect(isHidden(els.btnShowContent)).toBe(false);
            expect(els.btnShowContent.textContent).toBe('Show content');
            expect(isHidden(els.detailContent)).toBe(false);
            expect(isHidden(els.detailPreview)).toBe(true);
            expect(els.detailPreview.hasAttribute('src')).toBe(false);
            expect(isHidden(els.detailBinaryNote)).toBe(true);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        });

        it('offers no Show content for a binary payload that is not one of the four image kinds', () => {
            show(binaryMsg('pdf', ascii('%PDF-1.7')), binaryMsg('raw', Uint8Array.from([1, 2, 3, 4])));
            for (const id of ['pdf', 'raw']) {
                ui.selectMessage(id);
                expect(isHidden(els.btnShowContent)).toBe(true);
                expect(isHidden(els.detailBinaryNote)).toBe(true);
            }
        });

        it('swaps the Content Preview box for the image on Show content: an object URL of the image type', async () => {
            useUrl('blob:preview-1');
            const bytes = png(640, 480);
            show(binaryMsg('b1', bytes));
            ui.selectMessage('b1');

            els.btnShowContent.click();

            const blob = (URL.createObjectURL as any).mock.calls[0][0] as Blob;
            expect(blob.type).toBe('image/png');
            expect(await blobBytes(blob)).toEqual(Array.from(bytes));
            expect(els.detailPreview.getAttribute('src')).toBe('blob:preview-1');
            expect(isHidden(els.detailPreview)).toBe(false);
            expect(isHidden(els.detailContent)).toBe(true);
            expect(els.btnShowContent.textContent).toBe('Hide content');
        });

        it('puts the box back on Hide content and revokes the URL, and a second Show content makes a fresh one', () => {
            useUrl('blob:preview-1');
            show(binaryMsg('b1', png(640, 480)));
            ui.selectMessage('b1');
            els.btnShowContent.click();

            els.btnShowContent.click();
            expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
            expect(isHidden(els.detailPreview)).toBe(true);
            expect(els.detailPreview.hasAttribute('src')).toBe(false);
            expect(isHidden(els.detailContent)).toBe(false);
            expect(els.detailContent.textContent).toBe('[Binary payload: 29 bytes]');
            expect(els.btnShowContent.textContent).toBe('Show content');

            useUrl('blob:preview-2');
            els.btnShowContent.click();
            expect(els.detailPreview.getAttribute('src')).toBe('blob:preview-2');
            expect(isHidden(els.detailContent)).toBe(true);
            expect(els.btnShowContent.textContent).toBe('Hide content');
        });

        it('offers no Show content, and says why, when the image header gives no size', () => {
            show(binaryMsg('b1', Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3])));
            ui.selectMessage('b1');

            expect(isHidden(els.btnShowContent)).toBe(true);
            expect(els.detailBinaryNote.textContent).toBe('Not shown: the image\'s header does not say how large it is.');
            expect(isHidden(els.detailBinaryNote)).toBe(false);
        });

        it('offers no Show content above 40 megapixels, naming the declared size and the limit, and offers it at exactly 40', () => {
            show(binaryMsg('big', png(8001, 5000)), binaryMsg('edge', png(8000, 5000)));
            ui.selectMessage('big');

            expect(isHidden(els.btnShowContent)).toBe(true);
            expect(els.detailBinaryNote.textContent)
                .toBe('Not shown: the image\'s header says it is 8001 x 5000 pixels, more than the 40-megapixel limit.');

            ui.selectMessage('edge');
            expect(isHidden(els.btnShowContent)).toBe(false);
            expect(isHidden(els.detailBinaryNote)).toBe(true);
            expect(els.detailBinaryNote.textContent).toBe('');
        });

        it('puts the box back, drops Show content and says so when the browser cannot decode the image', () => {
            useUrl('blob:preview-1');
            show(binaryMsg('b1', png(10, 10)));
            ui.selectMessage('b1');
            els.btnShowContent.click();

            els.detailPreview.dispatchEvent(new Event('error'));

            expect(isHidden(els.detailPreview)).toBe(true);
            expect(isHidden(els.detailContent)).toBe(false);
            expect(isHidden(els.btnShowContent)).toBe(true);
            expect(els.detailBinaryNote.textContent).toBe('The image could not be decoded.');
            expect(isHidden(els.detailBinaryNote)).toBe(false);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
        });

        it('a late error event from an image the pane has moved on from changes nothing', () => {
            useUrl('blob:preview-1');
            show(binaryMsg('b1', png(10, 10)), binaryMsg('b2', png(20, 20)));
            ui.selectMessage('b1');
            els.btnShowContent.click();
            ui.selectMessage('b2');

            els.detailPreview.dispatchEvent(new Event('error'));

            expect(isHidden(els.detailBinaryNote)).toBe(true);
            expect(isHidden(els.btnShowContent)).toBe(false);
            expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        });

        it('revokes a shown image\'s URL and puts the box back when the details are cleared', () => {
            useUrl('blob:preview-1');
            show(binaryMsg('b1', png(640, 480)));
            ui.selectMessage('b1');
            els.btnShowContent.click();

            ui.clearDetails();

            expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
            for (const el of [els.btnShowContent, els.detailBinaryNote, els.detailPreview]) expect(isHidden(el)).toBe(true);
            expect(isHidden(els.detailContent)).toBe(false);
            expect(els.detailPreview.hasAttribute('src')).toBe(false);

            ui.clearDetails();
            expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        });

        it('starts the next message clean: the box back, Show content again, and its own bytes', async () => {
            useUrl('blob:preview-1');
            const second = png(32, 16);
            show(binaryMsg('b1', png(640, 480)), textMsg('t1'), binaryMsg('b2', second));
            ui.selectMessage('b1');
            els.btnShowContent.click();

            ui.selectMessage('t1');
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
            expect(isHidden(els.detailContent)).toBe(false);
            expect(els.detailContent.textContent).toBe('hello');
            expect(isHidden(els.btnShowContent)).toBe(true);

            ui.selectMessage('b2');
            expect(els.btnShowContent.textContent).toBe('Show content');
            els.btnShowContent.click();
            const blob = (URL.createObjectURL as any).mock.calls[1][0] as Blob;
            expect(await blobBytes(blob)).toEqual(Array.from(second));
        });
    });

    describe('showRawContent()', () => {
        it('shows raw dump from _originalMsg', () => {
            const msg = { _originalMsg: { dump: () => 'dump output' } };
            ui.showRawContent(msg);
            expect(els.rawContentText.textContent).toBe('dump output');
            expect(els.modalRaw.open).toBe(true);
        });

        it('close button hides modal', () => {
            ui.showRawContent({ _originalMsg: { dump: () => 'dump' } });
            els.btnRawClose.click();
            expect(els.modalRaw.open).toBe(false);
        });

    });

    describe('clearDetails()', () => {
        it('clears all detail fields and disables buttons', () => {
            els.detailId.textContent = 'msg-1';
            els.detailDest.textContent = 'dest';
            els.detailContent.textContent = 'content';
            els.btnShowRaw.disabled = false;
            els.btnCopyContent.disabled = false;
            els.btnCopyDest.disabled = false;
            els.btnCopyReplMsgId.disabled = false;
            els.detailTypeBadge.classList.remove('hidden');
            els.detailDestBadge.classList.remove('hidden');

            ui.clearDetails();

            expect(els.detailId.textContent).toBe('');
            expect(els.detailDest.textContent).toBe('');
            expect(els.detailContent.textContent).toBe('');
            expect(els.btnShowRaw.disabled).toBe(true);
            expect(els.btnCopyContent.disabled).toBe(true);
            expect(els.btnCopyDest.disabled).toBe(true);
            expect(els.btnCopyReplMsgId.disabled).toBe(true);
            expect(els.detailTypeBadge.classList.contains('hidden')).toBe(true);
            expect(els.detailDestBadge.classList.contains('hidden')).toBe(true);
        });

        it('removes selected class from rows', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const row = els.msgList.querySelector('tr');
            row.classList.add('selected');

            ui.clearDetails();
            expect(row.classList.contains('selected')).toBe(false);
        });

        it('clears replMsgId, propContainer, appPropertiesContainer', () => {
            els.detailReplMsgId.textContent = 'some-id';
            els.propContainer.innerHTML = '<span>tag</span>';
            els.appPropertiesContainer.innerHTML = '<span>header</span>';

            ui.clearDetails();

            expect(els.detailReplMsgId.textContent).toBe('');
            expect(els.propContainer.innerHTML).toBe('');
            expect(els.appPropertiesContainer.innerHTML).toBe('');
        });
    });

    describe('createTag()', () => {
        it('creates a tag element with key=value', () => {
            const container = document.createElement('div');
            ui.createTag(container, 'myKey', 'myVal');
            const tag = container.querySelector('.header-tag');
            expect(tag).toBeTruthy();
            expect(tag!.textContent).toBe('myKey = myVal');
        });

        it('truncates long values with ellipsis', () => {
            const container = document.createElement('div');
            const longVal = 'A'.repeat(30);
            ui.createTag(container, 'key', longVal);
            const tag = container.querySelector('.header-tag');
            expect(tag!.textContent).toContain('...');
        });

        it('expands/collapses on click for long values', () => {
            const container = document.createElement('div');
            const longVal = 'A'.repeat(30);
            ui.createTag(container, 'key', longVal);
            const tag = container.querySelector('.header-tag') as HTMLElement;

            // Initially truncated
            expect(tag.textContent).toContain('...');

            // Click to expand
            tag.click();
            expect(tag.textContent).not.toContain('...');
            expect(tag.textContent).toContain(longVal);

            // Click to collapse
            tag.click();
            expect(tag.textContent).toContain('...');
        });

        it('sets title for long values', () => {
            const container = document.createElement('div');
            ui.createTag(container, 'key', 'A'.repeat(30));
            const tag = container.querySelector('.header-tag') as HTMLElement;
            expect(tag.title).toBe('Click to expand/collapse');
        });

        it('does not set title for short values', () => {
            const container = document.createElement('div');
            ui.createTag(container, 'key', 'short');
            const tag = container.querySelector('.header-tag') as HTMLElement;
            expect(tag.title).toBe('');
        });

        it('renders boolean true as a bare label (no "= value")', () => {
            const container = document.createElement('div');
            ui.createTag(container, 'DeliverToOne', true);
            const tag = container.querySelector('.header-tag') as HTMLElement;
            expect(tag.textContent).toBe('DeliverToOne');
            expect(tag.title).toBe('');
            // Bare-label tags have no expand/collapse handler.
            expect(tag.onclick).toBeNull();
        });
    });

    describe('renderTags()', () => {
        it('renders tags for properties', () => {
            const container = document.createElement('div');
            ui.renderTags(container, { key1: 'val1', key2: 'val2' });
            const tags = container.querySelectorAll('.header-tag');
            expect(tags.length).toBe(2);
        });

        it('shows "None" for empty properties', () => {
            const container = document.createElement('div');
            ui.renderTags(container, {});
            expect(container.textContent).toContain('None');
        });

        it('shows "None" for null properties', () => {
            const container = document.createElement('div');
            ui.renderTags(container, null);
            expect(container.textContent).toContain('None');
        });

        it('skips null/undefined/empty values', () => {
            const container = document.createElement('div');
            ui.renderTags(container, { a: 'val', b: null, c: undefined, d: '' });
            const tags = container.querySelectorAll('.header-tag');
            expect(tags.length).toBe(1);
        });

        it('clears previous content', () => {
            const container = document.createElement('div');
            container.innerHTML = '<span>old</span>';
            ui.renderTags(container, { key: 'val' });
            expect(container.innerHTML).not.toContain('old');
        });

        it('renders scalar and boolean-true properties side by side', () => {
            const container = document.createElement('div');
            ui.renderTags(container, { Priority: 5, DeliverToOne: true });
            const tags = Array.from(container.querySelectorAll('.header-tag')).map(t => t.textContent);
            expect(tags).toEqual(['Priority = 5', 'DeliverToOne']);
        });
    });

    describe('addPropertyFilterRow()', () => {
        it('adds a property filter row to container', () => {
            ui.addPropertyFilterRow('myKey', 'myVal');
            const rows = els.filterPropsRows.querySelectorAll('.property-filter-row');
            expect(rows.length).toBe(1);
            expect((rows[0].querySelector('.prop-key') as HTMLInputElement).value).toBe('myKey');
            expect((rows[0].querySelector('.prop-value') as HTMLInputElement).value).toBe('myVal');
        });

        it('adds row with default empty values', () => {
            ui.addPropertyFilterRow();
            const rows = els.filterPropsRows.querySelectorAll('.property-filter-row');
            expect(rows.length).toBe(1);
            expect((rows[0].querySelector('.prop-key') as HTMLInputElement).value).toBe('');
        });

        it('remove button removes the row', () => {
            ui.addPropertyFilterRow('k', 'v');
            const removeBtn = els.filterPropsRows.querySelector('.btn-remove-prop') as HTMLElement;
            removeBtn.click();
            expect(els.filterPropsRows.querySelectorAll('.property-filter-row').length).toBe(0);
        });

        it('Enter key on prop-key triggers filter apply', () => {
            ui.addPropertyFilterRow('k', 'v');
            const keyInput = els.filterPropsRows.querySelector('.prop-key') as HTMLInputElement;
            const applyBtn = els.btnFilterApply;
            const clickSpy = vi.spyOn(applyBtn, 'click');

            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            keyInput.dispatchEvent(event);

            expect(clickSpy).toHaveBeenCalled();
        });

        it('Enter key on prop-value triggers filter apply', () => {
            ui.addPropertyFilterRow('k', 'v');
            const valInput = els.filterPropsRows.querySelector('.prop-value') as HTMLInputElement;
            const applyBtn = els.btnFilterApply;
            const clickSpy = vi.spyOn(applyBtn, 'click');

            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            valInput.dispatchEvent(event);

            expect(clickSpy).toHaveBeenCalled();
        });

        it('non-Enter key does not trigger apply', () => {
            ui.addPropertyFilterRow('k', 'v');
            const keyInput = els.filterPropsRows.querySelector('.prop-key') as HTMLInputElement;
            const clickSpy = vi.spyOn(els.btnFilterApply, 'click');

            keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            expect(clickSpy).not.toHaveBeenCalled();
        });

    });

    describe('getPropertyFilters()', () => {
        it('returns filters from rows', () => {
            ui.addPropertyFilterRow('key1', 'val1');
            ui.addPropertyFilterRow('key2', 'val2');

            const filters = ui.getPropertyFilters();
            expect(filters).toEqual([
                { key: 'key1', value: 'val1' },
                { key: 'key2', value: 'val2' }
            ]);
        });

        it('skips rows with empty keys', () => {
            ui.addPropertyFilterRow('', 'val');
            ui.addPropertyFilterRow('key', 'val');

            const filters = ui.getPropertyFilters();
            expect(filters.length).toBe(1);
            expect(filters[0].key).toBe('key');
        });

        it('trims whitespace from key/value', () => {
            ui.addPropertyFilterRow('  key  ', '  val  ');
            const filters = ui.getPropertyFilters();
            expect(filters[0].key).toBe('key');
            expect(filters[0].value).toBe('val');
        });
    });

    describe('clearPropertyFilters()', () => {
        it('clears all filter rows', () => {
            ui.addPropertyFilterRow('k1', 'v1');
            ui.addPropertyFilterRow('k2', 'v2');

            ui.clearPropertyFilters();
            expect(els.filterPropsRows.innerHTML).toBe('');
        });

    });

    describe('selectMessage destination label', () => {
        it('falls back to raw enum string when destType is neither TOPIC nor QUEUE', () => {
            // Covers the falsy branch of `else if (destType === QUEUE)` in the
            // details pane's destination badge -- when a future Solace SDK introduces a new
            // DestinationType (e.g. shared subscriptions), the badge keeps its
            // `destType.toString()` initial value rather than
            // crashing or guessing. A regression that added an `else throw` would
            // break installs on newer SDKs; this test surfaces the throw before
            // reaching the assertion.
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'unknown-dest', getType: () => 99 }),
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailDestBadge.textContent).toBe('99');
        });
    });
});
