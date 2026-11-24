import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedProfile } from '../../../src/core/services/managed-profile';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus } from '../../../src/core/types';

/**
 * Admin login — the entry point of the standalone /solAdmin app. The gateway
 * signs the admin in on its own page; this module reads the session back,
 * never opens a broker connection, and refuses a non-admin profile. Its own
 * page is the signed-out screen; the signed-in actions are the sidebar's
 * account control.
 */
const { me, logout } = vi.hoisted(() => ({ me: vi.fn() as any, logout: vi.fn() as any }));
vi.mock('../../../src/core/services/managed-service', () => ({
    createManagedService: () => ({ me, logout }),
}));
// The keep-alive (tests/core/services/session-activity.test.ts has its rules): here, only when it runs.
const activityMock = vi.hoisted(() => ({ made: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('../../../src/core/services/session-activity', () => ({
    keepSessionAlive: (...args: unknown[]) => {
        activityMock.made(...args);
        return { start: activityMock.start, stop: activityMock.stop };
    },
}));

import { AdminLoginModule } from '../../../src/modules/admin-login/module';
import { completeContext } from '../../helpers/appContext';

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
let sidebar: HTMLElement;

async function install(meResult: unknown = { ok: true, data: ADMIN_PROFILE }, onBus?: (bus: EventBus) => void) {
    me.mockResolvedValue(meResult);
    sidebar = document.createElement('div');
    container = loadModuleDOM('admin-login');
    eventBus = createEventBus();
    onBus?.(eventBus);
    appState = {
        activeModuleId: null, isConnected: false, isSempConnected: false,
        selectedVpn: null, solaceConnection: null, sempCredentials: null, managed: null,
    };
    ctx = completeContext({
        container, appState, eventBus,
        setState: vi.fn((k, v) => { (appState as any)[k] = v; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        mountSidebarAccount: vi.fn((node: HTMLElement) => { sidebar.replaceChildren(node); }),
    });
    await AdminLoginModule.install(ctx);
    const el = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
    const hidden = (sel: string) => el(sel).classList.contains('hidden');
    /** The account control in the sidebar slot; null until the module mounts one. */
    const account = () => sidebar.querySelector<HTMLElement>('.account-control');
    return { el, hidden, account };
}

beforeEach(() => {
    me.mockReset();
    logout.mockReset();
    logout.mockResolvedValue({ ok: true });
    activityMock.made.mockClear();
    activityMock.start.mockClear();
    activityMock.stop.mockClear();
});

describe('admin-login — restoring the gateway session', () => {
    it('adopts an admin session, publishes it, emits rbac:changed and shows the sidebar account control', async () => {
        const rbac = vi.fn();
        const { hidden, account } = await install(undefined, bus => bus.on('rbac:changed', rbac));
        expect(hidden('#admin-login-view')).toBe(true);
        expect(account()!.classList.contains('hidden')).toBe(false);
        expect(account()!.querySelector('.account-control-name')!.textContent).toBe('admin');
        expect(account()!.querySelector('.account-control-role')!.classList.contains('hidden')).toBe(false);
        // The gateway's pages return to the admin console.
        expect(account()!.querySelector('.account-control-password')!.getAttribute('href')).toBe('/login/password?next=/solAdmin');
        expect(account()!.querySelector('.account-control-twofactor')!.getAttribute('href')).toBe('/login/two-factor?next=/solAdmin');
        expect(appState.managed).toEqual({
            admin: true, username: 'admin', broker: '', vpns: [],
            operate: ADMIN_PROFILE.operate, readOnly: [], modules: [],
        });
        // The admin app opens no broker connection, so it adopts nothing into
        // the provisioned-connection profile.
        expect(ctx.managedProfile.isActive()).toBe(false);
        expect(rbac).toHaveBeenCalledTimes(1);
    });

    it('never opens a broker connection', async () => {
        await install();
        expect(appState.isConnected).toBe(false);
        expect(appState.isSempConnected).toBe(false);
        expect(appState.solaceConnection).toBeNull();
        expect(appState.sempCredentials).toBeNull();
    });

    it('without a session shows the sign-in link, quietly, and mounts no account control', async () => {
        const { el, hidden, account } = await install({ ok: false, status: 401, code: 'unauthenticated' });
        expect(hidden('#admin-login-view')).toBe(false);
        expect(hidden('#admin-login-error')).toBe(true);
        const link = el<HTMLAnchorElement>('#btn-admin-login');
        expect(link.getAttribute('href')).toBe('/login?next=/solAdmin');
        expect(link.textContent).toBe('Sign in');
        expect(appState.managed).toBeNull();
        expect(ctx.mountSidebarAccount).not.toHaveBeenCalled();
        expect(account()).toBeNull();
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

    it('refuses a non-admin profile, publishing nothing and mounting no control', async () => {
        const { el, account } = await install({ ok: true, data: { ...ADMIN_PROFILE, username: 'viewer', admin: false } });
        expect(el('#admin-login-error').textContent).toBe('This account is not an administrator.');
        expect(appState.managed).toBeNull();
        expect(account()).toBeNull();
    });
});

describe('admin-login — sign out', () => {
    it('ends the gateway session, clears the session, emits rbac:changed, shows the signed-out view, then navigates', async () => {
        const { el, hidden, account } = await install();
        const seen: string[] = [];
        logout.mockImplementation(async () => { seen.push('logout'); return { ok: true }; });
        eventBus.on('rbac:changed', () => seen.push(`rbac:changed (managed ${appState.managed === null ? 'cleared' : 'set'})`));
        (ctx.loadSelf as any).mockImplementation(() => seen.push(`loadSelf (sign-in view ${hidden('#admin-login-view') ? 'hidden' : 'shown'})`));
        account()!.querySelector<HTMLButtonElement>('.account-control-signout')!.click();
        expect(seen).toEqual(['logout', 'rbac:changed (managed cleared)', 'loadSelf (sign-in view shown)']);
        expect(logout).toHaveBeenCalledTimes(1);
        expect(appState.managed).toBeNull();
        expect(account()!.classList.contains('hidden')).toBe(true);
        expect(el<HTMLAnchorElement>('#btn-admin-login').getAttribute('href')).toBe('/login?next=/solAdmin');
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

    it('ignores the request while it holds no session (the Connections Provisioned tab may own it)', async () => {
        await install({ ok: false, status: 401, code: 'unauthenticated' });
        appState.managed = { admin: true, username: 'x', broker: 'b', vpns: [], operate: [], readOnly: [], modules: [] };
        eventBus.emit('rbac:sign-out-requested');
        expect(logout).not.toHaveBeenCalled();
        expect(appState.managed).not.toBeNull();
    });
});

describe('admin-login -- keeping the session alive', () => {
    it("watches the whole page for the administrator's input from sign-in, over this module's own request, and stops at sign-out", async () => {
        const { account } = await install();
        expect(activityMock.made).toHaveBeenCalledExactlyOnceWith(document, me, expect.any(Function));
        expect(activityMock.start).toHaveBeenCalledTimes(1);
        expect(activityMock.stop).not.toHaveBeenCalled();

        account()!.querySelector<HTMLButtonElement>('.account-control-signout')!.click();
        expect(activityMock.stop).toHaveBeenCalledTimes(1);
    });

    it('signs out, with the toast every admin page shows, when the gateway ended the session under an administrator at work', async () => {
        const { hidden } = await install();
        // The shell's toast container, so the toast has somewhere to show.
        document.body.insertAdjacentHTML('beforeend', '<div id="toast-container"></div>');
        const ended = activityMock.made.mock.calls[0][2] as () => void;
        ended();
        expect(document.querySelector('.toast')?.textContent).toContain('Your session has ended. Sign in again.');
        expect(appState.managed).toBeNull();
        expect(hidden('#admin-login-view')).toBe(false);
        expect(activityMock.stop).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['nobody is signed in', { ok: false, status: 401, code: 'unauthenticated' }],
        ['the account is not an administrator', { ok: true, data: { ...ADMIN_PROFILE, admin: false } }],
    ])('watches nothing while %s', async (_, answer) => {
        await install(answer);
        expect(activityMock.start).not.toHaveBeenCalled();
    });
});
