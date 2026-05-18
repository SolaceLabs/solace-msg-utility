import { ui } from './ui-core.js';
import { state } from './state.js';
import { escapeHtml } from '../../core/utils';

// ui-forward.js - Message Forwarding Modal

// Wired by module.ts at install time so the modal can detect a UUID collision
// against an in-flight forward from a prior modal session that was closed mid-flight.
// Default returns false so this module is usable in tests that don't wire it.
let _hasInFlightForward = (_cv) => false;
export function wireForward(deps) {
    _hasInFlightForward = deps.hasInFlightForward;
}

ui.getStatusIcon = function (status) {
    if (status === 'QUEUED') {
        return '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--text-muted, #9ca3af)"/></svg>';
    }
    if (status === 'SENDING') {
        return '<svg class="icon-spin" width="16" height="16" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10" fill="none" stroke="var(--status-connected)" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if (status === 'SUCCESS') {
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-connected)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    if (status === 'FAILED') {
        return '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--status-disconnected)"/></svg>';
    }
    return '';
};

ui.showForwardModal = function (msgs) {
    const els = ui.getElements();

    const msgArray = Array.isArray(msgs) ? msgs : [msgs];

    // Generate a unique correlationValue for each item. Collision is checked
    // against (a) the batch being built and (b) any timer still alive in
    // _forwardTimers from a prior modal that closed mid-flight. UUID v4
    // collision is ~10⁻³⁶ per pair so a single retry is enough in practice;
    // the cap is just a paranoia bound.
    const usedUuids = new Set();
    state.forwardQueue = msgArray.map(m => {
        let cv = ui.generateUuid();
        let attempts = 0;
        while ((usedUuids.has(cv) || _hasInFlightForward(cv)) && attempts < 5) {
            cv = ui.generateUuid();
            attempts++;
        }
        usedUuids.add(cv);
        return {
            originalMsg: m,
            id: m.id,
            correlationValue: cv,
            status: 'QUEUED',
            error: null
        };
    });

    els.inputForwardDestName.value = '';
    els.inputForwardDestType.value = 'Topic';
    els.inputForwardDestType.disabled = false;
    els.elForwardError.style.display = 'none';
    els.elForwardError.textContent = '';

    els.btnForwardSend.disabled = false;
    els.btnForwardSend.textContent = 'Send';
    els.btnForwardSend.classList.remove('btn-secondary');
    els.btnForwardSend.classList.add('btn-primary');

    // Apply the disable-if-Original rule now that type is reset to Topic.
    ui.updateForwardNameInputState();

    ui.updateForwardCount();

    ui.renderForwardList();

    els.modalForward.showModal();
    els.inputForwardDestName.focus();
};

// Disable the Name input when Type is "Original" (each message uses its own
// destination); otherwise enable it. Used on modal open, on type-change, and
// when a send completes (to restore per-type behaviour after the send-time
// disable). Safe to call repeatedly — idempotent.
ui.updateForwardNameInputState = function () {
    const els = ui.getElements();
    if (els.inputForwardDestType.value === 'Original') {
        els.inputForwardDestName.disabled = true;
        els.inputForwardDestName.value = '';
        els.inputForwardDestName.placeholder = '(each message uses its own destination)';
    } else {
        els.inputForwardDestName.disabled = false;
        els.inputForwardDestName.placeholder = 'Queue Or Topic Name';
    }
};

ui.renderForwardList = function () {
    const els = ui.getElements();

    els.listForwardMsgs.innerHTML = state.forwardQueue.map(item => {
        const icon = ui.getStatusIcon(item.status);
        const hasError = item.status === 'FAILED' && item.error;

        let cleanContent = (item.originalMsg.content || '').replace(/(\r\n|\n|\r)/gm, " ");
        let maxLen = 30;
        if (cleanContent.length > maxLen) {
            cleanContent = cleanContent.substring(0, maxLen) + '...';
        }

        return `
            <div class="flex-row gap-2 items-start mb-2">
                <div id="status-${item.correlationValue}" class="flex-shrink-0 mt-2" style="width: 16px;">
                    ${icon}
                </div>
                <div class="flex-col flex-1 min-w-0 gap-0">
                    <div class="flex-row justify-between items-center p-2 rounded border" style="background: var(--bg-input); border-color: var(--border-color);">
                        <span class="text-sm text-secondary whitespace-nowrap mr-2">${escapeHtml(item.id)}</span>
                        <span class="text-xs text-secondary whitespace-nowrap">${escapeHtml(cleanContent)}</span>
                    </div>
                    <div id="error-${item.correlationValue}" class="text-xs text-error text-left ${hasError ? '' : 'hidden'}" style="color: var(--status-disconnected); margin-top: 2px;">
                        ${escapeHtml(item.error || '')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

ui.closeForwardModal = function () {
    const els = ui.getElements();
    els.modalForward.close();
    state.selectedForwardMsg = null;
};

ui.onForwardSuccess = function () {
    ui.closeForwardModal();
};

ui.onForwardFailure = function (err) {
    const els = ui.getElements();
    els.elForwardError.textContent = `Error: ${err.message || err}`;
    els.elForwardError.style.display = 'block';
};

ui.updateForwardItemStatus = function (correlationValue, status, errorMsg) {
    if (!correlationValue || !state.forwardQueue) return;

    const item = state.forwardQueue.find(m => m.correlationValue === correlationValue);
    if (item) {
        item.status = status;
        item.error = errorMsg;

        const iconContainer = document.getElementById(`status-${correlationValue}`);
        if (iconContainer) {
            iconContainer.innerHTML = ui.getStatusIcon(status);
        }

        const errorContainer = document.getElementById(`error-${correlationValue}`);
        if (errorContainer) {
            if (status === 'FAILED' && errorMsg) {
                errorContainer.textContent = errorMsg;
                errorContainer.classList.remove('hidden');
            } else {
                errorContainer.classList.add('hidden');
            }
        }
    }

    // Refresh the "done / total" counter badge after each status change.
    ui.updateForwardCount();
    ui.checkForwardCompletion();
};

// Render the `done / total` counter into the forward modal's badge. Counts an
// item as "done" once it reaches a terminal state (SUCCESS or FAILED). Called
// from showForwardModal (initial 0 / N) and updateForwardItemStatus (every tick).
ui.updateForwardCount = function () {
    const els = ui.getElements();
    if (!state.forwardQueue) return;
    const total = state.forwardQueue.length;
    const done = state.forwardQueue.filter(m => m.status === 'SUCCESS' || m.status === 'FAILED').length;
    els.elForwardQueueCount.textContent = `${done} / ${total}`;
};

// Called after every per-item status change. Sets the Send button to one of
// three terminal labels once no items remain in-flight:
//   - any FAILED → "Resend failed messages (N)", enabled (user can retry)
//   - all SUCCESS → "Send Complete", disabled
//   - otherwise   → leave the in-flight "Sending..." label alone
// Also re-enables the Type/Name inputs so the user can target a different
// destination for the retry (dynamic re-selection per your request).
ui.checkForwardCompletion = function () {
    const els = ui.getElements();
    if (!state.forwardQueue) return;

    const total = state.forwardQueue.length;
    const failed = state.forwardQueue.filter(m => m.status === 'FAILED').length;
    const succeeded = state.forwardQueue.filter(m => m.status === 'SUCCESS').length;
    if (failed + succeeded < total) return; // still sending/queued

    if (failed > 0) {
        els.btnForwardSend.textContent = `Resend failed messages (${failed})`;
        els.btnForwardSend.disabled = false;
        els.btnForwardSend.classList.remove('btn-secondary');
        els.btnForwardSend.classList.add('btn-primary');
    } else {
        els.btnForwardSend.textContent = 'Send Complete';
        els.btnForwardSend.disabled = true;
        els.btnForwardSend.classList.add('btn-secondary');
        els.btnForwardSend.classList.remove('btn-primary');
    }

    // Re-enable destination controls on completion. Name input respects the
    // Original-disable rule via the shared helper.
    els.inputForwardDestType.disabled = false;
    ui.updateForwardNameInputState();
};
