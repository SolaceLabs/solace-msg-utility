import { describe, it, expect, vi, afterEach } from 'vitest';
import { primarySempContextFrom, deriveSempV1Url } from '../../../src/core/services/sempContext';
import { setHosted } from '../../../src/core/hosted';
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

describe('core/services/sempContext — deriveSempV1Url', () => {
    afterEach(() => setHosted(false));

    describe('direct mode (default)', () => {
        it('strips the SEMP v2 path and appends /SEMP', () => {
            expect(deriveSempV1Url('https://broker.example:1943/SEMP/v2')).toBe('https://broker.example:1943/SEMP');
        });
        it('strips any path/query from the base and appends /SEMP', () => {
            expect(deriveSempV1Url('http://host:8080/anything')).toBe('http://host:8080/SEMP');
            expect(deriveSempV1Url('http://host:8080/SEMP/v2/monitor?x=1')).toBe('http://host:8080/SEMP');
        });
        it('works when the baseUrl has no path at all', () => {
            expect(deriveSempV1Url('https://broker.example')).toBe('https://broker.example/SEMP');
        });
    });

    describe('hosted mode', () => {
        // In hosted mode the baseUrl is gateway-prefixed
        // (`{wireScheme}://{gateway}/{scheme}/{port}/{host}{userPath}`).
        // The proxy prefix MUST be preserved or the SEMP v1 POST won't
        // route through the gateway.
        it('preserves the gateway proxy prefix and appends /SEMP', () => {
            setHosted(true);
            expect(deriveSempV1Url('https://gateway:9443/https/943/broker.example.com'))
                .toBe('https://gateway:9443/https/943/broker.example.com/SEMP');
        });
        it('preserves a user-supplied urlPath inside the gateway prefix', () => {
            setHosted(true);
            expect(deriveSempV1Url('https://gateway:9443/https/943/broker.example.com/api'))
                .toBe('https://gateway:9443/https/943/broker.example.com/api/SEMP');
        });
        it('trims a trailing slash on the pathname before appending /SEMP', () => {
            setHosted(true);
            expect(deriveSempV1Url('https://gateway:9443/https/943/broker.example.com/'))
                .toBe('https://gateway:9443/https/943/broker.example.com/SEMP');
        });
    });
});
