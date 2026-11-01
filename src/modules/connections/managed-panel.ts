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
 * It does NOT hold the provisioned profile or the deployment seed: those live in
 * `ctx.managedStore`, which brokers credentials on request (see
 * `src/core/services/managed-session-store.ts`). This panel is that store's
 * writer — it owns the managed login — and reads provisioned identities back
 * from it, so no packed credential or seed passes through here.
 *
 * The gateway's HttpOnly cookie is the session. A page reload keeps it, so
 * `restore()` adopts it again at install; a 401 from the gateway means it
 * ended (idle or absolute limit, or an admin changed the account) and the
 * panel drops its local state to match.
 *
 * Visibility is decided by the caller: the Managed tab is only rendered when the
 * gateway advertised managed mode via `/hosted`, so this panel never needs its
 * own "gateway required" gate.
 */
import { required } from '../../core/dom';
import { createServiceSolace, type SolaceConnectionHooks } from '../../core/services/solace-client';
import { createServiceSemp, type SempConnectionHooks } from '../../core/services/semp-client';
import { createManagedService, type ManagedProfile } from '../../core/services/managed-service';
import { managedErrorMessage } from '../../core/services/managed-api';
import { isQueueVisible, canOperate } from '../../core/rbac';
import { logger } from '../../core/logger';
import { errMessage } from '../../core/utils';
import type { AppContext, SolaceConfig, SempConfig } from '../../core/types';

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
    handleCheckConnection(p: { vpn: string; queue: string; returnTo?: 'queue-browser' | 'queue-copy' }): void;
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

        selectView: required<HTMLElement>(container, '#managed-select-view'),
        emptyState: required<HTMLElement>(container, '#managed-empty-state'),
        connectControls: required<HTMLElement>(container, '#managed-connect-controls'),
        brokerSelect: required<HTMLSelectElement>(container, '#managed-broker-select'),
        vpnSelect: required<HTMLSelectElement>(container, '#managed-vpn-select'),
        brokerHost: required<HTMLInputElement>(container, '#managed-broker-host'),
        btnConnect: required<HTMLButtonElement>(container, '#btn-managed-connect'),
        connectError: required<HTMLElement>(container, '#managed-connect-error'),
        btnRefresh: required<HTMLButtonElement>(container, '#btn-managed-refresh'),
        btnLogout: required<HTMLButtonElement>(container, '#btn-managed-logout'),

        connectedView: required<HTMLElement>(container, '#managed-connected-view'),
        connectedSummary: required<HTMLElement>(container, '#managed-connected-summary'),
        btnDisconnect: required<HTMLButtonElement>(container, '#btn-managed-disconnect'),
    };

    const service = createManagedService();
    const store = app.managedStore;
    /** Signed in ⇔ the store holds a profile. No second copy of that truth here. */
    const signedIn = (): boolean => store.isActive();

    // --- panel state ---
    // Guards the multi-step VPN-switch dance against duplicate cross-module requests.
    let opInProgress = false;
    // The broker name of the live (or in-progress) connection — set when a
    // Solace connect is initiated, read back when building the connected
    // summary so we don't have to null-guard appState.managed there.
    let connectedBroker = '';
    let lastSolaceAttempt: { host: string; cfg: SolaceConfig; pass: string } | null = null;
    let lastSempAttempt: { host: string; cfg: SempConfig } | null = null;

    // --- view + error helpers ---
    function showView(view: 'login' | 'select' | 'connected'): void {
        els.loginView.classList.toggle('hidden', view !== 'login');
        els.selectView.classList.toggle('hidden', view !== 'select');
        els.connectedView.classList.toggle('hidden', view !== 'connected');
    }
    function setError(el: HTMLElement, msg: string | null): void {
        el.textContent = msg ?? '';
        el.classList.toggle('hidden', !msg);
    }

    // --- bridging hooks → global AppState + bus events ---
    const solaceHooks: SolaceConnectionHooks = {
        onConnected: (session, vpn) => {
            const a = lastSolaceAttempt!;
            app.setState('isConnected', true);
            app.setState('selectedVpn', vpn);
            app.setState('solaceConnection', {
                host: a.host, protocol: a.cfg.protocol, port: a.cfg.port, urlPath: a.cfg.urlPath,
                vpn: a.cfg.vpn, user: a.cfg.user, pass: a.pass,
            });
            wrapManagedBrowser(session, vpn);
            eventBus.emit('client:connected', { session });
            els.connectedSummary.textContent = `Broker "${connectedBroker}" · VPN "${vpn}"`;
            showView('connected');
        },
        onDisconnected: () => {
            app.setState('isConnected', false);
            app.setState('selectedVpn', null);
            app.setState('solaceConnection', null);
            lastSolaceAttempt = null;
            eventBus.emit('client:disconnected');
            if (signedIn()) showView('select');
        },
        onConnectFailed: ({ infoStr }) => {
            setError(els.connectError, `Connection failed: ${infoStr}`);
            showView('select');
        },
        onError: (err) => {
            setError(els.connectError, err.message);
            showView('select');
        },
    };

    const sempHooks: SempConnectionHooks = {
        onConnected: (sempCtx, creds) => {
            const a = lastSempAttempt!;
            app.setState('sempCredentials', {
                user: creds.user, pass: creds.pass, baseUrl: sempCtx.baseUrl,
                protocol: a.cfg.protocol, host: a.host, port: a.cfg.port, urlPath: a.cfg.urlPath,
            });
            app.setState('isSempConnected', true);
            eventBus.emit('semp:connected');
        },
        onDisconnected: () => {
            app.setState('isSempConnected', false);
            app.setState('sempCredentials', null);
            lastSempAttempt = null;
            eventBus.emit('semp:disconnected');
        },
        onAuthFailed: () => setError(els.connectError, 'SEMP authentication failed (401).'),
        onError: ({ message }) => setError(els.connectError, `SEMP error: ${message}`),
    };

    const serviceSolace = createServiceSolace(solaceHooks);
    const serviceSemp = createServiceSemp(sempHooks);

    // --- connect helpers ---
    // Credentials are brokered by the core store: it unpacks just-in-time and
    // hands back a ready payload, which these dial callbacks forward to this
    // panel's own factory pair. The panel never sees a packed value or the seed.
    async function connectSemp(brokerName: string): Promise<void> {
        await store.connect({ broker: brokerName, kind: 'semp' }, {
            connect: async (c) => {
                lastSempAttempt = { host: c.host, cfg: c.cfg };
                await serviceSemp.connect(c.cfg, c.host, c.pass);
            },
        });
    }

    async function connectSolace(brokerName: string, vpnName: string): Promise<void> {
        connectedBroker = brokerName;
        await store.connect({ broker: brokerName, vpn: vpnName, kind: 'solace' }, {
            connect: (c) => {
                lastSolaceAttempt = { host: c.host, cfg: c.cfg, pass: c.pass };
                serviceSolace.init();
                serviceSolace.connect(c.cfg, c.host, c.pass, c.clientName);
            },
        });
    }

    // Inject the managed guardrails into the SDK session WITHOUT touching
    // queue-browser: monkey-patch createQueueBrowser so (1) binding a
    // non-entitled queue throws — queue-browser's createBrowser try/catch
    // surfaces it via showBindError; and (2) on the browser's UP event the
    // perceived `_messageConsumer._permissions` is overwritten per RBAC, so
    // queue-browser's existing badge + Delete-hide logic gates by entitlement.
    // Read-only blocks Delete only; Forward stays allowed (broker-consistent).
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
            const browser = realCreate(props);
            const verdict = canOperate(m, m.broker, vpn, queue) ? 'READ_WRITE' : 'READ_ONLY';
            // Set AFTER the SDK populates _permissions on UP — our listener is
            // registered before queue-browser's, so it runs first on the event.
            browser.on((globalThis as any).solace.QueueBrowserEventName.UP, () => {
                if (browser._messageConsumer) browser._messageConsumer._permissions = verdict;
            });
            return browser;
        };
    }

    // --- selection UI (provisioned identities read back from the store) ---
    function populateVpns(brokerName: string): void {
        // Callers only ever pass a broker taken from `store.brokers()` (the
        // dropdown is rendered from it), so the lookup always hits.
        const hostname = store.brokers().find(b => b.broker === brokerName)!.hostname;
        const vpns = store.vpnsFor(brokerName);
        els.brokerHost.value = hostname;
        els.vpnSelect.innerHTML = '';
        vpns.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            els.vpnSelect.appendChild(opt);
        });
        els.vpnSelect.disabled = vpns.length === 0;
        updateConnectEnabled();
    }

    function updateConnectEnabled(): void {
        els.btnConnect.disabled = !(els.brokerSelect.value && els.vpnSelect.value);
    }

    function populateSelect(): void {
        const brokers = store.brokers();
        if (brokers.length === 0) {
            els.emptyState.classList.remove('hidden');
            els.connectControls.classList.add('hidden');
            return;
        }
        els.emptyState.classList.add('hidden');
        els.connectControls.classList.remove('hidden');
        els.brokerSelect.innerHTML = '';
        brokers.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.broker;
            opt.textContent = b.broker;
            els.brokerSelect.appendChild(opt);
        });
        populateVpns(els.brokerSelect.value);
    }

    // --- session: restore / sign out / refresh ---
    /**
     * Adopt a profile from the gateway. The store takes it BEFORE AppState is
     * published or `rbac:changed` emitted — that event means "state is already
     * consistent, react now", so no observer can see a half-built session.
     * Re-adopting also re-imports the seed, so a rotated deployment seed is
     * picked up for free. The connected broker (if any) is kept, with its
     * provisioned VPNs re-read ([] if it is no longer provisioned).
     */
    async function adopt(p: ManagedProfile): Promise<void> {
        await store.setProfile(p);
        const broker = appState.managed?.broker ?? '';
        app.setState('managed', {
            admin: p.admin, username: p.username, operate: p.operate, readOnly: p.readOnly,
            modules: p.modules, broker, vpns: broker ? store.vpnsFor(broker) : [],
        });
        eventBus.emit('rbac:changed');
        populateSelect();
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

    /** Drop every local trace of the session. Store and AppState are both
     *  cleared BEFORE the emit, so every observer sees a fully signed-out state. */
    function clearSession(): void {
        serviceSolace.disconnect();
        void serviceSemp.disconnect();
        store.clear();
        app.setState('managed', null);
        eventBus.emit('rbac:changed');
        setError(els.connectError, null);
    }

    async function restore(): Promise<boolean> {
        const res = await service.me();
        if (!res.ok) {
            // No session is the ordinary signed-out state, not an error.
            const quiet = res.code === 'unauthenticated';
            showSignedOut(quiet ? null : managedErrorMessage(res), res.code === 'password_change_required');
            return false;
        }
        try {
            await adopt(res.data);
        } catch (e) {
            showSignedOut(errMessage(e));
            return false;
        }
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
            setError(els.connectError, managedErrorMessage(res));
            return;
        }
        try {
            await adopt(res.data);
            setError(els.connectError, null);
        } catch (e) {
            setError(els.connectError, errMessage(e));
        }
    }

    // --- connect (initial) ---
    async function doConnect(): Promise<void> {
        const brokerName = els.brokerSelect.value;
        const vpnName = els.vpnSelect.value;
        if (!brokerName || !vpnName) return;
        // Only one connection mode may be live — drop any Direct session first.
        opts.tearDownOther();
        // Publish the connected broker's PROVISIONED VPN names so the queue
        // picker (via queueSourceFrom) lists exactly what this panel shows —
        // not the broader entitlement-glob set.
        app.setState('managed', {
            ...appState.managed!, broker: brokerName, vpns: store.vpnsFor(brokerName),
        });
        setError(els.connectError, null);
        els.btnConnect.disabled = true;
        try {
            await connectSemp(brokerName);
            await connectSolace(brokerName, vpnName);
            eventBus.emit('config:max-messages-changed', { value: 100 });
        } catch (e) {
            setError(els.connectError, errMessage(e));
        } finally {
            els.btnConnect.disabled = false;
        }
    }

    // --- wire UI events ---
    els.brokerSelect.addEventListener('change', () => populateVpns(els.brokerSelect.value));
    els.vpnSelect.addEventListener('change', updateConnectEnabled);
    els.btnConnect.addEventListener('click', () => void doConnect());
    els.btnDisconnect.addEventListener('click', () => { serviceSolace.disconnect(); void serviceSemp.disconnect(); });
    els.btnLogout.addEventListener('click', doLogout);
    els.btnRefresh.addEventListener('click', () => void doRefresh());

    // --- cross-module handlers (routed here by the module shell while a
    //     managed session is active) ---

    // Both handlers below are only routed here while `appState.managed` is set,
    // and that flag moves in lockstep with the store's profile (adopted together
    // on restore, cleared together on sign-out) — so a signed-out session is
    // unreachable here and the selection view is always the right target.
    function handleEditRequested(): void {
        app.loadSelf();
        showView('select');
    }

    function handleCheckConnection(
        { vpn: targetVpn, queue: targetQueue, returnTo }:
        { vpn: string; queue: string; returnTo?: 'queue-browser' | 'queue-copy' },
    ): void {
        if (opInProgress) return;

        const finish = () => {
            if (returnTo === 'queue-copy') {
                eventBus.emit('copy:vpn-switched', { vpn: targetVpn, queue: targetQueue });
            } else {
                eventBus.emit('browser:browse-queue', { queue: targetQueue });
            }
        };

        // Wait for the next client:connected (→ finish) or client:disconnected
        // (→ give up). 30s timeout so listeners can't leak. Clears opInProgress
        // on every exit path.
        function waitForConnect(): void {
            let onSuccess: () => void;
            let onFail: () => void;
            const cleanup = () => {
                clearTimeout(timer);
                eventBus.off('client:connected', onSuccess);
                eventBus.off('client:disconnected', onFail);
                opInProgress = false;
            };
            onSuccess = () => { cleanup(); finish(); };
            onFail = () => { cleanup(); };
            const timer = setTimeout(cleanup, 30_000);
            eventBus.on('client:connected', onSuccess);
            eventBus.on('client:disconnected', onFail);
        }

        if (!appState.isConnected) {
            // Managed mode needs an explicit broker+VPN selection — send the
            // user to the selection view to connect.
            app.loadSelf();
            showView('select');
            return;
        }
        if (appState.selectedVpn === targetVpn) {
            finish();
            return;
        }
        const brokerName = appState.managed!.broker;
        if (!confirm(`Current VPN is "${appState.selectedVpn}". Switch to "${targetVpn}"?`)) return;
        opInProgress = true;
        let disconnectTimer: ReturnType<typeof setTimeout>;
        const onDisconnected = () => {
            clearTimeout(disconnectTimer);
            eventBus.off('client:disconnected', onDisconnected);
            waitForConnect();
            // The store rejects an unprovisioned target — surface it rather than
            // leaving an unhandled rejection. Parity with the pre-store panel,
            // which set this same error and returned without connecting.
            void connectSolace(brokerName, targetVpn)
                .catch(e => setError(els.connectError, errMessage(e)));
        };
        eventBus.on('client:disconnected', onDisconnected);
        disconnectTimer = setTimeout(() => {
            eventBus.off('client:disconnected', onDisconnected);
            opInProgress = false;
            logger.warn('[Connections] Disconnect timed out (10s); aborting VPN switch');
        }, 10_000);
        serviceSolace.disconnect();
    }

    showView('login');
    logger.info('Managed connection panel ready');

    return {
        restore,
        logout: doLogout,
        refreshView(): void {
            if (!signedIn()) showView('login');
            else if (appState.isConnected) showView('connected');
            else showView('select');
        },
        handleCheckConnection,
        handleEditRequested,
    };
}
