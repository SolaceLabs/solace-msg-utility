/**
 * Queue Discovery Module
 *
 * Discovers VPNs and Queues via SEMP API. Depends on the SEMP connection
 * from the Connections module — priority is configured in `src/registry.ts`.
 */

import { createService } from './service.js';
import { ui } from './ui.js';
import { required } from '../../core/dom';
import { logger } from '../../core/logger';
import type { AppContext } from '../../core/types';

export const QueueDiscoveryModule = {
    name: 'Queue Discovery',
    id: 'queue-discovery',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus, setState } = app;

        // Instantiate service with AppContext
        const service = createService(app);

        // Elements — required() throws at install time if any are missing.
        const elWarning = required<HTMLElement>(container, '#discovery-warning');
        const elContent = required<HTMLElement>(container, '#discovery-content');
        const vpnInput = required<HTMLInputElement>(container, '#discovery-vpn-input');
        const vpnList = required<HTMLElement>(container, '#discovery-vpn-list');
        const btnRefreshVpns = required<HTMLButtonElement>(container, '#btn-refresh-vpns');
        const queueInput = required<HTMLInputElement>(container, '#discovery-queue-input');
        const queueList = required<HTMLElement>(container, '#discovery-queue-list');
        const btnRefreshQueues = required<HTMLButtonElement>(container, '#btn-refresh-queues');
        const btnCopy = required<HTMLButtonElement>(container, '#btn-copy-config');

        // State
        let selectedVpn: string | null = null;
        let selectedQueue: string | null = null;
        let currentVpnList: string[] = [];
        let currentQueueList: string[] = [];
        // Session-scoped discovery cache. VPN list is cached once; queue lists
        // are cached per-VPN. A successful Refresh click on either dropdown, or
        // a SEMP disconnect, invalidates the relevant entries (see below).
        let vpnCache: string[] | null = null;
        const queueCache = new Map<string, string[]>();
        // Generation counter for fetchQueues. Each call captures its own gen;
        // if the caller bumps the counter (VPN re-selected while paginating or
        // refresh clicked mid-stream), the old loop bails on the next iteration
        // and abandons its async generator. Protects against stale page data
        // merging into the new VPN's list.
        let fetchQueuesGen = 0;

        // --- Logic ---

        function handleVpnSelect(vpn: string) {
            selectedVpn = vpn;
            vpnInput.value = vpn;
            logger.info(`VPN Selected: ${vpn}`);

            setState('selectedVpn', vpn);

            fetchQueues();
        }

        function handleQueueSelect(queue: string) {
            selectedQueue = queue;
            queueInput.value = queue;
            logger.info(`Queue Selected: ${queue}`);
            btnCopy.disabled = false;
        }

        async function fetchVpns() {
            if (vpnCache) {
                logger.debug('[Discovery] Using cached VPN list');
                currentVpnList = [...vpnCache];
                ui.renderOptions(vpnList, currentVpnList, handleVpnSelect);
                vpnInput.placeholder = 'Select a Message VPN';
                return;
            }
            logger.info('Fetching VPNs...');
            vpnInput.placeholder = 'Loading...';
            currentVpnList = [];

            for await (const page of service.fetchVpns()) {
                if (page.ok) {
                    currentVpnList = [...currentVpnList, ...page.data].sort();
                    ui.renderOptions(vpnList, currentVpnList, handleVpnSelect);
                } else {
                    logger.error('Failed to fetch VPNs', page.error);
                    vpnInput.placeholder = page.error;
                    return;
                }
            }
            vpnCache = [...currentVpnList];
            vpnInput.placeholder = 'Select a Message VPN';
        }

        async function fetchQueues() {
            const myGen = ++fetchQueuesGen;
            const vpn = selectedVpn!;

            queueInput.value = '';
            selectedQueue = null;
            btnCopy.disabled = true;

            // Cache hit: render immediately, skip the network round-trip and the
            // 'Loading...' placeholder. Note the gen counter still bumped above —
            // any in-flight fetch from a prior VPN selection will bail on its
            // next iteration.
            const cached = queueCache.get(vpn);
            if (cached) {
                logger.debug(`[Discovery] Using cached queue list for ${vpn}`);
                currentQueueList = [...cached];
                ui.renderOptions(queueList, currentQueueList, handleQueueSelect);
                if (currentQueueList.length === 0) {
                    queueInput.value = 'No queues in Message VPN';
                    queueInput.disabled = true;
                    queueInput.placeholder = '';
                } else {
                    queueInput.disabled = false;
                    queueInput.placeholder = 'Select a Queue';
                }
                return;
            }

            logger.info(`Fetching Queues for ${vpn}...`);
            queueInput.placeholder = 'Loading...';
            currentQueueList = [];
            ui.renderOptions(queueList, [], handleQueueSelect);

            for await (const page of service.fetchQueues(vpn)) {
                // Bail if a newer fetch has taken over — don't merge stale data
                // into the current list and don't touch the UI.
                if (myGen !== fetchQueuesGen) return;
                if (page.ok) {
                    currentQueueList = [...currentQueueList, ...page.data].sort();
                    // Enable the input as soon as we have any data so the user can
                    // start typing while later pages still stream in. Placeholder
                    // stays on 'Loading...' until the stream exhausts — matches
                    // fetchVpns so a half-loaded list doesn't look finished.
                    queueInput.disabled = false;
                    ui.renderOptions(queueList, currentQueueList, handleQueueSelect);
                } else {
                    logger.error('Failed to fetch Queues', page.error);
                    queueInput.placeholder = page.error;
                    return;
                }
            }
            // Final gen check — if a newer fetch started while we awaited the
            // last page, don't finalise the placeholder or cache-write for the
            // superseded call.
            if (myGen !== fetchQueuesGen) return;

            queueCache.set(vpn, [...currentQueueList]);
            queueInput.placeholder = 'Select a Queue';

            // Empty result after all pages — show "no queues" hint.
            if (currentQueueList.length === 0) {
                queueInput.value = 'No queues in Message VPN';
                queueInput.disabled = true;
            }
        }

        // --- Setup Components ---
        // No closeScope passed → outside-click listener attaches to `document` so
        // clicks anywhere outside the dropdown (sidebar, top-bar, other modules)
        // close it. Container-scoping was tried earlier (see plan item 3.1) to
        // avoid a theoretical re-install leak, but modules only install once per
        // session in this app, so the trade-off was bad UX for no real benefit.
        ui.setupSearchableSelect(vpnInput, vpnList, handleVpnSelect);
        ui.setupSearchableSelect(queueInput, queueList, handleQueueSelect);

        // Initial State
        queueInput.disabled = true;
        ui.updateVisibility(elWarning, elContent, appState.isSempConnected);

        // Initial Fetch if Connected
        if (appState.isSempConnected) {
            fetchVpns();
        }

        // Validation (Blur) logic
        vpnInput.addEventListener('blur', () => {
            setTimeout(() => {
                const val = vpnInput.value;
                if ((val && !currentVpnList.includes(val)) || !val) {
                    if (val) logger.warn('Invalid VPN entered. Clearing.');
                    selectedVpn = null;
                    selectedQueue = null;
                    vpnInput.value = '';
                    ui.clearInputs(null, queueInput, btnCopy);
                }
            }, 150);
        });

        queueInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (queueInput.disabled) return;
                const val = queueInput.value;
                if (val && !currentQueueList.includes(val)) {
                    logger.warn('Invalid queue entered. Clearing.');
                    queueInput.value = '';
                    selectedQueue = null;
                    btnCopy.disabled = true;
                }
            }, 150);
        });

        // Event Listeners
        btnRefreshVpns.addEventListener('click', () => {
            // Explicit refresh — invalidate all cached discovery data, including
            // per-VPN queue lists which may no longer exist if the VPN was renamed
            // or removed on the broker since the last fetch.
            vpnCache = null;
            queueCache.clear();
            selectedVpn = null;
            selectedQueue = null;
            currentVpnList = [];
            currentQueueList = [];
            vpnInput.value = '';
            ui.clearInputs(null, queueInput, btnCopy);
            ui.renderOptions(vpnList, [], handleVpnSelect);
            ui.renderOptions(queueList, [], handleQueueSelect);
            fetchVpns();
        });

        btnRefreshQueues.addEventListener('click', () => {
            if (!selectedVpn) return;
            // Scoped refresh — only invalidate this VPN's queue cache so other
            // VPNs' caches stay warm.
            queueCache.delete(selectedVpn);
            selectedQueue = null;
            currentQueueList = [];
            queueInput.value = '';
            btnCopy.disabled = true;
            ui.renderOptions(queueList, [], handleQueueSelect);
            fetchQueues();
        });

        btnCopy.addEventListener('click', () => {
            if (selectedVpn && selectedQueue) {
                logger.info(`[Discovery] Requesting Open in Browser: VPN=${selectedVpn}, Queue=${selectedQueue}`);
                eventBus.emit('connection:check-connection', { vpn: selectedVpn, queue: selectedQueue });
            } else {
                alert('Please select a VPN and Queue first.');
            }
        });

        // Enter Key Support
        vpnInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btnRefreshVpns.click(); } });
        queueInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btnRefreshQueues.click(); } });

        // Reveal "Open in Browser" only if the queue-browser module is installed.
        // The kernel buffers install-phase emits via hold/release, so subscribing
        // here and emitting from queue-browser is race-free regardless of the
        // install order configured in `src/registry.ts`.
        eventBus.on('browser:available', () => {
            btnCopy.classList.remove('hidden');
        });

        // Global State Listener via EventBus
        eventBus.on('app:state-change', ({ key, value }) => {
            if (key === 'isSempConnected') {
                const isConnected = value as boolean;
                ui.updateVisibility(elWarning, elContent, isConnected);
                if (isConnected) {
                    fetchVpns();
                } else {
                    // SEMP disconnect invalidates the discovery cache — on
                    // reconnect the user might point at a different broker, or
                    // the same broker after a VPN/queue topology change.
                    vpnCache = null;
                    queueCache.clear();
                    selectedVpn = null;
                    selectedQueue = null;
                    vpnInput.value = '';
                    ui.clearInputs(null, queueInput, btnCopy);
                }
            }
        });

        logger.info('Queue Discovery Module Setup Complete');
    }
};
