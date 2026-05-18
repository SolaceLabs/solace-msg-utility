import { ui } from './ui-core.js';
import { state, getBrowser } from './state.js';
import { icons } from './constants.js';
import { escapeHtml } from '../../core/utils';
import { required } from '../../core/dom';
import { logger } from '../../core/logger';
import type { EventBus } from '../../core/types';

// ui-table.ts - Message List & Table Logic
// Initialized via initTable(eventBus) to provide EventBus for delete events.

declare const JSZip: any;

export function initTable(eventBus: EventBus) {

    ui.getSelectedMessageIds = function () {
        const els = ui.getElements();
        const checkedBoxes = Array.from(els.msgList.querySelectorAll('.msg-check:checked'));
        return checkedBoxes.map((cb: any) => cb.closest('tr').dataset.id);
    };

    ui.createRowHtml = function (msg: any) {
        const isReadOnly = state.currentQueuePermissions && state.currentQueuePermissions.READ_ONLY;
        const safeId = escapeHtml(msg.id);
        const safeDate = escapeHtml(msg.date);
        return `
            <tr data-id="${safeId}" class="clickable-row">
                <td class="row-checkbox"><input type="checkbox" class="msg-check"></td>
                <td>${safeId}</td>
                <td>${safeDate}</td>
                <td>${ui.formatBytes(msg.size)}</td>
                <td>
                    <div class="browser-actions">
                        <button class="btn-icon btn-download-content" title="Download Content (Payload)">${icons.downloadContent}</button>
                        <button class="btn-icon btn-download-full" title="Download Full Message (JSON)">${icons.downloadFull}</button>
                        <button class="btn-icon btn-forward-row" title="Forward Message">${icons.forward}</button>
                        ${!isReadOnly ? `<button class="btn-icon btn-delete-row" title="Delete" style="color: var(--status-disconnected);">${icons.delete}</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    };

    ui.attachRowListeners = function (tr: HTMLElement) {
        // Row Click (Select)
        tr.addEventListener('click', (e: any) => {
            if (e.target.closest('input') || e.target.closest('button')) return;
            ui.selectMessage((tr as HTMLElement & { dataset: DOMStringMap }).dataset.id);
        });

        // The four `if (msg)` guards below protect a state-find race: a click can land
        // after state.displayedMessages was filtered/cleared but before the row was
        // removed from the DOM. The handler holds the row's dataset.id but find()
        // returns undefined.
        required(tr, '.btn-download-content').addEventListener('click', (e) => {
            e.stopPropagation();
            const msg = state.displayedMessages.find((m: any) => m.id === (tr as any).dataset.id);
            if (msg) ui.downloadMessageContent(msg);
        });
        required(tr, '.btn-download-full').addEventListener('click', (e) => {
            e.stopPropagation();
            const msg = state.displayedMessages.find((m: any) => m.id === (tr as any).dataset.id);
            if (msg) ui.downloadMessageFull(msg);
        });
        required(tr, '.btn-forward-row').addEventListener('click', (e) => {
            e.stopPropagation();
            const msg = state.displayedMessages.find((m: any) => m.id === (tr as any).dataset.id);
            if (msg) ui.showForwardModal(msg);
        });
        required(tr, '.msg-check').addEventListener('change', ui.updateCounts);

        // Delete button — only emitted by createRowHtml when the queue isn't READ_ONLY.
        const btnDel = tr.querySelector('.btn-delete-row');
        if (btnDel) {
            btnDel.addEventListener('click', (e) => {
                e.stopPropagation();
                eventBus.emit('app:message-delete', { id: (tr as any).dataset.id! });
            });
        }
    };

    ui.renderList = function () {
        const els = ui.getElements();

        // Reset Check All
        els.checkAll.checked = false;

        // Build all rows off-DOM in a single reflow-free pass, attach listeners
        // while the nodes are still detached, then swap the tbody contents in one
        // operation. Meaningfully faster than innerHTML + re-query + forEach when
        // the list is large. For pathological sizes (>1K messages) virtual
        // scrolling would still be required — tracked as 3.3 long-term fix.
        const fragment = document.createDocumentFragment();
        const temp = document.createElement('tbody');
        temp.innerHTML = state.displayedMessages.map((msg: any) => ui.createRowHtml(msg)).join('');
        const rows = Array.from(temp.children) as HTMLElement[];
        rows.forEach((tr) => {
            ui.attachRowListeners(tr);
            fragment.appendChild(tr);
        });

        els.msgList.innerHTML = '';
        els.msgList.appendChild(fragment);

        ui.updateCounts();
    };

    ui.addMessageRow = function (msg: any) {
        const els = ui.getElements();

        const temp = document.createElement('tbody');
        temp.innerHTML = ui.createRowHtml(msg);
        // createRowHtml always emits exactly one <tr>
        const tr = temp.firstElementChild as HTMLElement;
        ui.attachRowListeners(tr);
        els.msgList.appendChild(tr);
        tr.style.animation = 'highlight-fade 2s';
        ui.updateCounts();
    };

    ui.removeMessageRow = function (msgId: string) {
        const els = ui.getElements();

        const tr = els.msgList.querySelector(`tr[data-id="${msgId}"]`);
        if (tr) {
            tr.remove();
            ui.updateCounts();

            // If selected, clear details
            if (els.detailId.textContent === msgId.toString()) {
                ui.clearDetails();
            }
        }
    };

    ui.updateCounts = function () {
        const els = ui.getElements();
        els.countTotal.textContent = state.allMessages.length;
        els.countDisplayed.textContent = state.displayedMessages.length;

        const checked = els.msgList.querySelectorAll('.msg-check:checked').length;
        els.countSelected.textContent = checked;

        const hasSelection = checked > 0;
        const isReadOnly = state.currentQueuePermissions && state.currentQueuePermissions.READ_ONLY;

        els.btnBrowserDownloadContent.disabled = !hasSelection;
        els.btnBrowserDownloadFull.disabled = !hasSelection;
        els.btnBrowserForward.disabled = (checked === 0);

        if (isReadOnly) {
            els.btnBrowserDelete.classList.add('hidden');
        } else {
            els.btnBrowserDelete.classList.remove('hidden');
            els.btnBrowserDelete.disabled = !hasSelection;
        }
    };

    ui.updatePermissionUI = function (queueName: string) {
        const els = ui.getElements();

        let isReadOnly = false;
        let perms: any = null;
        const browser = getBrowser(queueName);
        const consumer = browser ? browser._messageConsumer : null;
        perms = consumer ? consumer._permissions : null;

        if (perms) {
            if (typeof perms === 'string' && perms === 'READ_ONLY') isReadOnly = true;
        }

        state.currentQueuePermissions = isReadOnly ? { READ_ONLY: true } : { READ_ONLY: false };

        if (perms) {
            els.hdrPermissions.classList.remove('hidden');
            if (isReadOnly) {
                els.hdrPermissions.textContent = 'Read-Only';
                els.hdrPermissions.className = 'badge badge-outline-warning';
            } else {
                els.hdrPermissions.textContent = 'Read-Write';
                els.hdrPermissions.className = 'badge badge-outline-success';
            }
        } else {
            els.hdrPermissions.classList.add('hidden');
            state.currentQueuePermissions = null;
        }

        ui.renderList();
        ui.updateCounts();
    };

    ui.downloadMessagesZip = async function (type: string) {
        if (!(window as any).JSZip) {
            alert('JSZip library not loaded. Cannot create ZIP.');
            return;
        }

        // Get Checked Messages
        const ids = ui.getSelectedMessageIds();
        if (ids.length === 0) {
            alert('No messages selected.');
            return;
        }
        const msgs = state.displayedMessages.filter((m: any) => ids.includes(String(m.id)));

        if (msgs.length === 0) return;

        const zip = new JSZip();
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

        // type is one of 'content' | 'full' — only call sites are ui-events.ts which
        // pass those literals. msg.content is always a string by the time it reaches
        // here (set in service-events.onMessage; '' when no payload, never null).
        let zipFilename = '';
        if (type === 'content') {
            zipFilename = `solace-messages-content-${timestamp}.zip`;
            msgs.forEach((msg: any) => {
                const filename = `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}`;
                zip.file(filename, msg.content);
            });
        } else {
            zipFilename = `solace-messages-full-${timestamp}.zip`;
            msgs.forEach((msg: any) => {
                const fullObj = ui.getFullMessageJson(msg);
                const filename = `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}-full.json`;
                zip.file(filename, JSON.stringify(fullObj, null, 2));
            });
        }

        try {
            const content = await zip.generateAsync({ type: 'blob' });
            ui.triggerDownloadBlob(content, zipFilename);
        } catch (err) {
            logger.error('Failed to generate ZIP:', err);
            alert('Failed to generate ZIP file.');
        }
    };
}
