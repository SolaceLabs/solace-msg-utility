import { describe, it, expect, vi } from 'vitest';
import { primarySempContextFrom } from '../../../src/core/services/sempContext';
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

describe('core/services/sempContext — primarySempContextFrom', () => {
    it('returns null when SEMP is not connected', () => {
        const ctx = makeCtx({ isSempConnected: false });
        expect(primarySempContextFrom(ctx)).toBeNull();
    });

    it('returns null when sempCredentials is missing (defensive guard)', () => {
        // A deliberately inconsistent state — isSempConnected=true without
        // sempCredentials — shouldn't occur in practice, but the guard
        // prevents a runtime crash if bridging ever drifts out of sync.
        const ctx = makeCtx({ isSempConnected: true, sempCredentials: null });
        expect(primarySempContextFrom(ctx)).toBeNull();
    });

    it('returns a SempContext wrapping ctx.sempFetch and the stored baseUrl', () => {
        const ctx = makeCtx({
            isSempConnected: true,
            sempCredentials: {
                user: 'admin', pass: 'secret', baseUrl: 'https://broker:1943/api',
                protocol: 'https', host: 'broker', port: '1943', urlPath: '/api',
            },
        });
        const sempCtx = primarySempContextFrom(ctx);
        expect(sempCtx).not.toBeNull();
        expect(sempCtx!.baseUrl).toBe('https://broker:1943/api');
        expect(sempCtx!.fetch).toBe(ctx.sempFetch);
    });
});

