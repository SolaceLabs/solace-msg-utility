import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';

const svcMock = vi.hoisted(() => ({ listConnections: vi.fn(), saveConnection: vi.fn(), deleteConnection: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/modules/connection-management/service', () => ({
    createConnMgmtService: () => ({
        listConnections: svcMock.listConnections, saveConnection: svcMock.saveConnection, deleteConnection: svcMock.deleteConnection,
    }),
}));

import { ConnectionManagementModule, NO_VPNS } from '../../../src/modules/connection-management/module';
import { completeContext } from '../../helpers/appContext';
import { answerConfirm } from '../../helpers/confirmDialog';

const ADMIN: ManagedSession = {
    admin: true, username: 'admin', broker: '', vpns: [], operate: [], readOnly: [], modules: [],
};
const CONNS = [
    { broker: 'b1', hostname: 'host1', semp: { port: '1943', user: 'mon', pass: '' }, client: { port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: '' }] } },
    { broker: 'b2', hostname: 'host2', semp: { port: '1943', user: 'mon', pass: '' }, client: { port: '1443', msgVpns: [] } },
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
    return completeContext({
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; eventBus.emit('app:state-change', { key: k, value: v }); },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(), config: {},
    });
}

async function setup(managed: ManagedSession | null = ADMIN) {
    const container = loadModuleDOM('connection-management');
    const ctx = makeCtx(container, managed);
    svcMock.listConnections.mockResolvedValue({ ok: true, data: CONNS });
    await ConnectionManagementModule.install(ctx);
    if (managed?.admin) {
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').children.length).toBeGreaterThan(0));
    }
    return { container, ctx };
}

beforeEach(() => {
    svcMock.listConnections.mockReset();
    svcMock.saveConnection.mockReset();
    svcMock.deleteConnection.mockReset();
    toastMock.showToast.mockReset();
});

describe('connection-management — list', () => {
    it('renders the connection list for an admin on install', async () => {
        const { container } = await setup();
        expect(hidden(container, '#conn-mgmt-gate')).toBe(true);
        expect(hidden(container, '#conn-mgmt-list-view')).toBe(false);
        const rows = el(container, '#conn-mgmt-rows').querySelectorAll('tr');
        expect(rows.length).toBe(2);
        expect(rows[0].textContent).toContain('b1');
        expect(rows[0].textContent).toContain('host1');
    });

    it('gates (no fetch) when the session is not admin', async () => {
        const { container } = await setup({ ...ADMIN, admin: false });
        expect(hidden(container, '#conn-mgmt-gate')).toBe(false);
        expect(hidden(container, '#conn-mgmt-list-view')).toBe(true);
        expect(svcMock.listConnections).not.toHaveBeenCalled();
    });

    it('gates (no fetch) when there is no managed session', async () => {
        const { container } = await setup(null);
        expect(hidden(container, '#conn-mgmt-gate')).toBe(false);
        expect(svcMock.listConnections).not.toHaveBeenCalled();
    });

    it('Refresh re-fetches', async () => {
        const { container } = await setup();
        svcMock.listConnections.mockClear();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-refresh').click();
        await vi.waitFor(() => expect(svcMock.listConnections).toHaveBeenCalled());
    });

    it("shows the gateway's reason when the list fails", async () => {
        const container = loadModuleDOM('connection-management');
        svcMock.listConnections.mockResolvedValue({ ok: false, status: 429, code: 'rate_limited' });
        await ConnectionManagementModule.install(makeCtx(container, ADMIN));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-list-error').textContent).toBe('Too many requests. Wait a minute and try again.'));
    });

    it('a 401 on the list asks the session owner to sign out', async () => {
        const container = loadModuleDOM('connection-management');
        const ctx = makeCtx(container, ADMIN);
        const signOut = vi.fn();
        ctx.eventBus.on('rbac:sign-out-requested', signOut);
        svcMock.listConnections.mockResolvedValue({ ok: false, status: 401, code: 'unauthenticated' });
        await ConnectionManagementModule.install(ctx);
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        expect(toastMock.showToast).toHaveBeenCalledWith('Your session has ended. Sign in again.', 'error', 5000);
    });

    it('renders an empty-state row when there are no connections', async () => {
        const container = loadModuleDOM('connection-management');
        svcMock.listConnections.mockResolvedValue({ ok: true, data: [] });
        await ConnectionManagementModule.install(makeCtx(container, ADMIN));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').textContent).toMatch(/no connections/i));
    });

    it('reloads on rbac:changed', async () => {
        const { ctx } = await setup();
        svcMock.listConnections.mockClear();
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(svcMock.listConnections).toHaveBeenCalled());
    });

    it('clears the gate and loads the list when an admin logs in (rbac:changed)', async () => {
        const { container, ctx } = await setup(null);
        expect(hidden(container, '#conn-mgmt-gate')).toBe(false);
        ctx.setState('managed', ADMIN);
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(svcMock.listConnections).toHaveBeenCalled());
        expect(hidden(container, '#conn-mgmt-gate')).toBe(true);
        expect(hidden(container, '#conn-mgmt-list-view')).toBe(false);
    });
});

describe('connection-management -- list rows and search', () => {
    function search(c: HTMLElement, q: string): void {
        const input = el<HTMLInputElement>(c, '#conn-mgmt-search');
        input.value = q;
        input.dispatchEvent(new Event('input'));
    }
    const brokers = (c: HTMLElement) =>
        [...el(c, '#conn-mgmt-rows').querySelectorAll('tr')].map(tr => tr.cells[0].textContent);

    it("each row's actions are icon buttons named for the connection", async () => {
        const { container } = await setup();
        const row = el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0];
        expect(row.querySelector('.conn-mgmt-edit')!.getAttribute('aria-label')).toBe('Edit connection "b1"');
        expect(row.querySelector('.conn-mgmt-delete')!.getAttribute('aria-label')).toBe('Delete connection "b1"');
    });

    it('narrows by broker or hostname as you type, with * spanning any run', async () => {
        const { container } = await setup();
        search(container, 'B2');
        expect(brokers(container)).toEqual(['b2']);
        search(container, 'HOST1');
        expect(brokers(container)).toEqual(['b1']);
        search(container, 'h*2');
        expect(brokers(container)).toEqual(['b2']);
        search(container, '');
        expect(brokers(container)).toEqual(['b1', 'b2']);
    });

    it('says when no connection matches, writing the query as text', async () => {
        const { container } = await setup();
        search(container, '<b>x</b>');
        expect(el(container, '#conn-mgmt-rows').textContent).toBe('No connections match "<b>x</b>".');
        expect(el(container, '#conn-mgmt-rows').querySelector('b')).toBeNull();
    });
});

describe('connection-management — create / edit form', () => {
    it('Add opens the form in create mode', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(false);
        expect(el<HTMLInputElement>(container, '#conn-mgmt-broker').disabled).toBe(false);
    });

    it('rejects a save with no broker name', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toMatch(/broker/i));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();
    });

    it('creates a connection: sends the SEMP + VPN passwords as typed (TLS to the gateway)', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue({ ok: true });
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b9';
        el<HTMLInputElement>(container, '#conn-mgmt-hostname').value = 'h9';
        el<HTMLInputElement>(container, '#conn-mgmt-semp-port').value = '1943';
        el<HTMLInputElement>(container, '#conn-mgmt-semp-user').value = 'mon';
        el<HTMLInputElement>(container, '#conn-mgmt-semp-pass').value = 'secret';
        el<HTMLInputElement>(container, '#conn-mgmt-client-port').value = '1443';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[0].value = 'v1'; vpnInputs[1].value = 'u1'; vpnInputs[2].value = 'vpnpw';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();

        // The toast fires after the saveConnection await — wait for it, then the
        // call (with its captured args) has necessarily already happened.
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('Connection saved', 'ok'));
        expect(svcMock.saveConnection).toHaveBeenCalledWith({
            broker: 'b9', hostname: 'h9',
            semp: { port: '1943', user: 'mon', pass: 'secret' },
            client: { port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: 'vpnpw' }] },
        });
    });

    it('keeps blank SEMP + VPN passwords blank on edit, so the gateway keeps the stored ones', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue({ ok: true });
        // Edit b1 (first row) — passwords arrive blank from the list.
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        expect(el<HTMLInputElement>(container, '#conn-mgmt-broker').disabled).toBe(true);
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        const sent = svcMock.saveConnection.mock.calls[0][0];
        expect(sent.semp.pass).toBe('');
        expect(sent.client.msgVpns[0].pass).toBe('');
        expect(sent.client.msgVpns[0].name).toBe('v1');
    });

    it("shows the gateway's reason when the save is rejected", async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue({
            ok: false, status: 422, code: 'invalid', field: 'connection', reason: 'broker "bX": semp.port "x" is not a port (1 to 65535)',
        });
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'bX';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('broker "bX": semp.port "x" is not a port (1 to 65535)'));
    });

    it('Edit pre-fills the form and blanks the password fields', async () => {
        const { container } = await setup();
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        expect(el<HTMLInputElement>(container, '#conn-mgmt-hostname').value).toBe('host1');
        expect(el<HTMLInputElement>(container, '#conn-mgmt-semp-user').value).toBe('mon');
        expect(el<HTMLInputElement>(container, '#conn-mgmt-semp-pass').value).toBe('');
        expect(el(container, '#conn-mgmt-semp-pass-hint').textContent).toMatch(/keep/i);
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        expect(vpnInputs[0].value).toBe('v1');
    });

    it('edit tolerates a connection with no msgVpns array (?? [] fallback)', async () => {
        const container = loadModuleDOM('connection-management');
        const ctx = makeCtx(container, ADMIN);
        // msgVpns omitted → undefined at runtime
        svcMock.listConnections.mockResolvedValue({ ok: true, data: [
            { broker: 'b3', hostname: 'h3', semp: { port: '', user: '', pass: '' }, client: { port: '' } },
        ] });
        await ConnectionManagementModule.install(ctx);
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').children.length).toBeGreaterThan(0));
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(false);
        expect(el(container, '#conn-mgmt-vpn-rows').querySelectorAll('.row-list-row').length).toBe(0);
    });

    it('says what an empty VPN list means, and names the columns once a VPN is added', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        const vpns = el(container, '#conn-mgmt-vpn-rows');
        expect(vpns.querySelector('.row-list-empty')!.textContent).toBe(NO_VPNS);
        expect(vpns.querySelector('.row-list-head')!.classList.contains('hidden')).toBe(true);

        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        expect(vpns.querySelector('.row-list-empty')!.classList.contains('hidden')).toBe(true);
        expect(Array.from(vpns.querySelectorAll('.row-list-label'), n => n.textContent))
            .toEqual(['Message VPN', 'Client username', 'Client password']);
    });

    it('Cancel returns to the list', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel').click();
        expect(hidden(container, '#conn-mgmt-list-view')).toBe(false);
    });

    it('Add refuses a broker that already exists', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b1';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('Connection "b1" already exists. Use Edit to change it.'));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();
    });

    it('a renamed VPN needs its password: a blank one has nothing stored to keep', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue({ ok: true });
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[0].value = 'v1-prod';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('VPN "v1-prod" has no stored password to keep. Enter its password.'));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();

        vpnInputs[2].value = 'vpnpw';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([{ name: 'v1-prod', user: 'u1', pass: 'vpnpw' }]);
    });

    it('a VPN on a new connection needs a password; one without a name is left to the gateway', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue({ ok: false, status: 422, code: 'invalid', field: 'connection', reason: 'broker "b9": a message VPN has no name' });
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b9';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[0].value = 'v1'; vpnInputs[1].value = 'u1';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('VPN "v1" has no stored password to keep. Enter its password.'));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();

        vpnInputs[0].value = '';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('broker "b9": a message VPN has no name'));
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([{ name: '', user: 'u1', pass: '' }]);
    });

    it('Add VPN row button appends a row', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        expect(el(container, '#conn-mgmt-vpn-rows').querySelectorAll('.row-list-row').length).toBe(1);
    });

});

describe('connection-management — delete', () => {
    it('deletes after confirmation', async () => {
        const { container } = await setup();
        svcMock.deleteConnection.mockResolvedValue({ ok: true });
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-delete')!.click();
        expect(await answerConfirm(true)).toBe('Delete connection "b1"?');
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('Connection deleted', 'ok'));
        expect(svcMock.deleteConnection).toHaveBeenCalledWith('b1');
    });

    it('does nothing when cancelled', async () => {
        const { container } = await setup();
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-delete')!.click();
        await answerConfirm(false);
        expect(svcMock.deleteConnection).not.toHaveBeenCalled();
    });

    it("toasts the gateway's reason when the delete is rejected", async () => {
        const { container } = await setup();
        svcMock.deleteConnection.mockResolvedValue({ ok: false, status: 500, code: 'server_error' });
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-delete')!.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(toastMock.showToast)
            .toHaveBeenCalledWith('The gateway could not complete the request. Its log has the cause.', 'error'));
    });
});
