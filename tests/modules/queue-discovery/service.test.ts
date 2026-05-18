import { describe, it, expect, vi } from 'vitest';
import { createService } from '../../../src/modules/queue-discovery/service';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState } from '../../../src/core/types';

/**
 * After Stage C the queue-discovery service is a thin wrapper around the
 * lifted core `createSempDiscovery`. The paged-fetch / pagination /
 * error-mapping behaviors are tested at the core layer in
 * `tests/core/services/semp-discovery.test.ts`. These tests cover the
 * wrapper-only contract:
 *   - the "SEMP Not Connected" guard fires before any network call
 *   - when SEMP is connected, the wrapper delegates to the core factory
 *     using the primary SempContext (proxied via `ctx.sempFetch`)
 */

function createTestContext(overrides: Partial<AppContext> = {}): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null,
        sempCredentials: {
            user: 'admin', pass: 'admin', baseUrl: 'http://broker:8080',
            protocol: 'http', host: 'broker', port: '8080', urlPath: '',
        },
        isSempConnected: true
    };
    return {
        container: document.createElement('div'),
        appState,
        eventBus,
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: { useMocks: false },
        ...overrides
    };
}

async function allPages<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const pages: T[] = [];
    for await (const p of gen) pages.push(p);
    return pages;
}

describe('queue-discovery/service (wrapper)', () => {
    describe('fetchVpns()', () => {
        it('yields "SEMP Not Connected" without hitting the network when isSempConnected=false', async () => {
            const ctx = createTestContext();
            ctx.appState.isSempConnected = false;
            const service = createService(ctx);

            const gen = service.fetchVpns();
            const first = await gen.next();
            expect(first.value).toEqual({ ok: false, error: 'SEMP Not Connected' });
            // Second call exhausts the generator — covers the `return` after the yield.
            expect((await gen.next()).done).toBe(true);
            // Critical: no fetch issued. Catches a regression that moves the guard
            // below the first network call — the yielded error would look the same
            // but stale SEMP credentials would already be on the wire.
            expect(ctx.sempFetch).not.toHaveBeenCalled();
        });

        it('delegates to the core factory using ctx.sempFetch when SEMP is connected', async () => {
            const ctx = createTestContext();
            (ctx.sempFetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ msgVpnName: 'vpn-x' }] })
            });
            const pages = await allPages(createService(ctx).fetchVpns());

            expect(pages).toHaveLength(1);
            expect(pages[0]).toEqual({ ok: true, data: ['vpn-x'] });
            // Wrapper passes maxCount through to the core factory's URL builder.
            expect(ctx.sempFetch).toHaveBeenCalledWith(
                expect.stringContaining('/SEMP/v2/monitor/msgVpns?count=100')
            );
        });
    });

    describe('fetchQueues()', () => {
        it('yields "SEMP Not Connected" without hitting the network when isSempConnected=false', async () => {
            const ctx = createTestContext();
            ctx.appState.isSempConnected = false;
            const service = createService(ctx);

            const gen = service.fetchQueues('default');
            const first = await gen.next();
            expect(first.value).toEqual({ ok: false, error: 'SEMP Not Connected' });
            expect((await gen.next()).done).toBe(true);
            expect(ctx.sempFetch).not.toHaveBeenCalled();
        });

        it('delegates to the core factory and includes the VPN name in the URL', async () => {
            const ctx = createTestContext();
            (ctx.sempFetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ queueName: 'Q-1' }, { queueName: 'Q-2' }] })
            });
            const pages = await allPages(createService(ctx).fetchQueues('my-vpn'));

            expect(pages).toHaveLength(1);
            expect(pages[0]).toEqual({ ok: true, data: ['Q-1', 'Q-2'] });
            expect(ctx.sempFetch).toHaveBeenCalledWith(
                expect.stringContaining('/msgVpns/my-vpn/queues')
            );
        });
    });
});
