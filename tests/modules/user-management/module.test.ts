import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';

// --- mocked dependencies (hoisted so vi.mock factories can close over them) ---
const svcMock = vi.hoisted(() => ({ listUsers: vi.fn(), saveUser: vi.fn(), deleteUser: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../../src/core/encode', () => ({
    // deterministic, identity-revealing stamp so the test can assert the value
    stamp: (u: string, v: string) => `S1:${u}:${v}`,
}));
vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/modules/user-management/service', () => ({
    createUserMgmtService: () => ({
        listUsers: svcMock.listUsers, saveUser: svcMock.saveUser, deleteUser: svcMock.deleteUser,
    }),
}));

// Import AFTER the mocks are registered.
import { UserManagementModule } from '../../../src/modules/user-management/module';

const ADMIN: ManagedSession = {
    admin: true, username: 'admin', token: 'tok', broker: '', vpns: [], operate: [], readOnly: [],
};
const USERS = [
    { username: 'admin', admin: true, operate: [{ brokers: '*', msgVpns: '*', queues: '*' }], readOnly: [] },
    { username: 'viewer', admin: false, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'v1', queues: '*' }] },
];

function el<T extends HTMLElement>(c: HTMLElement, sel: string): T {
    return c.querySelector(sel) as T;
}
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');

function makeCtx(container: HTMLElement, managed: ManagedSession | null): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false, managed,
    };
    return {
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; eventBus.emit('app:state-change', { key: k, value: v }); },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(), config: {},
    } as AppContext;
}

async function setup(managed: ManagedSession | null = ADMIN) {
    const container = loadModuleDOM('user-management');
    const ctx = makeCtx(container, managed);
    svcMock.listUsers.mockResolvedValue(USERS);
    await UserManagementModule.install(ctx);
    if (managed?.admin) {
        await vi.waitFor(() => expect(el(container, '#user-mgmt-rows').children.length).toBeGreaterThan(0));
    }
    return { container, ctx };
}

const rowCount = (c: HTMLElement) => el(c, '#user-mgmt-rows').querySelectorAll('tr').length;

/** Click row `i`'s Edit (`.btn-secondary`) or Delete (`.btn-danger`) button. */
function clickRow(c: HTMLElement, i: number, cls: '.btn-secondary' | '.btn-danger'): void {
    el(c, '#user-mgmt-rows').querySelectorAll('tr')[i].querySelector<HTMLButtonElement>(cls)!.click();
}

/**
 * Stand in for the module that owns the login (admin-login / the Managed
 * panel): answer a sign-out request the way its logout does — clear the
 * session, then emit rbac:changed.
 */
function answerSignOut(ctx: AppContext) {
    const signOut = vi.fn(() => {
        ctx.setState('managed', null);
        ctx.eventBus.emit('rbac:changed');
    });
    ctx.eventBus.on('rbac:sign-out-requested', signOut);
    return signOut;
}

beforeEach(() => {
    svcMock.listUsers.mockReset();
    svcMock.saveUser.mockReset();
    svcMock.deleteUser.mockReset();
    toastMock.showToast.mockReset();
});

describe('user-management — list', () => {
    it('renders the user list for an admin on install', async () => {
        const { container } = await setup();
        expect(hidden(container, '#user-mgmt-gate')).toBe(true);
        expect(hidden(container, '#user-mgmt-list-view')).toBe(false);
        const rows = el(container, '#user-mgmt-rows').querySelectorAll('tr');
        expect(rows.length).toBe(2);
        expect(rows[0].textContent).toContain('admin');
        expect(rows[0].textContent).toContain('Admin');
        expect(rows[1].textContent).toContain('viewer');
        expect(rows[1].textContent).toContain('User');
    });

    it('gates (no fetch) when the session is not admin', async () => {
        const { container } = await setup({ ...ADMIN, admin: false });
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
        expect(hidden(container, '#user-mgmt-list-view')).toBe(true);
        expect(svcMock.listUsers).not.toHaveBeenCalled();
    });

    it('gates (no fetch) when there is no managed session', async () => {
        const { container } = await setup(null);
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
        expect(svcMock.listUsers).not.toHaveBeenCalled();
    });

    it('Refresh re-fetches the list', async () => {
        const { container } = await setup();
        svcMock.listUsers.mockClear();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-refresh').click();
        await vi.waitFor(() => expect(svcMock.listUsers).toHaveBeenCalled());
    });

    it('shows an error when listUsers returns null', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockResolvedValue(null);
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(hidden(container, '#user-mgmt-list-error')).toBe(false));
        expect(el(container, '#user-mgmt-list-error').textContent).toMatch(/failed/i);
    });

    it('surfaces a thrown error from listUsers', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockRejectedValue(new Error('boom'));
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#user-mgmt-list-error').textContent).toBe('boom'));
    });

    it('renders an empty-state row when there are no users', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockResolvedValue([]);
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#user-mgmt-rows').textContent).toMatch(/no users/i));
    });

    it('reloads the list on rbac:changed', async () => {
        const { container, ctx } = await setup();
        svcMock.listUsers.mockClear();
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(svcMock.listUsers).toHaveBeenCalled());
    });

    it('clears the gate and loads the list when an admin logs in (rbac:changed)', async () => {
        // Install with no session → gate; then an admin "logs in" and rbac:changed fires.
        const { container, ctx } = await setup(null);
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
        ctx.setState('managed', ADMIN);
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(svcMock.listUsers).toHaveBeenCalled());
        expect(hidden(container, '#user-mgmt-gate')).toBe(true);
        expect(hidden(container, '#user-mgmt-list-view')).toBe(false);
    });
});

describe('user-management — create / edit form', () => {
    it('Add opens the form in create mode', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        expect(hidden(container, '#user-mgmt-form-view')).toBe(false);
        expect(el<HTMLInputElement>(container, '#user-mgmt-username').disabled).toBe(false);
        expect(el(container, '#user-mgmt-password-hint').textContent).toMatch(/required/i);
    });

    it('rejects a save with no username', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toMatch(/username/i));
        expect(svcMock.saveUser).not.toHaveBeenCalled();
    });

    it('rejects a new user with no password', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLInputElement>(container, '#user-mgmt-username').value = 'newbie';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toMatch(/password/i));
        expect(svcMock.saveUser).not.toHaveBeenCalled();
    });

    it('creates a user: stamps the password and posts the payload', async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue(true);
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLInputElement>(container, '#user-mgmt-username').value = 'newbie';
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'pw';
        el<HTMLInputElement>(container, '#user-mgmt-admin').checked = true;
        // add one operate glob row
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add-operate').click();
        const opInputs = el(container, '#user-mgmt-operate-rows').querySelectorAll<HTMLInputElement>('input');
        opInputs[0].value = '*'; opInputs[1].value = '*'; opInputs[2].value = 'orders.*';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();

        // showView('list') is the LAST step of a successful save (after the
        // saveUser + refreshList awaits) — wait for it, then everything earlier
        // (the saveUser call, the toast) has necessarily already run.
        await vi.waitFor(() => expect(hidden(container, '#user-mgmt-list-view')).toBe(false));
        expect(svcMock.saveUser).toHaveBeenCalledWith('admin', 'tok', {
            username: 'newbie', password: 'S1:newbie:pw', admin: true,
            operate: [{ brokers: '*', msgVpns: '*', queues: 'orders.*' }], readOnly: [],
        });
        expect(toastMock.showToast).toHaveBeenCalledWith('User saved', 'ok');
    });

    it('shows an error when the save is rejected', async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue(false);
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLInputElement>(container, '#user-mgmt-username').value = 'x';
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toMatch(/failed/i));
    });

    it('surfaces a thrown error from saveUser', async () => {
        const { container } = await setup();
        svcMock.saveUser.mockRejectedValue('net-fail'); // non-Error → String(e) branch
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLInputElement>(container, '#user-mgmt-username').value = 'x';
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toBe('net-fail'));
    });

    it('Edit pre-fills the form and keeps the password blank', async () => {
        const { container } = await setup();
        // second row = viewer
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-secondary')!.click();
        expect(hidden(container, '#user-mgmt-form-view')).toBe(false);
        expect(el<HTMLInputElement>(container, '#user-mgmt-username').value).toBe('viewer');
        expect(el<HTMLInputElement>(container, '#user-mgmt-username').disabled).toBe(true);
        expect(el<HTMLInputElement>(container, '#user-mgmt-admin').checked).toBe(false);
        expect(el(container, '#user-mgmt-password-hint').textContent).toMatch(/keep/i);
        // viewer has one read-only glob row pre-filled
        const roInputs = el(container, '#user-mgmt-readonly-rows').querySelectorAll<HTMLInputElement>('input');
        expect(roInputs[0].value).toBe('b1');
    });

    it('editing keeps the password blank in the payload', async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue(true);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-secondary')!.click();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveUser).toHaveBeenCalled());
        expect(svcMock.saveUser.mock.calls[0][2].password).toBe('');
    });

    it('re-gates the local session AND emits rbac:changed when an admin demotes themselves', async () => {
        const { container, ctx } = await setup();
        svcMock.saveUser.mockResolvedValue(true);
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);
        // first row = admin (own record); open edit, clear the Administrator flag, save
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.btn-secondary')!.click();
        el<HTMLInputElement>(container, '#user-mgmt-admin').checked = false;
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        // The local session must reflect the demotion so the kernel re-gates;
        // emitting alone would leave appState.managed.admin stale. The setState
        // runs after the saveUser await, so wait for it to land.
        await vi.waitFor(() => expect(ctx.appState.managed!.admin).toBe(false));
        expect(rbac).toHaveBeenCalled();
        // The self-demote drops the now-unauthorized admin onto the gate.
        await vi.waitFor(() => expect(hidden(container, '#user-mgmt-gate')).toBe(false));
    });

    it('edit tolerates a user with no operate/readOnly arrays (?? [] fallback)', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        // a legacy record missing both glob arrays → they arrive as undefined
        svcMock.listUsers.mockResolvedValue([{ username: 'legacy', admin: false }]);
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#user-mgmt-rows').children.length).toBeGreaterThan(0));
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.btn-secondary')!.click();
        expect(el(container, '#user-mgmt-operate-rows').querySelectorAll('.row-list-row').length).toBe(0);
        expect(el(container, '#user-mgmt-readonly-rows').querySelectorAll('.row-list-row').length).toBe(0);
    });

    it('Cancel returns to the list', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-cancel').click();
        expect(hidden(container, '#user-mgmt-list-view')).toBe(false);
        expect(hidden(container, '#user-mgmt-form-view')).toBe(true);
    });

    it('Add read-only row button appends a row', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add-readonly').click();
        expect(el(container, '#user-mgmt-readonly-rows').querySelectorAll('.row-list-row').length).toBe(1);
    });

    it('save is a no-op if the managed session vanished mid-form', async () => {
        const { container, ctx } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        ctx.setState('managed', null);
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await Promise.resolve();
        expect(svcMock.saveUser).not.toHaveBeenCalled();
    });
});

describe('user-management — delete', () => {
    it('deletes a user after confirmation', async () => {
        const { container } = await setup();
        svcMock.deleteUser.mockResolvedValue(true);
        (globalThis.confirm as any).mockReturnValue(true);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-danger')!.click();
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('User deleted', 'ok'));
        expect(svcMock.deleteUser).toHaveBeenCalledWith('admin', 'tok', 'viewer');
    });

    it('does nothing when the delete is cancelled', async () => {
        const { container } = await setup();
        (globalThis.confirm as any).mockReturnValue(false);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-danger')!.click();
        await Promise.resolve();
        expect(svcMock.deleteUser).not.toHaveBeenCalled();
    });

    it('toasts an error when the delete is rejected', async () => {
        const { container } = await setup();
        svcMock.deleteUser.mockResolvedValue(false);
        (globalThis.confirm as any).mockReturnValue(true);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-danger')!.click();
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('Delete failed', 'error'));
    });

    it('toasts a thrown error from deleteUser', async () => {
        const { container } = await setup();
        svcMock.deleteUser.mockRejectedValue(new Error('nope'));
        (globalThis.confirm as any).mockReturnValue(true);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-danger')!.click();
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('nope', 'error'));
    });

    it('delete is a no-op if the managed session vanished', async () => {
        const { container, ctx } = await setup();
        ctx.setState('managed', null);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.btn-danger')!.click();
        await Promise.resolve();
        expect(svcMock.deleteUser).not.toHaveBeenCalled();
    });
});

// Changing your own password (or deleting your own account) leaves the session
// holding a token the gateway no longer accepts, so the module must hand the
// sign-out to the login owner instead of patching the session or reloading.
describe('user-management — your own session', () => {
    it('changing your own password asks the login owner to sign out, with a sign-in-again message', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue(true);
        svcMock.listUsers.mockClear();
        clickRow(container, 0, '.btn-secondary'); // admin = own record
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'new-pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));

        expect(svcMock.saveUser).toHaveBeenCalledWith('admin', 'tok',
            expect.objectContaining({ username: 'admin', password: 'S1:admin:new-pw' }));
        expect(toastMock.showToast).toHaveBeenCalledWith('Password changed. Sign in again with the new password.', 'ok', 5000);
        expect(toastMock.showToast).not.toHaveBeenCalledWith('User saved', 'ok');
        // Signed out → gated, and the list was never reloaded with the dead token.
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
        expect(hidden(container, '#user-mgmt-list-error')).toBe(true);
        expect(svcMock.listUsers).not.toHaveBeenCalled();
        expect(el<HTMLInputElement>(container, '#user-mgmt-password').value).toBe('');
    });

    it('editing your own record without a password keeps you signed in', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);
        svcMock.saveUser.mockResolvedValue(true);
        clickRow(container, 0, '.btn-secondary');
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(rbac).toHaveBeenCalled());

        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toMatchObject({ username: 'admin', token: 'tok', admin: true });
        expect(toastMock.showToast).toHaveBeenCalledWith('User saved', 'ok');
        expect(hidden(container, '#user-mgmt-list-view')).toBe(false);
    });

    it("changing another user's password keeps you signed in", async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue(true);
        svcMock.listUsers.mockClear();
        clickRow(container, 1, '.btn-secondary'); // viewer
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'pw2';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.listUsers).toHaveBeenCalledWith('admin', 'tok'));

        expect(svcMock.saveUser.mock.calls[0][2].password).toBe('S1:viewer:pw2');
        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toBe(ADMIN);
    });

    it('a rejected save of your own password does not sign you out', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue(false);
        clickRow(container, 0, '.btn-secondary');
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'new-pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toBe('Save failed.'));

        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toBe(ADMIN);
        expect(hidden(container, '#user-mgmt-form-view')).toBe(false);
    });

    it('deleting your own account signs you out instead of reloading the list', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.deleteUser.mockResolvedValue(true);
        svcMock.listUsers.mockClear();
        clickRow(container, 0, '.btn-danger');
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));

        expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringMatching(/your own account.*signed out/i));
        expect(svcMock.deleteUser).toHaveBeenCalledWith('admin', 'tok', 'admin');
        expect(toastMock.showToast).toHaveBeenCalledWith('Account deleted. You have been signed out.', 'ok', 5000);
        expect(svcMock.listUsers).not.toHaveBeenCalled();
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
    });

    it('a refused delete of your own account (last admin, 409) does not sign you out', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.deleteUser.mockResolvedValue(false);
        clickRow(container, 0, '.btn-danger');
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('Delete failed', 'error'));

        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toBe(ADMIN);
    });
});
