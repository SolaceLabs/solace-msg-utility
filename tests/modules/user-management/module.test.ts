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
