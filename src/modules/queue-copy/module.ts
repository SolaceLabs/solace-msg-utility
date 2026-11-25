/**
 * Queue Copy Module
 *
 * Two-column form:
 *   - Source (left): Broker / SEMP / Client cards mirroring the live primary
 *     connection (read-only); Source Queue is editable; an "Edit in
 *     Connections" button jumps to the connections module for credential
 *     changes. A Provisioned primary shows one read-only connection card
 *     (its Broker and Message VPN) in place of the three.
 *   - Destination (right): Broker (with the Copy to button), SEMP,
 *     Client, Destination target (queue/topic + mode). The destination
 *     follows the primary connection's mode: a Direct primary keeps the typed
 *     Broker host, SEMP and Client cards; a Provisioned primary replaces them
 *     with one provisioned connection card (Broker + Message VPN pickers, one
 *     Connect). That Connect runs the shared sequence of
 *     src/core/services/provisioned-connect.ts: SEMP through the gateway relay
 *     first (skipped when the destination is the primary's own broker, whose
 *     SEMP it uses), then the client credential and the messaging session,
 *     connected only when both are up.
 *
 * The modal Confirm Queue Copy verifies the source via SEMP v1 (with a
 * QueueBrowser-accumulate fallback) and then runs the copy/move engine.
 *
 * Depends on the primary connection from the connections module.
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
    setDestNameError,
    setDestTargetLocked,
} from './ui';
import type { PrimarySnapshot } from './ui';
import { wireUiEvents } from './ui-events';
import { destNameProblem } from './service';
import { createInitialState, syncDestFormFromSnapshot, destTargetKey, destMessagingHost, destLive } from './state';
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
import type { ProvisionedStatus, ProvisionedTarget } from '../../core/components/provisioned-connection';
import { logger } from '../../core/logger';
import { isHostedDeployment, limitSchemeOptions } from '../../core/hosted';
import { isQueueVisible, canOperate } from '../../core/rbac';
import { errMessage, sempAccountError, clientUsernameError } from '../../core/utils';
import { isSessionEnded } from '../../core/services/managed-profile';
import { connectProvisioned, gatewayCodeOf, outcomeDetails, outcomeLines, type StepResult } from '../../core/services/provisioned-connect';
import { managedErrorMessage } from '../../core/services/managed-api';
import { DEFAULT_MAX_MESSAGES_PER_QUEUE, DESTINATION_SDK_CONNECT } from '../../core/connections/defaults';
import type { AppContext, SempConfig, SempContext, SolaceConfig } from '../../core/types';

export const QueueCopyModule = {
    name: 'Queue Copy',
    id: 'queue-copy',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus, loadSelf } = app;

        const state = createInitialState();
        const els = cacheElements(container);
        // Without the gateway, an https page cannot open ws:// or http://. The
        // source fields mirror the primary connection and keep its scheme. The
        // /hosted verdict has one home, AppState.connConfig (set by the
        // connections module before this install runs); the destination
        // configs carry it so the services route through the gateway.
        const hosted = isHostedDeployment(appState);
        limitSchemeOptions(els.destSempProtocol, hosted);
        limitSchemeOptions(els.destSolProtocol, hosted);

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
         * (b) prefilling the destination fields the Copy to choice locks.
         * Returns null only when neither Solace nor SEMP is connected.
         */
        function getPrimarySnapshot(): PrimarySnapshot | null {
            const sol = appState.solaceConnection;
            const sempCreds = appState.sempCredentials;
            if (!sol && !sempCreds) return null;

            // The SEMP host names the broker. An appliance is a messaging
            // session that says so, or one on another host than SEMP.
            const solHost = sol?.host ?? '';
            const host = sempCreds?.host ?? solHost;
            const snap: PrimarySnapshot = {
                host,
                ...(sol && (sol.appliance || solHost !== host) ? { messagingHost: solHost } : {}),
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
         *  feeds into them (the same-VPN reuse path / the same-broker SEMP path). */
        function refreshFromPrimary(): void {
            const snap = getPrimarySnapshot();
            applySourceReadonly(els, snap);
            applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, snap, destLive(state));
            // Mirror prefilled DOM values into state so a later "uncheck Same
            // broker → click Connect without retyping" sends the right host
            // and credentials to the dest factories.
            syncDestFormFromSnapshot(state, snap);
            refreshStartEnabled();
            refreshDestPickVisible();
        }

        // -------- Provisioned destination card --------
        // The card shows where a provisioned destination connect stands. These
        // helpers mirror the Client / SEMP hooks into it; they do nothing for a
        // Direct primary (credMode 'manual'), whose rows report themselves.
        function provDetail(): string {
            const t = state.destForm.provisioned;
            return `Broker "${t.broker}", VPN "${t.vpn}"`;
        }
        // While a provisioned Connect runs its sequence, the hooks hand each
        // side to the step that opened it (held, not installed) instead of
        // installing it.
        let provSempStep: { result: StepResult | null; hold: (ctx: SempContext) => void } | null = null;
        // `started` turns true once this run's SDK session exists: before that,
        // a DISCONNECTED can only come from an earlier session and must not
        // settle this run.
        let provMessagingStep: {
            settle: (r: StepResult) => void;
            hold: (s: { session: any; vpn: string }) => void;
            started: boolean;
        } | null = null;
        /** Bumped by every provisioned Connect: a run that is no longer the latest was cancelled or overtaken. */
        let provRun = 0;
        function settleProvMessaging(r: StepResult, fromSdk = true): boolean {
            if (!provMessagingStep || (fromSdk && !provMessagingStep.started)) return false;
            const step = provMessagingStep;
            provMessagingStep = null;
            step.settle(r);
            return true;
        }
        function mirrorProv(status: ProvisionedStatus, detail?: string): void {
            if (state.destForm.credMode !== 'provisioned') return;
            destUi.destCard.setStatus(status, detail);
        }

        // -------- Destination connect factories --------
        // Pure factories from core/services with module-scoped bridging hooks.
        // Effects land in `state` and module-owned UI — never AppState, never
        // the global bus. Mirrors the connections module's primary bridging.
        /**
         * Install a destination session for the target its connect was started
         * for, if the form still names it. A connect is a dial plus the SDK
         * handshake, long enough for the target to move or the connect to be
         * cancelled; a late session is dropped, never handed to the engine.
         */
        function installDestSession(session: any, vpn: string, target: string | null): boolean {
            if (target === null || target !== destTargetKey(state.destForm)) {
                logger.warn(`[QueueCopy] discarding the destination session for VPN "${vpn}": the destination changed while it connected`);
                destSolClient.disconnect();
                setDestSolStatus(els, 'disconnected');
                setDestSolError(els, 'The destination changed while connecting. Connect again.');
                mirrorProv('error', 'The destination changed while connecting. Connect again.');
                destUi.refreshDestTarget();
                return false;
            }
            state.destSession = session;
            state.destSessionTarget = target;
            state.destPublisher = createSolacePublisher(session);
            setDestSolStatus(els, 'connected', vpn);
            setDestSolError(els, null);
            mirrorProv('connected', provDetail());
            destUi.refreshDestTarget();
            setDestSolFormLocked(els, true);
            setDestBrokerLocked(els, state.destForm.sameBroker, destLive(state));
            refreshStartEnabled();
            refreshDestPickVisible();
            return true;
        }

        const destSolHooks: SolaceConnectionHooks = {
            onConnected: (session, vpn) => {
                if (provMessagingStep?.started) {
                    const step = provMessagingStep;
                    provMessagingStep = null;
                    step.hold({ session, vpn });
                    step.settle({ ok: true });
                    return;
                }
                const target = state.destSolPending;
                state.destSolPending = null;
                installDestSession(session, vpn, target);
            },
            onDisconnected: () => {
                if (settleProvMessaging({ ok: false, reason: 'The messaging session closed before it was up.' })) return;
                const wasInstalled = state.destSession !== null;
                // A provisioned session that was only held (a run closing what
                // it will not use) was never installed: nothing to undo, a
                // failed run's reasons stay on the card, and a newer run in
                // flight keeps its lock and its card.
                if (!wasInstalled && state.destForm.credMode === 'provisioned') return;
                state.destPublisher?.dispose('Destination disconnected');
                state.destPublisher = null;
                state.destSession = null;
                state.destSessionTarget = null;
                // A connect in flight ends here too: its SDK session is gone.
                state.destSolPending = null;
                setDestSolStatus(els, 'disconnected');
                mirrorProv('disconnected');
                setDestSolFormLocked(els, false);
                // Re-derive the locks from the Copy to choice and from what is
                // still up: the source's broker keeps its hosts locked with no
                // destination connection at all, and a destination SEMP that is
                // still up keeps its own card and host locked.
                applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, getPrimarySnapshot(), destLive(state));
                destUi.refreshDestTarget();
                refreshStartEnabled();
                refreshDestPickVisible();
                // A provisioned destination is one connection: its messaging
                // session gone takes its SEMP with it.
                if (wasInstalled && state.destForm.credMode === 'provisioned' && state.destSempCtx) disconnectDestSemp();
            },
            onConnectFailed: ({ infoStr }) => {
                if (settleProvMessaging({ ok: false, reason: `Connection failed: ${infoStr}` })) return;
                state.destSolPending = null;
                setDestSolStatus(els, 'disconnected');
                setDestSolError(els, `Connection failed: ${infoStr}`);
                mirrorProv('error', `Connection failed: ${infoStr}`);
                destUi.refreshDestTarget();
            },
            onError: (err) => {
                if (settleProvMessaging({ ok: false, reason: err.message })) return;
                state.destSolPending = null;
                setDestSolStatus(els, 'disconnected');
                setDestSolError(els, err.message);
                mirrorProv('error', err.message);
                destUi.refreshDestTarget();
            },
        };

        function installDestSemp(sempCtx: SempContext): void {
            state.destSempCtx = sempCtx;
            setDestSempStatus(els, 'connected');
            setDestSempError(els, null);
            setDestSempFormLocked(els, true);
            setDestBrokerLocked(els, state.destForm.sameBroker, destLive(state));
            refreshDestPickVisible();
        }

        const destSempHooks: SempConnectionHooks = {
            onConnected: (sempCtx) => {
                if (provSempStep) {
                    provSempStep.hold(sempCtx);
                    provSempStep.result = { ok: true };
                    return;
                }
                installDestSemp(sempCtx);
            },
            onDisconnected: () => {
                state.destSempCtx = null;
                setDestSempStatus(els, 'disconnected');
                setDestSempFormLocked(els, false);
                applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, getPrimarySnapshot(), destLive(state));
                refreshDestPickVisible();
            },
            onAuthFailed: () => {
                setDestSempStatus(els, 'disconnected');
                if (state.destForm.credMode === 'provisioned') {
                    // The gateway's relay answers 401 only when its session has
                    // ended: the sequence (or, later, this hook) asks the
                    // session owner to sign out.
                    const ended = managedErrorMessage({ ok: false, status: 401, code: 'unauthenticated' });
                    if (provSempStep) {
                        provSempStep.result = { ok: false, reason: ended, code: 'unauthenticated', stop: 'session-ended' };
                        return;
                    }
                    setDestSempError(els, ended);
                    eventBus.emit('rbac:sign-out-requested');
                    return;
                }
                setDestSempError(els, 'SEMP authentication failed (401).');
            },
            onError: ({ message, code, isTimeout }) => {
                if (provSempStep) {
                    provSempStep.result = { ok: false, reason: message, code, timeout: isTimeout };
                    return;
                }
                setDestSempStatus(els, 'disconnected');
                setDestSempError(els, `SEMP error: ${message}`);
            },
        };

        const destSolClient = createServiceSolace(destSolHooks);
        const destSempClient = createServiceSemp(destSempHooks);

        function connectDestSemp(): void {
            const f = state.destForm;
            // The broker's SEMP account rules, as the connections form applies
            // them: a credential outside them is refused here, before btoa
            // sees it and before any request is sent.
            const account = sempAccountError(f.semp.user, state.destSempPass);
            if (account) {
                setDestSempError(els, account.message);
                return;
            }
            setDestSempStatus(els, 'connecting');
            setDestSempError(els, null);
            const cfg: SempConfig = {
                protocol: f.semp.protocol,
                port: f.semp.port,
                urlPath: f.semp.urlPath,
                user: f.semp.user,
                hosted,
            };
            void destSempClient.connect(cfg, f.host, state.destSempPass);
        }

        function connectDestSol(): void {
            const f = state.destForm;
            // A client username the broker refuses, as the connections form
            // refuses it: here, with the reason, before any connect.
            const userProblem = clientUsernameError(f.solace.user);
            if (userProblem) {
                setDestSolError(els, userProblem);
                return;
            }
            // The destination this connect is for: onConnected installs the
            // session only if the form still names it, and the controls that
            // choose it stay locked until the connect ends.
            state.destSolPending = destTargetKey(f);
            setDestTargetLocked(els, true);
            destUi.destCard.lock(true);
            const cfg: SolaceConfig = {
                protocol: f.solace.protocol,
                port: f.solace.port,
                urlPath: f.solace.urlPath,
                vpn: f.solace.vpn,
                user: f.solace.user,
                authMode: 'basic',
                ...DESTINATION_SDK_CONNECT,
                maxMessagesPerQueue: DEFAULT_MAX_MESSAGES_PER_QUEUE,
                hosted,
                // Dest connect() takes its clientName as a separate 4th arg and
                // never reads cfg.clientNameId, so this satisfies the required
                // SolaceConfig field without affecting the dest connection.
                clientNameId: '',
            };
            destSolClient.init();
            setDestSolStatus(els, 'connecting');
            setDestSolError(els, null);
            destSolClient.connect(cfg, destMessagingHost(f), state.destSolacePass);
        }

        /**
         * The card's Connect. The card has shown "Connecting" and locked its
         * pickers by now; this records the chosen names (the form's destination
         * from here on) and runs the shared sequence: SEMP through the relay
         * when the broker is not the primary's, then the client credential and
         * the messaging session. Both sides are held until both are up, then
         * installed together; otherwise the one that came up is closed again
         * and the card names each failure. The dials hand their credential to
         * the SDK inside the callback and keep nothing.
         */
        function connectDestProvisioned(target: ProvisionedTarget): void {
            state.destForm.provisioned = { broker: target.broker, vpn: target.vpn };
            void runDestProvisioned(target);
        }

        async function runDestProvisioned(target: ProvisionedTarget): Promise<void> {
            const f = state.destForm;
            const key = destTargetKey(f);
            const run = ++provRun;
            // Still this run's connect: not cancelled by a Disconnect (which
            // clears destSolPending) and not overtaken by a newer Connect.
            const current = (): boolean => run === provRun && state.destSolPending === key;
            // The target stays locked while the connect runs (renderDestMode
            // reads destSolPending); a Disconnect meanwhile clears it.
            state.destSolPending = key;
            setDestTargetLocked(els, true);
            destUi.destCard.lock(true);
            // What each step holds until the outcome is known.
            const held: { ctx: SempContext | null; session: { session: any; vpn: string } | null } = { ctx: null, session: null };
            const outcome = await connectProvisioned({
                semp: f.sameBroker ? undefined : () => openDestSemp(target.broker, ctx => { held.ctx = ctx; }),
                // A run cancelled during its SEMP step dials no credential.
                messaging: () => current()
                    ? openDestMessaging(target, s => { held.session = s; })
                    : Promise.resolve<StepResult>({ ok: false, reason: 'The connect was cancelled.' }),
                dropSemp: () => { held.ctx = null; },
                dropMessaging: () => { held.session = null; destSolClient.disconnect(); },
                onStep: (part) => current() && destUi.destCard.setStatus('connecting', part === 'semp'
                    ? `Connecting SEMP (management) to broker "${target.broker}"...`
                    : `Connecting messaging (client) to broker "${target.broker}", VPN "${target.vpn}"...`),
            });
            // Cancelled or overtaken while it ran: the card already says where
            // things stand; only a session this run still holds is closed.
            if (!current()) {
                // Close a session this run still holds, unless a newer run has
                // started its own: the client's new session replaced this one.
                const newerStarted = run !== provRun && (provMessagingStep?.started === true || state.destSession !== null);
                if (held.session && !newerStarted) destSolClient.disconnect();
                return;
            }
            state.destSolPending = null;
            if (outcome.ok) {
                // Both halves are held on success; SEMP only when the step ran.
                const session = held.session as { session: any; vpn: string };
                if (held.ctx) installDestSemp(held.ctx);
                if (!installDestSession(session.session, session.vpn, key) && state.destSempCtx) disconnectDestSemp();
                return;
            }
            if (outcome.sessionEnded) {
                mirrorProv('disconnected');
                destUi.refreshDestTarget();
                eventBus.emit('rbac:sign-out-requested');
                return;
            }
            for (const detail of outcomeDetails(outcome)) {
                logger.error(`[QueueCopy] destination connect to broker "${target.broker}" VPN "${target.vpn}" failed: ${detail}`);
                app.notifications.add('error', 'Queue Copy', detail);
            }
            mirrorProv('error', outcomeLines(outcome).join('\n'));
            destUi.refreshDestTarget();
        }

        /** The sequence's SEMP step for the destination: probe through the relay and hold the context. */
        async function openDestSemp(broker: string, hold: (ctx: SempContext) => void): Promise<StepResult> {
            const step: { result: StepResult | null; hold: (ctx: SempContext) => void } = { result: null, hold };
            provSempStep = step;
            try {
                await app.managedProfile.dial({ broker, kind: 'semp' }, {
                    connect: async (c) => { await destSempClient.connect(c.cfg, c.broker, ''); },
                });
            } catch (e) {
                // No gateway call is made for SEMP: the profile refused (signed
                // out, or the broker is not provisioned), and messaging would too.
                return { ok: false, reason: errMessage(e), stop: app.managedProfile.isActive() ? 'not-provisioned' : 'session-ended' };
            } finally {
                provSempStep = null;
            }
            return step.result ?? { ok: false, reason: 'The SEMP check gave no answer.' };
        }

        /** The sequence's messaging step for the destination: dial, start the SDK, wait for UP or a failure. */
        function openDestMessaging(target: ProvisionedTarget, hold: (s: { session: any; vpn: string }) => void): Promise<StepResult> {
            return new Promise<StepResult>(resolve => {
                const step = { settle: resolve, hold, started: false };
                provMessagingStep = step;
                destSolClient.init();
                // The profile dials the gateway for the VPN's credential, which
                // goes straight to the SDK; it also owns connection identity, so
                // the clientName always matches the clientNameId inside its cfg.
                app.managedProfile
                    .dial({ broker: target.broker, vpn: target.vpn, kind: 'solace' }, {
                        connect: (c) => {
                            // Overtaken by a newer Connect while the dial ran:
                            // start no SDK session for this one.
                            if (provMessagingStep !== step) return;
                            step.started = true;
                            const start = destSolClient.connect(c.cfg, c.broker, c.pass, c.clientName);
                            if (!start.ok) settleProvMessaging({ ok: false, reason: start.error });
                        },
                    })
                    .catch((e: unknown) => {
                        if (provMessagingStep !== step) return;
                        settleProvMessaging(isSessionEnded(e)
                            ? { ok: false, reason: errMessage(e), code: 'unauthenticated', stop: 'session-ended' }
                            : { ok: false, reason: errMessage(e), code: gatewayCodeOf(e) }, false);
                    });
            });
        }
        function disconnectDestProvisioned(): void {
            disconnectDestSemp();
            disconnectDestSol();
        }

        // Disconnect path: button reads as "Disconnect" once connected, so the
        // same button triggers either connect or disconnect depending on the
        // active state. We dispatch from the click handler in ui-events.
        function disconnectDestSemp(): void { void destSempClient.disconnect(); }
        function disconnectDestSol(): void {
            if (state.destSolPending !== null) {
                // Cancels a connect still in flight: onConnected discards its
                // late session, and the destination controls unlock now.
                state.destSolPending = null;
                setDestSolStatus(els, 'disconnected');
                mirrorProv('disconnected');
                destUi.refreshDestTarget();
            }
            destSolClient.disconnect();
        }

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
            // A name the SDK refuses would fail every publish of the run: say
            // why next to the field and keep Next off until it is fixed.
            const nameProblem = destNameProblem(state.dest.type, state.dest.name);
            setDestNameError(els, nameProblem);
            const ok = !!state.sourceQueue && !!state.dest.name && nameProblem === null && destReady;
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

        // destSolHooks and the connect/disconnect helpers above reach this only
        // after install has returned, once wireUiEvents has run.
        const destUi = wireUiEvents(app, els, state, {
            getPrimarySnapshot,
            getPrimarySession: () => primarySession,
            connectDestSemp,
            disconnectDestSemp,
            connectDestSol,
            disconnectDestSol,
            connectDestProvisioned,
            disconnectDestProvisioned,
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
            // A provisioned primary that moved to another Message VPN.
            destUi.refreshSource();
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

            // Only a secondary dialled for a provisioned destination (live, or
            // connecting) can lose its entitlement; the primary's own endpoint is
            // the connections module's, and a destination never connected has
            // no identity yet (the card records the names on Connect), so a
            // mode flip that disposes a typed destination is not a revocation.
            const destLive = state.destSession !== null || state.destSempCtx !== null || state.destSolPending !== null;
            const destProvisioned = state.destForm.credMode === 'provisioned'
                && (!state.destForm.sameBroker || !state.destForm.sameVpn)
                && state.destForm.provisioned.broker !== ''
                && destLive;
            const destStillProvisioned = !destProvisioned || app.managedProfile
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

        // After the connections module switches the primary VPN at queue-copy's
        // request, navigate back here and write the picked source queue name
        // into the input. The source picker emitted connection:check-connection
        // with returnTo='queue-copy', and connections fired this event once
        // the new VPN was UP.
        eventBus.on('copy:vpn-switched', ({ queue }) => {
            loadSelf();
            state.sourceQueue = queue;
            els.sourceInput.value = queue;
            refreshStartEnabled();
        });

        logger.info('Queue Copy Module Setup Complete');
    }
};
