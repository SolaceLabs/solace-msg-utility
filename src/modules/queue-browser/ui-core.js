import { state, defaultActiveFilters } from './state.js';
import { formatBytes, generateUuid } from '../../core/utils';
import { required } from '../../core/dom';

/** @type {any} */
export const ui = {};

/** @type {any} */
export const els = {};

// Delegate to core/utils — keeps ui.formatBytes() / ui.generateUuid() call sites working
ui.formatBytes = formatBytes;
ui.generateUuid = generateUuid;

ui.initElements = function (container) {
    els.container = container;

    // Headers
    els.hdrVpnName = container.querySelector('#browser-vpn-name');
    els.hdrQueueName = container.querySelector('#browser-queue-name');
    els.hdrPermissions = container.querySelector('#browser-permissions');

    // Bind Controls
    els.inputBind = container.querySelector('#browser-bind-input');
    els.btnBindPick = container.querySelector('#btn-browser-bind-pick');
    els.btnBind = container.querySelector('#btn-browser-bind');
    els.selectBound = container.querySelector('#browser-bound-queues');
    els.btnUnbind = container.querySelector('#btn-browser-unbind');
    els.elBindError = container.querySelector('#browser-bind-error');

    // Message List & Counts
    els.msgList = container.querySelector('#browser-msg-list');
    els.checkAll = container.querySelector('#browser-select-all');
    els.countTotal = container.querySelector('#count-total');
    els.countDisplayed = container.querySelector('#count-displayed');
    els.countSelected = container.querySelector('#count-selected');

    // Details Panel
    els.detailId = container.querySelector('#detail-msg-id');
    els.detailDest = container.querySelector('#detail-destination');
    els.detailTypeBadge = container.querySelector('#detail-type-badge');
    els.detailDestBadge = container.querySelector('#detail-dest-badge');
    els.detailReplMsgId = container.querySelector('#detail-repl-msg-id');
    els.btnCopyDest = container.querySelector('#btn-copy-dest');
    els.btnCopyReplMsgId = container.querySelector('#btn-copy-repl-msg-id');
    els.propContainer = container.querySelector('#detail-properties-container');
    els.appPropertiesContainer = container.querySelector('#detail-app-properties-container');
    els.detailContent = container.querySelector('#detail-content');
    els.btnCopyContent = container.querySelector('#btn-copy-content');

    // Raw Content
    els.btnShowRaw = container.querySelector('#btn-show-raw');
    els.modalRaw = container.querySelector('#browser-raw-content-modal');
    els.btnRawClose = container.querySelector('#btn-raw-close');
    els.rawContentText = container.querySelector('#raw-content-text');

    // Forward Modal Elements
    els.modalForward = container.querySelector('#browser-forward-modal');
    els.inputForwardDestName = container.querySelector('#forward-dest-name');
    els.inputForwardDestType = container.querySelector('#forward-dest-type');
    els.btnForwardCancel = container.querySelector('#btn-forward-cancel');
    els.btnForwardSend = container.querySelector('#btn-forward-send');
    els.btnForwardClose = container.querySelector('#btn-forward-close');
    els.elForwardError = container.querySelector('#forward-error');
    els.listForwardMsgs = container.querySelector('#forward-msg-list');
    els.elForwardQueueCount = container.querySelector('#forward-queue-count');

    // Filter Controls
    els.btnFilter = container.querySelector('#btn-browser-filter');
    els.modalFilter = container.querySelector('#browser-filter-modal');
    els.btnFilterCancel = container.querySelector('#btn-filter-cancel');
    els.btnFilterClear = container.querySelector('#btn-filter-clear');
    els.btnFilterApply = required(container, '#btn-filter-apply');
    els.inputFilterContent = container.querySelector('#filter-content');
    els.inputFilterId = container.querySelector('#filter-msg-id');
    els.inputFilterMsgType = container.querySelector('#filter-msg-type');
    els.inputFilterDest = container.querySelector('#filter-destination');
    els.inputFilterType = container.querySelector('#filter-destination-type');
    els.inputFilterNewerThan = required(container, '#filter-newer-than');
    els.inputFilterOlderThan = required(container, '#filter-older-than');
    els.radFilterCriteria = container.querySelectorAll('input[name="filter-criteria"]');
    els.btnAddPropFilter = container.querySelector('#btn-add-prop-filter');
    els.filterPropsRows = container.querySelector('#filter-properties-rows');

    // Bulk Actions
    els.btnBrowserDownloadContent = container.querySelector('#btn-browser-download-content');
    els.btnBrowserDownloadFull = container.querySelector('#btn-browser-download-full');
    els.btnBrowserForward = container.querySelector('#btn-browser-forward');
    els.btnBrowserDelete = container.querySelector('#btn-browser-delete');

    // Error
    els.elBrowserError = container.querySelector('#browser-connect-error');

    // Visibility
    els.elPrompt = container.querySelector('#browser-connect-prompt');
    els.elActiveView = container.querySelector('#browser-active-view');

    return els;
};

ui.getElements = function () {
    return els;
};

ui.showBrowserError = function (msg) {
    if (msg) {
        els.elBrowserError.textContent = msg;
        els.elBrowserError.style.display = 'block';
    } else {
        els.elBrowserError.style.display = 'none';
    }
};

ui.showBindError = function (msg) {
    if (msg) {
        els.elBindError.textContent = msg;
        els.elBindError.style.display = 'block';
        els.inputBind.classList.add('is-invalid');
    } else {
        els.elBindError.textContent = '';
        els.elBindError.style.display = 'none';
        els.inputBind.classList.remove('is-invalid');
    }
};


ui.updateVisibility = function (isConnected, vpnName) {
    if (!isConnected) {
        els.elPrompt.classList.remove('hidden');
        els.elActiveView.classList.add('hidden');
        els.hdrVpnName.textContent = '';
    } else {
        els.elPrompt.classList.add('hidden');
        els.elActiveView.classList.remove('hidden');
        els.hdrVpnName.textContent = vpnName;

        if (els.selectBound.value) {
            els.hdrQueueName.textContent = els.selectBound.value;
        } else {
            els.hdrQueueName.textContent = '';
            els.hdrPermissions.classList.add('hidden');
        }
    }
};

ui.resetUI = function () {
    while (els.selectBound.options.length > 1) {
        els.selectBound.remove(1);
    }
    els.selectBound.selectedIndex = 0;
    els.selectBound.dispatchEvent(new Event('change'));
    ui.updateVisibility(false);
};

// Reset selection only (don't hide panel)
ui.resetQueueSelection = function () {
    els.hdrQueueName.textContent = '';
    els.hdrPermissions.classList.add('hidden');
    state.currentQueue = '';
    state.allMessages = [];
    state.displayedMessages = [];
    state.currentQueuePermissions = null;

    // Reset Filters
    state.activeFilters = defaultActiveFilters();
    els.inputFilterContent.value = '';
    els.inputFilterId.value = '';
    els.inputFilterDest.value = '';
    els.inputFilterType.value = 'ANY';
    els.inputFilterMsgType.value = 'ANY';
    els.inputFilterNewerThan.value = '';
    els.inputFilterOlderThan.value = '';
    els.radFilterCriteria.forEach(r => r.checked = (r.value === 'OR'));

    els.btnFilter.classList.remove('filter-active');
    els.btnFilter.disabled = true;

    // ui.renderList / ui.clearDetails are installed by initTable / initDetails respectively.
    // Some unit tests import ui-core.js standalone without those installers, hence the guards.
    if (ui.renderList) ui.renderList();
    if (ui.clearDetails) ui.clearDetails();
};

ui.addQueueToDropdown = function (queueName) {
    let exists = false;
    for (let i = 0; i < els.selectBound.options.length; i++) {
        if (els.selectBound.options[i].value === queueName) exists = true;
    }

    if (!exists) {
        const opt = document.createElement('option');
        opt.value = queueName;
        opt.textContent = queueName;
        els.selectBound.appendChild(opt);
    }

    // Auto-select
    els.selectBound.value = queueName;
    els.selectBound.dispatchEvent(new Event('change'));
};
