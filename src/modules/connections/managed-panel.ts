/**
 * Managed connection panel (the "Managed" tab of the connections module's
 * managed entry, `module.managed.ts`; Release bundles never import this file).
 *
 * Entitled broker/VPN dropdowns instead of a manual credential form, for the
 * user signed in at the gateway. Sign-in itself happens on the gateway's
 * `/login` page; this panel reads the session back (`GET /managed/me`) and
 * signs out (`POST /managed/logout`). Ported from the former standalone `managed-connections` module when the
 * two connection modes were merged into one tabbed module; it keeps that
 * module's exact contract — the same AppState writes, the same bus events, and
 * the same `createQueueBrowser` RBAC monkey-patch — so every downstream module
 * behaves identically no matter which tab established the connection.
 *
 * Like the Direct panel, this bridges the pure core service factories
 * (`createServiceSolace` / `createServiceSemp`) to global AppState + bus events.
 * The provisioned names live in `ctx.managedProfile` (see
 * `src/core/services/managed-profile.ts`); this panel is its writer -- it owns
 * the managed login -- and attaches the gateway calls it dials through. SEMP
 * goes through the gateway's relay, which adds the broker's account; the SMF
 * password comes from dial at each connect and reaches only the SDK, never
 * AppState, so a reconnect after a VPN switch dials again.
 *
 * The gateway's HttpOnly cookie is the session. A page reload keeps it, so
 * `restore()` adopts it again at install; a 401 from the gateway means it
 * ended (idle or absolute limit, or an admin changed the account) and the
 * panel drops its local state to match.
 *
 * One Connect opens SEMP and messaging as one connection, through the shared
 * sequence in `src/core/services/provisioned-connect.ts`: SEMP first, then
 * messaging every time, and connected only when both are up. While it runs,
 * each side is held without being announced (no AppState write, no bus event);
 * on success both are announced, SEMP first, and on failure the side that came
 * up is closed again and the card names each failure. A messaging session that
 * drops later closes SEMP too, except while a VPN switch reconnects it.
 *
 * The broker/VPN choice and its Connect button are the shared provisioned
 * connection card (`src/core/components/provisioned-connection/`), which
 * queue-copy's provisioned destination uses too; this panel keeps the sign-in
 * and connected views around it. A VPN switch requested by another module runs
 * through the shared `vpn-switch.ts`, the same flow as the Direct form.
 *
 * Visibility is decided by the caller: the Managed tab is only rendered when the
 * gateway advertised managed mode via `/hosted`, so this panel never needs its
 * own "gateway required" gate.
 */
import { required, setError } from '../../core/dom';
import { createAccountControl } from '../../core/components/account-control';
import { createServiceSolace, type SolaceConnectionHooks } from '../../core/services/solace-client';
import { createServiceSemp, type SempConnectionHooks } from '../../core/services/semp-client';
import { createManagedService, type ManagedProfile } from '../../core/services/managed-service';
import { managedErrorMessage } from '../../core/services/managed-api';
import { isSessionEnded } from '../../core/services/managed-profile';
import { connectProvisioned, gatewayCodeOf, outcomeDetails, outcomeLines, PART_LABEL, type StepResult } from '../../core/services/provisioned-connect';
import { isQueueVisible } from '../../core/rbac';
import { logger } from '../../core/logger';
import { errMessage } from '../../core/utils';
import { DEFAULT_MAX_MESSAGES_PER_QUEUE } from '../../core/connections/defaults';
import { createProvisionedConnectionCard, type ProvisionedTarget } from '../../core/components/provisioned-connection';
import { createVpnSwitch, type CheckConnectionRequest } from './vpn-switch';
import type { AppContext, SolaceConfig, SempConfig, SempContext } from '../../core/types';

const log = logger.withTag('Connections');

/** Controller returned to the module shell so it can drive the panel. */
export interface ManagedPanel {
    /**
     * Adopt the gateway session, if there is one (`GET /managed/me`). Resolves
     * true when the user is signed in, so the shell can open the Managed tab.
     */
    restore(): Promise<boolean>;
    /**
     * Sign out: end the gateway session, disconnect the broker and clear
     * `appState.managed` (so RBAC stops applying). Called when the Direct tab
     * takes over the connection (only one mode may be live at a time), and when
     * another module asks for a sign-out (`rbac:sign-out-requested`, routed here
     * by the module shell).
     */
    logout(): void;
    /** Re-show the panel's own view for the current state (used on tab activate). */
    refreshView(): void;
    /** Cross-module VPN-switch / browse request, routed here for a managed session. */
    handleCheckConnection(p: CheckConnectionRequest): void;
    /** Cross-module "edit connection" request. */
    handleEditRequested(): void;
}

export interface ManagedPanelOptions {
    /**
     * Tear down the OTHER (Direct) connection before this panel connects — only
     * one connection mode may be live at a time, and a stale Direct session
     * would keep writing to the same global AppState.
     */
    tearDownOther: () => void;
}

export function createManagedPanel(app: AppContext, opts: ManagedPanelOptions): ManagedPanel {
    const { container, appState, eventBus } = app;

    const els = {
        loginView: required<HTMLElement>(container, '#managed-login-view'),
        btnLogin: required<HTMLAnchorElement>(container, '#btn-managed-login'),
        loginError: required<HTMLElement>(container, '#managed-login-error'),

        // The card's host; the card takes the Refresh button into its header.
        selectView: required<HTMLElement>(container, '#managed-select-view'),
        btnRefresh: required<HTMLButtonElement>(container, '#btn-managed-refresh'),

        connectedView: required<HTMLElement>(container, '#managed-connected-view'),
        connectedSummary: required<HTMLElement>(container, '#managed-connected-summary'),
        btnDisconnect: required<HTMLButtonElement>(container, '#btn-managed-disconnect'),
    };

    const service = createManagedService();
    const profile = app.managedProfile;
    // Change password, Two-factor sign-in and Sign out sit at the top of the
    // sidebar, on every page and through a connection; this panel keeps Refresh.
    const account = createAccountControl(() => doLogout());
    app.mountSidebarAccount(account.element);
    profile.attachDialer(service);
    /** Signed in <=> the profile is set. No second copy of that truth here. */
    const signedIn = (): boolean => profile.isActive();

    // --- panel state ---
    // The broker name of the live (or in-progress) connection — set when a
    // Solace connect is initiated, read back when building the connected
    // summary so we don't have to null-guard appState.managed there.
    let connectedBroker = '';
    // What the hooks publish once connected: names and config, never a password.
    let lastSolaceAttempt: { broker: string; cfg: SolaceConfig } | null = null;
    let lastSempAttempt: { broker: string; cfg: SempConfig } | null = null;

    // The connect sequence's held halves (provisioned-connect.ts). While a
    // Connect runs, SEMP's context and the messaging session are kept here,
    // unannounced, until the outcome is known.
    /** Set while the SEMP probe of a Connect runs: the hooks record its result here. */
    let sempProbe: { result: StepResult | null } | null = null;
    let heldSemp: { ctx: SempContext; attempt: { broker: string; cfg: SempConfig } } | null = null;
    /**
     * Set while the messaging step of a Connect waits for the SDK. `started`
     * turns true once this attempt's SDK session exists: before that, a
     * DISCONNECTED can only come from an earlier session (one the sequence
     * just dropped), and must not settle this attempt.
     */
    let messagingStep: { settle: (r: StepResult) => void; started: boolean } | null = null;
    let heldSession: { session: any; vpn: string } | null = null;
    /** The messaging session was announced (AppState, client:connected). */
    let announced = false;
    /** A VPN switch is reconnecting messaging: its drop keeps SEMP. */
    let switching = false;
    /** The user (Disconnect, sign-out) is closing the connection, so a drop is not a fault. */
    let closing = false;

    // --- view + error helpers ---
    function showView(view: 'login' | 'select' | 'connected'): void {
        els.loginView.classList.toggle('hidden', view !== 'login');
        els.selectView.classList.toggle('hidden', view !== 'select');
        els.connectedView.classList.toggle('hidden', view !== 'connected');
    }

    // --- bridging hooks → global AppState + bus events ---
    /** Publish the messaging session: AppState, the RBAC browser guard, client:connected, the connected view. */
    function announceMessaging(session: any, vpn: string): void {
        const a = lastSolaceAttempt!;
        announced = true;
        switching = false;
        app.setState('isConnected', true);
        app.setState('selectedVpn', vpn);
        app.setState('solaceConnection', {
            host: a.broker, protocol: a.cfg.protocol, port: a.cfg.port, urlPath: a.cfg.urlPath,
            vpn: a.cfg.vpn, user: a.cfg.user, pass: '',
        });
        wrapManagedBrowser(session, vpn);
        eventBus.emit('client:connected', { session });
        const summary = `Broker "${connectedBroker}", VPN "${vpn}"`;
        els.connectedSummary.textContent = summary;
        card.setStatus('connected', summary);
        showView('connected');
    }

    /** The messaging step of a Connect is waiting: hand it the result. */
    function settleMessaging(r: StepResult, fromSdk = true): boolean {
        if (!messagingStep || (fromSdk && !messagingStep.started)) return false;
        const { settle } = messagingStep;
        messagingStep = null;
        settle(r);
        return true;
    }

    /** The SDK refused or failed the session: settle a waiting Connect, end a VPN switch, or log it. */
    function messagingFailed(reason: string): void {
        if (settleMessaging({ ok: false, reason })) return;
        if (switching) switchFailed(`${PART_LABEL.messaging}: ${reason}`);
        else log.warn(`messaging failed with no connect waiting for it: ${reason}`);
    }

    const solaceHooks: SolaceConnectionHooks = {
        onConnected: (session, vpn) => {
            if (messagingStep?.started) {
                heldSession = { session, vpn };
                settleMessaging({ ok: true });
                return;
            }
            announceMessaging(session, vpn); // a VPN switch's reconnect
        },
        onDisconnected: () => {
            lastSolaceAttempt = null;
            heldSession = null;
            if (settleMessaging({ ok: false, reason: 'The messaging session closed before it was up.' })) return;
            if (!announced) return; // a held session dropped by the sequence: never announced
            announced = false;
            app.setState('isConnected', false);
            app.setState('selectedVpn', null);
            app.setState('solaceConnection', null);
            eventBus.emit('client:disconnected');
            const expected = closing || switching;
            closing = false;
            // One connection: messaging gone takes SEMP with it, except while a
            // VPN switch reconnects messaging on purpose.
            if (!switching && appState.isSempConnected) void serviceSemp.disconnect();
            if (expected) {
                card.setStatus('disconnected');
            } else {
                card.setStatus('error', `${PART_LABEL.messaging}: connection dropped, so SEMP was closed too`);
            }
            if (signedIn()) showView('select');
        },
        onConnectFailed: ({ infoStr }) => messagingFailed(`Connection failed: ${infoStr}`),
        onError: (err) => messagingFailed(err.message),
    };

    /** Publish the held SEMP context: AppState, semp:connected. */
    function announceSemp(): void {
        const { ctx, attempt: a } = heldSemp!;
        heldSemp = null;
        app.setState('sempCredentials', {
            user: '', pass: '', baseUrl: ctx.baseUrl,
            protocol: a.cfg.protocol, host: a.broker, port: a.cfg.port, urlPath: a.cfg.urlPath,
            relay: a.cfg.relayBase,
        });
        app.setState('isSempConnected', true);
        eventBus.emit('semp:connected');
    }

    const sempHooks: SempConnectionHooks = {
        // SEMP is opened only by a Connect, so the context is always held
        // until the sequence's outcome is known.
        onConnected: (sempCtx) => {
            heldSemp = { ctx: sempCtx, attempt: lastSempAttempt! };
            if (sempProbe) sempProbe.result = { ok: true };
        },
        onDisconnected: () => {
            app.setState('isSempConnected', false);
            app.setState('sempCredentials', null);
            lastSempAttempt = null;
            eventBus.emit('semp:disconnected');
        },
        // The relay answers 401 only when the gateway session has ended.
        onAuthFailed: () => {
            const message = managedErrorMessage({ ok: false, status: 401, code: 'unauthenticated' });
            if (sempProbe) sempProbe.result = { ok: false, reason: message, code: 'unauthenticated', stop: 'session-ended' };
            clearSession();
            showSignedOut(message);
        },
        onError: ({ message, code, isTimeout }) => {
            if (sempProbe) sempProbe.result = { ok: false, reason: message, code, timeout: isTimeout };
        },
    };

    const serviceSolace = createServiceSolace(solaceHooks);
    const serviceSemp = createServiceSemp(sempHooks);

    // --- connect helpers ---
    // The core profile dials: SEMP gets the relay config, Solace the VPN's
    // credential from the gateway, which these callbacks forward to this panel's
    // own factory pair. The password goes straight to the SDK and nowhere else.
    /** The sequence's SEMP step: probe through the relay and hold the context. */
    async function openSemp(brokerName: string): Promise<StepResult> {
        const probe: { result: StepResult | null } = { result: null };
        sempProbe = probe;
        try {
            await profile.dial({ broker: brokerName, kind: 'semp' }, {
                connect: async (c) => {
                    lastSempAttempt = { broker: c.broker, cfg: c.cfg };
                    await serviceSemp.connect(c.cfg, c.broker, '');
                },
            });
        } catch (e) {
            // The SEMP dial makes no gateway call and refuses before its first
            // await, so with doConnect's sign-in check just made the refusal
            // is a broker not provisioned; the messaging step would refuse
            // the same way.
            return { ok: false, reason: errMessage(e), stop: 'not-provisioned' };
        } finally {
            sempProbe = null;
        }
        return probe.result ?? { ok: false, reason: 'The SEMP check gave no answer.' };
    }

    /** The sequence's messaging step: dial, start the SDK, and wait for UP or a failure. */
    function openMessaging(brokerName: string, vpnName: string): Promise<StepResult> {
        return new Promise<StepResult>(resolve => {
            messagingStep = { settle: resolve, started: false };
            connectSolace(brokerName, vpnName).catch((e: unknown) => {
                settleMessaging(isSessionEnded(e)
                    ? { ok: false, reason: errMessage(e), code: 'unauthenticated', stop: 'session-ended' }
                    : { ok: false, reason: errMessage(e), code: gatewayCodeOf(e) }, false);
            });
        });
    }

    async function connectSolace(brokerName: string, vpnName: string): Promise<void> {
        connectedBroker = brokerName;
        await profile.dial({ broker: brokerName, vpn: vpnName, kind: 'solace' }, {
            connect: (c) => {
                lastSolaceAttempt = { broker: c.broker, cfg: c.cfg };
                serviceSolace.init();
                if (messagingStep) messagingStep.started = true;
                const start = serviceSolace.connect(c.cfg, c.broker, c.pass, c.clientName);
                // A refusal that did not reach onError (an attempt already in flight).
                if (!start.ok && !settleMessaging({ ok: false, reason: start.error }) && switching) {
                    switchFailed(`${PART_LABEL.messaging}: ${start.error}`);
                }
            },
        });
    }

    /** The held messaging session will not be used: close it without announcing anything. */
    function dropHeldMessaging(): void {
        heldSession = null;
        serviceSolace.disconnect();
    }

    /**
     * A VPN switch's reconnect failed: SEMP closes too, since the connection
     * is one connection, the reason goes on the selection view, and the
     * switch waiting on it ends. Signed out meanwhile: the sign-out closed
     * SEMP and the sign-in view says why, so only the switch ends.
     */
    function switchFailed(message: string): void {
        switching = false;
        if (signedIn()) {
            void serviceSemp.disconnect();
            card.setStatus('error', message);
            showView('select');
        }
        vpnSwitch.connectFailed(message);
    }

    // Inject the managed guardrail into the SDK session WITHOUT touching
    // queue-browser: monkey-patch createQueueBrowser so binding a non-entitled
    // queue throws -- queue-browser's createBrowser try/catch surfaces it via
    // showBindError. Read-only rows are applied by queue-browser itself
    // (ui-table.ts reads `appState.managed`), and only ever downgrade what the
    // broker allows.
    function wrapManagedBrowser(session: any, vpn: string): void {
        const realCreate = typeof session.createQueueBrowser === 'function'
            ? session.createQueueBrowser.bind(session)
            : null;
        if (!realCreate) return; // session shape without createQueueBrowser (e.g. test stub)
        session.createQueueBrowser = (props: any) => {
            const m = appState.managed;
            if (!m) return realCreate(props); // no managed session (e.g. post-logout) → plain
            const qd = props.queueDescriptor;
            const queue: string = qd.name ?? qd.getName?.() ?? '';
            if (!isQueueVisible(m, m.broker, vpn, queue)) {
                throw new Error(`You are not entitled to browse queue "${queue}".`);
            }
            return realCreate(props);
        };
    }

    // --- selection UI: the shared card, reading the names from the profile ---
    const disconnectBoth = (): void => {
        closing = true;
        serviceSolace.disconnect();
        void serviceSemp.disconnect();
    };
    const card = createProvisionedConnectionCard(els.selectView, {
        profile,
        onConnect: doConnect,
        onDisconnect: disconnectBoth,
        headerActions: els.btnRefresh,
        ids: {
            broker: 'managed-broker-select', vpn: 'managed-vpn-select', action: 'btn-managed-connect',
            error: 'managed-connect-error', empty: 'managed-empty-state', controls: 'managed-connect-controls',
        },
    });

    // --- session: restore / sign out / refresh ---
    /**
     * Adopt a profile from the gateway. The profile takes it BEFORE AppState is
     * published or `rbac:changed` emitted — that event means "state is already
     * consistent, react now", so no observer can see a half-built session. The
     * connected broker (if any) is kept, with its provisioned VPNs re-read ([]
     * if it is no longer provisioned).
     */
    function adopt(p: ManagedProfile): void {
        profile.setProfile(p);
        account.show({ username: p.username, admin: p.admin });
        const broker = appState.managed?.broker ?? '';
        app.setState('managed', {
            admin: p.admin, username: p.username, operate: p.operate, readOnly: p.readOnly,
            modules: p.modules, broker, vpns: broker ? profile.vpnsFor(broker) : [],
        });
        eventBus.emit('rbac:changed');
        card.setChoices();
    }

    /**
     * The signed-out view. Its button is a plain link to the gateway's sign-in
     * page, or to the password page when the gateway requires a change first.
     */
    function showSignedOut(message: string | null, mustChange = false): void {
        els.btnLogin.href = mustChange ? '/login/password' : '/login';
        els.btnLogin.textContent = mustChange ? 'Change password' : 'Sign in';
        setError(els.loginError, message);
        showView('login');
    }

    /** Drop every local trace of the session. Profile and AppState are both
     *  cleared BEFORE the emit, so every observer sees a fully signed-out state. */
    function clearSession(): void {
        closing = true;
        heldSemp = null;
        serviceSolace.disconnect();
        if (appState.isSempConnected) void serviceSemp.disconnect();
        profile.clear();
        account.show(null);
        app.setState('managed', null);
        eventBus.emit('rbac:changed');
        card.setStatus('disconnected');
    }

    async function restore(): Promise<boolean> {
        const res = await service.me();
        if (!res.ok) {
            // No session is the ordinary signed-out state, not an error.
            const quiet = res.code === 'unauthenticated';
            showSignedOut(quiet ? null : managedErrorMessage(res), res.code === 'password_change_required');
            return false;
        }
        adopt(res.data);
        showView('select');
        return true;
    }

    function doLogout(): void {
        // End the gateway session as well. An already-ended one is the same
        // outcome, so the answer is not awaited or shown.
        void service.logout();
        clearSession();
        showSignedOut(null);
    }

    async function doRefresh(): Promise<void> {
        // Refresh = re-read the user's entitlements and provisioned brokers from
        // the gateway. NOT a page refresh. A session the gateway has ended is
        // dropped here too; any other failure keeps the last-known connections.
        const res = await service.me();
        if (!res.ok) {
            if (res.code === 'unauthenticated' || res.code === 'password_change_required') {
                clearSession();
                showSignedOut(managedErrorMessage(res), res.code === 'password_change_required');
                return;
            }
            card.setStatus('error', managedErrorMessage(res));
            return;
        }
        adopt(res.data);
        // A refresh that worked clears the last one's error, never a live status.
        if (card.status() === 'error') card.setStatus('disconnected');
    }

    // --- connect (initial): the card's Connect, which has already gone
    //     'connecting'; the hooks report the outcome back to it ---
    async function doConnect({ broker: brokerName, vpn: vpnName }: ProvisionedTarget): Promise<void> {
        // A click that raced a sign-out: nothing to connect, and the card goes back to Connect.
        if (!signedIn()) {
            card.setStatus('disconnected');
            return;
        }
        // Only one connection mode may be live -- drop any Direct session first.
        opts.tearDownOther();
        // Publish the connected broker's PROVISIONED VPN names so the queue
        // picker (via queueSourceFrom) lists exactly what this panel shows —
        // not the broader entitlement-glob set.
        app.setState('managed', {
            ...appState.managed!, broker: brokerName, vpns: profile.vpnsFor(brokerName),
        });
        log.info(`connecting to broker "${brokerName}" VPN "${vpnName}"`);
        closing = false;
        const outcome = await connectProvisioned({
            semp: () => openSemp(brokerName),
            messaging: () => openMessaging(brokerName, vpnName),
            dropSemp: () => { heldSemp = null; },
            dropMessaging: dropHeldMessaging,
            onStep: (part) => signedIn() && card.setStatus('connecting', part === 'semp'
                ? `Connecting SEMP (management) to broker "${brokerName}"...`
                : `Connecting messaging (client) to broker "${brokerName}", VPN "${vpnName}"...`),
        });
        // Signed out while it ran (the account control, or a relay 401): the
        // sign-in view says why, and nothing held may be announced.
        if (!signedIn()) {
            heldSemp = null;
            if (heldSession) dropHeldMessaging();
            card.setStatus('disconnected');
            return;
        }
        if (outcome.ok) {
            announceSemp();
            const held = heldSession!;
            heldSession = null;
            announceMessaging(held.session, held.vpn);
            eventBus.emit('config:max-messages-changed', { value: DEFAULT_MAX_MESSAGES_PER_QUEUE });
            return;
        }
        if (outcome.sessionEnded) {
            // A dial refused because the gateway session ended (a relay 401
            // has signed out already and returned above).
            clearSession();
            showSignedOut(managedErrorMessage({ ok: false, status: 401, code: 'unauthenticated' }));
            return;
        }
        for (const detail of outcomeDetails(outcome)) {
            log.error(`connect to broker "${brokerName}" VPN "${vpnName}" failed: ${detail}`);
            app.notifications.add('error', 'Connections', detail);
        }
        card.setStatus('error', outcomeLines(outcome).join('\n'));
        showView('select');
    }

    // --- wire UI events ---
    els.btnDisconnect.addEventListener('click', disconnectBoth);
    els.btnRefresh.addEventListener('click', () => void doRefresh());

    // --- cross-module handlers (routed here by the module shell while a
    //     managed session is active) ---

    // Both handlers below are only routed here while `appState.managed` is set,
    // and that flag moves in lockstep with the profile (adopted together
    // on restore, cleared together on sign-out) — so a signed-out session is
    // unreachable here and the selection view is always the right target.
    function handleEditRequested(): void {
        app.loadSelf();
        showView('select');
    }

    // The shared VPN switch with this panel's own actions: a reconnect dials
    // the same broker again, and with no live session the request shows the
    // broker/VPN choice (a managed connect needs an explicit choice).
    const vpnSwitch = createVpnSwitch({
        eventBus, loadSelf: () => app.loadSelf(), log,
        mode: {
            isConnected: () => appState.isConnected,
            currentVpn: () => appState.selectedVpn as string,
            isConnecting: () => card.status() === 'connecting',
            async connect(vpn: string): Promise<void> {
                try {
                    await connectSolace(connectedBroker, vpn);
                } catch (e) {
                    // The gateway session ended: sign out, and still fail the
                    // switch. Any other refusal closes SEMP too: one connection.
                    if (isSessionEnded(e)) {
                        clearSession();
                        showSignedOut(errMessage(e));
                    } else {
                        switching = false;
                        if (appState.isSempConnected) void serviceSemp.disconnect();
                    }
                    throw e;
                }
            },
            // Only a VPN switch disconnects here: its drop keeps SEMP for the reconnect.
            disconnect: () => {
                switching = true;
                serviceSolace.disconnect();
            },
            showError(message: string): void {
                // Signed out meanwhile: the sign-in view already says why.
                if (!signedIn()) return;
                card.setStatus('error', message);
                showView('select');
            },
            showConnectView: () => showView('select'),
        },
    });

    showView('login');
    log.info('managed connection panel ready');

    return {
        restore,
        logout: doLogout,
        refreshView(): void {
            if (!signedIn()) showView('login');
            else if (appState.isConnected) showView('connected');
            else showView('select');
        },
        handleCheckConnection: vpnSwitch.request,
        handleEditRequested,
    };
}
