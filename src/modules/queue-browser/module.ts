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
import { showPayload } from './features.js';
import { required, attachBackdropClose } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import type { AppContext } from '../../core/types';

export const QueueBrowserModule = {
    name: 'Queue Browser',
    id: 'queue-browser',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus, loadSelf } = app;

        // No-payload flavor: strip every payload-bearing element from the DOM up-front,
        // before initElements caches them, so the message body can never be displayed.
        // Pairs with the body never being decoded onto state (service-events.ts) and the
        // payload actions never being wired (below). See features.ts.
        if (!showPayload()) {
            container.querySelectorAll('[data-payload]').forEach(el => el.remove());
        }

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
        const requiredSelectors = [
            '#browser-active-view',
            '#browser-vpn-name', '#browser-queue-name', '#browser-permissions',
            '#browser-connect-error', '#browser-bind-error',
            '#browser-bind-input', '#btn-browser-bind-pick', '#btn-browser-bind', '#btn-browser-unbind',
            '#browser-bound-queues',
            '#btn-browser-filter', '#browser-filter-modal',
            '#btn-filter-clear', '#btn-filter-cancel', '#btn-add-prop-filter',
            '#filter-msg-id', '#filter-msg-type',
            '#filter-destination', '#filter-destination-type',
            '#filter-properties-rows',
            '#browser-select-all', '#browser-msg-list',
            '#count-total', '#count-displayed', '#count-selected',
            '#btn-browser-forward', '#btn-browser-delete',
            '#detail-msg-id', '#detail-destination',
            '#detail-type-badge', '#detail-dest-badge', '#detail-repl-msg-id',
            '#detail-properties-container', '#detail-app-properties-container',
            '#btn-copy-dest', '#btn-copy-repl-msg-id',
            '#btn-forward-send', '#btn-forward-cancel', '#btn-forward-close',
            '#forward-dest-name', '#forward-dest-type',
            '#forward-error', '#forward-msg-list', '#forward-queue-count'
        ];
        // Payload-bearing elements (Content Preview, Show Raw + modal, Download
        // Content/Full, Body filter) exist only in the show-payload flavor — they were
        // removed from the DOM above in the no-payload flavor, so assert them only when present.
        if (showPayload()) {
            requiredSelectors.push(
                '#filter-content',
                '#btn-browser-download-content', '#btn-browser-download-full',
                '#btn-copy-content', '#detail-content',
                '#btn-show-raw', '#btn-raw-close', '#browser-raw-content-modal', '#raw-content-text'
            );
        }
        requiredSelectors.forEach(selector => required(container, selector));

        // The connection-required gate is owned by the shared module-gate
        // component; hand it to the ui layer so updateVisibility can toggle it
        // (the module still owns gate-vs-active-view mutual exclusion).
        ui.setGate(createGate(container, {
            id: 'browser-connect-prompt',
            title: 'Connection Required',
            message: 'Please establish a Solace Client connection to browse queues.',
        }));

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
        // Raw modal exists only in the show-payload flavor.
        if (showPayload()) attachBackdropClose(els.modalRaw as HTMLDialogElement);

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

        // Payload-only bulk/copy actions — buttons removed in the no-payload flavor.
        if (showPayload()) {
            els.btnBrowserDownloadContent.addEventListener('click', () => uiEvents.handleBulkDownloadContent());
            els.btnBrowserDownloadFull.addEventListener('click', () => uiEvents.handleBulkDownloadFull());
            els.btnCopyContent.addEventListener('click', () => uiEvents.handleCopyContent());
        }

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

        // 7. Show download buttons when JSZip is available. Payload flavor only —
        // the no-payload flavor removed these buttons and never exports the body.
        if (showPayload()) {
            const showDownloadButtons = () => {
                els.btnBrowserDownloadContent.classList.remove('hidden');
                els.btnBrowserDownloadFull.classList.remove('hidden');
            };
            if ((window as any).jszipLoaded) {
                showDownloadButtons();
            }
            eventBus.on('jszip:loaded', showDownloadButtons);
        }

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
