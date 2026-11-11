import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';

const svcMock = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), client: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/modules/gateway-settings/service', () => ({
    createSettingsService: () => ({ load: svcMock.load, save: svcMock.save, client: svcMock.client }),
}));

import { GatewaySettingsModule } from '../../../src/modules/gateway-settings/module';
import { completeContext } from '../../helpers/appContext';

const ADMIN: ManagedSession = {
    admin: true, username: 'admin', broker: '', vpns: [], operate: [], readOnly: [], modules: [],
};
const SETTINGS = {
    hosted: true, connModes: 'both', defaultConn: 'direct',
    tls: { certFile: '/tls/tls.crt', keyFile: '/tls/tls.key', trustDir: '/tls/trust', insecureSkipVerify: false },
    logLevel: 'warn', usersFile: '/data/users.yaml', connectionsFile: '/data/connections.yaml',
    access: { allow: ['10.0.0.0/8', '192.0.2.0/24'], trustedProxies: [] },
    session: { idleMinutes: 10, absoluteMinutes: 30 },
    login: { maxFailures: 5, backoffSeconds: 30, maxBackoffSeconds: 900, unauthenticatedPerMinute: 60 },
    modules: { offered: ['queue-browser'], userDefault: 'all' },
};
const RESTART_ONLY = ['hosted', 'tls.certFile', 'tls.keyFile', 'tls.trustDir', 'tls.insecureSkipVerify', 'usersFile', 'connectionsFile'];
const HOST_ONLY = ['tls.certFile', 'tls.keyFile', 'tls.trustDir', 'usersFile', 'connectionsFile'];
const view = (over: Record<string, unknown> = {}) => ({
    ok: true,
    data: { settings: SETTINGS, restartOnly: RESTART_ONLY, hostOnly: HOST_ONLY, pendingRestart: [], changedOnDisk: false, catalog: ['queue-browser', 'queue-copy'], ...over },
});

function el<T extends HTMLElement>(c: HTMLElement, sel: string): T {
    return c.querySelector(sel) as T;
}
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');
const value = (c: HTMLElement, id: string) => el<HTMLInputElement>(c, `#gw-set-${id}`).value;
const offeredBoxes = (c: HTMLElement) => [...el(c, '#gw-set-modules-offered').querySelectorAll<HTMLInputElement>('input')];
const errorText = (c: HTMLElement) => el(c, '#gw-set-error').textContent;

function makeCtx(container: HTMLElement, managed: ManagedSession | null): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false, managed,
    };
    return completeContext({
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(), config: {},
    });
}

async function setup(managed: ManagedSession | null = ADMIN, loaded: unknown = view()) {
    const container = loadModuleDOM('gateway-settings');
    const ctx = makeCtx(container, managed);
    svcMock.load.mockResolvedValue(loaded);
    await GatewaySettingsModule.install(ctx);
    await new Promise(resolve => setTimeout(resolve, 0)); // let the first load render
    return { container, ctx };
}

function clickSave(c: HTMLElement): void {
    el<HTMLButtonElement>(c, '#btn-gw-set-save').click();
}

beforeEach(() => {
    svcMock.load.mockReset();
    svcMock.save.mockReset();
    svcMock.client.mockReset();
    svcMock.client.mockResolvedValue({ ok: true, data: { address: '192.0.2.10', peer: '192.0.2.10', viaProxy: false } });
    toastMock.showToast.mockReset();
});

describe('gateway-settings — load', () => {
    it("shows the gateway's file for an admin", async () => {
        const { container } = await setup();
        expect(hidden(container, '#gw-set-gate')).toBe(true);
        expect(hidden(container, '#gw-set-view')).toBe(false);
        expect(value(container, 'connModes')).toBe('both');
        expect(value(container, 'access-allow')).toBe('10.0.0.0/8\n192.0.2.0/24');
        expect(value(container, 'session-idleMinutes')).toBe('10');
        expect(value(container, 'tls-certFile')).toBe('/tls/tls.crt');
        expect(el<HTMLInputElement>(container, '#gw-set-tls-insecureSkipVerify').checked).toBe(false);
        expect(el(container, '#gw-set-modules-offered').textContent).toBe(' Queue Browser Queue Copy');
        expect(offeredBoxes(container).map(b => b.checked)).toEqual([true, false]);
        expect(hidden(container, '#gw-set-pending')).toBe(true);
        expect(hidden(container, '#gw-set-disk')).toBe(true);
        expect(el<HTMLButtonElement>(container, '#btn-gw-set-save').disabled).toBe(false);
    });

    it('says the address is the TCP peer, and what to do if it is the proxy', async () => {
        const { container } = await setup();
        const line = el(container, '#gw-set-client').textContent as string;
        expect(line).toContain('Your address as the gateway sees it: 192.0.2.10 (the TCP peer).');
        expect(line).toContain('list it under Trusted reverse proxies and have it pass X-Forwarded-For');
    });

    it('says the address came from X-Forwarded-For through a trusted proxy', async () => {
        svcMock.client.mockResolvedValue({ ok: true, data: { address: '203.0.113.9', peer: '172.18.0.1', viaProxy: true } });
        const { container } = await setup();
        expect(el(container, '#gw-set-client').textContent)
            .toBe('Your address as the gateway sees it: 203.0.113.9 (from X-Forwarded-For, sent by the trusted proxy 172.18.0.1).');
    });

    it('says unknown when the gateway could not resolve the address', async () => {
        svcMock.client.mockResolvedValue({ ok: true, data: { address: '', peer: '172.18.0.1', viaProxy: false } });
        const { container } = await setup();
        expect(el(container, '#gw-set-client').textContent)
            .toBe('Your address as the gateway sees it: unknown. The connection comes from 172.18.0.1 and its X-Forwarded-For header could not be read.');
    });

    it('says unavailable when the address cannot be fetched, and still shows the settings', async () => {
        svcMock.client.mockResolvedValue({ ok: false, status: 500, code: 'x' });
        const { container } = await setup();
        expect(el(container, '#gw-set-client').textContent).toBe('Your address as the gateway sees it: unavailable.');
        expect(value(container, 'connModes')).toBe('both');
    });

    it('tags the restart-only keys, and shows the path keys read-only for a hand edit', async () => {
        const { container } = await setup();
        const tagged = (cls: string) => [...container.querySelectorAll<HTMLElement>(`.${cls}`)].map(g => g.dataset.key);
        expect(tagged('gw-set-restart')).toEqual(['tls.insecureSkipVerify']);
        expect(tagged('gw-set-host')).toEqual(['usersFile', 'connectionsFile', 'tls.certFile', 'tls.keyFile', 'tls.trustDir']);
        const disabled = [...container.querySelectorAll<HTMLInputElement>('#gw-set-view .form-control:disabled')].map(i => i.id);
        expect(disabled).toEqual(['gw-set-usersFile', 'gw-set-connectionsFile', 'gw-set-tls-certFile', 'gw-set-tls-keyFile', 'gw-set-tls-trustDir']);
        // Every key the gateway may name has a field to tag, except hosted: it
        // must stay true while Provisioned mode serves this page, so the page
        // offers neither it nor connModes "direct".
        const keys = [...container.querySelectorAll<HTMLElement>('[data-key]')].map(g => g.dataset.key);
        expect(keys).toEqual(expect.arrayContaining(RESTART_ONLY.filter(k => k !== 'hosted')));
        expect(keys).not.toContain('hosted');
        expect([...container.querySelectorAll<HTMLOptionElement>('#gw-set-connModes option')].map(o => o.value)).toEqual(['provisioned', 'both']);
    });

    it('lists the keys saved but not yet running', async () => {
        const { container } = await setup(ADMIN, view({ pendingRestart: ['usersFile', 'tls.certFile'] }));
        expect(hidden(container, '#gw-set-pending')).toBe(false);
        expect(el(container, '#gw-set-pending').textContent).toBe('Saved, applies when the gateway restarts: usersFile, tls.certFile.');
    });

    it('a hand edit on disk shows the banner and disables Save', async () => {
        const { container } = await setup(ADMIN, view({ changedOnDisk: true }));
        expect(hidden(container, '#gw-set-disk')).toBe(false);
        expect(el<HTMLButtonElement>(container, '#btn-gw-set-save').disabled).toBe(true);
    });

    // One install per test: the template's ids are document-wide, so a second
    // container in the same document would resolve to the first one's elements.
    it.each([
        ['no session', null],
        ['a non-admin session', { ...ADMIN, admin: false }],
    ])('gates (no fetch) with %s', async (_, managed) => {
        const { container } = await setup(managed);
        expect(hidden(container, '#gw-set-gate')).toBe(false);
        expect(hidden(container, '#gw-set-view')).toBe(true);
        expect(svcMock.load).not.toHaveBeenCalled();
    });

    it('loads once an admin signs in (rbac:changed), and Reload fetches again', async () => {
        const { container, ctx } = await setup(null);
        ctx.setState('managed', ADMIN);
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(value(container, 'connModes')).toBe('both'));
        expect(hidden(container, '#gw-set-gate')).toBe(true);
        el<HTMLButtonElement>(container, '#btn-gw-set-reload').click();
        expect(svcMock.load).toHaveBeenCalledTimes(2);
    });

    it("shows the gateway's reason when the load fails; Save then sends nothing", async () => {
        const { container } = await setup(ADMIN, { ok: false, status: 0, code: 'network' });
        await vi.waitFor(() => expect(errorText(container)).toBe('The gateway could not be reached.'));
        clickSave(container);
        await Promise.resolve();
        expect(svcMock.save).not.toHaveBeenCalled();
    });

    it('a 401 asks the session owner to sign out', async () => {
        const container = loadModuleDOM('gateway-settings');
        const ctx = makeCtx(container, ADMIN);
        const signOut = vi.fn();
        ctx.eventBus.on('rbac:sign-out-requested', signOut);
        svcMock.load.mockResolvedValue({ ok: false, status: 401, code: 'unauthenticated' });
        await GatewaySettingsModule.install(ctx);
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        expect(toastMock.showToast).toHaveBeenCalledWith('Your session has ended. Sign in again.', 'error', 5000);
    });
});

describe('gateway-settings — save', () => {
    it("sends the whole file with the form's values, then reloads", async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: true, data: { restartRequired: ['tls.insecureSkipVerify'] } });
        el<HTMLInputElement>(container, '#gw-set-session-idleMinutes').value = '5';
        el<HTMLTextAreaElement>(container, '#gw-set-access-allow').value = ' 10.0.0.0/8 \n\n192.0.2.7/32\n';
        el<HTMLSelectElement>(container, '#gw-set-logLevel').value = 'debug';
        el<HTMLInputElement>(container, '#gw-set-tls-insecureSkipVerify').checked = true;
        offeredBoxes(container)[1].checked = true;
        svcMock.load.mockResolvedValue(view({ pendingRestart: ['tls.insecureSkipVerify'] }));
        clickSave(container);

        await vi.waitFor(() => expect(hidden(container, '#gw-set-pending')).toBe(false));
        expect(svcMock.save).toHaveBeenCalledWith({
            ...SETTINGS,
            logLevel: 'debug',
            tls: { ...SETTINGS.tls, insecureSkipVerify: true },
            access: { allow: ['10.0.0.0/8', '192.0.2.7/32'], trustedProxies: [] },
            session: { idleMinutes: 5, absoluteMinutes: 30 },
            modules: { offered: ['queue-browser', 'queue-copy'], userDefault: 'all' },
        });
        expect(toastMock.showToast).toHaveBeenCalledWith('Settings saved', 'ok');
        expect(svcMock.load).toHaveBeenCalledTimes(2);
        // The form came back from the gateway, not from what was typed.
        expect(value(container, 'session-idleMinutes')).toBe('10');
        // The copy sent was a copy: the loaded settings are untouched.
        expect(SETTINGS.session.idleMinutes).toBe(10);
    });

    it.each([
        ['empty', ''],
        ['a fraction', '1.5'],
    ])('refuses %s in a number field before sending', async (_, typed) => {
        const { container } = await setup();
        el<HTMLInputElement>(container, '#gw-set-login-maxFailures').value = typed;
        clickSave(container);
        expect(errorText(container)).toBe('login.maxFailures must be a whole number.');
        expect(svcMock.save).not.toHaveBeenCalled();
    });

    it("shows the gateway's lock-out reason and leaves Save usable", async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({
            ok: false, status: 409, code: 'would_lock_out', field: 'access.allow',
            reason: 'This allow list would deny your own address (192.0.2.1). Add it, or a range that contains it.',
        });
        clickSave(container);
        await vi.waitFor(() => expect(errorText(container)).toBe('This allow list would deny your own address (192.0.2.1). Add it, or a range that contains it.'));
        expect(el<HTMLButtonElement>(container, '#btn-gw-set-save').disabled).toBe(false);
        expect(toastMock.showToast).not.toHaveBeenCalled();
    });

    it('a refusal over a hand edit shows the banner and disables Save', async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: false, status: 409, code: 'config_changed_on_disk' });
        clickSave(container);
        await vi.waitFor(() => expect(hidden(container, '#gw-set-disk')).toBe(false));
        expect(el<HTMLButtonElement>(container, '#btn-gw-set-save').disabled).toBe(true);
        expect(errorText(container)).toMatch(/^config\.yaml was edited on the gateway host/);
    });
});
