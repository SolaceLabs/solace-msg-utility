import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState } from '../../../src/core/types';

/**
 * Managed panel of the connections module (the "Managed" tab).
 *
 * Installs the REAL ConnectionsModule against a `/hosted` probe that advertises
 * managed mode, then drives the same `#managed-*` DOM the former standalone
 * managed-connections module owned — so this suite still covers the managed
 * login / provisioned-select / connect / refresh contract end-to-end after the
 * two connection modes were merged into one module.
 *
 * The module builds TWO factory pairs (Direct first, then Managed — see
 * module.ts step 3a), so the mocks below record every created instance and the
 * managed one is the last (`.at(-1)`).
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
const svcMock = vi.hoisted(() => ({ getConnections: vi.fn(), reload: vi.fn() }));
// Advertise managed mode so the module renders (and instantiates) the Managed tab.
const hostedMock = vi.hoisted(() => ({
    probeDeployment: vi.fn(async () => ({ hosted: true, conn: { connModes: 'managed', defaultConn: 'managed' } })),
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
}));
vi.mock('../../../src/core/encode', () => ({
    stamp: (u: string) => `tok:${u}`,
    importSeed: vi.fn(async () => ({ k: 'seed' })),
    fromB64: () => new Uint8Array([1]),
    unpack: vi.fn(async (blob: string) => `plain:${blob}`),
    pack: vi.fn(async (v: string) => `V1:${v}`),   // imported by the store; unused here
}));
vi.mock('../../../src/core/services/managed-service', () => ({
    createManagedService: () => ({ getConnections: svcMock.getConnections, reload: svcMock.reload }),
}));

// Import AFTER the mocks are registered.
import { ConnectionsModule } from '../../../src/modules/connections/module';
import { createManagedSessionStore } from '../../../src/core/services/managed-session-store';
import { unpack } from '../../../src/core/encode';

const PROFILE = {
    admin: true,
    siteSeed: 'c2VlZA==',
    operate: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    readOnly: [],
    brokers: [
        {
            broker: 'b1', hostname: 'host1', semp: { port: '1943', user: 'mon', pass: 'V1:sempb1' },
            msgVpns: [
                { name: 'vpn1', client: { port: '1443', user: 'u1', pass: 'V1:cli-b1v1' } },
                { name: 'vpn2', client: { port: '1443', user: 'u2', pass: 'V1:cli-b1v2' } },
            ],
        },
        { broker: 'b2', hostname: 'host2', semp: { port: '1943', user: 'mon', pass: 'V1:sempb2' }, msgVpns: [] },
    ],
};

function el<T extends HTMLElement>(c: HTMLElement, sel: string): T {
    return c.querySelector(sel) as T;
}
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');

function makeCtx(container: HTMLElement): AppContext {
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
        // The REAL store (over the mocked transform above): this panel is its
        // writer, so the suite covers login → setProfile → connect end to end.
        managedStore: createManagedSessionStore(),
        copyToClipboard: vi.fn(),
        config: {},
    } as AppContext;
}

async function setup() {
    const container = loadModuleDOM('connections');
    const ctx = makeCtx(container);
    await ConnectionsModule.install(ctx);
    return { container, ctx };
}

async function login(container: HTMLElement, ctx: AppContext, profile: unknown = PROFILE) {
    svcMock.getConnections.mockResolvedValue(profile);
    el<HTMLInputElement>(container, '#managed-username').value = 'admin';
    el<HTMLInputElement>(container, '#managed-password').value = 'pw';
    el<HTMLButtonElement>(container, '#btn-managed-login').click();
    // Truthy, not `not.toBeNull()` — the session starts out `undefined`, which
    // would satisfy a null check on the very first poll and not wait at all.
    await vi.waitFor(() => expect(ctx.appState.managed).toBeTruthy());
}

/** Login → connect → drive both onConnected hooks so we're fully "connected to vpn1 on b1". */
async function connectToB1Vpn1(container: HTMLElement, ctx: AppContext) {
    await login(container, ctx);
    el<HTMLButtonElement>(container, '#btn-managed-connect').click();
    await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());
    sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: 'base' }, { user: 'mon', pass: 'plain:V1:sempb1' });
    solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
}

beforeEach(() => {
    svcMock.getConnections.mockReset();
    svcMock.reload.mockReset();
    svcMock.reload.mockResolvedValue(true); // refresh reloads the proxy store; default to success
    // Each install creates a Direct pair then a Managed pair; clear so `.at(-1)`
    // always resolves to THIS test's managed instances.
    solaceMock.instances.length = 0;
    sempMock.instances.length = 0;
    hostedMock.probeDeployment.mockResolvedValue({ hosted: true, conn: { connModes: 'managed', defaultConn: 'managed' } });
    (unpack as any).mockImplementation(async (blob: string) => `plain:${blob}`);
});

describe('connections/managed panel — login', () => {
    it('shows the login view on install', async () => {
        const { container } = await setup();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
        expect(hidden(container, '#managed-connected-view')).toBe(true);
        // Gateway advertised managed → the Managed panel is the active tab.
        expect(hidden(container, '#conn-panel-managed')).toBe(false);
    });

    // Replaces the former "gateway required" gate: availability is now encoded in
    // tab visibility — a deployment that doesn't advertise managed never renders
    // the tab, so the panel (and its login form) simply isn't reachable.
    it('does not offer the Managed tab when the gateway does not advertise managed', async () => {
        hostedMock.probeDeployment.mockResolvedValue({ hosted: false, conn: { connModes: 'direct', defaultConn: 'direct' } });
        const { container } = await setup();
        expect(hidden(container, '#conn-panel-managed')).toBe(true);
        expect(hidden(container, '#conn-tab-managed')).toBe(true);
        expect(hidden(container, '#conn-panel-direct')).toBe(false); // Direct is the only mode
    });

    it('rejects empty credentials without calling the backend', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-managed-login').click();
        await Promise.resolve();
        expect(hidden(container, '#managed-login-error')).toBe(false);
        expect(svcMock.getConnections).not.toHaveBeenCalled();
    });

    it('logs in: sets the managed session, emits rbac:changed, shows selection', async () => {
        const { container, ctx } = await setup();
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);

        await login(container, ctx);

        expect(ctx.appState.managed).toMatchObject({
            admin: true, username: 'admin', token: 'tok:admin', broker: '',
            operate: PROFILE.operate, readOnly: PROFILE.readOnly,
        });
        expect(rbac).toHaveBeenCalled();
        expect(hidden(container, '#managed-select-view')).toBe(false);
        expect([...el<HTMLSelectElement>(container, '#managed-broker-select').options].map(o => o.value)).toEqual(['b1', 'b2']);
        expect([...el<HTMLSelectElement>(container, '#managed-vpn-select').options].map(o => o.value)).toEqual(['vpn1', 'vpn2']);
        expect(el<HTMLInputElement>(container, '#managed-broker-host').value).toBe('host1');
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
    });

    it('shows an error on invalid credentials (proxy 400 → null)', async () => {
        const { container, ctx } = await setup();
        svcMock.getConnections.mockResolvedValue(null);
        el<HTMLInputElement>(container, '#managed-username').value = 'admin';
        el<HTMLInputElement>(container, '#managed-password').value = 'bad';
        el<HTMLButtonElement>(container, '#btn-managed-login').click();
        await vi.waitFor(() => expect(hidden(container, '#managed-login-error')).toBe(false));
        expect(el(container, '#managed-login-error').textContent).toMatch(/invalid/i);
        expect(ctx.appState.managed).toBeUndefined();
    });

    it('surfaces a thrown error from the backend', async () => {
        const { container } = await setup();
        svcMock.getConnections.mockRejectedValue(new Error('boom'));
        el<HTMLInputElement>(container, '#managed-username').value = 'admin';
        el<HTMLInputElement>(container, '#managed-password').value = 'pw';
        el<HTMLButtonElement>(container, '#btn-managed-login').click();
        await vi.waitFor(() => expect(el(container, '#managed-login-error').textContent).toBe('boom'));
    });

    it('Enter in the password field triggers login', async () => {
        const { container, ctx } = await setup();
        svcMock.getConnections.mockResolvedValue(PROFILE);
        el<HTMLInputElement>(container, '#managed-username').value = 'admin';
        el<HTMLInputElement>(container, '#managed-password').value = 'pw';
        el<HTMLInputElement>(container, '#managed-password').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await vi.waitFor(() => expect(ctx.appState.managed).not.toBeNull());
    });

    it('ignores non-Enter keys in the credential fields', async () => {
        const { container } = await setup();
        el<HTMLInputElement>(container, '#managed-username').dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(svcMock.getConnections).not.toHaveBeenCalled();
    });

    it('shows the empty-state when the user has no entitled connections', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx, { ...PROFILE, brokers: [] });
        expect(hidden(container, '#managed-empty-state')).toBe(false);
        expect(hidden(container, '#managed-connect-controls')).toBe(true);
    });
});

describe('managed-connections — selection', () => {
    it('a broker with no VPNs disables the VPN select and Connect', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        const broker = el<HTMLSelectElement>(container, '#managed-broker-select');
        broker.value = 'b2';
        broker.dispatchEvent(new Event('change'));
        expect(el<HTMLSelectElement>(container, '#managed-vpn-select').disabled).toBe(true);
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(true);
        expect(el<HTMLInputElement>(container, '#managed-broker-host').value).toBe('host2');
    });

    it('vpn change re-evaluates the Connect button', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        const vpn = el<HTMLSelectElement>(container, '#managed-vpn-select');
        vpn.value = 'vpn2';
        vpn.dispatchEvent(new Event('change'));
        expect(el<HTMLButtonElement>(container, '#btn-managed-connect').disabled).toBe(false);
    });
});

describe('managed-connections — connect', () => {
    it('unpacks creds and connects SEMP + Solace, then emits the message cap', async () => {
        const { container, ctx } = await setup();
        const cap = vi.fn();
        ctx.eventBus.on('config:max-messages-changed', cap);
        await login(container, ctx);

        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());

        expect(ctx.appState.managed!.broker).toBe('b1');
        expect(sempMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ protocol: 'https', port: '1943', user: 'mon', urlPath: '' }),
            'host1', 'plain:V1:sempb1',
        );
        expect(solaceMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ protocol: 'wss', port: '1443', vpn: 'vpn1', user: 'u1', authMode: 'basic' }),
            'host1', 'plain:V1:cli-b1v1', expect.stringMatching(/^SolMsgUtil\/\d{14}\//),
        );
        expect(cap).toHaveBeenCalledWith({ value: 100 });
    });

    // Both guard tests log in first (which ENABLES the Connect button — jsdom
    // won't fire activation on a disabled button), then clear a select's value
    // directly so doConnect runs and hits the !brokerName / !vpnName guard.
    it('Connect is a no-op when no broker is selected', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        el<HTMLSelectElement>(container, '#managed-broker-select').value = '';
        sempMock.connect.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await Promise.resolve();
        expect(sempMock.connect).not.toHaveBeenCalled();
    });

    it('Connect is a no-op when no VPN is selected', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        el<HTMLSelectElement>(container, '#managed-vpn-select').value = '';
        sempMock.connect.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await Promise.resolve();
        expect(sempMock.connect).not.toHaveBeenCalled();
    });

    it('SEMP onConnected publishes sempCredentials + emits semp:connected', async () => {
        const { container, ctx } = await setup();
        const semp = vi.fn();
        ctx.eventBus.on('semp:connected', semp);
        await login(container, ctx);
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(sempMock.connect).toHaveBeenCalled());

        sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: 'base-url' }, { user: 'mon', pass: 'plain:V1:sempb1' });

        expect(ctx.appState.isSempConnected).toBe(true);
        expect(ctx.appState.sempCredentials).toMatchObject({ user: 'mon', pass: 'plain:V1:sempb1', baseUrl: 'base-url', protocol: 'https', host: 'host1', port: '1943' });
        expect(semp).toHaveBeenCalled();
    });

    it('Solace onConnected publishes state, emits client:connected, shows connected view', async () => {
        const { container, ctx } = await setup();
        const client = vi.fn();
        ctx.eventBus.on('client:connected', client);
        await connectToB1Vpn1(container, ctx);

        expect(ctx.appState.isConnected).toBe(true);
        expect(ctx.appState.selectedVpn).toBe('vpn1');
        expect(ctx.appState.solaceConnection).toMatchObject({ host: 'host1', protocol: 'wss', vpn: 'vpn1', user: 'u1', pass: 'plain:V1:cli-b1v1' });
        expect(client).toHaveBeenCalledWith({ session: { id: 'session' } });
        expect(hidden(container, '#managed-connected-view')).toBe(false);
    });

    it('surfaces an unpack failure as a connect error', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        (unpack as any).mockRejectedValueOnce(new Error('bad seed'));
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toBe('bad seed'));
    });
});

describe('managed-connections — lifecycle hooks', () => {
    it('Solace onDisconnected clears state and returns to selection', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        solaceMock.hooks.onDisconnected();
        expect(ctx.appState.isConnected).toBe(false);
        expect(ctx.appState.solaceConnection).toBeNull();
        expect(hidden(container, '#managed-select-view')).toBe(false);
    });

    it('Solace onConnectFailed / onError surface to the connect error', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        solaceMock.hooks.onConnectFailed({ infoStr: 'refused' });
        expect(el(container, '#managed-connect-error').textContent).toMatch(/refused/);
        solaceMock.hooks.onError(new Error('tls'));
        expect(el(container, '#managed-connect-error').textContent).toBe('tls');
    });

    it('SEMP onDisconnected / onAuthFailed / onError', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        // Connect first so lastSempAttempt is set before onConnected fires
        // (the hook only fires after connectSemp in the real flow).
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(sempMock.connect).toHaveBeenCalled());
        sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: 'b' }, { user: 'mon', pass: 'p' });
        sempMock.hooks.onDisconnected();
        expect(ctx.appState.isSempConnected).toBe(false);
        expect(ctx.appState.sempCredentials).toBeNull();
        sempMock.hooks.onAuthFailed();
        expect(el(container, '#managed-connect-error').textContent).toMatch(/401/);
        sempMock.hooks.onError({ message: 'down', isNetworkError: true, isTimeout: false, baseUrl: 'b' });
        expect(el(container, '#managed-connect-error').textContent).toMatch(/SEMP error: down/);
    });
});

describe('managed-connections — disconnect / logout', () => {
    it('Disconnect button tears down both connections', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        el<HTMLButtonElement>(container, '#btn-managed-disconnect').click();
        expect(solaceMock.disconnect).toHaveBeenCalled();
        expect(sempMock.disconnect).toHaveBeenCalled();
    });

    it('Logout clears the session, emits rbac:changed, returns to login', async () => {
        const { container, ctx } = await setup();
        const rbac = vi.fn();
        await login(container, ctx);
        ctx.eventBus.on('rbac:changed', rbac);
        el<HTMLButtonElement>(container, '#btn-managed-logout').click();
        expect(ctx.appState.managed).toBeNull();
        expect(rbac).toHaveBeenCalled();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(el<HTMLInputElement>(container, '#managed-username').value).toBe('');
        expect(solaceMock.disconnect).toHaveBeenCalled();
    });
});

describe('managed-connections — refresh entitlements', () => {
    it('re-fetches and updates the session', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);
        svcMock.getConnections.mockResolvedValue({ ...PROFILE, admin: false, operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }] });
        // Clear call history (getConnections already ran once during login) so the
        // order check below reflects only the refresh's calls. mockClear keeps the
        // mockResolvedValue set above — it resets call records, not the impl.
        svcMock.reload.mockClear();
        svcMock.getConnections.mockClear();
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.admin).toBe(false));
        expect(ctx.appState.managed!.readOnly.length).toBe(1);
        expect(rbac).toHaveBeenCalled();
        // Refresh first reloads the proxy store from disk, THEN re-fetches —
        // fetch-before-reload would return stale data, so guard the order.
        expect(svcMock.reload.mock.invocationCallOrder[0])
            .toBeLessThan(svcMock.getConnections.mock.invocationCallOrder[0]);
    });

    it('shows a warning but still updates when the proxy reload fails', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        svcMock.reload.mockResolvedValue(false); // server-side reload failed
        svcMock.getConnections.mockResolvedValue({ ...PROFILE, admin: false });
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toMatch(/reload failed/i));
        // The in-memory entitlements were still applied (showing last-known data).
        expect(ctx.appState.managed!.admin).toBe(false);
    });

    it('does nothing when not logged in', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await Promise.resolve();
        expect(svcMock.reload).not.toHaveBeenCalled();
        expect(svcMock.getConnections).not.toHaveBeenCalled();
    });

    it('logs the user out if the session is no longer valid', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        svcMock.getConnections.mockResolvedValue(null);
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed).toBeNull());
        expect(hidden(container, '#managed-login-view')).toBe(false);
    });

    it('surfaces a refresh error, stringifying non-Error rejections', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        // Reject with a non-Error to exercise errMessage's String(e) branch.
        svcMock.getConnections.mockRejectedValue('net-str');
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toBe('net-str'));
    });
});

describe('managed-connections — provisioned VPN publishing', () => {
    it('login alone leaves the provisioned VPN set empty (not connected yet)', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        expect(ctx.appState.managed!.vpns).toEqual([]);
    });

    it('connect publishes the connected broker\'s provisioned VPNs', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        // b1 provisions vpn1 + vpn2 in PROFILE — that's what the picker should list,
        // regardless of the broad `msgVpns: '*'` entitlement glob.
        expect(ctx.appState.managed!.vpns).toEqual(['vpn1', 'vpn2']);
    });

    it('refresh recomputes the provisioned VPNs for the connected broker', async () => {
        const { container, ctx } = await setup();
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
        svcMock.getConnections.mockResolvedValue(trimmed);
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.vpns).toEqual(['vpn1']));
    });

    it('refresh empties the provisioned VPNs when the connected broker is no longer provisioned', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        const noB1 = { ...PROFILE, brokers: [PROFILE.brokers[1]] }; // b1 dropped entirely
        svcMock.getConnections.mockResolvedValue(noB1);
        el<HTMLButtonElement>(container, '#btn-managed-refresh').click();
        await vi.waitFor(() => expect(ctx.appState.managed!.vpns).toEqual([]));
    });
});

describe('managed-connections — defensive paths', () => {
    it('Solace onDisconnected after logout leaves the login view (no profile)', async () => {
        const { container, ctx } = await setup();
        await login(container, ctx);
        el<HTMLButtonElement>(container, '#btn-managed-logout').click();
        // A late SDK disconnect callback with the session already torn down.
        solaceMock.hooks.onDisconnected();
        expect(hidden(container, '#managed-login-view')).toBe(false);
        expect(hidden(container, '#managed-select-view')).toBe(true);
        expect(ctx.appState.isConnected).toBe(false);
    });

    it('gives up the VPN switch when the reconnect itself disconnects', async () => {
        const { container, ctx } = await setup();
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
        const { container, ctx } = await setup();
        await login(container, ctx);
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
    function fakeBrowser(withConsumer = true) {
        const handlers: Record<string, () => void> = {};
        const b: any = {
            on: (ev: string, h: () => void) => { handlers[ev] = h; },
            fireUp: () => handlers['UP']?.(),
        };
        if (withConsumer) b._messageConsumer = { _permissions: 'READ_WRITE' };
        return b;
    }
    function fakeSession(browser: any = fakeBrowser()) {
        return { createQueueBrowser: vi.fn(() => browser) };
    }

    // Connect, then deliver a session that exposes createQueueBrowser so the wrap installs.
    async function connectWithSession(session: any, profile: unknown = PROFILE) {
        const { container, ctx } = await setup();
        await login(container, ctx, profile);
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

    it('overwrites _permissions to READ_ONLY on UP for a read-only queue', async () => {
        const ro = { ...PROFILE, operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }] };
        const browser = fakeBrowser();
        const session = fakeSession(browser);
        await connectWithSession(session, ro);
        session.createQueueBrowser({ queueDescriptor: { name: 'q1' } });
        browser.fireUp();
        expect(browser._messageConsumer._permissions).toBe('READ_ONLY');
    });

    it('overwrites _permissions to READ_WRITE on UP for an operate queue', async () => {
        const browser = fakeBrowser();
        const session = fakeSession(browser); // PROFILE operate = [{*,*,*}]
        await connectWithSession(session, PROFILE);
        session.createQueueBrowser({ queueDescriptor: { name: 'q1' } });
        browser.fireUp();
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

    it('skips the overwrite when the browser has no _messageConsumer', async () => {
        const browser = fakeBrowser(false); // no _messageConsumer
        const session = fakeSession(browser);
        await connectWithSession(session, PROFILE);
        session.createQueueBrowser({ queueDescriptor: { name: 'q1' } });
        expect(() => browser.fireUp()).not.toThrow();
        expect(browser._messageConsumer).toBeUndefined();
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
        const { container, ctx } = await setup();
        await login(container, ctx);
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
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'qX' });
        expect(browse).toHaveBeenCalledWith({ queue: 'qX' });
    });

    it('routes to copy:vpn-switched when returnTo is queue-copy', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        const copy = vi.fn();
        ctx.eventBus.on('copy:vpn-switched', copy);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn1', queue: 'qX', returnTo: 'queue-copy' });
        expect(copy).toHaveBeenCalledWith({ vpn: 'vpn1', queue: 'qX' });
    });

    it('switches VPN: disconnect → reconnect → finish', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        const browse = vi.fn();
        ctx.eventBus.on('browser:browse-queue', browse);
        (globalThis.confirm as any).mockReturnValue(true);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).toHaveBeenCalled();

        solaceMock.connect.mockClear();
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalledWith(
            expect.objectContaining({ vpn: 'vpn2' }), 'host1', 'plain:V1:cli-b1v2', expect.any(String),
        ));

        ctx.eventBus.emit('client:connected', { session: {} });
        expect(browse).toHaveBeenCalledWith({ queue: 'qZ' });
    });

    it('does not switch when the user cancels the confirm', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(false);
        solaceMock.disconnect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).not.toHaveBeenCalled();
    });

    it('ignores a duplicate request while a switch is in progress', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        solaceMock.disconnect.mockClear();
        // Second request while opInProgress — must be ignored (no extra disconnect).
        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn2', queue: 'qZ' });
        expect(solaceMock.disconnect).not.toHaveBeenCalled();
    });

    it('errors when the target VPN is not on the connected broker', async () => {
        const { container, ctx } = await setup();
        await connectToB1Vpn1(container, ctx);
        (globalThis.confirm as any).mockReturnValue(true);
        solaceMock.connect.mockClear();
        ctx.eventBus.emit('connection:check-connection', { vpn: 'ghost', queue: 'qZ' });
        ctx.eventBus.emit('client:disconnected');
        await vi.waitFor(() => expect(el(container, '#managed-connect-error').textContent).toMatch(/not provisioned/));
        expect(solaceMock.connect).not.toHaveBeenCalled();
    });

    it('clears the in-progress flag if the reconnect never completes (30s timeout)', async () => {
        const { container, ctx } = await setup();
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
        const { container, ctx } = await setup();
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

// The merged module runs Direct and Managed side by side, so exactly one may be
// live at a time and the Managed tab must re-show the right view when activated.
describe('connections/managed panel — mode interlock + tab activation', () => {
    /** Both tabs offered, Direct active first (so tab switching is exercisable). */
    function bothTabs() {
        hostedMock.probeDeployment.mockResolvedValue({
            hosted: true, conn: { connModes: 'both', defaultConn: 'direct' },
        });
    }
    // Install order (module.ts step 3a): Direct pair first, Managed pair last.
    const directSolace = () => solaceMock.instances[0];
    const directSemp = () => sempMock.instances[0];

    it('re-shows the login / select / connected view as the Managed tab is activated', async () => {
        bothTabs();
        const { container, ctx } = await setup();
        const managedTab = el<HTMLButtonElement>(container, '#conn-tab-managed');
        const directTab = el<HTMLButtonElement>(container, '#conn-tab-direct');

        // Not signed in → login view.
        managedTab.click();
        expect(hidden(container, '#managed-login-view')).toBe(false);

        // Signed in, not connected → selection view.
        directTab.click();
        await login(container, ctx);
        managedTab.click();
        expect(hidden(container, '#managed-select-view')).toBe(false);

        // Connected → connected view.
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();
        await vi.waitFor(() => expect(solaceMock.connect).toHaveBeenCalled());
        sempMock.hooks.onConnected({ fetch: vi.fn(), baseUrl: 'base' }, { user: 'mon', pass: 'p' });
        solaceMock.hooks.onConnected({ id: 'session' }, 'vpn1');
        directTab.click();
        managedTab.click();
        expect(hidden(container, '#managed-connected-view')).toBe(false);
    });

    it('connecting via Managed tears down a live Direct connection', async () => {
        bothTabs();
        const { container, ctx } = await setup();
        // Pretend the Direct tab already holds both connections.
        ctx.appState.isConnected = true;
        ctx.appState.isSempConnected = true;

        await login(container, ctx);
        el<HTMLButtonElement>(container, '#btn-managed-connect').click();

        await vi.waitFor(() => expect(directSolace().disconnect).toHaveBeenCalled());
        expect(directSemp().disconnect).toHaveBeenCalled();
    });

    it('connecting via Direct clears the managed session so RBAC cannot leak onto it', async () => {
        bothTabs();
        const { container, ctx } = await setup();
        await login(container, ctx);
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
