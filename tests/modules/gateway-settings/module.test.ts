import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';

const svcMock = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), client: vi.fn(), restart: vi.fn(), ping: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/modules/gateway-settings/service', () => ({
    createSettingsService: () => ({ load: svcMock.load, save: svcMock.save, client: svcMock.client, restart: svcMock.restart, ping: svcMock.ping }),
}));

import { GatewaySettingsModule, type GatewaySettingsOptions } from '../../../src/modules/gateway-settings/module';
import { completeContext } from '../../helpers/appContext';
import { answerConfirm } from '../../helpers/confirmDialog';

const ADMIN: ManagedSession = {
    admin: true, username: 'admin', broker: '', vpns: [], operate: [], readOnly: [], modules: [],
};
const SETTINGS = {
    hosted: true, connModes: 'both', defaultConn: 'direct',
    tls: { insecureSkipVerify: false, standardRoots: true },
    logLevel: 'warn',
    access: { allow: ['10.0.0.0/8', '192.0.2.0/24'], trustedProxies: [] },
    session: { idleMinutes: 10, absoluteMinutes: 30, connectsPerMinute: 20 },
    login: {
        maxFailures: 5, perClient: true, clientMaxFailures: 10, resetMinutes: 15, backoffSeconds: 30, maxBackoffSeconds: 900,
        unauthenticatedPerMinute: 60, passwordMinLength: 12, twoFactor: 'optional', twoFactorMinutes: 10,
    },
    modules: { offered: ['queue-browser'], userDefault: 'all' },
    audit: { stdout: false, access: false, onFailure: 'continue' },
};
const view = (over: Record<string, unknown> = {}) => ({
    ok: true,
    data: { rev: 'rev-1', settings: SETTINGS, changedOnDisk: false, catalog: ['queue-browser', 'queue-copy'], ...over },
});

function el<T extends HTMLElement>(c: HTMLElement, sel: string): T {
    return c.querySelector(sel) as T;
}
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');
const value = (c: HTMLElement, id: string) => el<HTMLInputElement>(c, `#gw-set-${id}`).value;
const tiles = (c: HTMLElement) => [...el(c, '#gw-set-modules-offered').querySelectorAll<HTMLButtonElement>('button.gw-set-tile')];
const pressed = (c: HTMLElement) => tiles(c).map(t => t.getAttribute('aria-pressed') === 'true');
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
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(),
    });
}

async function setup(managed: ManagedSession | null = ADMIN, loaded: unknown = view(), opts: GatewaySettingsOptions = {}) {
    const container = loadModuleDOM('gateway-settings');
    const ctx = makeCtx(container, managed);
    svcMock.load.mockResolvedValue(loaded);
    await GatewaySettingsModule.install(ctx, opts);
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
    svcMock.restart.mockReset();
    svcMock.ping.mockReset();
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
        expect(el<HTMLInputElement>(container, '#gw-set-tls-insecureSkipVerify').checked).toBe(false);
        expect(pressed(container)).toEqual([true, false]);
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

    it('has no path fields, and offers neither hosted nor connModes "direct"', async () => {
        const { container } = await setup();
        // The TLS paths are environment variables: no field.
        expect(container.querySelector('[id^="gw-set-tls-"]:not(#gw-set-tls-insecureSkipVerify):not(#gw-set-tls-standardRoots)')).toBeNull();
        expect(container.querySelector('.gw-set-host')).toBeNull();
        expect(container.textContent).not.toContain('edit on host');
        // hosted must stay true while Provisioned mode serves this page, so the
        // page offers neither it nor connModes "direct".
        const keys = [...container.querySelectorAll<HTMLElement>('[data-key]')].map(g => g.dataset.key);
        expect(keys).not.toContain('hosted');
        expect([...container.querySelectorAll<HTMLOptionElement>('#gw-set-connModes option')].map(o => o.value)).toEqual(['provisioned', 'both']);
    });

    it('every field is enabled', async () => {
        const { container } = await setup();
        expect(container.querySelectorAll('#gw-set-view .form-control:disabled')).toHaveLength(0);
    });

    it('shows the throttle, password and connect-rate settings from the gateway', async () => {
        const { container } = await setup(ADMIN, view({
            settings: {
                ...SETTINGS,
                session: { ...SETTINGS.session, connectsPerMinute: 7 },
                login: {
                    ...SETTINGS.login, perClient: false, maxFailures: 4, clientMaxFailures: 40, resetMinutes: 90,
                    passwordMinLength: 16, twoFactorMinutes: 3,
                },
            },
        }));
        expect(el<HTMLInputElement>(container, '#gw-set-login-perClient').checked).toBe(false);
        expect(['login-maxFailures', 'login-clientMaxFailures', 'login-resetMinutes', 'login-passwordMinLength',
            'login-twoFactorMinutes', 'session-connectsPerMinute'].map(id => value(container, id)))
            .toEqual(['4', '40', '90', '16', '3', '7']);
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

    it('fetches once at start with an admin restored, and ignores an rbac:changed that leaves the session as it is', async () => {
        const { container, ctx } = await setup();
        expect(svcMock.load).toHaveBeenCalledTimes(1);
        ctx.eventBus.emit('rbac:changed');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(svcMock.load).toHaveBeenCalledTimes(1);
        expect(hidden(container, '#gw-set-view')).toBe(false);
    });

    it('reloads when the admin signs out and in again, or another admin signs in', async () => {
        const { container, ctx } = await setup();
        ctx.setState('managed', null);
        ctx.eventBus.emit('rbac:changed');
        expect(hidden(container, '#gw-set-gate')).toBe(false);
        expect(svcMock.load).toHaveBeenCalledTimes(1);
        ctx.setState('managed', ADMIN);
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(svcMock.load).toHaveBeenCalledTimes(2));
        ctx.setState('managed', { ...ADMIN, username: 'other' });
        ctx.eventBus.emit('rbac:changed');
        await vi.waitFor(() => expect(svcMock.load).toHaveBeenCalledTimes(3));
    });

    it('shows the gate when the signed-in admin is demoted', async () => {
        const { container, ctx } = await setup();
        ctx.setState('managed', { ...ADMIN, admin: false });
        ctx.eventBus.emit('rbac:changed');
        expect(hidden(container, '#gw-set-gate')).toBe(false);
        expect(hidden(container, '#gw-set-view')).toBe(true);
        expect(svcMock.load).toHaveBeenCalledTimes(1);
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

describe('gateway-settings -- audit trail', () => {
    it('shows the two audit checkboxes from the loaded settings, live and editable', async () => {
        const { container } = await setup(ADMIN, view({
            settings: { ...SETTINGS, audit: { stdout: true, access: false, onFailure: 'continue' } },
        }));
        const stdout = el<HTMLInputElement>(container, '#gw-set-audit-stdout');
        const access = el<HTMLInputElement>(container, '#gw-set-audit-access');
        expect([stdout.checked, access.checked]).toEqual([true, false]);
        expect([stdout.disabled, access.disabled]).toEqual([false, false]);
        expect(container.textContent).toContain('/data/audit.log');
    });

    it('shows the audit.onFailure choice from the loaded settings, and sends the changed one', async () => {
        const { container } = await setup(ADMIN, view({
            settings: { ...SETTINGS, audit: { ...SETTINGS.audit, onFailure: 'refuse' } },
        }));
        const select = el<HTMLSelectElement>(container, '#gw-set-audit-onFailure');
        expect(select.value).toBe('refuse');
        expect(select.disabled).toBe(false);
        expect([...select.options].map(o => o.value)).toEqual(['continue', 'refuse']);
        select.value = 'continue';
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalled());
        expect(svcMock.save.mock.calls[0][0].audit.onFailure).toBe('continue');
    });

    it('offers the three two-factor modes by their labels, shows the loaded one, and sends the chosen one', async () => {
        const { container } = await setup(ADMIN, view({
            settings: { ...SETTINGS, login: { ...SETTINGS.login, twoFactor: 'admins' } },
        }));
        const select = el<HTMLSelectElement>(container, '#gw-set-login-twoFactor');
        expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
            ['optional', 'Optional'],
            ['admins', 'Administrators must use it'],
            ['mandatory', 'Everyone must use it'],
        ]);
        expect(select.value).toBe('admins');
        select.value = 'mandatory';
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalled());
        expect(svcMock.save.mock.calls[0][0].login).toEqual({ ...SETTINGS.login, twoFactor: 'mandatory' });
    });

    it('sends an unchanged audit section back as loaded', async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalled());
        expect(svcMock.save.mock.calls[0][0].audit).toEqual({ stdout: false, access: false, onFailure: 'continue' });
    });
});

describe('gateway-settings — save', () => {
    it("sends the whole file with the form's values, then reloads", async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        el<HTMLInputElement>(container, '#gw-set-session-idleMinutes').value = '5';
        el<HTMLTextAreaElement>(container, '#gw-set-access-allow').value = ' 10.0.0.0/8 \n\n192.0.2.7/32\n';
        el<HTMLSelectElement>(container, '#gw-set-logLevel').value = 'debug';
        el<HTMLInputElement>(container, '#gw-set-tls-insecureSkipVerify').checked = true;
        el<HTMLInputElement>(container, '#gw-set-audit-stdout').checked = true;
        el<HTMLInputElement>(container, '#gw-set-audit-access').checked = true;
        el<HTMLInputElement>(container, '#gw-set-session-connectsPerMinute').value = '8';
        el<HTMLInputElement>(container, '#gw-set-login-perClient').checked = false;
        el<HTMLInputElement>(container, '#gw-set-login-maxFailures').value = '3';
        el<HTMLInputElement>(container, '#gw-set-login-clientMaxFailures').value = '25';
        el<HTMLInputElement>(container, '#gw-set-login-resetMinutes').value = '60';
        el<HTMLInputElement>(container, '#gw-set-login-passwordMinLength').value = '16';
        el<HTMLInputElement>(container, '#gw-set-login-twoFactorMinutes').value = '5';
        tiles(container)[1].click();
        clickSave(container);

        await vi.waitFor(() => expect(svcMock.load).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(value(container, 'session-idleMinutes')).toBe('10'));
        expect(svcMock.save).toHaveBeenCalledWith({
            ...SETTINGS,
            logLevel: 'debug',
            tls: { insecureSkipVerify: true, standardRoots: true },
            access: { allow: ['10.0.0.0/8', '192.0.2.7/32'], trustedProxies: [] },
            session: { idleMinutes: 5, absoluteMinutes: 30, connectsPerMinute: 8 },
            login: {
                ...SETTINGS.login, perClient: false, maxFailures: 3, clientMaxFailures: 25, resetMinutes: 60,
                passwordMinLength: 16, twoFactorMinutes: 5,
            },
            modules: { offered: ['queue-browser', 'queue-copy'], userDefault: 'all' },
            audit: { stdout: true, access: true, onFailure: 'continue' },
        }, 'rev-1');
        expect(toastMock.showToast).toHaveBeenCalledWith('Settings saved', 'ok');
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

describe('gateway-settings -- versions', () => {
    it('a save sends the rev the settings were loaded at, and the reload brings the next one', async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        svcMock.load.mockResolvedValue(view({ rev: 'rev-2' }));
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.load).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(el<HTMLButtonElement>(container, '#btn-gw-set-save').disabled).toBe(false));
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalledTimes(2));
        expect(svcMock.save.mock.calls.map(c => c[1])).toEqual(['rev-1', 'rev-2']);
    });

    it('stale save: the dialog says so; Reload reloads the form with the other admin\'s values and rev', async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: false, status: 409, code: 'stale', rev: 'rev-9' });
        svcMock.load.mockResolvedValue(view({ rev: 'rev-9', settings: { ...SETTINGS, session: { ...SETTINGS.session, idleMinutes: 20 } } }));
        el<HTMLInputElement>(container, '#gw-set-session-idleMinutes').value = '5';
        clickSave(container);
        expect(await answerConfirm(true)).toBe('This settings page was changed by someone else since you opened it.');
        await vi.waitFor(() => expect(value(container, 'session-idleMinutes')).toBe('20'));
        expect(toastMock.showToast).not.toHaveBeenCalledWith('Settings saved', 'ok');

        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-10' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalledTimes(2));
        expect(svcMock.save.mock.calls[1][1]).toBe('rev-9');
    });

    it("stale save: Cancel keeps the admin's edits and does not reload", async () => {
        const { container } = await setup();
        svcMock.save.mockResolvedValue({ ok: false, status: 409, code: 'stale', rev: 'rev-9' });
        el<HTMLInputElement>(container, '#gw-set-session-idleMinutes').value = '5';
        clickSave(container);
        await answerConfirm(false);
        await vi.waitFor(() => expect(el<HTMLButtonElement>(container, '#btn-gw-set-save').disabled).toBe(false));
        expect(value(container, 'session-idleMinutes')).toBe('5');
        expect(svcMock.load).toHaveBeenCalledTimes(1);
        expect(errorText(container)).toBe('');
    });
});

describe('gateway-settings -- layout', () => {
    it('is named Gateway Settings in the sidebar', () => {
        expect(GatewaySettingsModule.name).toBe('Gateway Settings');
    });

    it('puts every section in a card of its own, stacked directly under the page, never inside another card', async () => {
        const { container } = await setup();
        const sections = [...container.querySelectorAll('.gw-set-section')].map(h => h.textContent);
        expect(sections).toEqual([
            'Connections', 'Access', 'Sessions', 'Sign-in throttle', 'Passwords and two-factor sign-in',
            'Modules', 'Logging', 'Audit trail', 'Broker trust', 'Gateway',
        ]);
        for (const h of container.querySelectorAll('.gw-set-section')) {
            const card = h.parentElement as HTMLElement;
            expect(card.classList.contains('card')).toBe(true);
            expect(card.parentElement?.id).toBe('gw-set-view');
        }
        // One card per section plus the intro card: nothing sits beside another card.
        expect(container.querySelectorAll('#gw-set-view .card')).toHaveLength(sections.length + 1);
        expect(container.querySelectorAll('.card .card')).toHaveLength(0);
    });

    it('opens with what the page is for and Reload, never its own title again, and names no file', async () => {
        const { container } = await setup();
        expect(container.querySelector('#gw-set-view h2')).toBeNull();
        const intro = el(container, '.gw-set-intro');
        expect(intro.textContent).toContain("The gateway's settings.");
        expect(intro.textContent).toContain('Certificates');
        expect(intro.textContent).not.toContain('config.yaml');
        expect(intro.closest('.card')?.querySelector('#btn-gw-set-reload')).not.toBeNull();
    });

    it('carries no restart-only tag, banner or button, and no inline style', async () => {
        const { container } = await setup();
        for (const sel of ['.gw-set-restart', '.gw-set-tag', '#gw-set-pending', '#btn-gw-set-goto-restart']) {
            expect(container.querySelector(sel), sel).toBeNull();
        }
        expect(container.textContent).not.toMatch(/applies when the gateway restarts/);
        expect(container.querySelectorAll('[style]')).toHaveLength(0);
    });

    it('groups the throttle and password settings by card, with the per-client choice as a checkbox', async () => {
        const { container } = await setup();
        const section = (id: string) => el(container, `#gw-set-${id}`).closest('.card')?.querySelector('.gw-set-section')?.textContent;
        for (const id of ['login-perClient', 'login-maxFailures', 'login-clientMaxFailures', 'login-resetMinutes']) {
            expect(section(id), id).toBe('Sign-in throttle');
        }
        for (const id of ['login-passwordMinLength', 'login-twoFactor', 'login-twoFactorMinutes']) {
            expect(section(id), id).toBe('Passwords and two-factor sign-in');
        }
        expect(section('session-connectsPerMinute')).toBe('Sessions');
        expect(el<HTMLInputElement>(container, '#gw-set-login-perClient').type).toBe('checkbox');
        const labels = [...container.querySelectorAll('label')].map(l => l.textContent?.trim());
        expect(labels).toEqual(expect.arrayContaining([
            'Count failures per client address',
            'Failed sign-ins per account before a back-off',
            'Failed sign-ins per client before a back-off',
            'Forget failures after (minutes)',
            'Minimum password length',
            'Time to finish two-factor after the password (minutes)',
            'Broker connects per user per minute',
        ]));
    });

    it('lays short fields (numbers, selects) out in columns and keeps long ones outside them', async () => {
        const { container } = await setup();
        for (const id of ['connModes', 'defaultConn', 'session-idleMinutes', 'session-absoluteMinutes', 'session-connectsPerMinute',
            'login-maxFailures', 'login-clientMaxFailures', 'login-resetMinutes', 'login-backoffSeconds', 'login-maxBackoffSeconds',
            'login-unauthenticatedPerMinute', 'login-passwordMinLength', 'login-twoFactor', 'login-twoFactorMinutes', 'modules-userDefault', 'logLevel', 'audit-onFailure']) {
            expect(el(container, `#gw-set-${id}`).closest('.form-cols'), id).not.toBeNull();
        }
        for (const id of ['access-allow', 'access-trustedProxies']) {
            expect(el(container, `#gw-set-${id}`).closest('.form-cols'), id).toBeNull();
        }
        expect(el(container, '#gw-set-modules-offered').closest('.form-cols')).toBeNull();
    });
});

describe('gateway-settings -- modules on offer', () => {
    it('shows one toggle tile per catalog module, with its name, its description and whether it is offered', async () => {
        const { container } = await setup(ADMIN, view({ catalog: ['queue-browser', 'queue-copy', 'queue-subscription-explorer', 'future-thing'] }));
        const rows = tiles(container).map(t => [
            t.tagName, t.type, t.dataset.module, t.getAttribute('aria-pressed'),
            t.querySelector('.gw-set-tile-name')?.textContent, t.querySelector('.gw-set-tile-desc')?.textContent ?? null,
        ]);
        expect(rows).toEqual([
            ['BUTTON', 'button', 'queue-browser', 'true', 'Queue Browser', 'Browse, inspect and delete queued messages.'],
            ['BUTTON', 'button', 'queue-copy', 'false', 'Queue Copy', 'Copy or move messages between queues.'],
            ['BUTTON', 'button', 'queue-subscription-explorer', 'false', 'Queue Subscriptions', 'See which topics each queue subscribes to.'],
            ['BUTTON', 'button', 'future-thing', 'false', 'Future Thing', null],
        ]);
        expect(el(container, '#gw-set-modules-offered').getAttribute('role')).toBe('group');
    });

    it('a click toggles a tile on and off, and Save sends the pressed ones in catalog order', async () => {
        const { container } = await setup(ADMIN, view({ catalog: ['queue-browser', 'queue-copy', 'queue-subscription-explorer'] }));
        const [browser, copy, subs] = tiles(container);
        browser.click();
        copy.click();
        subs.click();
        subs.click();
        expect(pressed(container)).toEqual([false, true, false]);
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalled());
        expect(svcMock.save.mock.calls[0][0].modules.offered).toEqual(['queue-copy']);
    });

    it('Reload brings back what the gateway has, dropping unsaved tile clicks', async () => {
        const { container } = await setup();
        tiles(container)[1].click();
        svcMock.load.mockResolvedValue(view());
        el<HTMLButtonElement>(container, '#btn-gw-set-reload').click();
        await vi.waitFor(() => expect(pressed(container)).toEqual([true, false]));
    });
});

describe('gateway-settings -- broker trust', () => {
    it('keeps Skip broker certificate checks in its card, saved with the rest', async () => {
        const { container } = await setup();
        const box = el<HTMLInputElement>(container, '#gw-set-tls-insecureSkipVerify');
        expect(box.closest('.card')?.querySelector('.gw-set-section')?.textContent).toBe('Broker trust');
        expect(box.checked).toBe(false);
        box.checked = true;
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalled());
        expect(svcMock.save.mock.calls[0][0].tls).toEqual({ insecureSkipVerify: true, standardRoots: true });
    });

    it('shows Trust the standard root CAs in the same card, on as loaded, and saves it off', async () => {
        const { container } = await setup();
        const box = el<HTMLInputElement>(container, '#gw-set-tls-standardRoots');
        expect(box.closest('.card')?.querySelector('.gw-set-section')?.textContent).toBe('Broker trust');
        expect(box.closest('label')?.textContent?.trim()).toBe('Trust the standard root CAs');
        expect(box.checked).toBe(true);
        box.checked = false;
        svcMock.save.mockResolvedValue({ ok: true, data: { rev: 'rev-2' } });
        clickSave(container);
        await vi.waitFor(() => expect(svcMock.save).toHaveBeenCalled());
        expect(svcMock.save.mock.calls[0][0].tls).toEqual({ insecureSkipVerify: false, standardRoots: false });
    });
});

describe('gateway-settings -- restart', () => {
    const QUESTION = 'Restart the gateway? Everyone is signed out and open broker connections close. It is back in a few seconds.';

    async function setupRestart() {
        const wait = vi.fn().mockResolvedValue(undefined);
        const reload = vi.fn();
        const { container, ctx } = await setup(ADMIN, view(), { wait, reload });
        const button = el<HTMLButtonElement>(container, '#btn-gw-set-restart');
        return { container, ctx, wait, reload, button };
    }

    it('lives in its own Gateway card', async () => {
        const { button } = await setupRestart();
        expect(button.textContent).toBe('Restart gateway');
        expect(button.closest('.card')?.querySelector('.gw-set-section')?.textContent).toBe('Gateway');
        expect(button.disabled).toBe(false);
    });

    it('Cancel asks and does nothing: no request, the button stays usable', async () => {
        const { button, reload } = await setupRestart();
        button.click();
        expect(await answerConfirm(false)).toBe(QUESTION);
        expect(svcMock.restart).not.toHaveBeenCalled();
        expect(button.disabled).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('OK posts the restart, says it is restarting, waits for /hosted and goes to the sign-in', async () => {
        const { container, wait, reload, button } = await setupRestart();
        svcMock.restart.mockResolvedValue({ ok: true, data: { restarting: true } });
        svcMock.ping.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        button.click();
        expect(await answerConfirm(true)).toBe(QUESTION);
        await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
        expect(svcMock.restart).toHaveBeenCalledTimes(1);
        expect(svcMock.ping).toHaveBeenCalledTimes(3);
        expect(wait.mock.calls.map(c => c[0])).toEqual([2000, 1000, 1000]);
        expect(hidden(container, '#gw-set-restarting')).toBe(false);
        expect(el(container, '#gw-set-restarting').textContent).toMatch(/^Restarting the gateway\./);
        expect(button.disabled).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('the confirm dialog is the app\'s, not the browser\'s', async () => {
        const nativeConfirm = vi.spyOn(window, 'confirm');
        const { button } = await setupRestart();
        button.click();
        expect(await answerConfirm(false)).toBe(QUESTION);
        expect(nativeConfirm).not.toHaveBeenCalled();
        nativeConfirm.mockRestore();
    });

    it.each([
        ['an administrator is required', { ok: false, status: 403, code: 'forbidden' }, 'This needs an administrator.'],
        ['the gateway cannot be reached', { ok: false, status: 0, code: 'network' }, 'The gateway could not be reached.'],
    ])('when %s, it says so, waits for nothing and leaves the button usable', async (_, failure, text) => {
        const { container, wait, reload, button } = await setupRestart();
        svcMock.restart.mockResolvedValue(failure);
        button.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(el(container, '#gw-set-restart-error').textContent).toBe(text));
        expect(hidden(container, '#gw-set-restart-error')).toBe(false);
        expect(hidden(container, '#gw-set-restarting')).toBe(true);
        expect(button.disabled).toBe(false);
        expect(svcMock.ping).not.toHaveBeenCalled();
        expect(wait).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('an ended session (401) asks the session owner to sign out', async () => {
        const { ctx, button } = await setupRestart();
        const signOut = vi.fn();
        ctx.eventBus.on('rbac:sign-out-requested', signOut);
        svcMock.restart.mockResolvedValue({ ok: false, status: 401, code: 'unauthenticated' });
        button.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        expect(button.disabled).toBe(false);
    });

    it('a gateway that never answers again: gives up after a minute, says so, and the button is usable again', async () => {
        const { container, wait, reload, button } = await setupRestart();
        svcMock.restart.mockResolvedValue({ ok: true, data: { restarting: true } });
        svcMock.ping.mockResolvedValue(false);
        button.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(el(container, '#gw-set-restart-error').textContent)
            .toBe('The gateway has not answered after a minute. Check it on its host, then reload this page.'));
        expect(wait).toHaveBeenCalledTimes(60);
        expect(svcMock.ping).toHaveBeenCalledTimes(60);
        expect(hidden(container, '#gw-set-restarting')).toBe(true);
        expect(button.disabled).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('a second try clears the earlier error', async () => {
        const { container, button } = await setupRestart();
        svcMock.restart.mockResolvedValueOnce({ ok: false, status: 403, code: 'forbidden' });
        button.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(hidden(container, '#gw-set-restart-error')).toBe(false));
        svcMock.restart.mockResolvedValueOnce({ ok: true, data: { restarting: true } });
        svcMock.ping.mockResolvedValue(true);
        button.click();
        await answerConfirm(true);
        await vi.waitFor(() => expect(hidden(container, '#gw-set-restart-error')).toBe(true));
    });

    it('sleeps with setTimeout when no wait is injected: 2 s before the first look at /hosted', async () => {
        const reload = vi.fn();
        const { container } = await setup(ADMIN, view(), { reload });
        const button = el<HTMLButtonElement>(container, '#btn-gw-set-restart');
        let answer!: (r: unknown) => void;
        svcMock.restart.mockReturnValue(new Promise(resolve => { answer = resolve; }));
        svcMock.ping.mockResolvedValue(true);
        button.click();
        await answerConfirm(true);
        const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
        try {
            answer({ ok: true, data: { restarting: true } });
            for (let i = 0; i < 20; i++) await Promise.resolve();
            expect(timer).toHaveBeenCalledWith(expect.any(Function), 2000);
            expect(reload).toHaveBeenCalledTimes(1);
        } finally {
            timer.mockRestore();
        }
    });
});
