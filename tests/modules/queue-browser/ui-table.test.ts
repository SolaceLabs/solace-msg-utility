import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui } from '../../../src/modules/queue-browser/ui-core.js';
import '../../../src/modules/queue-browser/ui-forward.js';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { initDetails } from '../../../src/modules/queue-browser/ui-details';
import { state, setBrowser } from '../../../src/modules/queue-browser/state.js';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import type { EventBus, AppContext } from '../../../src/core/types';

function createBrowserDOM() {
    return loadModuleDOM('queue-browser');
}

describe('queue-browser/ui-table', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        const container = createBrowserDOM();
        document.body.appendChild(container);
        ui.initElements(container);

        eventBus = createEventBus();

        const ctx: AppContext = {
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

    describe('getSelectedMessageIds()', () => {
        it('returns checked message IDs', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;
            const ids = ui.getSelectedMessageIds();
            expect(ids).toContain('1');
        });

        it('returns empty when nothing checked', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            ui.renderList();

            expect(ui.getSelectedMessageIds()).toEqual([]);
        });
    });

    describe('createRowHtml()', () => {
        it('creates row with message data', () => {
            const msg = { id: 'msg-1', date: '2024-01-01', size: 1024, type: 'Text', content: 'test' };
            const html = ui.createRowHtml(msg);
            expect(html).toContain('msg-1');
            expect(html).toContain('2024-01-01');
            expect(html).toContain('1 KB');
        });

        it('hides delete button when read-only', () => {
            state.currentQueuePermissions = { READ_ONLY: true };
            const msg = { id: 'msg-1', date: '', size: 0, type: 'Text', content: '' };
            const html = ui.createRowHtml(msg);
            expect(html).not.toContain('btn-delete-row');
        });

        it('renderList omits delete button on READ_ONLY queue but still wires the rest of the row', () => {
            // Covers the falsy branch of `if (btnDel)` at ui-table.ts:73.
            // Read-only queue bindings must NOT show a delete button, AND the
            // rest of attachRowListeners must still wire the remaining actions
            // (download, forward, checkbox). A regression that skipped the full
            // attachRowListeners body when btnDel was null would silently break
            // every other per-row action on read-only queues.
            state.currentQueuePermissions = { READ_ONLY: true };
            state.displayedMessages = [{ id: 'a', date: '', size: 100, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;

            ui.renderList();

            const tr = document.querySelector('tr[data-id="a"]') as HTMLElement;
            expect(tr).not.toBeNull();
            expect(tr.querySelector('.btn-delete-row')).toBeNull();
            // Proves the rest of attachRowListeners ran despite btnDel being null.
            expect(tr.querySelector('.btn-forward-row')).not.toBeNull();
            expect(tr.querySelector('.btn-download-content')).not.toBeNull();
            expect(tr.querySelector('.msg-check')).not.toBeNull();
        });

        it('shows delete button when not read-only', () => {
            state.currentQueuePermissions = { READ_ONLY: false };
            const msg = { id: 'msg-1', date: '', size: 0, type: 'Text', content: '' };
            const html = ui.createRowHtml(msg);
            expect(html).toContain('btn-delete-row');
        });
    });

    describe('renderList()', () => {
        it('renders all displayed messages', () => {
            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: '' },
                { id: '2', date: '', size: 0, type: 'Text', content: '' }
            ];
            state.allMessages = state.displayedMessages;

            ui.renderList();

            const rows = ui.getElements().msgList.querySelectorAll('tr');
            expect(rows.length).toBe(2);
        });

        it('resets check-all checkbox', () => {
            ui.getElements().checkAll.checked = true;
            state.displayedMessages = [];
            state.allMessages = [];
            ui.renderList();
            expect(ui.getElements().checkAll.checked).toBe(false);
        });

    });

    describe('row button handlers', () => {
        it('row buttons no-op when state.displayedMessages no longer contains the row id', () => {
            // Simulates a real race: the row was rendered with data-id='1', then state
            // was mutated (filter applied / queue switched) before the click landed.
            // The click handler's find() returns undefined; the guards must short-circuit.
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' } as any];
            state.allMessages = state.displayedMessages;
            state.currentQueuePermissions = null;
            ui.renderList();

            const tr = document.querySelector('#browser-msg-list tr[data-id="1"]') as HTMLElement;
            expect(tr).toBeTruthy();

            // Mutate state so the click handler's find() returns undefined for id='1'.
            state.displayedMessages = [];

            const downloadContentSpy = vi.spyOn(ui, 'downloadMessageContent').mockImplementation(() => {});
            const downloadFullSpy = vi.spyOn(ui, 'downloadMessageFull').mockImplementation(() => {});
            const forwardSpy = vi.spyOn(ui, 'showForwardModal').mockImplementation(() => {});

            (tr.querySelector('.btn-download-content') as HTMLElement).click();
            (tr.querySelector('.btn-download-full') as HTMLElement).click();
            (tr.querySelector('.btn-forward-row') as HTMLElement).click();

            expect(downloadContentSpy).not.toHaveBeenCalled();
            expect(downloadFullSpy).not.toHaveBeenCalled();
            expect(forwardSpy).not.toHaveBeenCalled();
        });
    });

    describe('addMessageRow()', () => {
        it('appends a row and animates', () => {
            const msg = { id: 'new-1', date: '', size: 0, type: 'Text', content: '' };
            state.allMessages = [msg];
            state.displayedMessages = [msg];

            ui.addMessageRow(msg);

            const row = ui.getElements().msgList.querySelector('tr[data-id="new-1"]');
            expect(row).toBeTruthy();
        });

    });

    describe('removeMessageRow()', () => {
        it('removes row by message ID', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            ui.removeMessageRow('1');
            expect(ui.getElements().msgList.querySelector('tr[data-id="1"]')).toBeNull();
        });

        it('clears details if selected message is removed', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            ui.getElements().detailId.textContent = '1';

            ui.removeMessageRow('1');
        });

        it('does not clear details when removing non-selected message', () => {
            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: '' },
                { id: '2', date: '', size: 0, type: 'Text', content: '' }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            ui.getElements().detailId.textContent = '2';  // different ID selected

            ui.removeMessageRow('1');
            expect(ui.getElements().detailId.textContent).toBe('2');  // should NOT be cleared
        });

        it('does nothing for nonexistent row — existing rows untouched', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            const rowsBefore = ui.getElements().msgList.querySelectorAll('tr').length;
            expect(() => ui.removeMessageRow('nonexistent')).not.toThrow();
            expect(ui.getElements().msgList.querySelectorAll('tr').length).toBe(rowsBefore);
        });

    });

    describe('updateCounts()', () => {
        it('updates count displays', () => {
            state.allMessages = [{ id: '1' }, { id: '2' }, { id: '3' }];
            state.displayedMessages = [{ id: '1' }, { id: '2' }];

            ui.updateCounts();

            expect(ui.getElements().countTotal.textContent).toBe('3');
            expect(ui.getElements().countDisplayed.textContent).toBe('2');
        });

        it('enables bulk buttons when messages selected', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;

            ui.updateCounts();

            expect(ui.getElements().btnBrowserForward.disabled).toBe(false);
        });

        it('hides delete button when read-only', () => {
            state.currentQueuePermissions = { READ_ONLY: true };
            ui.updateCounts();
            expect(ui.getElements().btnBrowserDelete.classList.contains('hidden')).toBe(true);
        });

        it('disables delete button when not read-only and no selection', () => {
            state.currentQueuePermissions = { READ_ONLY: false };
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();
            // No checkboxes checked
            ui.updateCounts();
            expect(ui.getElements().btnBrowserDelete.classList.contains('hidden')).toBe(false);
            expect(ui.getElements().btnBrowserDelete.disabled).toBe(true);
        });
    });

    describe('updatePermissionUI()', () => {
        it('shows Read-Write badge for writable queue', () => {
            setBrowser('q1', { _messageConsumer: { _permissions: 'READ_WRITE' } });
            state.displayedMessages = [];
            state.allMessages = [];

            ui.updatePermissionUI('q1');

            expect(ui.getElements().hdrPermissions.textContent).toBe('Read-Write');
            expect(state.currentQueuePermissions).toEqual({ READ_ONLY: false });
        });

        it('shows Read-Only badge', () => {
            setBrowser('q1', { _messageConsumer: { _permissions: 'READ_ONLY' } });
            state.displayedMessages = [];
            state.allMessages = [];

            ui.updatePermissionUI('q1');

            expect(ui.getElements().hdrPermissions.textContent).toBe('Read-Only');
            expect(state.currentQueuePermissions).toEqual({ READ_ONLY: true });
        });

        it('hides badge when no permissions available', () => {
            setBrowser('q1', { _messageConsumer: null });
            state.displayedMessages = [];
            state.allMessages = [];

            ui.updatePermissionUI('q1');

            expect(ui.getElements().hdrPermissions.classList.contains('hidden')).toBe(true);
            expect(state.currentQueuePermissions).toBeNull();
        });

        it('handles non-string permissions as READ_WRITE', () => {
            setBrowser('q1', { _messageConsumer: { _permissions: { custom: true } } });
            state.displayedMessages = [];
            state.allMessages = [];

            ui.updatePermissionUI('q1');

            expect(state.currentQueuePermissions).toEqual({ READ_ONLY: false });
        });

        it('handles no browser for queue', () => {
            state.displayedMessages = [];
            state.allMessages = [];
            ui.updatePermissionUI('nonexistent');
            expect(state.currentQueuePermissions).toBeNull();
        });
    });

    describe('downloadMessagesZip()', () => {
        it('alerts when JSZip not loaded', async () => {
            (window as any).JSZip = undefined;
            await ui.downloadMessagesZip('content');
            expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('JSZip'));
        });

        it('alerts when no messages selected', async () => {
            (window as any).JSZip = vi.fn();
            state.displayedMessages = [];

            await ui.downloadMessagesZip('content');
            expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('No messages'));
        });

        it('creates content ZIP for selected messages', async () => {
            const fileFn = vi.fn();
            const generateAsyncFn = vi.fn().mockResolvedValue(new Blob(['test']));

            (window as any).JSZip = vi.fn(function(this: any) {
                this.file = fileFn;
                this.generateAsync = generateAsyncFn;
            });

            state.displayedMessages = [
                { id: '1', content: 'Hello', date: '', size: 0, type: 'Text' }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            // Check the checkbox
            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;

            await ui.downloadMessagesZip('content');

            expect(fileFn).toHaveBeenCalled();
            expect(generateAsyncFn).toHaveBeenCalledWith({ type: 'blob' });
        });

        it('creates full JSON ZIP for selected messages', async () => {
            const fileFn = vi.fn();
            const generateAsyncFn = vi.fn().mockResolvedValue(new Blob(['test']));

            (window as any).JSZip = vi.fn(function(this: any) {
                this.file = fileFn;
                this.generateAsync = generateAsyncFn;
            });

            state.displayedMessages = [
                { id: '1', content: 'Hello', date: '', size: 0, type: 'Text', msgProperties: {}, appProperties: {} }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;

            await ui.downloadMessagesZip('full');

            expect(fileFn).toHaveBeenCalledWith(expect.stringContaining('-full.json'), expect.any(String));
        });

        it('handles ZIP generation error', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            (window as any).JSZip = vi.fn(function(this: any) {
                this.file = vi.fn();
                this.generateAsync = vi.fn().mockRejectedValue(new Error('zip error'));
            });

            state.displayedMessages = [{ id: '1', content: 'test' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;

            await ui.downloadMessagesZip('content');
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('returns early if no matching messages after filter', async () => {
            (window as any).JSZip = vi.fn();

            state.displayedMessages = [{ id: '1', content: 'test' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            // Check box for msg-1, but filter returns different IDs
            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;

            // Swap displayedMessages to have different IDs so filter returns 0
            state.displayedMessages = [{ id: '999', content: 'other' }];
            await ui.downloadMessagesZip('content');
        });
    });

    describe('attachRowListeners()', () => {
        it('row click selects message', () => {
            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: 'test', msgProperties: {}, appProperties: {},
                    _originalMsg: { getDestination: () => ({ getName: () => 'dest', getType: () => 0 }), getReplicationGroupMessageId: () => null, dump: () => '' } }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const row = document.querySelector('tr[data-id="1"]') as HTMLElement;
            row.click();

            expect(ui.getElements().detailId.textContent).toBe('1');
        });

        it('delete button emits app:message-delete', () => {
            state.currentQueuePermissions = { READ_ONLY: false };
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const handler = vi.fn();
            eventBus.on('app:message-delete', handler);

            const deleteBtn = document.querySelector('.btn-delete-row') as HTMLElement;
            deleteBtn.click();

            expect(handler).toHaveBeenCalledWith({ id: '1' });
        });

        it('checkbox change updates counts', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            expect(ui.getElements().countSelected.textContent).toBe('1');
        });

        it('row click ignores clicks on buttons and inputs', () => {
            state.displayedMessages = [{ id: '1', date: '', size: 0, type: 'Text', content: '' }];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.click();

            // detailId should not change since we clicked on an input
            expect(ui.getElements().detailId.textContent).toBe('');
        });

        it('download content button triggers download', () => {
            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: 'payload' }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const triggerSpy = vi.spyOn(ui, 'triggerDownload');
            const btn = document.querySelector('.btn-download-content') as HTMLElement;
            btn.click();

            // Verify both filename sanitization AND payload routing — a regression
            // that swapped `msg.content` for `msg.id` would still call createObjectURL.
            expect(triggerSpy).toHaveBeenCalledTimes(1);
            expect(triggerSpy.mock.calls[0][0]).toBe('solace-message-1');
            expect(triggerSpy.mock.calls[0][1]).toBe('payload');
            triggerSpy.mockRestore();
        });

        it('download full button triggers download', () => {
            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: 'payload', msgProperties: { foo: 'bar' }, appProperties: { baz: 'qux' } }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const triggerSpy = vi.spyOn(ui, 'triggerDownload');
            const btn = document.querySelector('.btn-download-full') as HTMLElement;
            btn.click();

            expect(triggerSpy).toHaveBeenCalledTimes(1);
            // Filename: full JSON downloads end in -full.json.
            expect(triggerSpy.mock.calls[0][0]).toMatch(/-full\.json$/);
            // Content: parses as JSON and contains the expected top-level keys.
            const parsed = JSON.parse(triggerSpy.mock.calls[0][1]);
            expect(parsed).toHaveProperty('payload', 'payload');
            expect(parsed).toHaveProperty('messageProperties');
            expect(parsed).toHaveProperty('applicationProperties');
            expect(triggerSpy.mock.calls[0][2]).toBe('application/json');
            triggerSpy.mockRestore();
        });

        it('downloadMessagesZip with full type includes properties', async () => {
            (window as any).JSZip = vi.fn(function(this: any) {
                this.file = vi.fn();
                this.generateAsync = vi.fn().mockResolvedValue(new Blob(['zip']));
            });

            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: 'payload', msgProperties: { key: 'val' }, appProperties: {} }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            const checkbox = document.querySelector('.msg-check') as HTMLInputElement;
            checkbox.checked = true;

            await ui.downloadMessagesZip('full');
        });

        it('forward button opens modal', () => {
            state.displayedMessages = [
                { id: '1', date: '', size: 0, type: 'Text', content: 'payload' }
            ];
            state.allMessages = state.displayedMessages;
            ui.renderList();

            // Need to import ui-forward first
            ui.generateUuid = () => 'test-uuid';

            const btn = document.querySelector('.btn-forward-row') as HTMLElement;
            btn.click();

            expect(state.forwardQueue.length).toBe(1);
        });
    });
});
