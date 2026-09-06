import { describe, it, expect, vi } from 'vitest';
import { unfilteredPrimarySempContext } from '../../../src/core/services/sempContext';
import type { AppContext, AppState } from '../../../src/core/types';

function makeCtx(overrides: Partial<AppState> = {}): AppContext {
    const appState: AppState = {
        activeModuleId: null,
        isConnected: false,
        selectedVpn: null,
        solaceConnection: null,
        sempCredentials: null,
        isSempConnected: false,
        ...overrides,
    };
    return {
        container: document.createElement('div'),
        appState,
        eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), hold: vi.fn(), release: vi.fn() } as any,
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: {},
    };
}

describe('core/services/sempContext — unfilteredPrimarySempContext', () => {
    it('returns null when SEMP is not connected', () => {
        const ctx = makeCtx({ isSempConnected: false });
        expect(unfilteredPrimarySempContext(ctx)).toBeNull();
    });

    it('returns null when sempCredentials is missing (defensive guard)', () => {
        // A deliberately inconsistent state — isSempConnected=true without
        // sempCredentials — shouldn't occur in practice, but the guard
        // prevents a runtime crash if bridging ever drifts out of sync.
        const ctx = makeCtx({ isSempConnected: true, sempCredentials: null });
        expect(unfilteredPrimarySempContext(ctx)).toBeNull();
    });

    it('returns a SempContext wrapping ctx.sempFetch and the stored baseUrl (non-managed)', () => {
        const ctx = makeCtx({
            isSempConnected: true,
            sempCredentials: {
                user: 'admin', pass: 'secret', baseUrl: 'https://broker:1943/api',
                protocol: 'https', host: 'broker', port: '1943', urlPath: '/api',
            },
        });
        const sempCtx = unfilteredPrimarySempContext(ctx);
        expect(sempCtx).not.toBeNull();
        expect(sempCtx!.baseUrl).toBe('https://broker:1943/api');
        expect(sempCtx!.fetch).toBe(ctx.sempFetch); // no managed session → plain fetch
    });

    it('wraps fetch with the RBAC discovery filter in a managed session', async () => {
        const ctx = makeCtx({
            isSempConnected: true,
            sempCredentials: {
                user: 'u', pass: 'p', baseUrl: 'b', protocol: 'https', host: 'h', port: '1943', urlPath: '',
            },
            managed: {
                admin: false, username: 'u', token: 't', broker: 'b1', vpns: [],
                operate: [{ brokers: 'b1', msgVpns: 'vpn1', queues: '*' }], readOnly: [],
            },
        });
        (ctx.sempFetch as any).mockResolvedValue(
            new Response(JSON.stringify({ data: [{ msgVpnName: 'vpn1' }, { msgVpnName: 'vpn2' }] }),
                { status: 200, headers: { 'content-type': 'application/json' } }),
        );

        const sempCtx = unfilteredPrimarySempContext(ctx)!;
        expect(sempCtx.fetch).not.toBe(ctx.sempFetch); // wrapped
        const json = await (await sempCtx.fetch('/SEMP/v2/monitor/msgVpns?count=100')).json();
        expect(json.data.map((v: any) => v.msgVpnName)).toEqual(['vpn1']);
    });
});

