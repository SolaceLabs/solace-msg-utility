import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot, type ManagedDemo } from '../../src/mock-broker/boot.managed';
import { resetScenario, scenario, setBrokers } from '../../src/mock-broker/fixtures';
import { setSocketGate } from '../../src/mock-broker/sdk/session';
import { Kernel } from '../../src/core/kernel';
import { ACTIVE_MODULES, MODULE_ENTRIES } from '../../src/variants/managed-demo';
import { ConnectionsModule } from '../../src/modules/connections/module.managed';
import { QueueBrowserModule } from '../../src/modules/queue-browser/module';
import { QueueCopyModule } from '../../src/modules/queue-copy/module';
import { UserManagementModule } from '../../src/modules/user-management/module';
import { ConnectionManagementModule } from '../../src/modules/connection-management/module';
import { GatewaySettingsModule } from '../../src/modules/gateway-settings/module';
import { loadModuleDOM } from '../helpers/loadModuleDOM';
import type { AppContext, PwaModule } from '../../src/core/types';

/**
 * managed-demo.html end to end, in process: the demo's boot, then the real
 * Kernel with the managed-demo variant's modules, each from its real template.
 * Only the reload a sign-in causes is simulated, by booting a second time over
 * what the first boot saved, as the browser would.
 *
 * The parts have their own suites (the fake gateway in
 * tests/mock-broker/gateway/, the boot in boot.managed.test.ts, each module in
 * tests/modules/); this one proves they agree on a whole session.
 */
const MODULES: Record<string, PwaModule> = {
    'connections': ConnectionsModule,
    'queue-browser': QueueBrowserModule,
    'queue-copy': QueueCopyModule,
    'user-management': UserManagementModule,
    'connection-management': ConnectionManagementModule,
    'gateway-settings': GatewaySettingsModule,
};

/** A module that only keeps the AppContext, so the test can read AppState. */
const PROBE = 'demo-flow-probe';
let ctx: AppContext;
const probe: PwaModule = { name: 'Probe', id: PROBE, install: async (c) => { ctx = c; } };

let realFetch: typeof window.fetch;
let demos: ManagedDemo[];
const saved = { WebSocket: window.WebSocket, EventSource: (window as any).EventSource, open: XMLHttpRequest.prototype.open };

beforeEach(() => {
    realFetch = window.fetch;
    document.body.innerHTML = '';
    sessionStorage.clear();
    resetScenario();
    demos = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
    demos.forEach(d => d.dispose());
    window.fetch = realFetch;
    delete (window as any).solace;
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: saved.WebSocket });
    Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: saved.EventSource });
    XMLHttpRequest.prototype.open = saved.open;
    delete (navigator as any).sendBeacon;
    setSocketGate(null);
    setBrokers({});
});

const startDemo = () => {
    const demo = boot({ reload: () => {} });
    demos.push(demo);
    scenario.latencyMs = 0;
    return demo;
};

const panelButton = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('#mock-controls .mockctl-btn')).find(b => b.textContent === label)!;
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const shown = (sel: string) => !q(sel).classList.contains('hidden');
const navItems = () => Array.from(document.querySelectorAll<HTMLElement>('#sidebar-nav .nav-item'), n => n.dataset.moduleId)
    .filter(id => id !== PROBE);

/**
 * Open the demo the way a visitor does: a first load, whatever `before` does
 * on it (sign in from the demo panel, change a setting), the reload, and the
 * app over the second load.
 */
async function openDemo(before: (first: ManagedDemo) => void | Promise<void> = () => {}): Promise<ManagedDemo> {
    const first = startDemo();
    await before(first);
    first.pages.hide();
    first.save();
    first.dispose();

    document.body.innerHTML = '';
    const demo = startDemo();
    const shell = document.createElement('div');
    shell.innerHTML = `
        <div id="main-sidebar"><nav id="sidebar-nav"></nav><div id="sidebar-account"></div></div>
        <button id="btn-sidebar-toggle"></button><span id="page-title"></span>
        <span id="status-indicator-client"></span><span id="status-indicator-semp"></span>
        <div id="module-container"></div>`;
    document.body.appendChild(shell);
    for (const id of [...Object.keys(MODULES), PROBE]) {
        const tpl = document.createElement('template');
        tpl.dataset.moduleId = id;
        if (id !== PROBE) {
            const c = loadModuleDOM(id, MODULE_ENTRIES[id]);
            c.remove();
            tpl.innerHTML = c.innerHTML;
        }
        document.body.appendChild(tpl);
    }
    const registered = Object.entries(ACTIVE_MODULES).map(([id, priority]) => ({ module: MODULES[id], priority }));
    await new Kernel([...registered, { module: probe, priority: 1 }]).start();
    return demo;
}

const signInAs = (username: string) => () => panelButton(`Sign in as ${username}`).click();

async function connect(broker: string, vpn: string): Promise<void> {
    q<HTMLSelectElement>('#managed-broker-select').value = broker;
    q('#managed-broker-select').dispatchEvent(new Event('change'));
    q<HTMLSelectElement>('#managed-vpn-select').value = vpn;
    q('#managed-vpn-select').dispatchEvent(new Event('change'));
    q<HTMLButtonElement>('#btn-managed-connect').click();
    await vi.waitFor(() => expect([ctx.appState.isSempConnected, ctx.appState.isConnected]).toEqual([true, true]));
}

describe('managed demo end to end', () => {
    it('covers every module of the managed-demo variant', () => {
        expect(Object.keys(MODULES).sort()).toEqual(Object.keys(ACTIVE_MODULES).sort());
    });

    it('loads signed out under connModes both: no sign-in page, the Managed tab\'s Sign in, Direct offered', async () => {
        await openDemo(async first => {
            const put = await first.gateway.handle({
                method: 'PUT', path: '/managed/settings', query: '',
                body: JSON.stringify({ ...first.gateway.settings.current(), connModes: 'both' }),
                session: first.gateway.openSession('admin', false),
            });
            expect(put.status).toBe(200);
        });

        expect(document.querySelector('.mgw-page')).toBeNull();
        expect([shown('#conn-tabs'), shown('#conn-tab-direct')]).toEqual([true, true]);
        expect(q('#conn-tab-managed').getAttribute('aria-selected')).toBe('true');   // defaultConn: managed
        expect(shown('#managed-login-view')).toBe(true);
        expect(q('#btn-managed-login').getAttribute('href')).toBe('/login');
        expect(ctx.appState.managed ?? null).toBeNull();
    });

    it('signs the operator in, shows only what the gateway grants, connects, and reads queues through the relay', async () => {
        await openDemo(signInAs('operator'));

        await vi.waitFor(() => expect(ctx.appState.managed?.username).toBe('operator'));
        expect(navItems()).toEqual(['connections', 'queue-browser', 'queue-copy']);
        expect(Array.from(q<HTMLSelectElement>('#managed-broker-select').options, o => o.value)).toEqual(['east-prod', 'lab']);
        expect(q('#sidebar-account').textContent).toContain('operator');

        await connect('east-prod', 'orders');
        expect(shown('#managed-connected-view')).toBe(true);
        const res = await ctx.sempFetch('/SEMP/v2/monitor/msgVpns/orders/queues?count=100');
        const names = ((await res.json()).data as { queueName: string }[]).map(d => d.queueName);
        expect(names).toContain('orders.new');
    });

    it('closes the operator\'s live connection when the VPN access is revoked, and Refresh shows nothing left', async () => {
        await openDemo(signInAs('operator'));
        await vi.waitFor(() => expect(ctx.appState.managed?.username).toBe('operator'));
        await connect('east-prod', 'orders');

        panelButton('Revoke my VPN access').click();
        await vi.waitFor(() => expect(ctx.appState.isConnected).toBe(false));
        expect(shown('#managed-select-view')).toBe(true);

        q<HTMLButtonElement>('#btn-managed-refresh').click();
        await vi.waitFor(() => expect(shown('#managed-empty-state')).toBe(true));
        expect(ctx.appState.managed?.operate).toEqual([]);
    });

    const SELF_EDITS: [string, () => void][] = [
        ['clearing their own Administrator flag', () => {
            q<HTMLInputElement>('#user-mgmt-admin').checked = false;
            q<HTMLButtonElement>('#btn-user-mgmt-save').click();
        }],
        ['changing their own password', () => {
            q<HTMLInputElement>('#user-mgmt-password').value = 'a-new-demo-password-01';
            q<HTMLButtonElement>('#btn-user-mgmt-save').click();
        }],
    ];

    async function openOwnRow(): Promise<HTMLTableRowElement> {
        await openDemo(signInAs('admin'));
        await vi.waitFor(() => expect(ctx.appState.managed?.admin).toBe(true));
        expect(navItems()).toEqual(['connections', 'queue-browser', 'queue-copy', 'user-management', 'connection-management', 'gateway-settings']);
        q('#sidebar-nav .nav-item[data-module-id="user-management"]').click();
        const own = () => Array.from(document.querySelectorAll<HTMLTableRowElement>('#user-mgmt-rows tr'))
            .find(tr => tr.querySelector('td')?.textContent === 'admin');
        await vi.waitFor(() => expect(own()).toBeTruthy());
        return own()!;
    }

    async function expectSignedOut(demo: ManagedDemo): Promise<void> {
        await vi.waitFor(() => expect(ctx.appState.managed ?? null).toBeNull());
        expect(demo.gateway.session()).toBeNull();
        expect(shown('#managed-login-view')).toBe(true);
        expect(q('#sidebar-account .conn-account').classList.contains('hidden')).toBe(true);
    }

    for (const [what, edit] of SELF_EDITS) {
        it(`signs an administrator out at once for ${what}`, async () => {
            const row = await openOwnRow();
            row.querySelector<HTMLButtonElement>('.btn-secondary')!.click();
            edit();
            await expectSignedOut(demos[demos.length - 1]);
        });
    }

    it('signs an administrator out at once for deleting their own account', async () => {
        const row = await openOwnRow();
        row.querySelector<HTMLButtonElement>('.btn-danger')!.click();
        const demo = demos[demos.length - 1];
        await expectSignedOut(demo);
        expect(demo.gateway.store.findUser('admin')).toBeFalsy();
    });
});
