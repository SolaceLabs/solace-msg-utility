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
    { rev: 4, broker: 'b1', hostname: 'host1', semp: { port: '1943', user: 'mon', pass: '' }, client: { port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: '' }] } },
    { rev: 6, broker: 'b2', hostname: 'host2', semp: { port: '1943', user: 'mon', pass: '' }, client: { port: '1443', msgVpns: [] } },
];
/** The gateway's 200 answer to a save: the record's new rev. */
const saved = (rev = 7) => ({ ok: true, data: { rev } });
const failed = (status: number, code: string, extra: object = {}) => ({ ok: false, status, code, ...extra });

function el<T extends HTMLElement>(c: HTMLElement, sel: string): T {
    return c.querySelector(sel) as T;
}
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');
/** One part of a scheme button: `semp` (https, http) or `client` (wss, ws). */
const schemePart = (c: HTMLElement, card: 'semp' | 'client', scheme: string) =>
    el<HTMLButtonElement>(c, `#conn-mgmt-${card}-scheme button[data-scheme="${scheme}"]`);
/** The pressed parts of the two scheme buttons: SEMP's, then the Client's. */
const schemes = (c: HTMLElement) => (['semp', 'client'] as const).map(card =>
    [...el(c, `#conn-mgmt-${card}-scheme`).querySelectorAll<HTMLElement>('button[aria-pressed="true"]')].map(b => b.dataset.scheme));

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
    const container = loadModuleDOM('connection-management');
    const ctx = makeCtx(container, managed);
    svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: CONNS } });
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
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [] } });
        await ConnectionManagementModule.install(makeCtx(container, ADMIN));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').textContent).toMatch(/no connections/i));
    });

    it('fetches the list once at start with an admin restored', async () => {
        await setup();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(svcMock.listConnections).toHaveBeenCalledTimes(1);
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
        svcMock.saveConnection.mockResolvedValue(saved());
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
            rev: 0,
            broker: 'b9', hostname: 'h9',
            semp: { scheme: 'https', port: '1943', user: 'mon', pass: 'secret' },
            client: { scheme: 'wss', port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: 'vpnpw' }] },
        });
    });

    it('sends the plain schemes when the operator picks http and ws', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b8';
        schemePart(container, 'semp', 'http').click();
        schemePart(container, 'client', 'ws').click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        const sent = svcMock.saveConnection.mock.calls[0][0];
        expect([sent.semp.scheme, sent.client.scheme]).toEqual(['http', 'ws']);
    });

    it('loads the stored schemes on Edit; a blank or missing scheme shows TLS', async () => {
        const container = loadModuleDOM('connection-management');
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [
            { broker: 'p1', hostname: 'h', semp: { scheme: 'http', port: '8080', user: 'u', pass: '' }, client: { scheme: 'ws', port: '8008', msgVpns: [] } },
            { broker: 'p2', hostname: 'h', semp: { scheme: 'https', port: '1943', user: 'u', pass: '' }, client: { scheme: 'wss', port: '1443', msgVpns: [] } },
            { broker: 'p3', hostname: 'h', semp: { port: '1943', user: 'u', pass: '' }, client: { port: '1443', msgVpns: [] } },
        ] } });
        await ConnectionManagementModule.install(makeCtx(container, ADMIN));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').children.length).toBe(3));
        const edit = (i: number) => el(container, '#conn-mgmt-rows').querySelectorAll('tr')[i]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        edit(0);
        expect(schemes(container)).toEqual([['http'], ['ws']]);
        edit(1);
        expect(schemes(container)).toEqual([['https'], ['wss']]);
        edit(2);
        expect(schemes(container)).toEqual([['https'], ['wss']]);
    });

    it('Add starts on the TLS schemes even after editing a plain connection', async () => {
        const container = loadModuleDOM('connection-management');
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [
            { broker: 'p1', hostname: 'h', semp: { scheme: 'http', port: '8080', user: 'u', pass: '' }, client: { scheme: 'ws', port: '8008', msgVpns: [] } },
        ] } });
        await ConnectionManagementModule.install(makeCtx(container, ADMIN));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').children.length).toBe(1));
        el(container, '#conn-mgmt-rows').querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        expect(schemes(container)).toEqual([['https'], ['wss']]);
    });

    it('shows the gateway 422 for a refused scheme through the form error', async () => {
        const { container } = await setup();
        const reason = 'broker "bX": semp.scheme "ftp" must be "https" or "http"';
        svcMock.saveConnection.mockResolvedValue({ ok: false, status: 422, code: 'invalid', field: 'connection', reason });
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'bX';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe(reason));
    });

    it('keeps blank SEMP + VPN passwords blank on edit, so the gateway keeps the stored ones', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
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

    it('Cancel returns to the list and forgets the typed SEMP and VPN passwords', async () => {
        const { container } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-semp-pass').value = 'semp-typed';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[vpnInputs.length - 1].value = 'vpn-typed';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel').click();
        expect(hidden(container, '#conn-mgmt-list-view')).toBe(false);
        expect(el<HTMLInputElement>(container, '#conn-mgmt-semp-pass').value).toBe('');
        expect(el(container, '#conn-mgmt-vpn-rows').querySelectorAll('.row-list-row').length).toBe(0);
    });

    it('a sign-out in the middle of an edit leaves no typed password in the hidden form', async () => {
        const { container, ctx } = await setup();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-semp-pass').value = 'semp-typed';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        ctx.setState('managed', null);
        ctx.eventBus.emit('rbac:changed');
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(true);
        expect(el<HTMLInputElement>(container, '#conn-mgmt-semp-pass').value).toBe('');
        expect(el(container, '#conn-mgmt-vpn-rows').querySelectorAll('.row-list-row').length).toBe(0);
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
        svcMock.saveConnection.mockResolvedValue(saved());
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[0].value = 'v1-prod';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('VPN "v1-prod" has no stored password to keep. Enter its password, or save the removal of the other VPN first to add this one with none.'));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();

        vpnInputs[2].value = 'vpnpw';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([{ name: 'v1-prod', user: 'u1', pass: 'vpnpw' }]);
    });

    it('a VPN on a new connection saves with an empty password when none is typed', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b9';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[0].value = 'v1'; vpnInputs[1].value = 'u1';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([{ name: 'v1', user: 'u1', pass: '' }]);
    });

    it('a VPN added while editing saves with an empty password while every stored VPN keeps its name', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0]
            .querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[3].value = 'v9'; vpnInputs[4].value = 'u9';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([
            { name: 'v1', user: 'u1', pass: '' },
            { name: 'v9', user: 'u9', pass: '' },
        ]);
    });

    it('a VPN without a name is left to the gateway', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue({ ok: false, status: 422, code: 'invalid', field: 'connection', reason: 'broker "b9": a message VPN has no name' });
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b9';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[1].value = 'u1';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('broker "b9": a message VPN has no name'));
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([{ name: '', user: 'u1', pass: '' }]);
    });

    it('refuses a SEMP or client username a broker refuses, before anything is sent', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b9';
        el<HTMLInputElement>(container, '#conn-mgmt-semp-user').value = 'ops.admin';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn').click();
        const vpnInputs = el(container, '#conn-mgmt-vpn-rows').querySelectorAll<HTMLInputElement>('input');
        vpnInputs[0].value = 'v1'; vpnInputs[1].value = 'app*'; vpnInputs[2].value = 'vpnpw';
        const formError = () => el(container, '#conn-mgmt-form-error').textContent;

        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(formError()).toBe('SEMP username may be up to 32 characters: letters, digits, - and _.'));
        el<HTMLInputElement>(container, '#conn-mgmt-semp-user').value = 'ops-admin_2';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(formError()).toBe('VPN "v1": Client username must not contain ? or *.'));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();

        vpnInputs[1].value = 'app user';
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').click();
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        expect(svcMock.saveConnection.mock.calls[0][0].semp.user).toBe('ops-admin_2');
        expect(svcMock.saveConnection.mock.calls[0][0].client.msgVpns).toEqual([{ name: 'v1', user: 'app user', pass: 'vpnpw' }]);
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
        expect(svcMock.deleteConnection).toHaveBeenCalledWith('b1', 4);
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

// The rev each row came with goes back with a save or a delete; when someone
// else moved the record first, the admin is told and the list is reloaded.
describe('connection-management -- versions', () => {
    const editB1 = (c: HTMLElement) => el(c, '#conn-mgmt-rows').querySelectorAll('tr')[0].querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();
    const delB1 = (c: HTMLElement) => el(c, '#conn-mgmt-rows').querySelectorAll('tr')[0].querySelector<HTMLButtonElement>('.conn-mgmt-delete')!.click();
    const save = (c: HTMLElement) => el<HTMLButtonElement>(c, '#btn-conn-mgmt-save').click();

    it('a save of an opened connection sends the rev the list gave it', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        editB1(container);
        save(container);
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalledTimes(1));
        expect(svcMock.saveConnection.mock.calls[0][0]).toMatchObject({ broker: 'b1', rev: 4 });
    });

    it('a refused save leaves the form open on the same rev: the retry sends it again', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValueOnce(failed(422, 'invalid', { reason: 'bad port' })).mockResolvedValue(saved());
        editB1(container);
        save(container);
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('bad port'));
        save(container);
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalledTimes(2));
        expect(svcMock.saveConnection.mock.calls.map(c => c[0].rev)).toEqual([4, 4]);
    });

    it('stale save: the dialog says so; Reload reloads the list (new revs) and closes the form', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(failed(409, 'stale', { rev: 9 }));
        // Someone moved b1 to host-new, rev 9.
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [{ ...CONNS[0], hostname: 'host-new', rev: 9 }, CONNS[1]] } });
        editB1(container);
        save(container);
        expect(await answerConfirm(true)).toBe('This connection was changed by someone else since you opened it.');
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').querySelectorAll('tr')[0].textContent).toContain('host-new'));
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(true);
        expect(hidden(container, '#conn-mgmt-list-view')).toBe(false);
        expect(toastMock.showToast).not.toHaveBeenCalledWith('Connection saved', 'ok');

        svcMock.saveConnection.mockResolvedValue(saved());
        editB1(container);
        save(container);
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalledTimes(2));
        expect(svcMock.saveConnection.mock.calls[1][0].rev).toBe(9);
    });

    it("stale save: Cancel keeps the form and the admin's edits, and reloads nothing", async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(failed(409, 'stale', { rev: 9 }));
        editB1(container);
        el<HTMLInputElement>(container, '#conn-mgmt-hostname').value = 'typed-host';
        save(container);
        await answerConfirm(false);
        await vi.waitFor(() => expect(el<HTMLButtonElement>(container, '#btn-conn-mgmt-save').disabled).toBe(false));
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(false);
        expect(el<HTMLInputElement>(container, '#conn-mgmt-hostname').value).toBe('typed-host');
        expect(svcMock.listConnections).toHaveBeenCalledTimes(1);
    });

    it('save of a connection deleted meanwhile: says so and shows the reloaded list', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(failed(404, 'not_found'));
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [CONNS[1]] } });
        editB1(container);
        save(container);
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('This connection was deleted by someone else.', 'error'));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').querySelectorAll('tr').length).toBe(1));
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(true);
    });

    it('Add of a broker that someone else created meanwhile: the existing already-exists message, form stays', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(failed(409, 'exists'));
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(container, '#conn-mgmt-broker').value = 'b9';
        save(container);
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent).toBe('Connection "b9" already exists. Use Edit to change it.'));
        expect(hidden(container, '#conn-mgmt-form-view')).toBe(false);
    });

    it('stale delete: the dialog offers Reload, which reloads the list', async () => {
        const { container } = await setup();
        svcMock.deleteConnection.mockResolvedValue(failed(409, 'stale', { rev: 8 }));
        delB1(container);
        await answerConfirm(true);
        await vi.waitFor(() => expect(svcMock.deleteConnection).toHaveBeenCalledTimes(1));
        expect(await answerConfirm(true)).toBe('This connection was changed by someone else since you opened it.');
        await vi.waitFor(() => expect(svcMock.listConnections).toHaveBeenCalledTimes(2));
        expect(svcMock.deleteConnection).toHaveBeenCalledWith('b1', 4);
    });

    it('delete of a connection already deleted: says so and shows the reloaded list', async () => {
        const { container } = await setup();
        svcMock.deleteConnection.mockResolvedValue(failed(404, 'not_found'));
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [CONNS[1]] } });
        delB1(container);
        await answerConfirm(true);
        await vi.waitFor(() => expect(toastMock.showToast).toHaveBeenCalledWith('This connection was deleted by someone else.', 'error'));
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').querySelectorAll('tr').length).toBe(1));
    });
});

// A software or cloud broker has one hostname. An appliance answers SEMP on
// its management hostname and messaging on another (client.hostname);
// tests/core/connections/broker-hosts.test.ts covers the type control itself.
describe('connection-management -- an appliance\'s two hostnames', () => {
    const APPLIANCE = {
        rev: 3, broker: 'ap1', hostname: 'mgmt1',
        semp: { port: '443', user: 'mon', pass: '' },
        client: { hostname: 'msg1', port: '443', msgVpns: [] },
    };
    const typeButton = (c: HTMLElement, type: 'software' | 'appliance') =>
        el<HTMLButtonElement>(c, `#conn-mgmt-broker-type [data-broker-type="${type}"]`);
    const hostnames = (c: HTMLElement) => [
        typeButton(c, 'appliance').getAttribute('aria-pressed'),
        el(c, '#lbl-conn-mgmt-hostname').textContent,
        el<HTMLInputElement>(c, '#conn-mgmt-hostname').value,
        el<HTMLInputElement>(c, '#conn-mgmt-client-hostname').value,
        el<HTMLInputElement>(c, '#conn-mgmt-client-hostname').disabled,
    ];
    const editRow = (c: HTMLElement, n: number) =>
        el(c, '#conn-mgmt-rows').querySelectorAll('tr')[n].querySelector<HTMLButtonElement>('.conn-mgmt-edit')!.click();

    async function setupWithAppliance() {
        const { container } = await setup();
        svcMock.listConnections.mockResolvedValue({ ok: true, data: { connections: [CONNS[0], APPLIANCE] } });
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-refresh').click();
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-rows').textContent).toContain('ap1'));
        return container;
    }

    /** Type the fields of a new connection `broker`, as an appliance, and press Save. */
    function saveAppliance(c: HTMLElement, broker: string, hostname: string, clientHostname: string): void {
        el<HTMLButtonElement>(c, '#btn-conn-mgmt-add').click();
        el<HTMLInputElement>(c, '#conn-mgmt-broker').value = broker;
        typeButton(c, 'appliance').click();
        el<HTMLInputElement>(c, '#conn-mgmt-hostname').value = hostname;
        el<HTMLInputElement>(c, '#conn-mgmt-client-hostname').value = clientHostname;
        el<HTMLButtonElement>(c, '#btn-conn-mgmt-save').click();
    }

    it('lists an appliance with its messaging hostname, and finds it by either', async () => {
        const container = await setupWithAppliance();
        const rows = el(container, '#conn-mgmt-rows').querySelectorAll('tr');
        expect(rows[0].children[1].textContent).toBe('host1');
        expect(rows[1].children[1].textContent).toBe('mgmt1 (messaging: msg1)');

        const search = el<HTMLInputElement>(container, '#conn-mgmt-search');
        const found = (q: string) => {
            search.value = q;
            search.dispatchEvent(new Event('input'));
            return Array.from(el(container, '#conn-mgmt-rows').querySelectorAll('tr'), r => r.children[0].textContent);
        };
        expect(found('msg1')).toEqual(['ap1']);
        expect(found('mgmt1')).toEqual(['ap1']);
    });

    it('opens an appliance as one, a connection with one hostname as Software / Cloud, and a new one as Software / Cloud', async () => {
        const container = await setupWithAppliance();
        editRow(container, 1);
        expect(hostnames(container)).toEqual(['true', 'Management hostname', 'mgmt1', 'msg1', false]);

        el<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel').click();
        editRow(container, 0);
        expect(hostnames(container)).toEqual(['false', 'Hostname', 'host1', 'host1', true]);

        el<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel').click();
        editRow(container, 1);
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel').click();
        el<HTMLButtonElement>(container, '#btn-conn-mgmt-add').click();
        expect(hostnames(container)).toEqual(['false', 'Hostname', '', '', true]);
    });

    it('saves an appliance\'s messaging hostname with the client part, trimmed', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        saveAppliance(container, 'ap2', ' mgmt2 ', ' msg2 ');
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        const sent = svcMock.saveConnection.mock.calls[0][0];
        expect([sent.hostname, sent.client.hostname]).toEqual(['mgmt2', 'msg2']);
    });

    it('sends one hostname for an appliance whose two are the same host', async () => {
        const { container } = await setup();
        svcMock.saveConnection.mockResolvedValue(saved());
        saveAppliance(container, 'ap3', 'same', 'same');
        await vi.waitFor(() => expect(svcMock.saveConnection).toHaveBeenCalled());
        const sent = svcMock.saveConnection.mock.calls[0][0];
        expect(sent.hostname).toBe('same');
        expect('hostname' in sent.client).toBe(false);
    });

    it('refuses an appliance without a messaging hostname, and sends nothing', async () => {
        const { container } = await setup();
        saveAppliance(container, 'ap4', 'mgmt4', '  ');
        await vi.waitFor(() => expect(el(container, '#conn-mgmt-form-error').textContent)
            .toBe('Messaging hostname is required for an appliance. Choose Software / Cloud for a broker with one hostname.'));
        expect(svcMock.saveConnection).not.toHaveBeenCalled();
    });
});
