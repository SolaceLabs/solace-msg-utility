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
        const inst = { hooks, init: vi.fn(), connect: vi.fn(() => ({ ok: true })), disconnect: vi.fn(() => ({ ok: true })), cleanup: vi.fn() };
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
    probeDeployment: hostedMock.probeDeployment, isHostedDeployment: () => true,
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
import { completeContext } from '../../helpers/appContext';

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

/** The sidebar slot the panel mounts its account control into. */
let sidebar: HTMLElement;
const account = () => sidebar.querySelector<HTMLElement>('.account-control')!;
const signOut = () => account().querySelector<HTMLButtonElement>('.account-control-signout')!.click();

function makeCtx(container: HTMLElement): AppContext {
    sidebar = document.createElement('div');
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false,
    };
    return completeContext({
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; eventBus.emit('app:state-change', { key: k, value: v }); },
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        // The REAL profile (over the mocked gateway calls above): this panel is
        // its writer, so the suite covers login -> setProfile -> dial end to end.
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        mountSidebarAccount: (node: HTMLElement) => { sidebar.replaceChildren(node); },
    });
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

const SEMP_CTX = { fetch: vi.fn(), baseUrl: '/managed/relay/b1' };
const NO_CREDENTIALS = { user: '', pass: '' };

/**
 * How the managed pair's SEMP client answers the relay probe of a Connect: each
 * variant fires the hook the real client would (call after the install, which
 * creates the pair). A Connect with none of them gets no answer at all. A
 * disconnect reports back through `onDisconnected`, as the real client does.
 */
function answerProbe(fire: () => void): void {
    sempMock.connect.mockImplementation(async () => { fire(); });
    sempMock.disconnect.mockImplementation(async () => { sempMock.hooks.onDisconnected(); });
}
const semp = {
    up: () => answerProbe(() => sempMock.hooks.onConnected(SEMP_CTX, NO_CREDENTIALS)),
    fails: (info: { message: string; code?: string; isTimeout?: boolean }) => answerProbe(() => sempMock.hooks.onError({
        isNetworkError: false, isTimeout: false, baseUrl: '/managed/relay/b1', ...info,
    })),
    /** The relay answers 401: the gateway session has ended. */
    sessionEnded: () => answerProbe(() => sempMock.hooks.onAuthFailed()),
    /** The probe waits; the returned function lets it succeed. */
    pending(): () => void {
        let release = () => {};
        sempMock.disconnect.mockImplementation(async () => { sempMock.hooks.onDisconnected(); });
        sempMock.connect.mockImplementation(() => new Promise<void>(resolve => {
            release = () => { sempMock.hooks.onConnected(SEMP_CTX, NO_CREDENTIALS); resolve(); };
        }));
        return () => release();
    },
};

const clickConnect = (c: HTMLElement) => el<HTMLButtonElement>(c, '#btn-managed-connect').click();
/** The Connect has reached the messaging step: the SDK was asked to connect. */
const messagingStarted = () => vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());
const connectError = (c: HTMLElement) => el(c, '#managed-connect-error').textContent;
const failed = (c: HTMLElement) => vi.waitFor(() => expect(hidden(c, '#managed-connect-error')).toBe(false));
/** Let every pending promise step run, for a test that asserts something did NOT happen. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
/** The failure texts the notification bell holds. */
const bell = (ctx: AppContext) => ctx.notifications.entries().map(e => [e.level, e.module, e.text]);

/** The bus events a connection announces, in order. */
function announcements(ctx: AppContext): string[] {
    const seen: string[] = [];
    ctx.eventBus.on('semp:connected', () => seen.push('semp:connected'));
    ctx.eventBus.on('semp:disconnected', () => seen.push('semp:disconnected'));
    ctx.eventBus.on('client:connected', () => seen.push('client:connected'));
    ctx.eventBus.on('client:disconnected', () => seen.push('client:disconnected'));
    return seen;
}

/** Signed in, SEMP answering -> Connect -> both up: fully "connected to vpn1 on b1". */
async function connectToB1Vpn1(container: HTMLElement, session: unknown = { id: 'session' }) {
    semp.up();
    clickConnect(container);
    await messagingStarted();
    solaceMock.hooks.onConnected(session, 'vpn1');
    await vi.waitFor(() => expect(hidden(container, '#managed-connected-view')).toBe(false));
}

/**
 * Answer the open VPN-switch question (the core confirm dialog) and let the
 * switch go on.
 */
async function answerSwitch(yes: boolean): Promise<void> {
    const dialog = document.querySelector('dialog.confirm-dialog') as HTMLDialogElement;
    (dialog.querySelector(yes ? '.confirm-dialog-ok' : '.confirm-dialog-cancel') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
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
        // The account control in the sidebar: who, and the actions.
        expect(account().classList.contains('hidden')).toBe(false);
        expect(account().querySelector('.account-control-name')!.textContent).toBe('admin');
        expect(account().querySelector('.account-control-password')!.getAttribute('href')).toBe('/login/password');
        const link = account().querySelector('.account-control-twofactor')!;
        expect([link.classList.contains('hidden'), link.getAttribute('href')]).toEqual([false, '/login/two-factor']);
    });

    it('keeps the account control in the sidebar through a connection, and signs out from there', async () => {
        const { container } = await signedIn();
        await connectToB1Vpn1(container);
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
        const { container } = await signedIn();
        const broker = el<HTMLSelectElement>(container, '#managed-broker-select');
        broker.value = 'b2';
        broker.dispatchEvent(new Event('change'));
        expect(el<HTMLSelectElement>(container, '#managed-vpn-select').disabled).toBe(true);
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(true);
    });

    it('vpn change re-evaluates the Connect button', async () => {
        const { container } = await signedIn();
        const vpn = el<HTMLSelectElement>(container, '#managed-vpn-select');
        vpn.value = 'vpn2';
        vpn.dispatchEvent(new Event('change'));
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
    });
});

describe('managed-connections — connect', () => {
    it('connects SEMP through the relay and Solace through a dialled SMF socket, then emits the message cap once both are up', async () => {
        const { container, ctx } = await signedIn();
        const cap = vi.fn();
        ctx.eventBus.on('config:max-messages-changed', cap);
        semp.up();

        clickConnect(container);
        await messagingStarted();

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
        expect(cap).not.toHaveBeenCalled();

        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        await vi.waitFor(() => expect(cap).toHaveBeenCalledWith({ value: 100 }));
    });

    // Both guard tests log in first (which ENABLES the Connect button — jsdom
    // won't fire activation on a disabled button), then clear a select's value
    // directly so doConnect runs and hits the !brokerName / !vpnName guard.
    it('Connect is a no-op when no broker is selected', async () => {
        const { container } = await signedIn();
        el<HTMLSelectElement>(container, '#managed-broker-select').value = '';
        sempMock.connect.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await Promise.resolve();
        expect(sempMock.connect).not.toHaveBeenCalled();
    });

    it('Connect is a no-op when no VPN is selected', async () => {
        const { container } = await signedIn();
        el<HTMLSelectElement>(container, '#managed-vpn-select').value = '';
        sempMock.connect.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await Promise.resolve();
        expect(sempMock.connect).not.toHaveBeenCalled();
    });

    it('announces SEMP, then messaging, and nothing before both are up', async () => {
        const { container, ctx } = await signedIn();
        const seen: string[] = [];
        ctx.eventBus.on('app:state-change', ({ key, value }: any) => {
            if (key === 'isSempConnected' || key === 'isConnected') seen.push(`${key}=${value}`);
        });
        const events = announcements(ctx);
        semp.up();

        clickConnect(container);
        await messagingStarted();   // SEMP answered, messaging is on its way
        expect([seen, events, ctx.appState.sempCredentials]).toEqual([[], [], null]);

        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        await vi.waitFor(() => expect(hidden(container, '#managed-connected-view')).toBe(false));
        expect(seen).toEqual(['isSempConnected=true', 'isConnected=true']);
        expect(events).toEqual(['semp:connected', 'client:connected']);
    });

    it('publishes both connections once they are up, with no password anywhere in AppState, and shows the connected view', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);

        expect(ctx.appState.isSempConnected).toBe(true);
        expect(ctx.appState.sempCredentials).toEqual({
            user: '', pass: '', baseUrl: '/managed/relay/b1', protocol: 'https', host: 'b1', port: '', urlPath: '',
            relay: '/managed/relay/b1',
        });
        expect(ctx.appState.isConnected).toBe(true);
        expect(ctx.appState.selectedVpn).toBe('vpn1');
        expect(ctx.appState.solaceConnection).toEqual({
            host: 'b1', protocol: 'wss', port: '', urlPath: '', vpn: 'vpn1', user: 'u-vpn1', pass: '',
        });
        expect(el(container, '#managed-connected-summary').textContent).toBe('Broker "b1", VPN "vpn1"');
        expect(hidden(container, '#managed-select-view')).toBe(true);
        expect(JSON.stringify(ctx.appState)).not.toContain('pw-vpn1');
    });

    it('shows the step the Connect is on, and keeps Connect disabled until the outcome', async () => {
        const { container } = await signedIn();
        const release = semp.pending();
        const button = () => el<HTMLButtonElement>(container, '#btn-managed-connect');
        const status = () => el(container, '#managed-select-view .prov-conn-status').textContent;

        clickConnect(container);
        await vi.waitFor(() => expect(sempMock.connect).toHaveBeenCalled());
        expect([status(), button().textContent, button().disabled])
            .toEqual(['Connecting SEMP (management) to broker "b1"...', 'Connecting...', true]);

        release();
        await messagingStarted();
        expect([status(), button().textContent, button().disabled])
            .toEqual(['Connecting messaging (client) to broker "b1", VPN "vpn1"...', 'Connecting...', true]);

        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        await vi.waitFor(() => expect(button().textContent).toBe('Disconnect'));
        expect(button().disabled).toBe(false);
    });
});

describe('managed-connections -- a Connect that fails', () => {
    /** Neither connection is announced, and what came up was closed: the state of a refused Connect. */
    function expectNothingAnnounced(ctx: AppContext, events: string[]): void {
        expect(events).toEqual([]);
        expect([ctx.appState.isConnected, ctx.appState.isSempConnected, ctx.appState.sempCredentials])
            .toEqual([false, false, null]);
    }
    const connectButton = (c: HTMLElement) => el<HTMLButtonElement>(c, '#btn-managed-connect');

    it('SEMP failed, messaging up: messaging is closed again, nothing is announced, both lines show and the bell gets the detail', async () => {
        const { container, ctx } = await signedIn();
        const events = announcements(ctx);
        semp.fails({ message: 'The gateway could not reach the broker.', code: 'upstream_unavailable' });

        clickConnect(container);
        await messagingStarted();   // messaging runs even though SEMP failed
        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        await failed(container);

        expect(connectError(container)).toBe(
            'SEMP (management): broker not reachable\nMessaging (client): connected, closed because SEMP failed',
        );
        expect(solaceMock.disconnect).toHaveBeenCalledTimes(1);
        solaceMock.hooks.onDisconnected();   // the SDK confirming the close announces nothing either
        expectNothingAnnounced(ctx, events);
        expect(bell(ctx)).toEqual([['error', 'Connections', 'SEMP (management): The gateway could not reach the broker.']]);
        expect(hidden(container, '#managed-select-view')).toBe(false);
        expect([connectButton(container).textContent, connectButton(container).disabled]).toEqual(['Connect', false]);
    });

    it('SEMP up, messaging failed: SEMP is never announced', async () => {
        const { container, ctx } = await signedIn();
        const events = announcements(ctx);
        semp.up();

        clickConnect(container);
        await messagingStarted();
        solaceMock.hooks.onConnectFailed({ infoStr: 'VPN shut down' });
        await failed(container);

        expect(connectError(container)).toBe(
            'Messaging (client): Connection failed: VPN shut down\nSEMP (management): connected, closed because messaging failed',
        );
        expectNothingAnnounced(ctx, events);
        expect(sempMock.disconnect).not.toHaveBeenCalled();   // held, never opened to the app
        expect(bell(ctx)).toEqual([['error', 'Connections', 'Messaging (client): Connection failed: VPN shut down']]);
    });

    it('both failed: one line each, short reasons on the card and the full text in the bell', async () => {
        const { container, ctx } = await signedIn();
        const events = announcements(ctx);
        const timedOut = 'Connection timed out (10s). Check host and port.';
        const long = `The SDK refused the connection with a reason that does not fit on a card line: ${'x'.repeat(40)}`;
        semp.fails({ message: timedOut, isTimeout: true });

        clickConnect(container);
        await messagingStarted();
        solaceMock.hooks.onError(new Error(long));
        await failed(container);

        expect(connectError(container)).toBe(
            'SEMP (management): broker not reachable (timed out)\nMessaging (client): failed, details in the log',
        );
        expect(bell(ctx)).toEqual([
            ['error', 'Connections', `SEMP (management): ${timedOut}`],
            ['error', 'Connections', `Messaging (client): ${long}`],
        ]);
        expectNothingAnnounced(ctx, events);
        expect(solaceMock.disconnect).not.toHaveBeenCalled();   // nothing came up
    });

    it('a SEMP probe that ends without an answer fails the SEMP step', async () => {
        const { container, ctx } = await signedIn();   // no `semp.*`: the client fires no hook
        clickConnect(container);
        await messagingStarted();
        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        await failed(container);
        expect(connectError(container)).toBe(
            'SEMP (management): The SEMP check gave no answer.\nMessaging (client): connected, closed because SEMP failed',
        );
        expect(ctx.appState.isConnected).toBe(false);
    });

    it('a relay 401 during the probe signs out: no dial, no messaging, nothing on the card or in the bell', async () => {
        const { container, ctx } = await signedIn();
        semp.sessionEnded();
        clickConnect(container);
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        await settle();
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
        expect(svcMock.dial).not.toHaveBeenCalled();
        expect(solaceMock.connect).not.toHaveBeenCalled();
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(bell(ctx)).toEqual([]);
    });

    it('a dial refused because the session ended signs out, and the SEMP side that came up is never announced', async () => {
        const { container, ctx } = await signedIn();
        const events = announcements(ctx);
        semp.up();
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthenticated' });

        clickConnect(container);
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        await settle();
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(solaceMock.connect).not.toHaveBeenCalled();
        expectNothingAnnounced(ctx, events);
        expect(bell(ctx)).toEqual([]);
    });

    it('a dial refused with a gateway code gives the short line, the full sentence goes to the bell, and SEMP is closed again', async () => {
        const { container, ctx } = await signedIn();
        const events = announcements(ctx);
        semp.up();
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 429, code: 'rate_limited' });

        clickConnect(container);
        await failed(container);

        expect(connectError(container)).toBe(
            'Messaging (client): too many attempts, wait a minute\nSEMP (management): connected, closed because messaging failed',
        );
        expect(solaceMock.connect).not.toHaveBeenCalled();
        expectNothingAnnounced(ctx, events);
        expect(bell(ctx)).toEqual([['error', 'Connections', 'Messaging (client): Too many requests. Wait a minute and try again.']]);
        expect(ctx.appState.managed).not.toBeNull();   // still signed in
    });

    it('a connect start the SDK client refuses without reporting an error fails the messaging step', async () => {
        const { container } = await signedIn();
        semp.up();
        solaceMock.connect.mockImplementation(() => ({ ok: false, error: 'A connection attempt is already in progress.' }));
        clickConnect(container);
        await failed(container);
        expect(connectError(container)).toBe(
            'Messaging (client): A connection attempt is already in progress.\nSEMP (management): connected, closed because messaging failed',
        );
    });

    it('a session that closes before it is up fails the messaging step', async () => {
        const { container, ctx } = await signedIn();
        semp.up();
        clickConnect(container);
        await messagingStarted();
        solaceMock.hooks.onDisconnected();
        await failed(container);
        expect(connectError(container)).toBe(
            'Messaging (client): The messaging session closed before it was up.\nSEMP (management): connected, closed because messaging failed',
        );
        expect(ctx.appState.isSempConnected).toBe(false);
    });

    it('a DISCONNECTED from an earlier session while the dial is still running does not settle the attempt', async () => {
        const { container } = await signedIn();
        semp.up();
        let answer: (v: unknown) => void = () => {};
        svcMock.dial.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        clickConnect(container);
        await vi.waitFor(() => expect(svcMock.dial).toHaveBeenCalled());

        solaceMock.hooks.onDisconnected();   // the late close of the session a dropped Connect left behind
        await settle();
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(true);

        answer(dialed('b1', 'vpn1'));
        await messagingStarted();
        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        await vi.waitFor(() => expect(hidden(container, '#managed-connected-view')).toBe(false));
        expect(hidden(container, '#managed-connect-error')).toBe(true);
    });

    it('a broker the profile does not provision stops the Connect at SEMP with the profile\'s reason: no dial, no messaging', async () => {
        const { container, ctx } = await signedIn();
        // A stale choice: the page still offers a broker the profile no longer holds.
        const broker = el<HTMLSelectElement>(container, '#managed-broker-select');
        const vpn = el<HTMLSelectElement>(container, '#managed-vpn-select');
        broker.add(new Option('ghost', 'ghost'));
        broker.value = 'ghost';
        vpn.add(new Option('v', 'v'));
        vpn.value = 'v';
        vpn.dispatchEvent(new Event('change'));

        clickConnect(container);
        await failed(container);

        const reason = 'SEMP (management): Broker "ghost" is not provisioned for this account.';
        expect(connectError(container)).toBe(reason);
        expect(svcMock.dial).not.toHaveBeenCalled();
        expect(solaceMock.connect).not.toHaveBeenCalled();
        expect(bell(ctx)).toEqual([['error', 'Connections', reason]]);
    });

    it('a Connect clicked after the sign-out opens nothing and shows nothing', async () => {
        const { container, ctx } = await signedIn();
        signOut();
        clickConnect(container);
        await settle();
        expect(sempMock.connect).not.toHaveBeenCalled();
        expect(svcMock.dial).not.toHaveBeenCalled();
        expect(solaceMock.connect).not.toHaveBeenCalled();
        // The card is back to Connect, and no managed session was written.
        expect(ctx.appState.managed).toBeNull();
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
        expect(hidden(container, '#managed-select-view .prov-conn-status')).toBe(true);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(bell(ctx)).toEqual([]);
    });

    describe('signing out while the sequence runs', () => {
        it('during the SEMP probe: what the probe then opens is dropped, and nothing shows', async () => {
            const { container, ctx } = await signedIn();
            const events = announcements(ctx);
            const release = semp.pending();
            clickConnect(container);
            await vi.waitFor(() => expect(sempMock.connect).toHaveBeenCalled());

            signOut();
            release();   // the probe answers after the sign-out
            await settle();

            expectNothingAnnounced(ctx, events);
            expect(svcMock.dial).not.toHaveBeenCalled();
            expect(hidden(container, '#managed-login-view')).toBe(false);
            expect(hidden(container, '#managed-connect-error')).toBe(true);
            expect(bell(ctx)).toEqual([]);
            // The card reads Connect again, not 'connecting': no step line after the sign-out.
            expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
            expect(hidden(container, '#managed-select-view .prov-conn-status')).toBe(true);
        });

        it('while messaging starts: the closing session ends the sequence quietly', async () => {
            const { container, ctx } = await signedIn();
            const events = announcements(ctx);
            semp.up();
            clickConnect(container);
            await messagingStarted();

            signOut();
            solaceMock.hooks.onDisconnected();   // the SDK closes the session that was still connecting
            await settle();

            expectNothingAnnounced(ctx, events);
            expect(hidden(container, '#managed-login-view')).toBe(false);
            expect(hidden(container, '#managed-connect-error')).toBe(true);
            expect(bell(ctx)).toEqual([]);
        });

        it('the moment messaging comes up: the held session is closed and never announced', async () => {
            const { container, ctx } = await signedIn();
            const events = announcements(ctx);
            semp.up();
            clickConnect(container);
            await messagingStarted();

            solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
            signOut();   // before the Connect has seen its outcome
            await settle();

            expect(solaceMock.disconnect).toHaveBeenCalledTimes(2);   // the sign-out's, then the held session's
            expectNothingAnnounced(ctx, events);
            expect(hidden(container, '#managed-login-view')).toBe(false);
            expect(bell(ctx)).toEqual([]);
        });
    });
});

describe('managed-connections — lifecycle hooks', () => {
    it('a messaging session that drops unexpectedly closes SEMP too, and the card says so', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const events = announcements(ctx);

        solaceMock.hooks.onDisconnected();

        expect([ctx.appState.isConnected, ctx.appState.selectedVpn, ctx.appState.solaceConnection]).toEqual([false, null, null]);
        expect(sempMock.disconnect).toHaveBeenCalledTimes(1);
        expect([ctx.appState.isSempConnected, ctx.appState.sempCredentials]).toEqual([false, null]);
        expect(events).toEqual(['client:disconnected', 'semp:disconnected']);
        expect(connectError(container)).toBe('Messaging (client): connection dropped, so SEMP was closed too');
        expect(hidden(container, '#managed-select-view')).toBe(false);
        expect(hidden(container, '#managed-connected-view')).toBe(true);
    });

    it('an SDK failure or error with no Connect waiting and no VPN switch is only logged: the card and SEMP stay as they are', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const summary = el(container, '#managed-connected-summary').textContent;

        solaceMock.hooks.onConnectFailed({ infoStr: 'late' });
        solaceMock.hooks.onError(new Error('late'));

        expect(sempMock.disconnect).not.toHaveBeenCalled();
        expect(ctx.appState.isSempConnected).toBe(true);
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(hidden(container, '#managed-connected-view')).toBe(false);
        expect(el(container, '#managed-connected-summary').textContent).toBe(summary);
    });

    it('SEMP onDisconnected clears the SEMP state and tells the bus', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const events = announcements(ctx);
        sempMock.hooks.onDisconnected();
        expect(ctx.appState.isSempConnected).toBe(false);
        expect(ctx.appState.sempCredentials).toBeNull();
        expect(events).toEqual(['semp:disconnected']);
    });

    it('a SEMP answer when no Connect is waiting for it announces nothing and shows nothing', async () => {
        const { container, ctx } = await signedIn();
        const events = announcements(ctx);
        sempMock.hooks.onConnected(SEMP_CTX, NO_CREDENTIALS);
        sempMock.hooks.onError({ message: 'down', isNetworkError: true, isTimeout: false, baseUrl: 'b' });
        expect(ctx.appState.isSempConnected).toBe(false);
        expect(events).toEqual([]);
        expect(hidden(container, '#managed-connect-error')).toBe(true);
    });

    it('SEMP onAuthFailed (a relay 401: the gateway session ended) signs out', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        sempMock.hooks.onAuthFailed();
        expect(ctx.appState.managed).toBeNull();
        expect(solaceMock.disconnect).toHaveBeenCalled();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el(container, '#managed-login-error').textContent).toBe('Your session has ended. Sign in again.');
    });
});

describe('managed-connections — disconnect / logout', () => {
    it('Disconnect closes both connections and is no fault: the card says disconnected and SEMP closes once', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        el<HTMLButtonElement>(container, '#btn-managed-disconnect').click();
        expect(solaceMock.disconnect).toHaveBeenCalled();
        expect(sempMock.disconnect).toHaveBeenCalled();

        solaceMock.hooks.onDisconnected();   // the SDK confirms the close
        expect(ctx.appState.isConnected).toBe(false);
        expect(ctx.appState.isSempConnected).toBe(false);
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(hidden(container, '#managed-select-view')).toBe(false);
        expect(sempMock.disconnect).toHaveBeenCalledTimes(1);
        const button = el<HTMLButtonElement>(container, '#btn-managed-connect');
        expect([button.textContent, button.disabled]).toEqual(['Connect', false]);
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
        await connectToB1Vpn1(container);
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

    it('a refresh that works clears the last one\'s error', async () => {
        const { container } = await signedIn();
        svcMock.me.mockResolvedValue({ ok: false, status: 0, code: 'network' });
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(hidden(container, '#managed-connect-error')).toBe(false));
        svcMock.me.mockResolvedValue(OK());
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(hidden(container, '#managed-connect-error')).toBe(true));
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
    });
});

describe('managed-connections — provisioned VPN publishing', () => {
    it('signing in alone leaves the provisioned VPN set empty (not connected yet)', async () => {
        const { ctx } = await signedIn();
        expect(ctx.appState.managed!.vpns).toEqual([]);
    });

    it('connect publishes the connected broker\'s provisioned VPNs', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        // b1 provisions vpn1 + vpn2 in PROFILE — that's what the picker should list,
        // regardless of the broad `msgVpns: '*'` entitlement glob.
        expect(ctx.appState.managed!.vpns).toEqual(['vpn1', 'vpn2']);
    });

    it('refresh recomputes the provisioned VPNs for the connected broker', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
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
        await connectToB1Vpn1(container);
        const noB1 = { ...PROFILE, brokers: [PROFILE.brokers[1]] }; // b1 dropped entirely
        svcMock.me.mockResolvedValue(OK(noB1));
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.vpns).toEqual([]));
    });
});

describe('managed-connections — defensive paths', () => {
    it('a drop after the sign-out is no fault: the sign-in view stays and the card shows no error', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        signOut();
        // The SDK reports the close the sign-out asked for, with the session already gone.
        solaceMock.hooks.onDisconnected();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
        expect(hidden(container, '#managed-connect-error')).toBe(true);
        expect(ctx.appState.isConnected).toBe(false);
    });

    it('gives up the VPN switch when the reconnect itself disconnects', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
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
        return { createQueueBrowser: vi.fn((_props: unknown) => browser) };
    }

    // Connect, then deliver a session that exposes createQueueBrowser so the wrap installs.
    async function connectWithSession(session: any, profile: unknown = PROFILE) {
        const { container, ctx } = await signedIn(profile);
        await connectToB1Vpn1(container, session); // installs the wrap on `session`
        return { container, ctx };
    }

    it('throws when binding a non-entitled queue, allows an entitled one', async () => {
        const restrictive = { ...PROFILE, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'allowed' }] };
        const browser = fakeBrowser();
        const session = fakeSession(browser);
        await connectWithSession(session, restrictive);
        expect(() => session.createQueueBrowser({ queueDescriptor: { name: 'denied' } })).toThrow(/not entitled/i);
        expect(session.createQueueBrowser({ queueDescriptor: { name: 'allowed' } })).toBe(browser);
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
        const restrictive = { ...PROFILE, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'q-getname' }] };
        const browser = fakeBrowser();
        const session = fakeSession(browser);
        await connectWithSession(session, restrictive);
        // Only 'q-getname' is entitled: it resolves through getName(), another name is refused.
        expect(session.createQueueBrowser({ queueDescriptor: { getName: () => 'q-getname' } })).toBe(browser);
        expect(() => session.createQueueBrowser({ queueDescriptor: { getName: () => 'other' } })).toThrow(/not entitled/i);
    });

    it('treats an empty/unknown queue descriptor as queue name "" (allowed under operate "*")', async () => {
        const browser = fakeBrowser();
        const session = fakeSession(browser);
        await connectWithSession(session, PROFILE); // operate '*' matches '' too
        expect(session.createQueueBrowser({ queueDescriptor: {} })).toBe(browser);
    });

    it('refuses an empty/unknown queue descriptor under a restrictive profile (fail closed)', async () => {
        const restrictive = { ...PROFILE, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'allowed' }] };
        const session = fakeSession();
        await connectWithSession(session, restrictive);
        expect(() => session.createQueueBrowser({ queueDescriptor: {} })).toThrow(/not entitled/i);
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
        await connectToB1Vpn1(container);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'qX' });
        expect(browse).toHaveBeenCalledWith({ queue: 'qX' });
    });

    it('routes to copy:vpn-switched when returnTo is queue-copy', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const copy = vi.fn();
        ctx.eventBus.on('copy:vpn-switched', copy);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'qX', returnTo: 'queue-copy' });
        expect(copy).toHaveBeenCalledWith({ vpn: 'vpn1', queue: 'qX' });
    });

    it('a VPN switch keeps SEMP while it reconnects messaging: disconnect -> dial again -> reconnect -> finish', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        const seen = announcements(ctx);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        expect(solaceMock.disconnect).toHaveBeenCalled();

        solaceMock.connect.mockClear();
        solaceMock.hooks.onDisconnected();   // the SDK closes the session
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ vpn: 'vpn2', smfPath: '/managed/smf/b1/vpn2' }), 'b1', 'pw-vpn2', expect.any(String),
        ));
        expect(svcMock.dial.mock.calls).toEqual([['b1', 'vpn1'], ['b1', 'vpn2']]);
        // The drop was expected: SEMP stays up and the card does not call it a fault.
        expect(sempMock.disconnect).not.toHaveBeenCalled();
        expect(ctx.appState.isSempConnected).toBe(true);
        expect(hidden(container, '#managed-connect-error')).toBe(true);

        solaceMock.hooks.onConnected({ id: 'session2' }, 'vpn2');
        expect(browse).toHaveBeenCalledWith({ queue: 'qZ' });
        expect(seen).toEqual(['client:disconnected', 'client:connected']);
        expect(ctx.appState.selectedVpn).toBe('vpn2');
        expect(hidden(container, '#managed-connected-view')).toBe(false);
        expect(el(container, '#managed-connected-summary').textContent).toBe('Broker "b1", VPN "vpn2"');
    });

    it('does not switch when the user cancels the confirm', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        solaceMock.disconnect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(false);
        expect(solaceMock.disconnect).not.toHaveBeenCalled();
    });

    it('ignores a duplicate request while a switch is in progress', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        solaceMock.disconnect.mockClear();
        // Second request while opInProgress — must be ignored (no extra disconnect).
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).not.toHaveBeenCalled();
    });

    it('errors when the target VPN is not on the connected broker', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        solaceMock.connect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'ghost', queue: 'qZ' });
        await answerSwitch(true);
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toMatch(/not provisioned/));
        expect(solaceMock.connect).not.toHaveBeenCalled();
        // One connection: the refused reconnect closes SEMP too.
        expect(sempMock.disconnect).toHaveBeenCalled();
    });

    it('signs out when the VPN switch dial finds the gateway session ended', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthenticated' });
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(hidden(container, '#managed-login-view')).toBe(false);
    });

    it('a refused switch dial ends the switch: a later connect does not finish it, and the next request runs', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        svcMock.dial.mockResolvedValueOnce({ ok: false, status: 429, code: 'rate_limited' });

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toMatch(/Too many requests/));
        expect(sempMock.disconnect).toHaveBeenCalled();
        expect(ctx.appState.isSempConnected).toBe(false);

        // The user connects again by hand: that is not the abandoned switch.
        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).not.toHaveBeenCalled();

        solaceMock.disconnect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        expect(solaceMock.disconnect).toHaveBeenCalled();
    });

    it('ends the switch with the reason if the reconnect never completes (30s timeout), and the next request runs', async () => {
        const toasts = document.createElement('div');
        toasts.id = 'toast-container';
        document.body.appendChild(toasts);
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        vi.useFakeTimers();
        try {
            ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
            await answerSwitch(true);
            ctx.eventBus.emit('client:disconnected'); // triggers reconnect + waitForConnect
            await Promise.resolve();
            vi.advanceTimersByTime(30_000); // no client:connected -> the switch fails
            const browse = vi.fn();
            ctx.eventBus.on('browser:browse-queue', browse);
            ctx.eventBus.emit('client:connected', { session: {} }); // listener already cleaned up
            expect(browse).not.toHaveBeenCalled();
            // The reason on the selection view and in a warning toast.
            expect(el(container, '#managed-connect-error').textContent).toBe('VPN "vpn2" did not connect within 30 s.');
            expect(hidden(container, '#managed-select-view')).toBe(false);
            expect(toasts.querySelector('.toast--warn')!.textContent).toBe('Could not switch to VPN "vpn2": VPN "vpn2" did not connect within 30 s.');

            solaceMock.disconnect.mockClear();
            ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
            await answerSwitch(true);
            expect(solaceMock.disconnect).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('a reconnect the SDK refuses ends the switch at once, closes SEMP, and shows the reason on the selection view', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        solaceMock.hooks.onDisconnected();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalledTimes(2));
        solaceMock.hooks.onConnectFailed({ infoStr: 'VPN shut down' });

        expect(connectError(container)).toBe('Messaging (client): connection failed: VPN shut down');
        expect(hidden(container, '#managed-select-view')).toBe(false);
        expect(sempMock.disconnect).toHaveBeenCalled();
        expect(ctx.appState.isSempConnected).toBe(false);
        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).not.toHaveBeenCalled();
    });

    it('a reconnect start refused without reaching onError ends the switch, closes SEMP and shows the reason', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        solaceMock.connect.mockImplementation(() => ({ ok: false, error: 'A connection attempt is already in progress.' }));
        solaceMock.hooks.onDisconnected();
        await vi.waitFor(() => expect(connectError(container)).toBe('Messaging (client): A connection attempt is already in progress.'));

        expect(sempMock.disconnect).toHaveBeenCalled();
        expect(ctx.appState.isSempConnected).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(false);
    });

    it('an SDK error on the reconnect ends the switch the same way', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        solaceMock.hooks.onDisconnected();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalledTimes(2));
        solaceMock.hooks.onError(new Error('tls'));

        expect(connectError(container)).toBe('Messaging (client): tls');
        expect(ctx.appState.isSempConnected).toBe(false);
    });

    it('a sign-out while the switch dials: the late credential starts nothing, SEMP is closed once and the sign-in view stays', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        let answer: (v: unknown) => void = () => {};
        svcMock.dial.mockImplementationOnce(() => new Promise(r => { answer = r; }));

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        solaceMock.hooks.onDisconnected();
        await vi.waitFor(() => expect(svcMock.dial).toHaveBeenCalledTimes(2));
        ctx.eventBus.emit('rbac:sign-out-requested');
        expect(sempMock.disconnect).toHaveBeenCalledTimes(1);

        answer(dialed('b1', 'vpn2'));   // the gateway answers after the sign-out
        await settle();

        expect(solaceMock.connect).toHaveBeenCalledTimes(1);
        expect(sempMock.disconnect).toHaveBeenCalledTimes(1);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
    });

    it('a sign-out while the switch reconnects: the SDK failure that follows ends the switch and leaves the sign-in view', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        await answerSwitch(true);
        solaceMock.hooks.onDisconnected();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalledTimes(2));
        ctx.eventBus.emit('rbac:sign-out-requested');
        solaceMock.hooks.onConnectFailed({ infoStr: 'closed' });

        expect(sempMock.disconnect).toHaveBeenCalledTimes(1);
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).not.toHaveBeenCalled();
    });

    it('refuses a request while the user\'s own Connect is in flight', async () => {
        const { container, ctx } = await signedIn();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();   // card goes connecting
        (ctx.loadSelf as any).mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(ctx.loadSelf).not.toHaveBeenCalled();
    });

    it('aborts the switch if the disconnect never arrives (10s timeout)', async () => {
        const { container, ctx } = await signedIn();
        await connectToB1Vpn1(container);
        vi.useFakeTimers();
        try {
            ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
            await answerSwitch(true);
            solaceMock.connect.mockClear();
            vi.advanceTimersByTime(10_000); // no client:disconnected → abort
            ctx.eventBus.emit('client:disconnected'); // listener already removed
            expect(solaceMock.connect).not.toHaveBeenCalled();
            expect(el(container, '#managed-connect-error').textContent).toBe('the session on VPN "vpn1" did not close within 10 s.');
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
        await connectToB1Vpn1(container);
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
