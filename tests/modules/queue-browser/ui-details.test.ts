import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui, els } from '../../../src/modules/queue-browser/ui-core.js';
import { initDetails } from '../../../src/modules/queue-browser/ui-details';
import { BLOB_URL_REVOKE_DELAY_MS } from '../../../src/modules/queue-browser/constants.js';
import { state } from '../../../src/modules/queue-browser/state.js';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import type { AppContext } from '../../../src/core/types';

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
        ctx = {
            container,
            appState: { activeModuleId: null, isConnected: false, selectedVpn: null, solaceConnection: null, sempCredentials: null, isSempConnected: false },
            eventBus,
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
            config: {}
        };

        initDetails(ctx);
        initTable(eventBus);

        resetQueueBrowserState();
    });

    describe('triggerDownload()', () => {
        it('creates blob and defers URL revocation', () => {
            vi.useFakeTimers();
            ui.triggerDownload('test.txt', 'hello', 'text/plain');
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
            vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS);
            expect(URL.revokeObjectURL).toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    describe('triggerDownloadBlob()', () => {
        it('creates download link from blob and defers URL revocation', () => {
            vi.useFakeTimers();
            const blob = new Blob(['data']);
            ui.triggerDownloadBlob(blob, 'file.bin');
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
            vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS);
            expect(URL.revokeObjectURL).toHaveBeenCalled();
            vi.useRealTimers();
        });

        it('aborts when createObjectURL returns null — no anchor appended, no revoke scheduled', () => {
            vi.useFakeTimers();
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            (URL.createObjectURL as any).mockReturnValueOnce(null);
            const bodyChildrenBefore = document.body.children.length;

            const blob = new Blob(['data']);
            ui.triggerDownloadBlob(blob, 'file.bin');

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('createObjectURL returned null'));
            expect(document.body.children.length).toBe(bodyChildrenBefore);
            vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS);
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    describe('downloadMessageContent()', () => {
        it('downloads message content', () => {
            const msg = { id: 'msg-1', content: 'payload data' };
            ui.downloadMessageContent(msg);
            expect(URL.createObjectURL).toHaveBeenCalled();
        });

        it('returns early for null message', () => {
            ui.downloadMessageContent(null);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        });

        it('handles empty content', () => {
            const msg = { id: 'msg-2', content: '' };
            ui.downloadMessageContent(msg);
            expect(URL.createObjectURL).toHaveBeenCalled();
        });

        it('sanitizes filename from message id', () => {
            const triggerSpy = vi.spyOn(ui, 'triggerDownload');
            const msg = { id: 'msg/special:chars!', content: 'test' };
            ui.downloadMessageContent(msg);

            // `/`, `:`, `!` are stripped by /[^a-zA-Z0-9-_]/g sanitizer in ui-details.ts.
            expect(triggerSpy).toHaveBeenCalledTimes(1);
            expect(triggerSpy.mock.calls[0][0]).toBe('solace-message-msgspecialchars');
            expect(triggerSpy.mock.calls[0][1]).toBe('test');
            triggerSpy.mockRestore();
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
            expect(result.messageProperties.destination.name).toBe('Unknown');
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
        it('downloads full message as JSON', () => {
            const msg = { id: 'msg-1', type: 'Text', content: 'test', msgProperties: {}, appProperties: {} };
            ui.downloadMessageFull(msg);
            expect(URL.createObjectURL).toHaveBeenCalled();
        });

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
            expect(ctx.copyToClipboard).toHaveBeenCalled();
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
            expect(ctx.copyToClipboard).toHaveBeenCalled();
        });

        it('does nothing if message not found', () => {
            state.displayedMessages = [];
            ui.selectMessage('nonexistent');
            expect(els.detailId.textContent).toBe('');
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

    describe('addPropertyFilterRow edge cases', () => {
        it('non-Enter key on filter row does not trigger apply', () => {
            ui.addPropertyFilterRow('key', 'val');
            const keyInput = els.filterPropsRows.querySelector('.prop-key') as HTMLElement;
            const applyClickSpy = vi.spyOn(els.btnFilterApply, 'click');
            keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            expect(applyClickSpy).not.toHaveBeenCalled();
        });
    });

    describe('selectMessage destination label', () => {
        it('shows TOPIC label when destType matches solace.DestinationType.TOPIC', () => {
            const solace = (window as any).solace;
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'my/topic', getType: () => solace.DestinationType.TOPIC }),
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailDestBadge.textContent).toBe('Topic');
        });

        it('shows Queue label when destType matches solace.DestinationType.QUEUE', () => {
            const solace = (window as any).solace;
            const msg = {
                id: 'msg-1', type: 'Text', content: '', msgProperties: {}, appProperties: {},
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'my-queue', getType: () => solace.DestinationType.QUEUE }),
                    getReplicationGroupMessageId: () => null, dump: () => ''
                }
            };
            state.displayedMessages = [msg];
            ui.selectMessage('msg-1');
            expect(els.detailDestBadge.textContent).toBe('Queue');
        });

        it('falls back to raw enum string when destType is neither TOPIC nor QUEUE', () => {
            // Covers the falsy branch of `else if (destType === QUEUE)` at
            // ui-details.ts:102 — when a future Solace SDK introduces a new
            // DestinationType (e.g. shared subscriptions), the badge keeps its
            // `destType.toString()` initial value from line 100 rather than
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
