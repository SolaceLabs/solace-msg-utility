import { ui, NOTICE_TOAST_MS } from './ui-core.js';
import { state } from './state.js';
import { errMessage, escapeHtml } from '../../core/utils';
import { logger } from '../../core/logger';
import { showToast } from '../../core/toast';
import { showPayload } from './features.js';
import { bytesToBase64, contentFileName } from './payload.js';
import { detectKind, hexDump, imageSize, MAX_PREVIEW_PIXELS, type FileKind } from './file-kind.js';
import { toJsonValue } from './sdt.js';
import { downloadBlob, saveBlob } from '../../core/download';
import type { AppContext } from '../../core/types';

const log = logger.withTag('queue-browser');

// ui-details.ts - Message Details & Properties
// Initialized via initDetails(ctx) which closes over AppContext for copyToClipboard.

export function initDetails(ctx: AppContext) {

    ui.triggerDownload = function (filename: string, content: string, type = 'text/plain') {
        const blob = new Blob([content], { type: type });
        ui.triggerDownloadBlob(blob, filename);
    };

    ui.triggerDownloadBlob = function (blob: Blob, filename: string) {
        downloadBlob(blob, filename);
    };

    /**
     * Save the message's body: its original bytes (a binary attachment, or a
     * map's or stream's wire bytes), else its text, always as
     * application/octet-stream so the browser never opens it, under the name
     * contentFileName() suggests. Called from the click: the save dialog
     * needs the user's gesture.
     */
    ui.downloadMessageContent = function (msg: any) {
        if (!msg) return;
        const name = contentFileName(msg);
        saveBlob(new Blob([msg.bytes ?? msg.content], { type: 'application/octet-stream' }), name).catch((e: unknown) => {
            log.error(`Could not save ${name}`, e);
            showToast(`Could not save ${name}: ${errMessage(e)}`, 'error', NOTICE_TOAST_MS);
        });
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
            // A binary payload rides as base64, flagged so a reader can decode it; text stays text.
            // A map or stream rides as its wire bytes too, with its fields decoded beside them.
            payload: msg.binary || msg.sdt ? bytesToBase64(msg.bytes) : msg.content
        };
        if (msg.binary || msg.sdt) fullObj.payloadEncoding = 'base64';
        if (msg.sdt) fullObj.payloadDecoded = toJsonValue(msg.sdt);

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
        } catch (e) { log.warn('Failed to extract destination details', e); }
        return fullObj;
    };

    ui.downloadMessageFull = function (msg: any) {
        const fullObj = ui.getFullMessageJson(msg);
        if (!fullObj) return;
        const filename = `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}-full.json`;
        ui.triggerDownload(filename, JSON.stringify(fullObj, null, 2), 'application/json');
    };

    // The preview's object URL, revoked when the pane moves on.
    let previewUrl: string | null = null;

    /** Hide the binary payload's kind, preview, hex view and note, and let the preview's bytes go. */
    function resetBinary(): void {
        const els = ui.getElements();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        els.detailPreview.onerror = null;
        for (const el of [els.detailBinary, els.btnShowPreview, els.btnShowHex, els.detailBinaryNote, els.detailPreview, els.detailHex]) {
            el.classList.add('hidden');
        }
        els.detailPreview.removeAttribute('src');
        els.detailHex.textContent = '';
        els.detailBinaryNote.textContent = '';
        els.btnShowPreview.textContent = 'Show preview';
        els.btnShowHex.textContent = 'Show hex';
    }

    function note(text: string): void {
        const els = ui.getElements();
        els.detailBinaryNote.textContent = text;
        els.detailBinaryNote.classList.remove('hidden');
    }

    /**
     * Show or hide an image payload. Nothing decodes it until the user asks,
     * and an image whose header declares more than MAX_PREVIEW_PIXELS, or no
     * size at all, is refused before it is decoded. The bytes are
     * attachmentBytes()'s own copy, so an ArrayBuffer backs them (a Blob
     * takes no shared memory).
     */
    function togglePreview(bytes: Uint8Array<ArrayBuffer>, image: NonNullable<FileKind['image']>): void {
        const els = ui.getElements();
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
            els.detailPreview.onerror = null;
            els.detailPreview.removeAttribute('src');
            els.detailPreview.classList.add('hidden');
            els.detailBinaryNote.classList.add('hidden');
            els.btnShowPreview.textContent = 'Show preview';
            return;
        }
        const size = imageSize(bytes, image);
        if (!size) {
            note('Not shown: the image\'s header does not say how large it is.');
            return;
        }
        if (size.width * size.height > MAX_PREVIEW_PIXELS) {
            note(`Not shown: ${size.width} x ${size.height} pixels is more than the ${MAX_PREVIEW_PIXELS / 1_000_000}-megapixel limit.`);
            return;
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: image }));
        previewUrl = url;
        // Undecodable after all: let its bytes go, and offer Show preview again.
        // Cleared whenever the preview goes, so a late event cannot reach the
        // next message's tools.
        els.detailPreview.onerror = () => {
            URL.revokeObjectURL(url);
            previewUrl = null;
            els.detailPreview.onerror = null;
            els.detailPreview.removeAttribute('src');
            els.detailPreview.classList.add('hidden');
            els.btnShowPreview.textContent = 'Show preview';
            note('The image could not be decoded.');
        };
        els.detailPreview.src = url;
        els.detailPreview.classList.remove('hidden');
        note(`${size.width} x ${size.height} pixels`);
        els.btnShowPreview.textContent = 'Hide preview';
    }

    function toggleHex(bytes: Uint8Array): void {
        const els = ui.getElements();
        const show = els.detailHex.classList.contains('hidden');
        els.detailHex.textContent = show ? hexDump(bytes) : '';
        els.detailHex.classList.toggle('hidden', !show);
        els.btnShowHex.textContent = show ? 'Hide hex' : 'Show hex';
    }

    /** Under a binary payload's placeholder: what its bytes look like, and its preview or hex button. */
    function showBinary(msg: any): void {
        const els = ui.getElements();
        resetBinary();
        if (!msg.binary) return;
        const kind = detectKind(msg.bytes);
        els.detailBinaryKind.textContent = kind ? `Looks like: ${kind.label}` : 'Kind not recognised';
        els.detailBinary.classList.remove('hidden');
        const image = kind?.image;
        if (image) {
            els.btnShowPreview.classList.remove('hidden');
            els.btnShowPreview.onclick = () => togglePreview(msg.bytes, image);
        } else {
            els.btnShowHex.classList.remove('hidden');
            els.btnShowHex.onclick = () => toggleHex(msg.bytes);
        }
    }

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

            // Payload preview + raw/copy-content actions exist only in the show-payload
            // flavor; their elements were removed in the no-payload flavor.
            // A true binary payload shows its size placeholder; there is no text to copy.
            if (showPayload()) {
                els.detailContent.textContent = msg.content;
                els.btnShowRaw.disabled = false;
                els.btnShowRaw.onclick = () => ui.showRawContent(msg);
                els.btnCopyContent.disabled = msg.binary === true;
                showBinary(msg);
            }

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
        // Payload preview + raw/copy-content controls are absent in the no-payload flavor.
        if (showPayload()) {
            els.detailContent.textContent = '';
            els.btnShowRaw.disabled = true;
            els.btnCopyContent.disabled = true;
            resetBinary();
        }
        els.btnCopyDest.disabled = true;
        els.btnCopyReplMsgId.disabled = true;
        els.detailTypeBadge.classList.add('hidden');
        els.detailDestBadge.classList.add('hidden');

        els.msgList.querySelectorAll('tr.selected').forEach((tr: any) => tr.classList.remove('selected'));
    };

    ui.createTag = function (container: HTMLElement, key: string, val: any) {
        const tag = document.createElement('span');
        tag.className = 'header-tag';

        // Boolean flags render as a bare label — the presence of the tag is the value.
        if (val === true) {
            tag.textContent = key;
            container.appendChild(tag);
            return;
        }

        const valStr = String(val);
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
            <button class="btn-icon btn-icon-danger btn-remove-prop" title="Remove">
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
