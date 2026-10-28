/**
 * Integration — the /solAdmin session lifecycle: real admin-login +
 * user-management on one EventBus, AppState and managedStore.
 *
 * The unit suites stand in for the other side of `rbac:sign-out-requested`
 * (tests/modules/user-management/module.test.ts › "user-management — your own
 * session", tests/modules/admin-login/module.test.ts › "admin-login — sign-out
 * requested by another module"); here both modules are real, so a change that
 * makes the session's token invalid must end on admin-login's sign-in view
 * rather than on a user list that cannot load. Only the network edges are
 * mocked (the managed and user services, `/hosted`) plus the toast; `encode`
 * and the store stay real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../../src/core/event-bus';
import { createManagedSessionStore } from '../../src/core/services/managed-session-store';
import { loadModuleDOM } from '../helpers/loadModuleDOM';
import type { AppContext, AppState } from '../../src/core/types';

const { getConnections, umSvc, showToast } = vi.hoisted(() => ({
    getConnections: vi.fn(),
    umSvc: { listUsers: vi.fn(), saveUser: vi.fn(), deleteUser: vi.fn() },
    showToast: vi.fn(),
}));
vi.mock('../../src/core/services/managed-service', () => ({
    createManagedService: () => ({ getConnections, reload: vi.fn() }),
}));
vi.mock('../../src/modules/user-management/service', () => ({
    createUserMgmtService: () => umSvc,
}));
vi.mock('../../src/core/toast', () => ({ showToast }));

// Import AFTER the mocks are registered.
import { AdminLoginModule } from '../../src/modules/admin-login/module';
import { UserManagementModule } from '../../src/modules/user-management/module';

const SEED_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const USERS = [
    { username: 'admin', admin: true, operate: [{ brokers: '*', msgVpns: '*', queues: '*' }], readOnly: [] },
    { username: 'viewer', admin: false, operate: [], readOnly: [] },
];

const q = <T extends HTMLElement>(c: HTMLElement, sel: string): T => c.querySelector(sel) as T;
const hidden = (c: HTMLElement, sel: string) => q(c, sel).classList.contains('hidden');
const rowButton = (c: HTMLElement, i: number, cls: string) =>
    q(c, '#user-mgmt-rows').querySelectorAll('tr')[i].querySelector<HTMLButtonElement>(cls)!;

/** Both modules of the admin app, sharing one bus, AppState and store. */
async function installAdminApp() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
        JSON.stringify({ hosted: true, connModes: 'managed', defaultConn: 'managed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, isSempConnected: false,
        selectedVpn: null, solaceConnection: null, sempCredentials: null, managed: null,
    };
    const managedStore = createManagedSessionStore();
    const ctxFor = (container: HTMLElement): AppContext => ({
        container, appState, eventBus, managedStore,
        setState: (k, v) => { (appState as any)[k] = v; eventBus.emit('app:state-change', { key: k, value: v }); },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(), config: {},
    });
    const login = loadModuleDOM('admin-login');
    const users = loadModuleDOM('user-management');
    const loginCtx = ctxFor(login);
    await AdminLoginModule.install(loginCtx);
    await UserManagementModule.install(ctxFor(users));
    return { appState, managedStore, login, users, loginCtx };
}

async function signInAsAdmin({ login, users }: Awaited<ReturnType<typeof installAdminApp>>) {
    getConnections.mockResolvedValue({
        admin: true, siteSeed: SEED_B64,
        operate: [{ brokers: '*', msgVpns: '*', queues: '*' }], readOnly: [], brokers: [],
    });
    umSvc.listUsers.mockResolvedValue(USERS);
    q<HTMLInputElement>(login, '#admin-login-username').value = 'admin';
    q<HTMLInputElement>(login, '#admin-login-password').value = 'pw';
    q<HTMLButtonElement>(login, '#btn-admin-login').click();
    await vi.waitFor(() => expect(q(users, '#user-mgmt-rows').querySelectorAll('tr').length).toBe(2));
}

/** The admin app is back at its sign-in screen with nothing of the old session left. */
function expectSignedOut(app: Awaited<ReturnType<typeof installAdminApp>>) {
    const { appState, managedStore, login, users, loginCtx } = app;
    expect(hidden(login, '#admin-login-view')).toBe(false);
    expect(appState.managed).toBeNull();
    expect(managedStore.isActive()).toBe(false);
    expect(loginCtx.loadSelf).toHaveBeenCalledTimes(1);
    expect(hidden(users, '#user-mgmt-gate')).toBe(false);
    expect(hidden(users, '#user-mgmt-list-error')).toBe(true);
    // Only the sign-in load: no reload with the token the gateway dropped.
    expect(umSvc.listUsers).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
    getConnections.mockReset();
    umSvc.listUsers.mockReset();
    umSvc.saveUser.mockReset();
    umSvc.deleteUser.mockReset();
    showToast.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('integration — admin app session lifecycle', () => {
    it('changing your own password signs the admin app out instead of leaving a list that cannot load', async () => {
        const app = await installAdminApp();
        await signInAsAdmin(app);
        umSvc.saveUser.mockResolvedValue(true);

        rowButton(app.users, 0, '.btn-secondary').click();
        q<HTMLInputElement>(app.users, '#user-mgmt-password').value = 'new-pw';
        q<HTMLButtonElement>(app.users, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(app.appState.managed).toBeNull());

        expectSignedOut(app);
        expect(showToast).toHaveBeenCalledWith('Password changed. Sign in again with the new password.', 'ok', 5000);
    });

    it('deleting your own account signs the admin app out', async () => {
        const app = await installAdminApp();
        await signInAsAdmin(app);
        umSvc.deleteUser.mockResolvedValue(true);

        rowButton(app.users, 0, '.btn-danger').click();
        await vi.waitFor(() => expect(app.appState.managed).toBeNull());

        expectSignedOut(app);
        expect(showToast).toHaveBeenCalledWith('Account deleted. You have been signed out.', 'ok', 5000);
    });

    it('editing your own record without a password keeps the admin app signed in', async () => {
        const app = await installAdminApp();
        await signInAsAdmin(app);
        const token = app.appState.managed!.token;
        umSvc.saveUser.mockResolvedValue(true);

        rowButton(app.users, 0, '.btn-secondary').click();
        q<HTMLButtonElement>(app.users, '#btn-user-mgmt-save').click();
        // The own-record save re-emits rbac:changed, which reloads the list.
        await vi.waitFor(() => expect(umSvc.listUsers).toHaveBeenCalledTimes(2));

        expect(hidden(app.login, '#admin-session-view')).toBe(false);
        expect(app.appState.managed!.token).toBe(token);
        expect(app.managedStore.isActive()).toBe(true);
        expect(app.loginCtx.loadSelf).not.toHaveBeenCalled();
    });
});
