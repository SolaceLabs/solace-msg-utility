import { ui } from './ui-core.js';
import { state } from './state.js';
import { escapeHtml } from '../../core/utils';
import { logger } from '../../core/logger';
import { BLOB_URL_REVOKE_DELAY_MS } from './constants.js';
import type { AppContext } from '../../core/types';

// ui-details.ts - Message Details & Properties
// Initialized via initDetails(ctx) which closes over AppContext for copyToClipboard.

declare const JSZip: any;

export function initDetails(ctx: AppContext) {

    ui.triggerDownload = function (filename: string, content: string, type = 'text/plain') {
        const blob = new Blob([content], { type: type });
        ui.triggerDownloadBlob(blob, filename);
    };

    ui.triggerDownloadBlob = function (blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        if (!url) {
            logger.warn('[ui-details] createObjectURL returned null — download aborted');
            return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS);
    };

    ui.downloadMessageContent = function (msg: any) {
        if (!msg) return;
        const filename = `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}`;
        const content = msg.content || '';
        ui.triggerDownload(filename, content);
    };

    ui.getFullMessageJson = function (msg: any) {
        if (!msg) return null;
        const fullObj: any = {
            messageProperties: {
                ...msg.msgProperties,
                destination: { name: 'Unknown', type: 'Unknown' },
                messageType: msg.type
            },
            applicationProperties: msg.appProperties,
            payload: msg.content
        };

        // _originalMsg is set by service-events.onMessage for every broker-delivered
        // message and is always present here. getDestination() can still return null
        // for some SDK message states — that inner guard is legitimate.
        try {
            const dest = msg._originalMsg.getDestination();
            if (dest) {
                fullObj.messageProperties.destination.name = dest.getName();
                const dType = dest.getType();
                if (dType === (window as any).solace.DestinationType.TOPIC) fullObj.messageProperties.destination.type = 'Topic';
                else if (dType === (window as any).solace.DestinationType.QUEUE) fullObj.messageProperties.destination.type = 'Queue';
                else fullObj.messageProperties.destination.type = dType.toString();
            }
        } catch (e) { logger.warn('Failed to extract destination details', e); }
        return fullObj;
    };

    ui.downloadMessageFull = function (msg: any) {
        const fullObj = ui.getFullMessageJson(msg);
        if (!fullObj) return;
        const filename = `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}-full.json`;
        ui.triggerDownload(filename, JSON.stringify(fullObj, null, 2), 'application/json');
    };

    ui.selectMessage = function (id: string) {
        const els = ui.getElements();

        // Highlight row
        els.msgList.querySelectorAll('tr').forEach((tr: any) => {
            if (tr.dataset.id === id) tr.classList.add('selected');
            else tr.classList.remove('selected');
        });

        const msg = state.displayedMessages.find((m: any) => m.id === id);
        if (msg) {
            state.selectedMessage = msg;
            els.detailId.textContent = msg.id;

            els.detailTypeBadge.textContent = msg.type;
            els.detailTypeBadge.className = 'badge badge-outline-info';
            els.detailTypeBadge.classList.remove('hidden');

            // _originalMsg is always set by service-events.onMessage.
            const dest = msg._originalMsg.getDestination();
            if (dest) {
                const destName = dest.getName();
                els.detailDest.textContent = destName;
                const destType = dest.getType();
                let typeLabel = destType.toString();
                if (destType === (window as any).solace.DestinationType.TOPIC) typeLabel = 'Topic';
                else if (destType === (window as any).solace.DestinationType.QUEUE) typeLabel = 'Queue';
                els.detailDestBadge.textContent = typeLabel;
            } else {
                els.detailDest.textContent = 'N/A';
                els.detailDestBadge.textContent = 'Unknown';
            }

            // Older SDK message subtypes can lack getReplicationGroupMessageId — that
            // `typeof === 'function'` check is legitimate SDK-version defensiveness.
            if (typeof msg._originalMsg.getReplicationGroupMessageId === 'function') {
                try {
                    const rmid = msg._originalMsg.getReplicationGroupMessageId();
                    els.detailReplMsgId.textContent = rmid ? rmid.toString() : 'N/A';
                } catch (e) { els.detailReplMsgId.textContent = 'N/A'; }
            } else {
                els.detailReplMsgId.textContent = 'N/A';
            }

            els.detailDestBadge.className = 'badge badge-outline-success';
            els.detailDestBadge.classList.remove('hidden');

            ui.renderTags(els.propContainer, msg.msgProperties);
            ui.renderTags(els.appPropertiesContainer, msg.appProperties);

            els.detailContent.textContent = msg.content;

            els.btnShowRaw.disabled = false;
            els.btnShowRaw.onclick = () => ui.showRawContent(msg);
            els.btnCopyContent.disabled = false;
            els.btnCopyDest.disabled = false;
            els.btnCopyDest.onclick = () => ctx.copyToClipboard(els.detailDest.textContent, els.btnCopyDest);
            els.btnCopyReplMsgId.disabled = false;
            els.btnCopyReplMsgId.onclick = () => ctx.copyToClipboard(els.detailReplMsgId.textContent, els.btnCopyReplMsgId);
        }
    };

    ui.showRawContent = function (msg: any) {
        const els = ui.getElements();
        els.rawContentText.textContent = msg._originalMsg.dump();
        els.modalRaw.showModal();
        els.btnRawClose.onclick = () => els.modalRaw.close();
    };

    ui.clearDetails = function () {
        const els = ui.getElements();
        els.detailId.textContent = '';
        els.detailDest.textContent = '';
        els.detailReplMsgId.textContent = '';
        els.propContainer.innerHTML = '';
        els.appPropertiesContainer.innerHTML = '';
        els.detailContent.textContent = '';
        els.btnShowRaw.disabled = true;
        els.btnCopyContent.disabled = true;
        els.btnCopyDest.disabled = true;
        els.btnCopyReplMsgId.disabled = true;
        els.detailTypeBadge.classList.add('hidden');
        els.detailDestBadge.classList.add('hidden');

        els.msgList.querySelectorAll('tr.selected').forEach((tr: any) => tr.classList.remove('selected'));
    };

    ui.createTag = function (container: HTMLElement, key: string, val: any) {
        const valStr = String(val);
        const tag = document.createElement('span');
        tag.className = 'header-tag';

        const isLong = valStr.length > 20;

        const render = (expanded: boolean) => {
            let displayVal = valStr;
            if (!expanded && isLong) {
                displayVal = valStr.substring(0, 20) + '...';
            }
            tag.textContent = `${key} = ${displayVal}`;
        };

        render(false);

        if (isLong) {
            let expanded = false;
            tag.onclick = () => {
                expanded = !expanded;
                render(expanded);
            };
            tag.title = 'Click to expand/collapse';
        }

        container.appendChild(tag);
    };

    ui.renderTags = function (container: HTMLElement, properties: Record<string, any>) {
        container.innerHTML = '';

        if (!properties || Object.keys(properties).length === 0) {
            const empty = document.createElement('span');
            empty.textContent = 'None';
            empty.style.color = 'var(--text-secondary)';
            empty.style.fontStyle = 'italic';
            empty.style.fontSize = '0.85rem';
            container.appendChild(empty);
            return;
        }

        for (const [key, val] of Object.entries(properties)) {
            if (val !== null && val !== undefined && val !== '') {
                ui.createTag(container, key, val);
            }
        }
    };

    ui.addPropertyFilterRow = function (key = '', value = '') {
        const els = ui.getElements();
        const container = els.filterPropsRows;

        const row = document.createElement('div');
        row.className = 'flex-row gap-2 mt-1 property-filter-row';
        row.innerHTML = `
            <input type="text" class="form-control prop-key" placeholder="Key" list="standard-properties-list" value="${escapeHtml(key)}">
            <input type="text" class="form-control prop-value" placeholder="Value" value="${escapeHtml(value)}">
            <button class="btn-icon btn-remove-prop" title="Remove" style="color: var(--status-disconnected);">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
            </button>
        `;

        (row.querySelector('.btn-remove-prop') as HTMLElement).onclick = () => row.remove();

        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                els.btnFilterApply.click();
            }
        };
        (row.querySelector('.prop-key') as HTMLElement).addEventListener('keydown', handleEnter as EventListener);
        (row.querySelector('.prop-value') as HTMLElement).addEventListener('keydown', handleEnter as EventListener);

        container.appendChild(row);
    };

    ui.getPropertyFilters = function () {
        const els = ui.getElements();
        const container = els.filterPropsRows;

        const rows = container.querySelectorAll('.property-filter-row');
        const filters: { key: string; value: string }[] = [];
        rows.forEach((row: any) => {
            const key = row.querySelector('.prop-key').value.trim();
            const value = row.querySelector('.prop-value').value.trim();
            if (key) {
                filters.push({ key, value });
            }
        });
        return filters;
    };

    ui.clearPropertyFilters = function () {
        const els = ui.getElements();
        els.filterPropsRows.innerHTML = '';
    };
}
