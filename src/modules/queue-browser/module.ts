/**
 * Queue Browser Module
 *
 * Browse, filter, forward, and delete messages from Solace queues.
 * Priority 30: Depends on Solace session from Connections module.
 */

// Import internal sub-modules
import { state, wireIngestUi } from './state.js';
import { ui } from './ui-core.js';
// These extend the ui object with additional methods:
import { wireForward } from './ui-forward.js';
import { initTable } from './ui-table.js';
import { createService } from './service.js';
import { createServiceEvents } from './service-events.js';
import { logger } from '../../core/logger';
import { createUiEvents } from './ui-events.js';
import { initDetails } from './ui-details.js';
import { required, attachBackdropClose } from '../../core/dom';
import type { AppContext } from '../../core/types';

export const QueueBrowserModule = {
    name: 'Queue Browser',
    id: 'queue-browser',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus, loadSelf } = app;

        // Instantiate services with AppContext
        const serviceEvents = createServiceEvents();
        const service = createService(app, serviceEvents);
        serviceEvents.wire({ disconnectBrowser: service.disconnectBrowser });
        wireForward({ hasInFlightForward: service.hasInFlightForward });
        const uiEvents = createUiEvents(app, service);
        initDetails(app);
        initTable(eventBus);

        // Wire state's ingest path to the UI row-remove function so the moving-window
        // drop in ingestMessage can clean up the DOM without state.js importing ui directly.
        wireIngestUi((id: string) => ui.removeMessageRow(id));

        // Adopt the maxMessagesPerQueue cap from saved config. Connections emits this
        // on load and on save; we mirror it into state for addMessage and reflect it
        // in the snapshot-notice count span.
        const maxMessagesCount = required<HTMLSpanElement>(container, '#browser-max-messages-count');
        maxMessagesCount.textContent = String(state.maxMessagesPerQueue);
        eventBus.on('config:max-messages-changed', ({ value }) => {
            state.maxMessagesPerQueue = value;
            maxMessagesCount.textContent = String(value);
        });

        // 1. Initialize UI elements + assert module-owned required elements up-front.
        const els = ui.initElements(container);
        [
            '#browser-connect-prompt', '#browser-active-view',
            '#browser-vpn-name', '#browser-queue-name', '#browser-permissions',
            '#browser-connect-error', '#browser-bind-error',
            '#browser-bind-input', '#btn-browser-bind-pick', '#btn-browser-bind', '#btn-browser-unbind',
            '#browser-bound-queues',
            '#btn-browser-filter', '#browser-filter-modal',
            '#btn-filter-clear', '#btn-filter-cancel', '#btn-add-prop-filter',
            '#filter-content', '#filter-msg-id', '#filter-msg-type',
            '#filter-destination', '#filter-destination-type',
            '#filter-properties-rows',
            '#browser-select-all', '#browser-msg-list',
            '#count-total', '#count-displayed', '#count-selected',
            '#btn-browser-forward', '#btn-browser-delete',
            '#btn-browser-download-content', '#btn-browser-download-full',
            '#btn-copy-content',
            '#detail-msg-id', '#detail-destination', '#detail-content',
            '#detail-type-badge', '#detail-dest-badge', '#detail-repl-msg-id',
            '#detail-properties-container', '#detail-app-properties-container',
            '#btn-show-raw', '#btn-copy-dest', '#btn-copy-repl-msg-id',
            '#btn-raw-close', '#browser-raw-content-modal', '#raw-content-text',
            '#btn-forward-send', '#btn-forward-cancel', '#btn-forward-close',
            '#forward-dest-name', '#forward-dest-type',
            '#forward-error', '#forward-msg-list', '#forward-queue-count'
        ].forEach(selector => required(container, selector));

        // 2. Initial Visibility
        ui.updateVisibility(appState.isConnected, appState.selectedVpn);

        // 3. Wire Event Listeners

        // Bind/Unbind
        els.btnBind.addEventListener('click', () => uiEvents.handleBindClick());
        els.btnBindPick.addEventListener('click', () => uiEvents.handleBindPickClick());
        els.inputBind.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                els.btnBind.click();
            }
        });
        els.btnUnbind.addEventListener('click', () => uiEvents.handleUnbindClick());

        // Picker icon visibility tracks the primary SEMP connection. Hidden when
        // there's no SEMP context to drive the picker against. Initial state is
        // applied here; later flips happen via the semp:connected/disconnected
        // bus events below.
        els.btnBindPick.classList.toggle('hidden', !appState.isSempConnected);
        eventBus.on('semp:connected', () => {
            els.btnBindPick.classList.remove('hidden');
        });
        eventBus.on('semp:disconnected', () => {
            els.btnBindPick.classList.add('hidden');
        });

        // Dropdown Change
        els.selectBound.addEventListener('change', () => uiEvents.handleDropdownChange());

        // Filter Modal — native <dialog> with showModal/close + backdrop click closes.
        els.btnFilter.addEventListener('click', () => {
            if (els.modalFilter.open) els.modalFilter.close(); else els.modalFilter.showModal();
        });
        els.btnFilterApply.addEventListener('click', () => uiEvents.applyFilters());
        els.btnFilterClear.addEventListener('click', () => uiEvents.clearFilters());
        els.btnFilterCancel.addEventListener('click', () => els.modalFilter.close());

        // Pre-fill datetime inputs with today @ 00:00:00 on first interaction so
        // the native picker opens at midnight rather than the current time.
        // mousedown fires before the picker reads the input value; focus covers
        // keyboard tab-in. Listener is a no-op once a value is set.
        const prefillNewer = () => uiEvents.prefillDateInputMidnight(els.inputFilterNewerThan);
        const prefillOlder = () => uiEvents.prefillDateInputMidnight(els.inputFilterOlderThan);
        els.inputFilterNewerThan.addEventListener('mousedown', prefillNewer);
        els.inputFilterNewerThan.addEventListener('focus', prefillNewer);
        els.inputFilterOlderThan.addEventListener('mousedown', prefillOlder);
        els.inputFilterOlderThan.addEventListener('focus', prefillOlder);
        attachBackdropClose(els.modalFilter as HTMLDialogElement);
        attachBackdropClose(els.modalForward as HTMLDialogElement);
        attachBackdropClose(els.modalRaw as HTMLDialogElement);

        // Add Property Filter Row
        els.btnAddPropFilter.addEventListener('click', () => ui.addPropertyFilterRow());

        // Check All Toggle
        els.checkAll.addEventListener('change', () => {
            const checked = els.checkAll.checked;
            els.msgList.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = checked);
            ui.updateCounts();
        });

        // Bulk Actions — thin wrappers over ui-events handlers
        els.btnBrowserForward.addEventListener('click', () => uiEvents.handleBulkForward());
        els.btnBrowserDelete.addEventListener('click', () => uiEvents.handleBulkDelete());
        els.btnBrowserDownloadContent.addEventListener('click', () => uiEvents.handleBulkDownloadContent());
        els.btnBrowserDownloadFull.addEventListener('click', () => uiEvents.handleBulkDownloadFull());

        // Copy Content Button
        els.btnCopyContent.addEventListener('click', () => uiEvents.handleCopyContent());

        // Forward Modal
        els.btnForwardSend.addEventListener('click', () => uiEvents.handleForwardSend());
        els.btnForwardCancel.addEventListener('click', () => ui.closeForwardModal());
        els.btnForwardClose.addEventListener('click', () => ui.closeForwardModal());
        els.inputForwardDestName.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                els.btnForwardSend.click();
            }
        });
        // "Original Destination" uses each message's own destination, so the
        // shared Name input doesn't apply — disable it with a hint. Switching
        // back to Topic/Queue re-enables it.
        els.inputForwardDestType.addEventListener('change', () => {
            ui.updateForwardNameInputState();
        });

        // Single Delete Event (from row button via EventBus)
        eventBus.on('app:message-delete', ({ id }) => {
            uiEvents.handleDelete(id);
        });

        // Shared disconnect cleanup — used by both state-change and client:disconnected.
        // Any in-flight forward promises are settled by the publisher's `dispose`
        // inside service.ts (called from its own `client:disconnected` listener),
        // which propagates "Client disconnected." into the per-item .then handler
        // in handleForwardSend and updates the modal status to FAILED. No manual
        // forwardQueue sweep is needed here.
        function handleDisconnect() {
            ui.updateVisibility(false, null);
            service.disconnectAll();
            ui.resetUI();
        }

        // 5. State Change Listeners via EventBus
        eventBus.on('app:state-change', ({ key, value }) => {
            if (key === 'isConnected') {
                ui.updateVisibility(value as boolean, appState.selectedVpn);
                if (!value) {
                    handleDisconnect();
                }
            } else if (key === 'selectedVpn') {
                // VPN may change while still connected (e.g. after a reconnect to a different VPN).
                els.hdrVpnName.textContent = (value as string) || '';
            }
        });

        // Client Disconnect (from broker)
        eventBus.on('client:disconnected', () => {
            logger.info('[Browser] Client disconnected, cleaning up...');
            handleDisconnect();
        });

        // 6. Cross-Module: Handle "Browse Queue" from Discovery via EventBus
        eventBus.on('browser:browse-queue', ({ queue: targetQueue }) => {
            logger.info('[Browser] Received browse request:', targetQueue);

            // Switch view to Browser
            if (loadSelf) loadSelf();

            setTimeout(() => {
                els.inputBind.value = targetQueue;
                els.btnBind.click();
            }, 200);
        });

        // 7. Show download buttons when JSZip is available
        function showDownloadButtons() {
            els.btnBrowserDownloadContent.classList.remove('hidden');
            els.btnBrowserDownloadFull.classList.remove('hidden');
        }

        if ((window as any).jszipLoaded) {
            showDownloadButtons();
        }
        eventBus.on('jszip:loaded', showDownloadButtons);

        // 8. Initial Counts
        ui.updateCounts();

        // 9. Announce availability so feature-gated UI in other modules
        // (e.g. Discovery's "Open in Browser" button) can reveal itself.
        // Buffered by the kernel's hold/release until every module has installed,
        // so subscription order doesn't matter.
        eventBus.emit('browser:available');

        logger.info('Queue Browser Module Setup Complete');
    }
};
