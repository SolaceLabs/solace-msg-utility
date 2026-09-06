import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedSessionStore } from '../../../src/core/services/managed-session-store';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus } from '../../../src/core/types';

/**
 * Admin login — the entry point of the standalone /solAdmin app. Same managed
 * auth as the connections module's Managed tab, but it must never open a broker
 * connection and must refuse a non-admin at login.
 */
const { getConnections } = vi.hoisted(() => ({ getConnections: vi.fn() as any }));
vi.mock('../../../src/core/services/managed-service', () => ({
    createManagedService: () => ({ getConnections, reload: vi.fn() }),
}));

import { AdminLoginModule } from '../../../src/modules/admin-login/module';

const SEED_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

const ADMIN_PROFILE = {
    admin: true,
    siteSeed: SEED_B64,
    operate: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    readOnly: [],
    brokers: [],
};

let container: HTMLElement;
let eventBus: EventBus;
let ctx: AppContext;
let appState: AppState;

/** The module probes /hosted at install; default to a gateway that answers. */
function stubHosted(hosted: boolean): void {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
        JSON.stringify({ hosted, connModes: 'managed', defaultConn: 'managed' }),
        { status: hosted ? 200 : 404, headers: { 'Content-Type': 'application/json' } },
    )));
}

async function install(hosted = true) {
    stubHosted(hosted);
    container = loadModuleDOM('admin-login');
    eventBus = createEventBus();
    appState = {
        activeModuleId: null, isConnected: false, isSempConnected: false,
        selectedVpn: null, solaceConnection: null, sempCredentials: null, managed: null,
    };
    ctx = {
        container, appState, eventBus,
        setState: vi.fn((k, v) => { (appState as any)[k] = v; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedStore: createManagedSessionStore(),
        copyToClipboard: vi.fn(),
        config: {},
    };
    await AdminLoginModule.install(ctx);
    const el = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
    const hidden = (sel: string) => el(sel).classList.contains('hidden');
    return { el, hidden };
}

function signIn(el: <T extends HTMLElement>(s: string) => T, user = 'admin', pass = 'pw'): void {
    el<HTMLInputElement>('#admin-login-username').value = user;
    el<HTMLInputElement>('#admin-login-password').value = pass;
    el<HTMLButtonElement>('#btn-admin-login').click();
}

beforeEach(() => { getConnections.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('admin-login — sign in', () => {
    it('shows the login view behind a gateway', async () => {
        const { hidden } = await install();
        expect(hidden('#admin-login-view')).toBe(false);
        expect(hidden('#admin-session-view')).toBe(true);
    });

    it('gates itself when served without a gateway', async () => {
        const { hidden } = await install(false);
        // The admin app IS the deployment surface here, so unlike the Managed
        // tab it has to explain itself rather than silently not appear.
        expect(hidden('#admin-login-view')).toBe(true);
        expect(container.querySelector('#admin-login-gate')!.classList.contains('hidden')).toBe(false);
    });

    it('rejects empty credentials without calling the backend', async () => {
        const { el } = await install();
        el<HTMLButtonElement>('#btn-admin-login').click();
        expect(getConnections).not.toHaveBeenCalled();
        expect(el('#admin-login-error').textContent).toMatch(/username and password/i);
    });

    it('adopts the profile, publishes the session and emits rbac:changed', async () => {
        const { el, hidden } = await install();
        getConnections.mockResolvedValue(ADMIN_PROFILE);
        const seen: string[] = [];
        eventBus.on('rbac:changed', () => seen.push(appState.managed ? 'session' : 'none'));

        signIn(el, 'root');
        await vi.waitFor(() => expect(hidden('#admin-session-view')).toBe(false));

        expect(ctx.managedStore.isActive()).toBe(true);
        expect(appState.managed).toMatchObject({ admin: true, username: 'root', broker: '', vpns: [] });
        // The emit must land AFTER the session is published — an observer that
        // re-renders the sidebar on this event must not see a half-built state.
        expect(seen).toEqual(['session']);
        expect(el('#admin-session-summary').textContent).toMatch(/root \(administrator\)/);
    });

    it('never opens a broker connection', async () => {
        const { el } = await install();
        getConnections.mockResolvedValue(ADMIN_PROFILE);
        signIn(el);
        await vi.waitFor(() => expect(appState.managed).not.toBeNull());

        expect(appState.isConnected).toBe(false);
        expect(appState.isSempConnected).toBe(false);
        expect(appState.solaceConnection).toBeNull();
        expect(appState.sempCredentials).toBeNull();
    });

    it('refuses a non-admin at login, adopting nothing', async () => {
        const { el, hidden } = await install();
        getConnections.mockResolvedValue({ ...ADMIN_PROFILE, admin: false });
        const emits = vi.fn();
        eventBus.on('rbac:changed', emits);

        signIn(el, 'ordinary');
        await vi.waitFor(() => expect(el('#admin-login-error').textContent).toMatch(/not an administrator/i));

        expect(appState.managed).toBeNull();
        expect(ctx.managedStore.isActive()).toBe(false);
        expect(emits).not.toHaveBeenCalled();
        expect(hidden('#admin-session-view')).toBe(true);
    });

    it('reports bad credentials distinctly from a non-admin account', async () => {
        const { el } = await install();
        getConnections.mockResolvedValue(null);      // proxy 400 → null, by design
        signIn(el);
        await vi.waitFor(() => expect(el('#admin-login-error').textContent).toMatch(/invalid username or password/i));
        expect(appState.managed).toBeNull();
    });

    it('surfaces a backend failure instead of hanging the button', async () => {
        const { el } = await install();
        getConnections.mockRejectedValue(new Error('network down'));
        signIn(el);
        await vi.waitFor(() => expect(el('#admin-login-error').textContent).toMatch(/network down/));
        expect(el<HTMLButtonElement>('#btn-admin-login').disabled).toBe(false);
    });

    it('Enter in either credential field signs in', async () => {
        const { el } = await install();
        getConnections.mockResolvedValue(ADMIN_PROFILE);
        el<HTMLInputElement>('#admin-login-username').value = 'admin';
        el<HTMLInputElement>('#admin-login-password').value = 'pw';
        el('#admin-login-password').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await vi.waitFor(() => expect(getConnections).toHaveBeenCalledTimes(1));

        el('#admin-login-username').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(getConnections).toHaveBeenCalledTimes(1);
    });
});

describe('admin-login — sign out', () => {
    it('clears the store and the session, then emits', async () => {
        const { el, hidden } = await install();
        getConnections.mockResolvedValue(ADMIN_PROFILE);
        signIn(el);
        await vi.waitFor(() => expect(hidden('#admin-session-view')).toBe(false));

        const seen: (string | null)[] = [];
        eventBus.on('rbac:changed', () => seen.push(appState.managed ? 'session' : null));
        el<HTMLButtonElement>('#btn-admin-logout').click();

        expect(appState.managed).toBeNull();
        expect(ctx.managedStore.isActive()).toBe(false);
        expect(seen).toEqual([null]);
        expect(hidden('#admin-login-view')).toBe(false);
        expect(el<HTMLInputElement>('#admin-login-password').value).toBe('');
    });
});
