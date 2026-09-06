/**
 * Queue Copy Module
 *
 * Two-column form:
 *   - Source (left): Broker / SEMP / Client cards mirroring the live primary
 *     connection (read-only); Source Queue is editable; an "Edit in
 *     Connections" button jumps to the connections module for credential
 *     changes.
 *   - Destination (right): Broker (with Same-broker / Same-VPN toggles), SEMP,
 *     Client, Destination target (queue/topic + mode).
 *
 * The modal Confirm Queue Copy verifies the source via SEMP v1 (with a
 * QueueBrowser-accumulate fallback) and then runs the copy/move engine.
 *
 * Priority 20: below queue-browser (30) so it appears beneath it in the
 * sidebar. Depends on the primary connection from the connections module.
 */

import {
    cacheElements,
    applyDestPrefill,
    applyDestType,
    applySourceReadonly,
    setSourcePickVisible,
    setDestPickVisible as ui_setDestPickVisible,
    setStartEnabled,
    setDestSempStatus,
    setDestSempError,
    setDestSolStatus,
    setDestSolError,
    setDestSempFormLocked,
    setDestSolFormLocked,
    setDestBrokerLocked,
} from './ui';
import type { PrimarySnapshot } from './ui';
import { wireUiEvents } from './ui-events';
import { createInitialState, syncDestFormFromSnapshot } from './state';
import {
    createServiceSolace,
    type SolaceConnectionHooks,
} from '../../core/services/solace-client';
import {
    createServiceSemp,
    type SempConnectionHooks,
} from '../../core/services/semp-client';
import { createSolacePublisher } from '../../core/services/solace-publisher';
import { createGate } from '../../core/components/module-gate';
import { logger } from '../../core/logger';
import { isQueueVisible, canOperate } from '../../core/rbac';
import { errMessage } from '../../core/utils';
import type { AppContext, SempConfig, SolaceConfig } from '../../core/types';

export const QueueCopyModule = {
    name: 'Queue Copy',
    id: 'queue-copy',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus, loadSelf } = app;

        const state = createInitialState();
        const els = cacheElements(container);

        // Connection-required gate (created by the shared component) vs the
        // content panel — the module owns the mutual exclusion.
        const gate = createGate(container, {
            id: 'copy-warning',
            title: 'Connection Required',
            message: 'Please establish a primary Solace connection before copying messages.',
        });
        function setPrimaryConnected(isConnected: boolean): void {
            if (isConnected) {
                gate.hide();
                els.content.classList.remove('hidden');
            } else {
                gate.show();
                els.content.classList.add('hidden');
            }
        }

        // Track the primary session so toggle-prefill and modal Start can
        // read broker/VPN/user details live.
        let primarySession: any = null;

        /**
         * Pull a snapshot of the primary connection. Used for both
         * (a) populating the read-only source cards and
         * (b) prefilling disabled destination fields when toggles are on.
         * Returns null only when neither Solace nor SEMP is connected.
         */
        function getPrimarySnapshot(): PrimarySnapshot | null {
            const sol = appState.solaceConnection;
            const sempCreds = appState.sempCredentials;
            if (!sol && !sempCreds) return null;

            const snap: PrimarySnapshot = {
                host: sol?.host ?? '',
                solace: {
                    protocol: sol?.protocol ?? 'wss',
                    port: sol?.port ?? '',
                    urlPath: sol?.urlPath ?? '',
                    vpn: sol?.vpn ?? (appState.selectedVpn ?? ''),
                    user: sol?.user ?? '',
                    pass: sol?.pass ?? '',
                },
                semp: { protocol: 'https', port: '', urlPath: '', user: '', pass: '' },
            };

            if (sempCreds) {
                // Read the structured fields the connections module captured
                // at Connect time — these always reflect what the user typed,
                // regardless of hosted-mode URL rewriting on `baseUrl`.
                if (!snap.host) snap.host = sempCreds.host;
                snap.semp.protocol = sempCreds.protocol;
                snap.semp.port = sempCreds.port;
                snap.semp.urlPath = sempCreds.urlPath;
                snap.semp.user = sempCreds.user;
                snap.semp.pass = sempCreds.pass;
            }

            return snap;
        }

        /** Re-apply both the source readonly mirror AND the destination prefill
         *  whenever the primary connection state changes. Also re-derives the
         *  Next-button + dest-picker gates because primary connection state
         *  feeds into them (Same-VPN reuse path / Same-broker SEMP path). */
        function refreshFromPrimary(): void {
            const snap = getPrimarySnapshot();
            applySourceReadonly(els, snap);
            applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, snap);
            // Mirror prefilled DOM values into state so a later "uncheck Same
            // broker → click Connect without retyping" sends the right host
            // and credentials to the dest factories.
            syncDestFormFromSnapshot(state, snap);
            refreshStartEnabled();
            refreshDestPickVisible();
        }

        // -------- Destination connect factories --------
        // Pure factories from core/services with module-scoped bridging hooks.
        // Effects land in `state` and module-owned UI — never AppState, never
        // the global bus. Mirrors the connections module's primary bridging.
        const destSolHooks: SolaceConnectionHooks = {
            onConnected: (session, vpn) => {
                state.destSession = session;
                state.destPublisher = createSolacePublisher(session);
                setDestSolStatus(els, 'connected', vpn);
                setDestSolError(els, null);
                setDestSolFormLocked(els, true);
                setDestBrokerLocked(els, true);
                refreshStartEnabled();
                refreshDestPickVisible();
            },
            onDisconnected: () => {
                state.destPublisher?.dispose('Destination disconnected');
                state.destPublisher = null;
                state.destSession = null;
                setDestSolStatus(els, 'disconnected');
                setDestSolFormLocked(els, false);
                // Re-derive broker-host lock from toggle state — Same-broker
                // dictates whether the host stays locked even with no live
                // dest connection.
                applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, getPrimarySnapshot());
                refreshStartEnabled();
                refreshDestPickVisible();
            },
            onConnectFailed: ({ infoStr }) => {
                setDestSolStatus(els, 'disconnected');
                setDestSolError(els, `Connection failed: ${infoStr}`);
            },
            onError: (err) => {
                setDestSolStatus(els, 'disconnected');
                setDestSolError(els, err.message);
            },
        };

        const destSempHooks: SempConnectionHooks = {
            onConnected: (sempCtx) => {
                state.destSempCtx = sempCtx;
                setDestSempStatus(els, 'connected');
                setDestSempError(els, null);
                setDestSempFormLocked(els, true);
                setDestBrokerLocked(els, true);
                refreshDestPickVisible();
            },
            onDisconnected: () => {
                state.destSempCtx = null;
                setDestSempStatus(els, 'disconnected');
                setDestSempFormLocked(els, false);
                applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, getPrimarySnapshot());
                refreshDestPickVisible();
            },
            onAuthFailed: () => {
                setDestSempStatus(els, 'disconnected');
                setDestSempError(els, 'SEMP authentication failed (401).');
            },
            onError: ({ message }) => {
                setDestSempStatus(els, 'disconnected');
                setDestSempError(els, `SEMP error: ${message}`);
            },
        };

        const destSolClient = createServiceSolace(destSolHooks);
        const destSempClient = createServiceSemp(destSempHooks);

        function connectDestSemp(): void {
            const f = state.destForm;
            setDestSempStatus(els, 'connecting');
            setDestSempError(els, null);
            if (f.credMode === 'provisioned') {
                // The core store owns the credential: it unpacks just-in-time and
                // dials with a password this module never sees. Effects still land
                // only in module-local state via destSempHooks (Anchor 4).
                void app.managedStore
                    .connect({ broker: f.provisioned.broker, kind: 'semp' }, {
                        connect: async (c) => { await destSempClient.connect(c.cfg, c.host, c.pass); },
                    })
                    .catch((e) => {
                        setDestSempStatus(els, 'disconnected');
                        setDestSempError(els, errMessage(e));
                    });
                return;
            }
            const cfg: SempConfig = {
                protocol: f.semp.protocol,
                port: f.semp.port,
                urlPath: f.semp.urlPath,
                user: f.semp.user,
            };
            void destSempClient.connect(cfg, f.host, state.destSempPass);
        }

        function connectDestSol(): void {
            const f = state.destForm;
            if (f.credMode === 'provisioned') {
                destSolClient.init();
                setDestSolStatus(els, 'connecting');
                setDestSolError(els, null);
                // The store also owns connection identity here, so the clientName
                // it composes always matches the clientNameId inside its cfg.
                void app.managedStore
                    .connect({ broker: f.provisioned.broker, vpn: f.provisioned.vpn, kind: 'solace' }, {
                        connect: (c) => { destSolClient.connect(c.cfg, c.host, c.pass, c.clientName); },
                    })
                    .catch((e) => {
                        setDestSolStatus(els, 'disconnected');
                        setDestSolError(els, errMessage(e));
                    });
                return;
            }
            const cfg: SolaceConfig = {
                protocol: f.solace.protocol,
                port: f.solace.port,
                urlPath: f.solace.urlPath,
                vpn: f.solace.vpn,
                user: f.solace.user,
                authMode: 'basic',
                connectRetries: 0,
                connectTimeout: 3000,
                reconnectRetries: 1,
                reconnectWait: 3000,
                maxMessagesPerQueue: 100,
                // Dest connect() takes its clientName as a separate 4th arg and
                // never reads cfg.clientNameId, so this satisfies the required
                // SolaceConfig field without affecting the dest connection.
                clientNameId: '',
            };
            destSolClient.init();
            setDestSolStatus(els, 'connecting');
            setDestSolError(els, null);
            destSolClient.connect(cfg, f.host, state.destSolacePass);
        }

        // Disconnect path: button reads as "Disconnect" once connected, so the
        // same button triggers either connect or disconnect depending on the
        // active state. We dispatch from the click handler in ui-events.
        function disconnectDestSemp(): void { void destSempClient.disconnect(); }
        function disconnectDestSol(): void { destSolClient.disconnect(); }

        // -------- Cross-cutting gate refreshers --------
        // Both Next-button enablement and destination-picker visibility depend
        // on (state ⊕ live secondary connections), so they're owned here where
        // the connection lifecycle hooks fire. ui-events.ts also calls these
        // through `services` whenever a form input changes.
        function refreshStartEnabled(): void {
            // Dest Client connection must be ready: either we're reusing the
            // primary (sameVpn implies sameBroker) or we have an explicit
            // dest Solace session. Dest SEMP is NOT gated here — it's only
            // needed for the destination queue picker, not at copy time.
            const destReady = state.destForm.sameVpn || state.destSession !== null;
            const ok = !!state.sourceQueue && !!state.dest.name && destReady;
            setStartEnabled(els, ok);
        }

        function refreshDestPickVisible(): void {
            // Topic destinations have no broker-side list — picker stays hidden.
            if (state.dest.type === 'topic') {
                ui_setDestPickVisible(els, false);
                return;
            }
            // Visible whenever a SempContext is resolvable for the destination:
            //   - sameBroker → primary SEMP (when connected)
            //   - cross-broker → state.destSempCtx (when user has connected dest SEMP)
            const sempReady = state.destForm.sameBroker
                ? appState.isSempConnected
                : state.destSempCtx !== null;
            ui_setDestPickVisible(els, sempReady);
        }

        // -------- Initial UI state --------
        applyDestType(els, state.dest.type);
        setPrimaryConnected(appState.isConnected);
        setSourcePickVisible(els, appState.isSempConnected);
        // refreshFromPrimary computes both Next-button + dest-picker gates from
        // current state, so no explicit initial-disabled call is needed.
        refreshFromPrimary();

        wireUiEvents(app, els, state, {
            getPrimarySnapshot,
            getPrimarySession: () => primarySession,
            connectDestSemp,
            disconnectDestSemp,
            connectDestSol,
            disconnectDestSol,
            refreshStartEnabled,
            refreshDestPickVisible,
        });

        // "Edit in Connections" navigates the user to the connections form.
        // The connections module owns the navigation (loadSelf into itself);
        // emitting the bus event keeps this module unaware of the connections
        // module's internals. One Edit button lives in each source card
        // header (Broker / SEMP / Client) — they all do the same thing.
        els.sourceEditButtons.forEach((btn) => {
            btn.addEventListener('click', () => eventBus.emit('connection:edit-requested'));
        });

        // -------- Bus listeners --------
        eventBus.on('client:connected', ({ session }) => {
            primarySession = session;
            // Each module that publishes builds its own publisher tied to
            // this session — queue-browser does the same. Two publishers on
            // one session coexist cleanly: each resolves only entries from
            // its own pending map.
            state.primaryPublisher?.dispose();
            state.primaryPublisher = createSolacePublisher(session);
            setPrimaryConnected(true);
            refreshFromPrimary();
        });

        eventBus.on('client:disconnected', () => {
            primarySession = null;
            state.primaryPublisher?.dispose('Primary disconnected');
            state.primaryPublisher = null;
            setPrimaryConnected(false);
            refreshFromPrimary();
        });

        eventBus.on('semp:connected', () => {
            setSourcePickVisible(els, true);
            refreshFromPrimary();
            refreshDestPickVisible();
        });

        eventBus.on('semp:disconnected', () => {
            setSourcePickVisible(els, false);
            refreshFromPrimary();
            refreshDestPickVisible();
        });

        // After the connections module switches the primary VPN at queue-copy's
        // request, navigate back here and write the picked source queue name
        // into the input. The source picker emitted connection:check-connection
        // with returnTo='queue-copy', and connections fired this event once
        // the new VPN was UP.
        /**
         * Entitlements changed underneath us (login / Refresh / logout / the
         * Direct-connect interlock).
         *
         * An active run halts through the engine's ordinary halt path — the same
         * one the Cancel button uses. The treatment is identical (stop consuming,
         * drain in-flight publishes, settle once), so it deliberately reports as
         * `cancelled`: `rbac:changed` only ever fires as a result of something the
         * user just did, so there is nothing to disambiguate for them. The reason
         * is logged here, which is where diagnosis belongs.
         */
        eventBus.on('rbac:changed', () => {
            const session = appState.managed ?? null;
            const vpn = appState.selectedVpn ?? '';
            const broker = session?.broker ?? '';

            const destProvisioned = state.destForm.credMode === 'provisioned';
            const destStillProvisioned = !destProvisioned || app.managedStore
                .vpnsFor(state.destForm.provisioned.broker)
                .includes(state.destForm.provisioned.vpn);

            if (state.job && !state.job.cancelRequested) {
                // Move is the forcing case: without this a run keeps DELETING from
                // a queue the user was just denied operate on.
                const sourceGone = !isQueueVisible(session, broker, vpn, state.sourceQueue);
                const moveDenied = state.mode === 'move'
                    && !canOperate(session, broker, vpn, state.sourceQueue);
                if (sourceGone || moveDenied || !destStillProvisioned) {
                    logger.warn('[QueueCopy] halting run — the entitlement backing an endpoint was revoked');
                    state.job.cancelRequested = true;
                }
            }

            // Teardown applies to the DESTINATION only: it is this module's own
            // secondary connection. The source rides the app-wide primary, which
            // the connections module owns — revoking one queue must never
            // disconnect that session.
            //
            // Deferred while a run is settling: killing the dest session mid-drain
            // would fail in-flight publishes and misreport the outcome. A stale
            // connection is hygiene, not a control — the run-start gate re-checks
            // entitlement before anything is published — so it is dropped on the
            // next refresh instead.
            if (!destStillProvisioned && !state.job) {
                disconnectDestSemp();
                disconnectDestSol();
            }
        });

        eventBus.on('copy:vpn-switched', ({ queue }) => {
            if (loadSelf) loadSelf();
            state.sourceQueue = queue;
            els.sourceInput.value = queue;
            refreshStartEnabled();
        });

        logger.info('Queue Copy Module Setup Complete');
    }
};
