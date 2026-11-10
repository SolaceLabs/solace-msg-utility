import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState } from '../../../src/core/types';

/**
 * Managed panel of the connections module (the "Managed" tab).
 *
 * Installs the REAL managed entry (`module.managed.ts`, the `managed` variant)
 * with its composed `index.managed.html`, against a `/hosted` probe that
 * advertises managed mode, then drives the `#managed-*` DOM end to end: the
 * gateway session restored at install / provisioned-select / connect /
 * refresh / sign-out, the mode interlock and `rbac:sign-out-requested` with a
 * live session. Sign-in itself is the gateway's page (go-web-proxy/pages_test.go). The entry's tab bar and its
 * Direct fallbacks are in tests/modules/connections/module.managed.test.ts.
 *
 * The entry builds TWO factory pairs (Direct first, then Managed — see
 * module.managed.ts step 2), so the mocks below record every created instance
 * and the managed one is the last (`.at(-1)`).
 */
// --- mocked dependencies (hoisted so vi.mock factories can close over them) ---
const solaceMock = vi.hoisted(() => {
    const instances: any[] = [];
    return {
        instances,
        get hooks() { return instances.at(-1)!.hooks; },          // managed pair = last created
        get init() { return instances.at(-1)!.init; },
        get connect() { return instances.at(-1)!.connect; },
        get disconnect() { return instances.at(-1)!.disconnect; },
        get cleanup() { return instances.at(-1)!.cleanup; },
    };
});
const sempMock = vi.hoisted(() => {
    const instances: any[] = [];
    return {
        instances,
        get hooks() { return instances.at(-1)!.hooks; },
        get connect() { return instances.at(-1)!.connect; },
        get disconnect() { return instances.at(-1)!.disconnect; },
    };
});
const svcMock = vi.hoisted(() => ({ me: vi.fn(), logout: vi.fn(), dial: vi.fn() }));
// Advertise managed mode so the module renders (and instantiates) the Managed tab.
const hostedMock = vi.hoisted(() => ({
    probeDeployment: vi.fn(async () => ({ hosted: true, conn: { connModes: 'provisioned', defaultConn: 'provisioned' } })),
}));

vi.mock('../../../src/core/services/solace-client', () => ({
    createServiceSolace: (hooks: any) => {
        const inst = { hooks, init: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), cleanup: vi.fn() };
        solaceMock.instances.push(inst);
        return inst;
    },
}));
vi.mock('../../../src/core/services/semp-client', () => ({
    createServiceSemp: (hooks: any) => {
        const inst = { hooks, connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
        sempMock.instances.push(inst);
        return inst;
    },
}));
vi.mock('../../../src/core/hosted', () => ({
    probeDeployment: hostedMock.probeDeployment, setHosted: vi.fn(), isHosted: () => true, buildBrokerUrl: () => '',
    // Hosted: every scheme stays usable.
    limitSchemeOptions: vi.fn(), usableScheme: (scheme: string) => scheme,
}));
vi.mock('../../../src/core/services/managed-service', () => ({
    createManagedService: () => ({
        me: svcMock.me, logout: svcMock.logout, dial: svcMock.dial,
        relayBase: (broker: string) => `/managed/relay/${broker}`,
    }),
}));

// Import AFTER the mocks are registered.
import { ConnectionsModule } from '../../../src/modules/connections/module.managed';
import { createManagedProfile } from '../../../src/core/services/managed-profile';

/** The /managed/me profile: names only, as the gateway sends it. */
const PROFILE = {
    username: 'admin',
    admin: true,
    operate: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    readOnly: [],
    modules: ['queue-browser'],
    brokers: [
        { broker: 'b1', msgVpns: [{ name: 'vpn1' }, { name: 'vpn2' }] },
        { broker: 'b2', msgVpns: [] },
    ],
};

/** The gateway's dial answer for a VPN: its credential and the SMF socket path. */
const dialed = (broker: string, vpn: string) => ({
    ok: true, data: { smfPath: `/managed/smf/${broker}/${vpn}`, vpn, user: `u-${vpn}`, pass: `pw-${vpn}` },
});

function el<T extends HTMLElement>(c: HTMLElement, sel: string): T {
    return c.querySelector(sel) as T;
}
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');

/** The sidebar footer slot the panel mounts its account control into. */
let sidebar: HTMLElement;
const account = () => sidebar.querySelector<HTMLElement>('.conn-account')!;
const signOut = () => account().querySelector<HTMLButtonElement>('.conn-account-signout')!.click();

function makeCtx(container: HTMLElement): AppContext {
    sidebar = document.createElement('div');
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false,
    };
    return {
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; eventBus.emit('app:state-change', { key: k, value: v }); },
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        // The REAL profile (over the mocked gateway calls above): this panel is
        // its writer, so the suite covers login -> setProfile -> dial end to end.
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        mountSidebarAccount: (node: HTMLElement) => { sidebar.replaceChildren(node); },
        config: {},
    } as AppContext;
}

const NO_SESSION = { ok: false, status: 401, code: 'unauthenticated' };
const OK = (profile: unknown = PROFILE) => ({ ok: true, data: profile });

/**
 * Install with the gateway answering `GET /managed/me` with `me` (default: no
 * session). `before` runs on the context first, e.g. to subscribe to an event
 * the install emits.
 */
async function setup(me: unknown = NO_SESSION, before?: (ctx: AppContext) => void) {
    svcMock.me.mockResolvedValue(me);
    const container = loadModuleDOM('connections', 'managed');
    const ctx = makeCtx(container);
    before?.(ctx);
    await ConnectionsModule.install(ctx);
    return { container, ctx };
}

/** Install with a live gateway session for `profile`: the panel restores it. */
const signedIn = (profile: unknown = PROFILE, before?: (ctx: AppContext) => void) => setup(OK(profile), before);

/** Signed in → connect → drive both onConnected hooks so we're fully "connected to vpn1 on b1". */
async function connectToB1Vpn1(container: HTMLElement, ctx: AppContext) {
    el<HTMLButtonElement>(container, '#btn-managed-connect').click();
    await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());
    sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: '/managed/relay/b1' }, { user: '', pass: '' });
    solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
}

beforeEach(() => {
    svcMock.me.mockReset();
    svcMock.logout.mockReset();
    svcMock.logout.mockResolvedValue({ ok: true });
    svcMock.dial.mockReset();
    svcMock.dial.mockImplementation(async (broker: string, vpn: string) => dialed(broker, vpn));
    // Each install creates a Direct pair then a Managed pair; clear so `.at(-1)`
    // always resolves to THIS test's managed instances.
    solaceMock.instances.length = 0;
    sempMock.instances.length = 0;
    hostedMock.probeDeployment.mockResolvedValue({ hosted: true, conn: { connModes: 'provisioned', defaultConn: 'provisioned' } });
});

describe('connections/managed panel — restoring the gateway session', () => {
    it('without a session shows the sign-in link, quietly', async () => {
        const { container } = await setup();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
        expect(hidden(container, '#managed-connected-view')).toBe(true);
        expect(hidden(container, '#managed-login-error')).toBe(true);
        const link = el<HTMLAnchorElement>(container, '#btn-managed-login');
        expect(link.getAttribute('href')).toBe('/login');
        expect(link.textContent).toBe('Sign in');
        // Gateway advertised managed → the Managed panel is the active tab.
        expect(hidden(container, '#conn-panel-managed')).toBe(false);
    });

    // Replaces the former "gateway required" gate: availability is now encoded in
    // tab visibility — a deployment that doesn't advertise managed never renders
    // the tab, so the panel is not reachable and asks the gateway nothing.
    it('does not offer the Provisioned tab when the gateway does not advertise Provisioned', async () => {
        hostedMock.probeDeployment.mockResolvedValue({ hosted: false, conn: { connModes: 'direct', defaultConn: 'direct' } });
        const { container } = await setup();
        expect(hidden(container, '#conn-panel-managed')).toBe(true);
        expect(hidden(container, '#conn-tab-managed')).toBe(true);
        expect(hidden(container, '#conn-panel-direct')).toBe(false); // Direct is the only mode
        expect(svcMock.me).not.toHaveBeenCalled();
    });

    it('adopts a live session: sets the managed session, emits rbac:changed, shows selection', async () => {
        const rbac = vi.fn();
        const { container, ctx } = await signedIn(PROFILE, c => c.eventBus.on('rbac:changed', rbac));

        expect(ctx.appState.managed).toEqual({
            admin: true, username: 'admin', broker: '', vpns: [],
            operate: PROFILE.operate, readOnly: PROFILE.readOnly, modules: ['queue-browser'],
        });
        expect(ctx.managedProfile.isActive()).toBe(true);
        expect(rbac).toHaveBeenCalled();
        expect(hidden(container, '#managed-select-view')).toBe(false);
        expect([...el<HTMLSelectElement>(container, '#managed-broker-select').options].map(o => o.value)).toEqual(['b1', 'b2']);
        expect([...el<HTMLSelectElement>(container, '#managed-vpn-select').options].map(o => o.value)).toEqual(['vpn1', 'vpn2']);
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
        // The account control in the sidebar footer: who, and the two actions.
        expect(account().classList.contains('hidden')).toBe(false);
        expect(account().querySelector('.conn-account-name')!.textContent).toBe('admin');
        expect(account().querySelector('.conn-account-password')!.getAttribute('href')).toBe('/login/password');
    });

    it('keeps the account control in the sidebar through a connection, and signs out from there', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        expect(hidden(container, '#managed-connected-view')).toBe(false);
        expect(account().classList.contains('hidden')).toBe(false);

        const before = [solaceMock.disconnect.mock.calls.length, sempMock.disconnect.mock.calls.length];
        signOut();
        // Signing out while connected disconnects first, then ends the session.
        expect([solaceMock.disconnect.mock.calls.length, sempMock.disconnect.mock.calls.length])
            .toEqual([before[0] + 1, before[1] + 1]);
        expect(svcMock.logout).toHaveBeenCalledTimes(1);
        expect(account().classList.contains('hidden')).toBe(true);
    });

    it('a session opens the Provisioned tab even when Direct is the default', async () => {
        hostedMock.probeDeployment.mockResolvedValue({ hosted: true, conn: { connModes: 'both', defaultConn: 'direct' } });
        const { container } = await signedIn();
        expect(hidden(container, '#conn-panel-managed')).toBe(false);
        expect(hidden(container, '#conn-panel-direct')).toBe(true);
    });

    it('points at the password page when the gateway requires a change', async () => {
        const { container, ctx } = await setup({ ok: false, status: 403, code: 'password_change_required' });
        const link = el<HTMLAnchorElement>(container, '#btn-managed-login');
        expect(link.getAttribute('href')).toBe('/login/password');
        expect(link.textContent).toBe('Change password');
        expect(el(container, '#managed-login-error').textContent).toBe('You must change your password before you continue.');
        expect(ctx.appState.managed).toBeUndefined();
    });

    it('shows why when the gateway cannot be reached', async () => {
        const { container } = await setup({ ok: false, status: 0, code: 'network' });
        expect(el(container, '#managed-login-error').textContent).toBe('The gateway could not be reached.');
    });

    it('shows the empty-state when the user has no entitled connections', async () => {
        const { container } = await signedIn({ ...PROFILE, brokers: [] });
        expect(hidden(container, '#managed-empty-state')).toBe(false);
        expect(hidden(container, '#managed-connect-controls')).toBe(true);
    });
});

describe('managed-connections — selection', () => {
    it('a broker with no VPNs disables the VPN select and Connect', async () => {
        const { container, ctx } = await signedIn();
        const broker = el<HTMLSelectElement>(container, '#managed-broker-select');
        broker.value = 'b2';
        broker.dispatchEvent(new Event('change'));
        expect(el<HTMLSelectElement>(container, '#managed-vpn-select').disabled).toBe(true);
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(true);
    });

    it('vpn change re-evaluates the Connect button', async () => {
        const { container, ctx } = await signedIn();
        const vpn = el<HTMLSelectElement>(container, '#managed-vpn-select');
        vpn.value = 'vpn2';
        vpn.dispatchEvent(new Event('change'));
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
    });
});

describe('managed-connections — connect', () => {
    it('connects SEMP through the relay and Solace through a dialled SMF socket, then emits the message cap', async () => {
        const { container, ctx } = await signedIn();
        const cap = vi.fn();
        ctx.eventBus.on('config:max-messages-changed', cap);

        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());

        expect(ctx.appState.managed!.broker).toBe('b1');
        // SEMP: the relay base, no credential at all.
        expect(sempMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ relayBase: '/managed/relay/b1', user: '' }), 'b1', '',
        );
        // SMF: dialled for exactly this broker and VPN; the password goes to the SDK.
        expect(svcMock.dial).toHaveBeenCalledWith('b1', 'vpn1');
        expect(solaceMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ protocol: 'wss', vpn: 'vpn1', user: 'u-vpn1', authMode: 'basic', smfPath: '/managed/smf/b1/vpn1' }),
            'b1', 'pw-vpn1', expect.stringMatching(/^SolMsgUtil\/\d{14}\//),
        );
        expect(cap).toHaveBeenCalledWith({ value: 100 });
    });

    // Both guard tests log in first (which ENABLES the Connect button — jsdom
    // won't fire activation on a disabled button), then clear a select's value
    // directly so doConnect runs and hits the !brokerName / !vpnName guard.
    it('Connect is a no-op when no broker is selected', async () => {
        const { container, ctx } = await signedIn();
        el<HTMLSelectElement>(container, '#managed-broker-select').value = '';
        sempMock.connect.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await Promise.resolve();
        expect(sempMock.connect).not.toHaveBeenCalled();
    });

    it('Connect is a no-op when no VPN is selected', async () => {
        const { container, ctx } = await signedIn();
        el<HTMLSelectElement>(container, '#managed-vpn-select').value = '';
        sempMock.connect.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await Promise.resolve();
        expect(sempMock.connect).not.toHaveBeenCalled();
    });

    it('SEMP onConnected publishes sempCredentials + emits semp:connected', async () => {
        const { container, ctx } = await signedIn();
        const semp = vi.fn();
        ctx.eventBus.on('semp:connected', semp);
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(sempMock.connect).toHaveBeenCalled());

        sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: '/managed/relay/b1' }, { user: '', pass: '' });

        expect(ctx.appState.isSempConnected).toBe(true);
        expect(ctx.appState.sempCredentials).toEqual({
            user: '', pass: '', baseUrl: '/managed/relay/b1', protocol: 'https', host: 'b1', port: '', urlPath: '',
            relay: '/managed/relay/b1',
        });
        expect(semp).toHaveBeenCalled();
    });

    it('Solace onConnected publishes state, emits client:connected, shows connected view', async () => {
        const { container, ctx } = await signedIn();
        const client = vi.fn();
        ctx.eventBus.on('client:connected', client);
        await connectToB1Vpn1(container, ctx);

        expect(ctx.appState.isConnected).toBe(true);
        expect(ctx.appState.selectedVpn).toBe('vpn1');
        expect(ctx.appState.solaceConnection).toEqual({
            host: 'b1', protocol: 'wss', port: '', urlPath: '', vpn: 'vpn1', user: 'u-vpn1', pass: '',
        });
        expect(client).toHaveBeenCalledWith({ session: { id: 'session' } });
        expect(hidden(container, '#managed-connected-view')).toBe(false);
        // The dialled password reached the SDK only: nothing in AppState holds it.
        expect(JSON.stringify(ctx.appState)).not.toContain('pw-vpn1');
    });

    it("shows a refused dial's reason on the selection view", async () => {
        const { container, ctx } = await signedIn();
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 404, code: 'not_found' });
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toBe('Not found. It may already have been removed.'));
        expect(solaceMock.connect).not.toHaveBeenCalled();
        expect(ctx.appState.managed).not.toBeNull();
    });

    it('signs out when the dial says the gateway session has ended', async () => {
        const { container, ctx } = await signedIn();
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthenticated' });
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
    });

    it('signs out, without dialling, when the relay says the session has ended', async () => {
        const { container, ctx } = await signedIn();
        sempMock.connect.mockImplementationOnce(async () => { sempMock.hooks.onAuthFailed(); });
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
        expect(svcMock.dial).not.toHaveBeenCalled();
        expect(solaceMock.connect).not.toHaveBeenCalled();
        expect(hidden(container, '#managed-connect-error')).toBe(true);
    });
});

describe('managed-connections — lifecycle hooks', () => {
    it('Solace onDisconnected clears state and returns to selection', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        solaceMock.hooks.onDisconnected();
        expect(ctx.appState.isConnected).toBe(false);
        expect(ctx.appState.solaceConnection).toBeNull();
        expect(hidden(container, '#managed-select-view')).toBe(false);
    });

    it('Solace onConnectFailed / onError surface to the connect error', async () => {
        const { container, ctx } = await signedIn();
        solaceMock.hooks.onConnectFailed({ infoStr: 'refused' });
        expect(el(container, '#managed-connect-error').textContent).toMatch(/refused/);
        solaceMock.hooks.onError(new Error('tls'));
        expect(el(container, '#managed-connect-error').textContent).toBe('tls');
    });

    it('SEMP onDisconnected / onError', async () => {
        const { container, ctx } = await signedIn();
        // Connect first so lastSempAttempt is set before onConnected fires
        // (the hook only fires after connectSemp in the real flow).
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(sempMock.connect).toHaveBeenCalled());
        sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: 'b' }, { user: '', pass: '' });
        sempMock.hooks.onDisconnected();
        expect(ctx.appState.isSempConnected).toBe(false);
        expect(ctx.appState.sempCredentials).toBeNull();
        sempMock.hooks.onError({ message: 'down', isNetworkError: true, isTimeout: false, baseUrl: 'b' });
        expect(el(container, '#managed-connect-error').textContent).toMatch(/SEMP error: down/);
    });

    it('SEMP onAuthFailed (a relay 401: the gateway session ended) signs out', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        sempMock.hooks.onAuthFailed();
        expect(ctx.appState.managed).toBeNull();
        expect(solaceMock.disconnect).toHaveBeenCalled();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
    });
});

describe('managed-connections — disconnect / logout', () => {
    it('Disconnect button tears down both connections', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        el<HTMLButtonElement>(container, '#btn-managed-disconnect').click();
        expect(solaceMock.disconnect).toHaveBeenCalled();
        expect(sempMock.disconnect).toHaveBeenCalled();
    });

    it('Sign out ends the gateway session, clears the local one, emits rbac:changed, returns to sign-in', async () => {
        const { container, ctx } = await signedIn();
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);
        signOut();
        expect(svcMock.logout).toHaveBeenCalledTimes(1);
        expect(ctx.appState.managed).toBeNull();
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(rbac).toHaveBeenCalled();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-login-error')).toBe(true);
        expect(solaceMock.disconnect).toHaveBeenCalled();
    });
});

// user-management asks for this after a change ended the admin's own session;
// the managed entry routes it to the panel's sign-out.
describe('connections/managed panel — rbac:sign-out-requested', () => {
    it('ends the managed session and drops its broker connection', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);

        ctx.eventBus.emit('rbac:sign-out-requested');

        expect(solaceMock.disconnect).toHaveBeenCalled();
        expect(sempMock.disconnect).toHaveBeenCalled();
        expect(ctx.appState.managed).toBeNull();
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(rbac).toHaveBeenCalled();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(svcMock.logout).toHaveBeenCalledTimes(1);
    });

    it('leaves a Direct-only session alone', async () => {
        // Both tabs offered (the `bothTabs()` config of this file's
        // "connections/managed panel — mode interlock + tab activation" suite),
        // Direct live, no managed session.
        hostedMock.probeDeployment.mockResolvedValue({
            hosted: true, conn: { connModes: 'both', defaultConn: 'direct' },
        });
        const { ctx } = await setup();
        ctx.appState.isConnected = true;
        ctx.appState.isSempConnected = true;

        ctx.eventBus.emit('rbac:sign-out-requested');

        for (const inst of [...solaceMock.instances, ...sempMock.instances]) {
            expect(inst.disconnect).not.toHaveBeenCalled();
        }
        expect(ctx.appState.isSempConnected).toBe(true);
    });
});

describe('managed-connections — refresh entitlements', () => {
    it('re-reads the session and updates it', async () => {
        const { container, ctx } = await signedIn();
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);
        svcMock.me.mockResolvedValue(OK({ ...PROFILE, admin: false, operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }] }));
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.admin).toBe(false));
        expect(ctx.appState.managed!.readOnly.length).toBe(1);
        expect(rbac).toHaveBeenCalled();
        expect(hidden(container, '#managed-connect-error')).toBe(true);
    });

    it('drops the session when the gateway has ended it', async () => {
        const { container, ctx } = await signedIn();
        svcMock.me.mockResolvedValue(NO_SESSION);
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
        expect(el<HTMLAnchorElement>(container, '#btn-managed-login').getAttribute('href')).toBe('/login');
    });

    it('drops the session and points at the password page when a change is now required', async () => {
        const { container, ctx } = await signedIn();
        svcMock.me.mockResolvedValue({ ok: false, status: 403, code: 'password_change_required' });
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(el<HTMLAnchorElement>(container, '#btn-managed-login').getAttribute('href')).toBe('/login/password');
    });

    it('keeps the last-known connections when the gateway fails otherwise', async () => {
        const { container, ctx } = await signedIn();
        svcMock.me.mockResolvedValue({ ok: false, status: 0, code: 'network' });
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toBe('The gateway could not be reached.'));
        expect(ctx.appState.managed!.username).toBe('admin');
        expect(hidden(container, '#managed-select-view')).toBe(false);
    });
});

describe('managed-connections — provisioned VPN publishing', () => {
    it('signing in alone leaves the provisioned VPN set empty (not connected yet)', async () => {
        const { container, ctx } = await signedIn();
        expect(ctx.appState.managed!.vpns).toEqual([]);
    });

    it('connect publishes the connected broker\'s provisioned VPNs', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        // b1 provisions vpn1 + vpn2 in PROFILE — that's what the picker should list,
        // regardless of the broad `msgVpns: '*'` entitlement glob.
        expect(ctx.appState.managed!.vpns).toEqual(['vpn1', 'vpn2']);
    });

    it('refresh recomputes the provisioned VPNs for the connected broker', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        expect(ctx.appState.managed!.vpns).toEqual(['vpn1', 'vpn2']);

        // Admin removed vpn2 from b1 in connections.yaml; Refresh picks it up.
        const trimmed = {
            ...PROFILE,
            brokers: [
                { ...PROFILE.brokers[0], msgVpns: [PROFILE.brokers[0].msgVpns[0]] },
                PROFILE.brokers[1],
            ],
        };
        svcMock.me.mockResolvedValue(OK(trimmed));
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.vpns).toEqual(['vpn1']));
    });

    it('refresh empties the provisioned VPNs when the connected broker is no longer provisioned', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        const noB1 = { ...PROFILE, brokers: [PROFILE.brokers[1]] }; // b1 dropped entirely
        svcMock.me.mockResolvedValue(OK(noB1));
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.vpns).toEqual([]));
    });
});

describe('managed-connections — defensive paths', () => {
    it('Solace onDisconnected after logout leaves the login view (no profile)', async () => {
        const { container, ctx } = await signedIn();
        signOut();
        // A late SDK disconnect callback with the session already torn down.
        solaceMock.hooks.onDisconnected();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
        expect(ctx.appState.isConnected).toBe(false);
    });

    it('gives up the VPN switch when the reconnect itself disconnects', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        ctx.eventBus.emit('client:disconnected'); // → reconnect + waitForConnect
        ctx.eventBus.emit('client:disconnected'); // → waitForConnect onFail → give up
        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).not.toHaveBeenCalled();
    });
});

describe('managed-connections — connection:edit-requested', () => {
    it('navigates to selection when logged in', async () => {
        const { container, ctx } = await signedIn();
        ctx.eventBus.emit('connection:edit-requested');
        expect(ctx.loadSelf).toHaveBeenCalled();
        expect(hidden(container, '#managed-select-view')).toBe(false);
    });

    it('navigates to login when not logged in', async () => {
        const { container, ctx } = await setup();
        ctx.eventBus.emit('connection:edit-requested');
        expect(hidden(container, '#managed-login-view')).toBe(false);
    });
});

describe('managed-connections — createQueueBrowser wrap', () => {
    function fakeBrowser() {
        return { on: vi.fn(), _messageConsumer: { _permissions: 'READ_WRITE' } };
    }
    function fakeSession(browser: any = fakeBrowser()) {
        return { createQueueBrowser: vi.fn(() => browser) };
    }

    // Connect, then deliver a session that exposes createQueueBrowser so the wrap installs.
    async function connectWithSession(session: any, profile: unknown = PROFILE) {
        const { container, ctx } = await signedIn(profile);
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());
        solaceMock.hooks.onConnected(session, 'vpn1'); // installs the wrap on `session`
        return { container, ctx };
    }

    it('throws when binding a non-entitled queue, allows an entitled one', async () => {
        const restrictive = { ...PROFILE, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'allowed' }] };
        const session = fakeSession();
        await connectWithSession(session, restrictive);
        expect(() => session.createQueueBrowser({ queueDescriptor: { name: 'denied' } })).toThrow(/not entitled/i);
        expect(() => session.createQueueBrowser({ queueDescriptor: { name: 'allowed' } })).not.toThrow();
    });

    // Read-only rows are queue-browser's to apply (ui-table.ts, downgrade
    // only): the wrap never touches the browser the SDK hands back.
    it('leaves a read-only queue\'s browser exactly as the SDK made it', async () => {
        const ro = { ...PROFILE, operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }] };
        const browser = fakeBrowser();
        const session = fakeSession(browser);
        await connectWithSession(session, ro);
        expect(session.createQueueBrowser({ queueDescriptor: { name: 'q1' } })).toBe(browser);
        expect(browser.on).not.toHaveBeenCalled();
        expect(browser._messageConsumer._permissions).toBe('READ_WRITE');
    });

    it('reads the queue name via getName() when .name is absent', async () => {
        const session = fakeSession();
        await connectWithSession(session, PROFILE);
        // operate '*' → visible; just assert no throw and the descriptor is consumed.
        expect(() => session.createQueueBrowser({ queueDescriptor: { getName: () => 'q-getname' } })).not.toThrow();
    });

    it('tolerates an empty/unknown queue descriptor (queue name "")', async () => {
        const session = fakeSession();
        await connectWithSession(session, PROFILE); // operate '*' matches '' too
        expect(() => session.createQueueBrowser({ queueDescriptor: {} })).not.toThrow();
    });

    it('falls back to a plain browser when the managed session is gone (post-logout)', async () => {
        const browser = fakeBrowser();
        const session = fakeSession(browser);
        const { ctx } = await connectWithSession(session, PROFILE);
        ctx.setState('managed', null);
        // No throw, no override — the wrap delegates straight to the real
        // createQueueBrowser and returns its browser (the spy is now captured
        // inside the wrap as realCreate, so we verify delegation by its return).
        const result = session.createQueueBrowser({ queueDescriptor: { name: 'anything' } });
        expect(result).toBe(browser);
    });
});

describe('managed-connections — connection:check-connection', () => {
    it('navigates to selection when not connected', async () => {
        const { container, ctx } = await signedIn();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'q1' });
        expect(ctx.loadSelf).toHaveBeenCalled();
        expect(hidden(container, '#managed-select-view')).toBe(false);
    });

    it('navigates to login when not connected and not signed in', async () => {
        const { container, ctx } = await setup();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'v', queue: 'q' });
        expect(ctx.loadSelf).toHaveBeenCalled();
        expect(hidden(container, '#managed-login-view')).toBe(false);
    });

    it('finishes immediately when already on the target VPN (browse)', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'qX' });
        expect(browse).toHaveBeenCalledWith({ queue: 'qX' });
    });

    it('routes to copy:vpn-switched when returnTo is queue-copy', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        const copy = vi.fn();
        ctx.eventBus.on('copy:vpn-switched', copy);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'qX', returnTo: 'queue-copy' });
        expect(copy).toHaveBeenCalledWith({ vpn: 'vpn1', queue: 'qX' });
    });

    it('switches VPN: disconnect -> dial again -> reconnect -> finish', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        (globalThis.confirm as any).mockReturnValue(true);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).toHaveBeenCalled();

        solaceMock.connect.mockClear();
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ vpn: 'vpn2', smfPath: '/managed/smf/b1/vpn2' }), 'b1', 'pw-vpn2', expect.any(String),
        ));
        expect(svcMock.dial.mock.calls).toEqual([['b1', 'vpn1'], ['b1', 'vpn2']]);

        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).toHaveBeenCalledWith({ queue: 'qZ' });
    });

    it('does not switch when the user cancels the confirm', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(false);
        solaceMock.disconnect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).not.toHaveBeenCalled();
    });

    it('ignores a duplicate request while a switch is in progress', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        solaceMock.disconnect.mockClear();
        // Second request while opInProgress — must be ignored (no extra disconnect).
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).not.toHaveBeenCalled();
    });

    it('errors when the target VPN is not on the connected broker', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        solaceMock.connect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'ghost', queue: 'qZ' });
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toMatch(/not provisioned/));
        expect(solaceMock.connect).not.toHaveBeenCalled();
    });

    it('signs out when the VPN switch dial finds the gateway session ended', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthenticated' });
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(hidden(container, '#managed-login-view')).toBe(false);
    });

    it('a refused switch dial ends the switch: a later connect does not finish it, and the next request runs', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 429, code: 'rate_limited' });

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toMatch(/Too many requests/));

        // The user connects again by hand: that is not the abandoned switch.
        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).not.toHaveBeenCalled();

        solaceMock.disconnect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).toHaveBeenCalled();
    });

    it('clears the in-progress flag if the reconnect never completes (30s timeout)', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        vi.useFakeTimers();
        try {
            ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
            ctx.eventBus.emit('client:disconnected'); // triggers reconnect + waitForConnect
            await Promise.resolve();
            vi.advanceTimersByTime(30_000); // no client:connected → cleanup fires
            const browse = vi.fn();
            ctx.eventBus.on('browser:browse-queue', browse);
            ctx.eventBus.emit('client:connected', { session: {} }); // listener already cleaned up
            expect(browse).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('aborts the switch if the disconnect never arrives (10s timeout)', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        vi.useFakeTimers();
        try {
            ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
            solaceMock.connect.mockClear();
            vi.advanceTimersByTime(10_000); // no client:disconnected → abort
            ctx.eventBus.emit('client:disconnected'); // listener already removed
            expect(solaceMock.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});

// The managed entry runs Direct and Managed side by side, so exactly one may be
// live at a time and the Managed tab must re-show the right view when activated.
describe('connections/managed panel — mode interlock + tab activation', () => {
    /** Both tabs offered, Direct active first (so tab switching is exercisable). */
    function bothTabs() {
        hostedMock.probeDeployment.mockResolvedValue({
            hosted: true, conn: { connModes: 'both', defaultConn: 'direct' },
        });
    }
    // Install order (module.managed.ts step 2): Direct pair first, Managed pair last.
    const directSolace = () => solaceMock.instances[0];
    const directSemp = () => sempMock.instances[0];

    it('re-shows the sign-in view as the Provisioned tab is activated without a session', async () => {
        bothTabs();
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#conn-tab-managed').click();
        expect(hidden(container, '#managed-login-view')).toBe(false);
    });

    it('re-shows the select / connected view as the Provisioned tab is activated', async () => {
        bothTabs();
        const { container } = await signedIn();
        const managedTab = el<HTMLButtonElement>(container, '#conn-tab-managed');
        const directTab = el<HTMLButtonElement>(container, '#conn-tab-direct');

        // Signed in, not connected → selection view.
        directTab.click();
        managedTab.click();
        expect(hidden(container, '#managed-select-view')).toBe(false);

        // Connected → connected view.
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());
        sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: 'base' }, { user: '', pass: '' });
        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        directTab.click();
        managedTab.click();
        expect(hidden(container, '#managed-connected-view')).toBe(false);
    });

    it('connecting via Managed tears down a live Direct connection', async () => {
        bothTabs();
        const { container, ctx } = await signedIn();
        // Pretend the Direct tab already holds both connections.
        ctx.appState.isConnected = true;
        ctx.appState.isSempConnected = true;

        el<HTMLButtonElement>(container, '#btn-managed-connect').click();

        await vi.waitFor(() => expect(directSolace().disconnect).toHaveBeenCalled());
        expect(directSemp().disconnect).toHaveBeenCalled();
    });

    it('connecting via Direct clears the managed session so RBAC cannot leak onto it', async () => {
        bothTabs();
        const { container, ctx } = await signedIn();
        expect(ctx.appState.managed).not.toBeNull();

        // Fill the minimum valid Direct form and connect.
        el<HTMLInputElement>(container, '#conn-host').value = 'broker.test';
        el<HTMLInputElement>(container, '#solace-port').value = '8080';
        el<HTMLInputElement>(container, '#solace-vpn').value = 'vpn';
        el<HTMLInputElement>(container, '#solace-username').value = 'u';
        el<HTMLButtonElement>(container, '#btn-solace-connect').click();

        expect(ctx.appState.managed).toBeNull();          // session dropped
        expect(directSolace().connect).toHaveBeenCalled(); // direct connect proceeded
    });
});
