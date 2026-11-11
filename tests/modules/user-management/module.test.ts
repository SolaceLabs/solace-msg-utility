import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';

// --- mocked dependencies (hoisted so vi.mock factories can close over them) ---
const svcMock = vi.hoisted(() => ({ listUsers: vi.fn(), saveUser: vi.fn(), deleteUser: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/modules/user-management/service', () => ({
    createUserMgmtService: () => ({
        listUsers: svcMock.listUsers, saveUser: svcMock.saveUser, deleteUser: svcMock.deleteUser,
    }),
}));

// Import AFTER the mocks are registered.
import { NO_OPERATE, NO_READ_ONLY, UserManagementModule } from '../../../src/modules/user-management/module';
import { completeContext } from '../../helpers/appContext';
import { answerConfirm } from '../../helpers/confirmDialog';

const ADMIN: ManagedSession = {
    admin: true, username: 'admin', broker: '', vpns: [], operate: [], readOnly: [], modules: [],
};
const USERS = [
    { username: 'admin', admin: true, operate: [{ brokers: '*', msgVpns: '*', queues: '*' }], readOnly: [], modules: null },
    { username: 'viewer', admin: false, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'v1', queues: '*' }], modules: ['queue-browser'] },
];
/** The deployment offers only queue-browser of the two catalog modules. */
const CHOICES = { catalog: ['queue-browser', 'queue-copy'], offered: ['queue-browser'], userDefault: 'all' };
const listed = (users: unknown[], modules: unknown = CHOICES) => ({ ok: true, data: { users, modules } });

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
    return completeContext({
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; eventBus.emit('app:state-change', { key: k, value: v }); },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(),
    });
}

async function setup(managed: ManagedSession | null = ADMIN) {
    const container = loadModuleDOM('user-management');
    const ctx = makeCtx(container, managed);
    svcMock.listUsers.mockResolvedValue(listed(USERS));
    await UserManagementModule.install(ctx);
    if (managed?.admin) {
        await vi.waitFor(() => expect(el(container, '#user-mgmt-rows').children.length).toBeGreaterThan(0));
    }
    return { container, ctx };
}

const rowCount = (c: HTMLElement) => el(c, '#user-mgmt-rows').querySelectorAll('tr').length;

/** Click row `i`'s Edit (`.user-mgmt-edit`) or Delete (`.user-mgmt-delete`) icon button. */
function clickRow(c: HTMLElement, i: number, cls: '.user-mgmt-edit' | '.user-mgmt-delete'): void {
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

    it("shows the gateway's reason when the list fails", async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockResolvedValue({ ok: false, status: 0, code: 'network' });
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#user-mgmt-list-error').textContent).toBe('The gateway could not be reached.'));
    });

    it('a 401 on the list asks the session owner to sign out', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        const signOut = answerSignOut(ctx);
        svcMock.listUsers.mockResolvedValue({ ok: false, status: 401, code: 'unauthenticated' });
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        expect(toastMock.showToast).toHaveBeenCalledWith('Your session has ended. Sign in again.', 'error', 5000);
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
        expect(hidden(container, '#user-mgmt-test-view')).toBe(true);
    });

    it('renders an empty-state row when there are no users', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockResolvedValue(listed([]));
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#user-mgmt-rows').textContent).toMatch(/no users/i));
    });

    it('reloads the list on rbac:changed', async () => {
        const { ctx } = await setup();
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

describe('user-management -- list rows and search', () => {
    const MANY = ['alice', 'bob', 'ops-admin', 'ops-viewer'].map(username =>
        ({ username, admin: false, operate: [], readOnly: [], modules: null }));

    async function setupMany() {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockResolvedValue(listed(MANY));
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(rowCount(container)).toBe(4));
        return container;
    }
    function search(c: HTMLElement, q: string): void {
        const input = el<HTMLInputElement>(c, '#user-mgmt-search');
        input.value = q;
        input.dispatchEvent(new Event('input'));
    }
    const names = (c: HTMLElement) =>
        [...el(c, '#user-mgmt-rows').querySelectorAll('tr')].map(tr => tr.cells[0].textContent);

    it("each row's actions are icon buttons named for the user", async () => {
        const { container } = await setup();
        const row = el(container, '#user-mgmt-rows').querySelectorAll('tr')[1];
        expect(row.querySelector('.user-mgmt-edit')!.getAttribute('aria-label')).toBe('Edit user "viewer"');
        expect(row.querySelector('.user-mgmt-delete')!.getAttribute('aria-label')).toBe('Delete user "viewer"');
        expect(row.querySelector('.user-mgmt-delete')!.classList.contains('btn-icon-danger')).toBe(true);
    });

    it('narrows the list as you type: contains, case-insensitive, * spanning any run; clearing restores it', async () => {
        const container = await setupMany();
        search(container, 'OPS');
        expect(names(container)).toEqual(['ops-admin', 'ops-viewer']);
        search(container, 'o*v');
        expect(names(container)).toEqual(['ops-viewer']);
        search(container, '');
        expect(names(container)).toEqual(['alice', 'bob', 'ops-admin', 'ops-viewer']);
        expect(svcMock.listUsers).toHaveBeenCalledTimes(1); // filtered in memory
    });

    it('says when no user matches, writing the query as text', async () => {
        const container = await setupMany();
        search(container, '<img src=x>');
        expect(el(container, '#user-mgmt-rows').textContent).toBe('No users match "<img src=x>".');
        expect(el(container, '#user-mgmt-rows').querySelector('img')).toBeNull();
    });

    it('keeps the query across a Refresh', async () => {
        const container = await setupMany();
        search(container, 'ops');
        svcMock.listUsers.mockResolvedValue(listed([...MANY, { ...MANY[0], username: 'ops-new' }]));
        el<HTMLButtonElement>(container, '#btn-user-mgmt-refresh').click();
        await vi.waitFor(() => expect(names(container)).toEqual(['ops-admin', 'ops-viewer', 'ops-new']));
    });
});

describe('user-management -- permission test card', () => {
    it('shows with the list, offers the loaded users, and gives way to the form', async () => {
        const { container } = await setup();
        expect(hidden(container, '#user-mgmt-test-view')).toBe(false);
        const options = [...el<HTMLSelectElement>(container, '#user-mgmt-test-user').options].map(o => o.value);
        expect(options).toEqual(['', 'admin', 'viewer']);
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        expect(hidden(container, '#user-mgmt-test-view')).toBe(true);
        el<HTMLButtonElement>(container, '#btn-user-mgmt-cancel').click();
        expect(hidden(container, '#user-mgmt-test-view')).toBe(false);
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

    it('Add refuses a username that already exists', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLInputElement>(container, '#user-mgmt-username').value = 'viewer';
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'long-enough-pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toBe('User "viewer" already exists. Use Edit to change it.'));
        expect(svcMock.saveUser).not.toHaveBeenCalled();
    });

    it('creates a user: sends the password as typed (the gateway hashes it)', async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue({ ok: true });
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
        expect(svcMock.saveUser).toHaveBeenCalledWith({
            username: 'newbie', password: 'pw', admin: true,
            operate: [{ brokers: '*', msgVpns: '*', queues: 'orders.*' }], readOnly: [], modules: null,
        });
        expect(toastMock.showToast).toHaveBeenCalledWith('User saved', 'ok');
    });

    it("shows the gateway's reason when the save is rejected", async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue({
            ok: false, status: 422, code: 'invalid', field: 'password', reason: 'Password must be 12 to 128 characters.',
        });
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLInputElement>(container, '#user-mgmt-username').value = 'x';
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent).toBe('Password must be 12 to 128 characters.'));
        expect(el<HTMLButtonElement>(container, '#btn-user-mgmt-save').disabled).toBe(false);
    });

    it('Edit pre-fills the form and keeps the password blank', async () => {
        const { container } = await setup();
        // second row = viewer
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.user-mgmt-edit')!.click();
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
        svcMock.saveUser.mockResolvedValue({ ok: true });
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.user-mgmt-edit')!.click();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveUser).toHaveBeenCalled());
        expect(svcMock.saveUser.mock.calls[0][0].password).toBe('');
    });

    it('edit tolerates a user with no operate/readOnly arrays (?? [] fallback)', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        // a legacy record missing both glob arrays → they arrive as undefined
        svcMock.listUsers.mockResolvedValue(listed([{ username: 'legacy', admin: false }]));
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#user-mgmt-rows').children.length).toBeGreaterThan(0));
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.user-mgmt-edit')!.click();
        expect(el(container, '#user-mgmt-operate-rows').querySelectorAll('.row-list-row').length).toBe(0);
        expect(el(container, '#user-mgmt-readonly-rows').querySelectorAll('.row-list-row').length).toBe(0);
        // No modules field either: the deployment default.
        expect(el<HTMLInputElement>(container, '#user-mgmt-modules-default').checked).toBe(true);
    });

    it('Cancel returns to the list', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-cancel').click();
        expect(hidden(container, '#user-mgmt-list-view')).toBe(false);
        expect(hidden(container, '#user-mgmt-form-view')).toBe(true);
    });

    it('says what each empty entitlement list means, and names the columns once a row is added', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        const operate = el(container, '#user-mgmt-operate-rows');
        const shown = (sel: string, root: HTMLElement) => !root.querySelector(sel)!.classList.contains('hidden');

        expect(operate.querySelector('.row-list-empty')!.textContent).toBe(NO_OPERATE);
        expect(el(container, '#user-mgmt-readonly-rows').querySelector('.row-list-empty')!.textContent).toBe(NO_READ_ONLY);
        expect(shown('.row-list-head', operate)).toBe(false);
        // The hint under both lists: what a row grants, and that the Administrator flag grants no broker.
        expect(el(container, '.user-mgmt-hint').textContent).toContain('The Administrator flag gives no broker access by itself.');

        el<HTMLButtonElement>(container, '#btn-user-mgmt-add-operate').click();
        expect(shown('.row-list-empty', operate)).toBe(false);
        expect(shown('.row-list-head', operate)).toBe(true);
        expect(Array.from(operate.querySelectorAll('.row-list-label'), n => n.textContent)).toEqual(['Brokers', 'Message VPNs', 'Queues']);
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

describe('user-management — modules', () => {
    const boxes = (c: HTMLElement) => [...el(c, '#user-mgmt-modules').querySelectorAll<HTMLInputElement>('input')];
    const defaultBox = (c: HTMLElement) => el<HTMLInputElement>(c, '#user-mgmt-modules-default');
    function toggleDefault(c: HTMLElement, checked: boolean): void {
        defaultBox(c).checked = checked;
        defaultBox(c).dispatchEvent(new Event('change'));
    }

    it('a new user starts on the deployment default, shown and locked', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        expect(defaultBox(container).checked).toBe(true);
        expect(el(container, '#user-mgmt-modules-default-hint').textContent).toBe('(every offered module)');
        expect(el(container, '#user-mgmt-modules').textContent).toBe(' Queue Browser Queue Copy (not offered)');
        expect(boxes(container).map(b => [b.value, b.checked, b.disabled])).toEqual([
            ['queue-browser', true, true],
            ['queue-copy', false, true],
        ]);
    });

    it("editing a user with a list of their own shows it, editable", async () => {
        const { container } = await setup();
        clickRow(container, 1, '.user-mgmt-edit'); // viewer: ['queue-browser']
        expect(defaultBox(container).checked).toBe(false);
        expect(boxes(container).map(b => [b.checked, b.disabled])).toEqual([[true, false], [false, false]]);
    });

    it("leaving the default starts from what it grants; the save sends the user's own list", async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue({ ok: true });
        clickRow(container, 0, '.user-mgmt-edit'); // admin: default
        toggleDefault(container, false);
        expect(boxes(container).map(b => [b.checked, b.disabled])).toEqual([[true, false], [false, false]]);
        boxes(container)[0].checked = false;
        boxes(container)[1].checked = true;
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveUser).toHaveBeenCalled());
        expect(svcMock.saveUser.mock.calls[0][0].modules).toEqual(['queue-copy']);
    });

    it('returning to the default shows it again and sends null', async () => {
        const { container } = await setup();
        svcMock.saveUser.mockResolvedValue({ ok: true });
        clickRow(container, 1, '.user-mgmt-edit'); // viewer
        boxes(container)[1].checked = true;
        toggleDefault(container, true);
        expect(boxes(container).map(b => [b.checked, b.disabled])).toEqual([[true, true], [false, true]]);
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveUser).toHaveBeenCalled());
        expect(svcMock.saveUser.mock.calls[0][0].modules).toBeNull();
    });

    it('under a "none" default the hint says so and nothing is granted', async () => {
        const container = loadModuleDOM('user-management');
        const ctx = makeCtx(container, ADMIN);
        svcMock.listUsers.mockResolvedValue(listed(USERS, { ...CHOICES, userDefault: 'none' }));
        await UserManagementModule.install(ctx);
        await vi.waitFor(() => expect(rowCount(container)).toBe(2));
        el<HTMLButtonElement>(container, '#btn-user-mgmt-add').click();
        expect(el(container, '#user-mgmt-modules-default-hint').textContent).toBe('(no modules)');
        expect(boxes(container).some(b => b.checked)).toBe(false);
    });
});

describe('user-management — delete', () => {
    it('deletes a user after confirmation', async () => {
        const { container } = await setup();
        svcMock.deleteUser.mockResolvedValue({ ok: true });
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.user-mgmt-delete')!.click();
        expect(await answerConfirm(true)).toBe('Delete user "viewer"?');
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('User deleted', 'ok'));
        expect(svcMock.deleteUser).toHaveBeenCalledWith('viewer');
    });

    it('does nothing when the delete is cancelled', async () => {
        const { container } = await setup();
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.user-mgmt-delete')!.click();
        await answerConfirm(false);
        expect(svcMock.deleteUser).not.toHaveBeenCalled();
    });

    it("toasts the gateway's reason when the delete is rejected", async () => {
        const { container } = await setup();
        svcMock.deleteUser.mockResolvedValue({ ok: false, status: 404, code: 'not_found' });
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.user-mgmt-delete')!.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('Not found. It may already have been removed.', 'error'));
    });

    it('delete is a no-op if the managed session vanished', async () => {
        const { container, ctx } = await setup();
        ctx.setState('managed', null);
        el(container, '#user-mgmt-rows').querySelectorAll('tr')[1]
            .querySelector<HTMLButtonElement>('.user-mgmt-delete')!.click();
        await Promise.resolve();
        expect(svcMock.deleteUser).not.toHaveBeenCalled();
    });
});

// A new password or administrator flag on your own account, or deleting it,
// ends the session at the gateway, so the module must hand the sign-out to the
// session owner instead of patching the session or reloading.
describe('user-management — your own session', () => {
    it('changing your own password asks the session owner to sign out, with a sign-in-again message', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue({ ok: true });
        svcMock.listUsers.mockClear();
        clickRow(container, 0, '.user-mgmt-edit'); // admin = own record
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'new-pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));

        expect(svcMock.saveUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin', password: 'new-pw' }));
        expect(toastMock.showToast).toHaveBeenCalledWith('Password changed. Sign in again.', 'ok', 5000);
        expect(toastMock.showToast).not.toHaveBeenCalledWith('User saved', 'ok');
        // Signed out → gated, and the list was never reloaded on the dead session.
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
        expect(hidden(container, '#user-mgmt-list-error')).toBe(true);
        expect(svcMock.listUsers).not.toHaveBeenCalled();
        expect(el<HTMLInputElement>(container, '#user-mgmt-password').value).toBe('');
    });

    it('clearing your own Administrator flag signs you out too', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue({ ok: true });
        clickRow(container, 0, '.user-mgmt-edit');
        el<HTMLInputElement>(container, '#user-mgmt-admin').checked = false;
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        expect(toastMock.showToast).toHaveBeenCalledWith('Administrator flag changed. Sign in again.', 'ok', 5000);
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
    });

    it('editing your own entitlements without a password keeps you signed in', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        const rbac = vi.fn();
        ctx.eventBus.on('rbac:changed', rbac);
        svcMock.saveUser.mockResolvedValue({ ok: true });
        clickRow(container, 0, '.user-mgmt-edit');
        el(container, '#user-mgmt-operate-rows').querySelectorAll<HTMLInputElement>('input')[2].value = 'orders.*';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(rbac).toHaveBeenCalled());

        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toMatchObject({
            username: 'admin', admin: true, operate: [{ brokers: '*', msgVpns: '*', queues: 'orders.*' }],
        });
        expect(toastMock.showToast).toHaveBeenCalledWith('User saved', 'ok');
        expect(hidden(container, '#user-mgmt-list-view')).toBe(false);
    });

    it("changing another user's password keeps you signed in", async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue({ ok: true });
        svcMock.listUsers.mockClear();
        clickRow(container, 1, '.user-mgmt-edit'); // viewer
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'pw2';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.listUsers).toHaveBeenCalled());

        expect(svcMock.saveUser.mock.calls[0][0].password).toBe('pw2');
        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toBe(ADMIN);
    });

    it('a rejected save of your own password does not sign you out', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.saveUser.mockResolvedValue({ ok: false, status: 500, code: 'server_error' });
        clickRow(container, 0, '.user-mgmt-edit');
        el<HTMLInputElement>(container, '#user-mgmt-password').value = 'new-pw';
        el<HTMLButtonElement>(container, '#btn-user-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#user-mgmt-form-error').textContent)
            .toBe('The gateway could not complete the request. Its log has the cause.'));

        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toBe(ADMIN);
        expect(hidden(container, '#user-mgmt-form-view')).toBe(false);
    });

    it('deleting your own account signs you out instead of reloading the list', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.deleteUser.mockResolvedValue({ ok: true });
        svcMock.listUsers.mockClear();
        clickRow(container, 0, '.user-mgmt-delete');
        expect(await answerConfirm(true)).toBe('Delete your own account "admin"? You will be signed out.');
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));

        expect(svcMock.deleteUser).toHaveBeenCalledWith('admin');
        expect(toastMock.showToast).toHaveBeenCalledWith('Account deleted. You have been signed out.', 'ok', 5000);
        expect(svcMock.listUsers).not.toHaveBeenCalled();
        expect(hidden(container, '#user-mgmt-gate')).toBe(false);
    });

    it('a refused delete of your own account (last admin, 409) does not sign you out', async () => {
        const { container, ctx } = await setup();
        const signOut = answerSignOut(ctx);
        svcMock.deleteUser.mockResolvedValue({ ok: false, status: 409, code: 'last_admin' });
        clickRow(container, 0, '.user-mgmt-delete');
        await answerConfirm(true);
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('At least one administrator must remain.', 'error'));

        expect(signOut).not.toHaveBeenCalled();
        expect(ctx.appState.managed).toBe(ADMIN);
    });
});
