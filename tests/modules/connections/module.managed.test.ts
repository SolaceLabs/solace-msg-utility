import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionsModule } from '../../../src/modules/connections/module.managed';
import { ConnectionsModule as ReleaseEntry } from '../../../src/modules/connections/module';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedProfile } from '../../../src/core/services/managed-profile';
import { createSolaceMock } from '../../setup';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState } from '../../../src/core/types';
import { completeContext } from '../../helpers/appContext';

/**
 * The managed entry of the connections module (`module.managed.ts`, the
 * `managed` variant, built into provisioned.html): the Direct / Managed tab bar
 * and the cross-module routers that fall back to the Direct form when no
 * managed session exists. Installed with the REAL services and the composed
 * `index.managed.html`, with `/hosted` stubbed.
 *
 * The Managed panel itself (sign-in, select, connect, refresh), the mode
 * interlock and `rbac:sign-out-requested` with a live session are covered by
 * tests/modules/connections/managed-panel.test.ts, which installs this entry.
 */

function createTestContext(container: HTMLElement): { ctx: AppContext; appState: AppState } {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false,
    };
    const ctx: AppContext = completeContext({
        container,
        appState,
        eventBus,
        setState: vi.fn((key: keyof AppState, value: any) => { (appState as any)[key] = value; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        mountSidebarAccount: vi.fn(),
    });
    return { ctx, appState };
}

/** `/hosted` answers `json`; `/managed/me` finds no gateway session. */
function stubHosted(json: unknown) {
    (globalThis.fetch as any).mockImplementation((url: string) => {
        if (url === '/hosted') return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(json)) });
        if (url === '/managed/me') return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'unauthenticated' }) });
        return Promise.resolve({ ok: true, status: 200 });
    });
}

let container: HTMLElement;
const hiddenCls = (sel: string) => (container.querySelector(sel) as HTMLElement).classList.contains('hidden');

beforeEach(() => {
    (window as any).solace = createSolaceMock();
    container = loadModuleDOM('connections', 'managed');
});

describe('connections/module.managed — identity', () => {
    it('is the same sidebar entry as the Release entry', () => {
        // One module id, one sidebar entry: the variant picks the file, the user
        // sees "Connections" either way.
        expect(ConnectionsModule.id).toBe(ReleaseEntry.id);
        expect(ConnectionsModule.name).toBe(ReleaseEntry.name);
        expect(ConnectionsModule.icon).toBe(ReleaseEntry.icon);
    });

    it("publishes the gateway's connection config as advertised", async () => {
        // Unlike the Release entry, this one can back a managed session, so
        // queue-copy may offer provisioned destinations.
        stubHosted({ hosted: true, connModes: 'both', defaultConn: 'provisioned' });
        const { ctx, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);
        expect(appState.connConfig).toEqual({ connModes: 'both', defaultConn: 'provisioned', hosted: true });
    });
});

describe('connections/module.managed — connection-mode tabs', () => {
    it("shows both tabs + the tab bar for connModes 'both'; Provisioned click switches panels", async () => {
        stubHosted({ hosted: true, connModes: 'both', defaultConn: 'direct' });
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        expect(hiddenCls('#conn-tabs')).toBe(false);         // a choice exists → bar shown
        expect(hiddenCls('#conn-tab-direct')).toBe(false);
        expect(hiddenCls('#conn-tab-managed')).toBe(false);
        expect(hiddenCls('#conn-panel-direct')).toBe(false); // Direct active first
        expect(hiddenCls('#conn-panel-managed')).toBe(true);
        expect([...container.querySelectorAll('#conn-tabs [role=tab]')].map(t => t.textContent)).toEqual(['Direct', 'Provisioned']);

        (container.querySelector('#conn-tab-managed') as HTMLButtonElement).click();
        expect(hiddenCls('#conn-panel-managed')).toBe(false); // Provisioned now active
        expect(hiddenCls('#conn-panel-direct')).toBe(true);
        expect((container.querySelector('#conn-tab-managed') as HTMLElement).getAttribute('aria-selected')).toBe('true');

        (container.querySelector('#conn-tab-direct') as HTMLButtonElement).click();
        expect(hiddenCls('#conn-panel-direct')).toBe(false); // back to Direct
        expect((container.querySelector('#conn-tab-direct') as HTMLElement).getAttribute('aria-selected')).toBe('true');
    });

    it("Provisioned only (connModes 'provisioned') hides the tab bar and shows the Provisioned panel", async () => {
        stubHosted({ hosted: true, connModes: 'provisioned', defaultConn: 'direct' });
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        expect(hiddenCls('#conn-tabs')).toBe(true);          // single tab → bar hidden
        expect(hiddenCls('#conn-tab-managed')).toBe(false);
        expect(hiddenCls('#conn-tab-direct')).toBe(true);
        expect(hiddenCls('#conn-panel-managed')).toBe(false);
        expect(hiddenCls('#conn-panel-direct')).toBe(true);
    });

    it("defaultConn 'provisioned' with 'both' activates the Provisioned tab first", async () => {
        stubHosted({ hosted: true, connModes: 'both', defaultConn: 'provisioned' });
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);
        expect(hiddenCls('#conn-panel-managed')).toBe(false); // Provisioned active first
        expect(hiddenCls('#conn-panel-direct')).toBe(true);
    });

    it('behind a Direct-only gateway, shows the Direct form alone', async () => {
        // No /hosted at all (provisioned.html opened outside its gateway): Direct
        // only, no tab bar, and no panel is built.
        (globalThis.fetch as any).mockImplementation(() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') }));
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        expect(hiddenCls('#conn-tabs')).toBe(true);
        expect(hiddenCls('#conn-tab-managed')).toBe(true);
        expect(hiddenCls('#conn-panel-direct')).toBe(false);
        expect(hiddenCls('#conn-panel-managed')).toBe(true);
    });
});

describe('connections/module.managed -- inconclusive /hosted probe', () => {
    const visible = (sel: string) => !hiddenCls(sel);

    it('never falls back to Direct-only: the notice replaces every panel, no verdict is published, and Retry reloads', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') });
        const { ctx, appState } = createTestContext(container);
        const reload = vi.fn();
        await ConnectionsModule.install(ctx, { reload });

        expect(visible('#conn-probe-notice-managed')).toBe(true);
        expect(container.querySelector('#conn-probe-notice-managed')!.textContent).toContain('Could not check whether this page is served by the gateway.');
        expect(hiddenCls('#conn-panel-direct')).toBe(true);
        expect(hiddenCls('#conn-panel-managed')).toBe(true);
        expect(hiddenCls('#conn-tabs')).toBe(true);
        expect(appState.connConfig).toBeUndefined();

        (container.querySelector('#btn-conn-probe-retry-managed') as HTMLButtonElement).click();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('a network error is inconclusive too; Retry without an injected reload calls window.location.reload', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);
        expect(visible('#conn-probe-notice-managed')).toBe(true);

        const original = window.location;
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
        try {
            (container.querySelector('#btn-conn-probe-retry-managed') as HTMLButtonElement).click();
        } finally {
            Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true });
        }
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('a conclusive no-gateway (404) shows no notice', async () => {
        (globalThis.fetch as any).mockImplementation(() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') }));
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);
        expect(visible('#conn-probe-notice-managed')).toBe(false);
        expect(hiddenCls('#conn-panel-direct')).toBe(false);
    });
});

describe('connections/module.managed — routers without a managed session', () => {
    it('connection:edit-requested navigates to the module', async () => {
        stubHosted({ hosted: true, connModes: 'both', defaultConn: 'direct' });
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        ctx.eventBus.emit('connection:edit-requested');
        expect(ctx.loadSelf).toHaveBeenCalledTimes(1);
    });

    it('connection:check-connection runs the Direct connect for the requested VPN', async () => {
        stubHosted({ hosted: true, connModes: 'both', defaultConn: 'direct' });
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        ctx.eventBus.emit('connection:check-connection', { vpn: 'vpn-x', queue: 'q1' });

        // Not connected: the Direct dance navigates here and fills the VPN in
        // before attempting the connect.
        expect(ctx.loadSelf).toHaveBeenCalled();
        expect((container.querySelector('#solace-vpn') as HTMLInputElement).value).toBe('vpn-x');
    });
});
