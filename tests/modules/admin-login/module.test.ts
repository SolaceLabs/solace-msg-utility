import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedProfile } from '../../../src/core/services/managed-profile';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus } from '../../../src/core/types';

/**
 * Admin login — the entry point of the standalone /solAdmin app. The gateway
 * signs the admin in on its own page; this module reads the session back,
 * never opens a broker connection, and refuses a non-admin profile.
 */
const { me, logout } = vi.hoisted(() => ({ me: vi.fn() as any, logout: vi.fn() as any }));
vi.mock('../../../src/core/services/managed-service', () => ({
    createManagedService: () => ({ me, logout }),
}));

import { AdminLoginModule } from '../../../src/modules/admin-login/module';

const ADMIN_PROFILE = {
    username: 'admin',
    admin: true,
    operate: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    readOnly: [],
    brokers: [],
    modules: [],
};

let container: HTMLElement;
let eventBus: EventBus;
let ctx: AppContext;
let appState: AppState;

async function install(meResult: unknown = { ok: true, data: ADMIN_PROFILE }, onBus?: (bus: EventBus) => void) {
    me.mockResolvedValue(meResult);
    container = loadModuleDOM('admin-login');
    eventBus = createEventBus();
    onBus?.(eventBus);
    appState = {
        activeModuleId: null, isConnected: false, isSempConnected: false,
        selectedVpn: null, solaceConnection: null, sempCredentials: null, managed: null,
    };
    ctx = {
        container, appState, eventBus,
        setState: vi.fn((k, v) => { (appState as any)[k] = v; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        config: {},
    };
    await AdminLoginModule.install(ctx);
    const el = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
    const hidden = (sel: string) => el(sel).classList.contains('hidden');
    return { el, hidden };
}

beforeEach(() => {
    me.mockReset();
    logout.mockReset();
    logout.mockResolvedValue({ ok: true });
});

describe('admin-login — restoring the gateway session', () => {
    it('adopts an admin session, publishes it and emits rbac:changed', async () => {
        const rbac = vi.fn();
        const { el, hidden } = await install(undefined, bus => bus.on('rbac:changed', rbac));
        expect(hidden('#admin-session-view')).toBe(false);
        expect(hidden('#admin-login-view')).toBe(true);
        expect(el('#admin-session-summary').textContent).toBe('Signed in as admin (administrator).');
        expect(appState.managed).toEqual({
            admin: true, username: 'admin', broker: '', vpns: [],
            operate: ADMIN_PROFILE.operate, readOnly: [], modules: [],
        });
        // The admin app opens no broker connection, so it adopts nothing into
        // the provisioned-connection profile.
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(rbac).toHaveBeenCalledTimes(1);
        expect(el<HTMLAnchorElement>('#admin-change-password').getAttribute('href')).toBe('/login/password?next=/solAdmin');
    });

    it('never opens a broker connection', async () => {
        await install();
        expect(appState.isConnected).toBe(false);
        expect(appState.isSempConnected).toBe(false);
        expect(appState.solaceConnection).toBeNull();
        expect(appState.sempCredentials).toBeNull();
    });

    it('without a session shows the sign-in link, quietly', async () => {
        const { el, hidden } = await install({ ok: false, status: 401, code: 'unauthenticated' });
        expect(hidden('#admin-login-view')).toBe(false);
        expect(hidden('#admin-session-view')).toBe(true);
        expect(hidden('#admin-login-error')).toBe(true);
        const link = el<HTMLAnchorElement>('#btn-admin-login');
        expect(link.getAttribute('href')).toBe('/login?next=/solAdmin');
        expect(link.textContent).toBe('Sign in');
        expect(appState.managed).toBeNull();
    });

    it('points at the password page when the gateway requires a change', async () => {
        const { el, hidden } = await install({ ok: false, status: 403, code: 'password_change_required' });
        expect(el<HTMLAnchorElement>('#btn-admin-login').getAttribute('href')).toBe('/login/password?next=/solAdmin');
        expect(el('#btn-admin-login').textContent).toBe('Change password');
        expect(hidden('#admin-login-error')).toBe(false);
        expect(el('#admin-login-error').textContent).toBe('You must change your password before you continue.');
    });

    it('shows why when the gateway cannot be reached', async () => {
        const { el } = await install({ ok: false, status: 0, code: 'network' });
        expect(el('#admin-login-error').textContent).toBe('The gateway could not be reached.');
    });

    it('refuses a non-admin profile, publishing nothing', async () => {
        const { el, hidden } = await install({ ok: true, data: { ...ADMIN_PROFILE, username: 'viewer', admin: false } });
        expect(el('#admin-login-error').textContent).toBe('This account is not an administrator.');
        expect(hidden('#admin-session-view')).toBe(true);
        expect(appState.managed).toBeNull();
    });
});

describe('admin-login — sign out', () => {
    it('ends the gateway session, clears the session, then emits', async () => {
        const { el, hidden } = await install();
        const rbac = vi.fn();
        eventBus.on('rbac:changed', rbac);
        el<HTMLButtonElement>('#btn-admin-logout').click();
        expect(logout).toHaveBeenCalledTimes(1);
        expect(appState.managed).toBeNull();
        expect(rbac).toHaveBeenCalledTimes(1);
        expect(hidden('#admin-login-view')).toBe(false);
        expect(el<HTMLAnchorElement>('#btn-admin-login').getAttribute('href')).toBe('/login?next=/solAdmin');
        expect(ctx.loadSelf).toHaveBeenCalled();
    });
});

describe('admin-login — sign-out requested by another module', () => {
    it('signs out on request while it holds the session', async () => {
        const { hidden } = await install();
        eventBus.emit('rbac:sign-out-requested');
        expect(logout).toHaveBeenCalledTimes(1);
        expect(appState.managed).toBeNull();
        expect(hidden('#admin-login-view')).toBe(false);
        // A second request finds nothing to sign out.
        eventBus.emit('rbac:sign-out-requested');
        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('ignores the request while it holds no session (the Connections Managed tab may own it)', async () => {
        await install({ ok: false, status: 401, code: 'unauthenticated' });
        appState.managed = { admin: true, username: 'x', broker: 'b', vpns: [], operate: [], readOnly: [], modules: [] };
        eventBus.emit('rbac:sign-out-requested');
        expect(logout).not.toHaveBeenCalled();
        expect(appState.managed).not.toBeNull();
    });
});
