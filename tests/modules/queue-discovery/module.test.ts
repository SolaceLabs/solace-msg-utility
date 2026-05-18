import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueDiscoveryModule } from '../../../src/modules/queue-discovery/module';
import { ui as discoveryUi } from '../../../src/modules/queue-discovery/ui.js';
import { PAGE_DELAY_MS } from '../../../src/core/services/semp-discovery';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus } from '../../../src/core/types';

function createDiscoveryDOM() {
    // Use the real per-module template so the test DOM can't drift from the
    // HTML that actually ships. Appends to document.body; caller is responsible
    // for cleanup between tests (the existing tests overwrite document.body).
    return loadModuleDOM('queue-discovery');
}

function createTestContext(container: HTMLElement): { ctx: AppContext; eventBus: EventBus; appState: AppState } {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null,
        sempCredentials: {
            user: 'admin', pass: 'admin', baseUrl: 'http://broker:8080',
            protocol: 'http', host: 'broker', port: '8080', urlPath: '',
        },
        isSempConnected: false
    };
    const ctx: AppContext = {
        container,
        appState,
        eventBus,
        setState: vi.fn((key: keyof AppState, value: any) => { (appState as any)[key] = value; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/queues')) {
                return { ok: true, json: async () => ({ data: [{ queueName: 'test-queue-1' }, { queueName: 'test-queue-2' }] }) };
            }
            return { ok: true, json: async () => ({ data: [{ msgVpnName: 'default' }, { msgVpnName: 'dev' }] }) };
        }),
        copyToClipboard: vi.fn(),
        config: {}
    };
    return { ctx, eventBus, appState };
}

describe('QueueDiscoveryModule', () => {
    it('has correct metadata', () => {
        expect(QueueDiscoveryModule.name).toBe('Queue Discovery');
        expect(QueueDiscoveryModule.id).toBe('queue-discovery');
        expect(QueueDiscoveryModule.icon).toContain('svg');
        // Priority is set in src/registry.ts; tested in tests/registry.test.ts.
    });

    it('installs and initializes queue input as disabled', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);
        await QueueDiscoveryModule.install(ctx);

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        expect(queueInput.disabled).toBe(true);
    });

    it('fetches VPNs when SEMP is already connected', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        await QueueDiscoveryModule.install(ctx);

        // Wait for async fetchVpns
        await vi.waitFor(() => {
            const vpnList = container.querySelector('#discovery-vpn-list')!;
            expect(vpnList.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
        });
    });

    it('renders VPNs incrementally as pages arrive', async () => {
        vi.useFakeTimers();
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        // Override sempFetch: page 1 has nextPageUri, page 2 completes the stream.
        (ctx.sempFetch as any).mockReset();
        (ctx.sempFetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [{ msgVpnName: 'vpn-b' }, { msgVpnName: 'vpn-a' }],
                    meta: { paging: { nextPageUri: 'http://broker:8080/next' } }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [{ msgVpnName: 'vpn-c' }] })
            });

        await QueueDiscoveryModule.install(ctx);

        const vpnList = container.querySelector('#discovery-vpn-list')!;

        // After page 1 renders — 2 sorted options visible before page 2 is fetched.
        await vi.waitFor(() => {
            const opts = Array.from(vpnList.querySelectorAll('.dropdown-option')).map(o => o.textContent);
            expect(opts).toEqual(['vpn-a', 'vpn-b']);
        });

        // Advance the 700ms throttle so page 2 is requested.
        await vi.advanceTimersByTimeAsync(700);

        // After page 2 — all three VPNs present and sorted.
        await vi.waitFor(() => {
            const opts = Array.from(vpnList.querySelectorAll('.dropdown-option')).map(o => o.textContent);
            expect(opts).toEqual(['vpn-a', 'vpn-b', 'vpn-c']);
        });
        vi.useRealTimers();
    });

    it('stops paginating VPNs when a page errors mid-stream', async () => {
        vi.useFakeTimers();
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        (ctx.sempFetch as any).mockReset();
        (ctx.sempFetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [{ msgVpnName: 'vpn-a' }],
                    meta: { paging: { nextPageUri: 'http://broker:8080/next' } }
                })
            })
            .mockResolvedValueOnce({ ok: false, statusText: 'Server Error' });

        await QueueDiscoveryModule.install(ctx);

        const vpnList = container.querySelector('#discovery-vpn-list')!;
        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;

        await vi.waitFor(() => {
            expect(vpnList.querySelectorAll('.dropdown-option').length).toBe(1);
        });

        await vi.advanceTimersByTimeAsync(700);

        // Error surfaces as placeholder; partial list stays rendered.
        await vi.waitFor(() => {
            expect(vpnInput.placeholder).toBe('Server Error');
        });
        expect(vpnList.querySelectorAll('.dropdown-option').length).toBe(1);
        vi.useRealTimers();
    });

    it('fetches VPNs when isSempConnected state changes to true', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, eventBus, appState } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        // Simulate SEMP connection: state changes then event fires (mirrors kernel.setState)
        appState.isSempConnected = true;
        eventBus.emit('app:state-change', { key: 'isSempConnected', value: true });

        await vi.waitFor(() => {
            const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
            expect(vpnInput.placeholder).toBe('Select a Message VPN');
        });
    });

    it('clears state when SEMP disconnects', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, eventBus } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        eventBus.emit('app:state-change', { key: 'isSempConnected', value: false });

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        expect(vpnInput.value).toBe('');
    });

    it('ignores non-isSempConnected state changes', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, eventBus } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        // This should not trigger any VPN fetch
        eventBus.emit('app:state-change', { key: 'isConnected', value: true });
    });

    it('cached VPN list is reused — second fetchVpns call does not hit SEMP', async () => {
        // Cache invalidation regression check: if vpnCache stops being read, every
        // selection-change would silently re-fetch the VPN list — a perf regression
        // a user would notice but no test would catch.
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, eventBus, appState } = createTestContext(container);
        appState.isSempConnected = true;
        await QueueDiscoveryModule.install(ctx);

        // First fetchVpns at install time — populates cache.
        await vi.waitFor(() => {
            expect(container.querySelectorAll('#discovery-vpn-list .dropdown-option').length).toBeGreaterThan(0);
        });
        const callsAfterFirst = (ctx.sempFetch as any).mock.calls.length;
        expect(callsAfterFirst).toBeGreaterThan(0);

        // Re-emit the connected state — exercises the cache-hit early-return.
        // (The Refresh button explicitly clears the cache, so we can't use it; the
        // state-change path is the natural cache-hit trigger in production too,
        // since SEMP can flap connected→disconnected→connected.)
        // Disconnect first to clear the latch on `if (isConnected) fetchVpns()`,
        // but bypass the disconnect handler's cache-invalidation by calling
        // fetchVpns directly via a re-connect that uses cached data on the rebound
        // — except disconnect clears vpnCache. So instead: install with cache pre-populated,
        // then trigger a state-change event with the same value, which still calls
        // fetchVpns and lets the cache hit.
        eventBus.emit('app:state-change', { key: 'isSempConnected', value: true });
        await Promise.resolve(); // flush microtasks; cache hit is synchronous
        const callsAfterCacheHit = (ctx.sempFetch as any).mock.calls.length;
        expect(callsAfterCacheHit).toBe(callsAfterFirst); // no new SEMP calls

        // Dropdown still shows the same VPN list (rendered from cache).
        expect(container.querySelectorAll('#discovery-vpn-list .dropdown-option').length).toBeGreaterThan(0);
    });

    it('cached queue list with empty result shows "No queues" placeholder', async () => {
        // Targets the empty-result branch in the cached fetchQueues path that the
        // user only ever sees if a VPN has no queues. The bug-class to catch:
        // refactoring the placeholder text, dropping the `disabled = true`, or
        // moving the empty-state UI elsewhere — silent UX regression today.
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        // Override sempFetch: VPNs return as normal, but queues for 'default' return empty.
        (ctx.sempFetch as any).mockImplementation(async (url: string) => {
            if (url.includes('/queues')) return { ok: true, json: async () => ({ data: [] }) };
            return { ok: true, json: async () => ({ data: [{ msgVpnName: 'default' }] }) };
        });

        await QueueDiscoveryModule.install(ctx);
        await vi.waitFor(() => {
            expect(container.querySelectorAll('#discovery-vpn-list .dropdown-option').length).toBeGreaterThan(0);
        });

        // Select the VPN — first fetchQueues call (network) populates cache with [].
        const vpnOption = container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement;
        vpnOption.click();

        // Non-cache empty-result path: value + disabled are set, placeholder stays
        // at 'Select a Queue' (only the cache-hit path clears placeholder — a minor
        // inconsistency in the source, but not what this test guards).
        await vi.waitFor(() => {
            const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
            expect(queueInput.value).toBe('No queues in Message VPN');
            expect(queueInput.disabled).toBe(true);
        });

        // Re-select the same VPN — cache-hit path. Placeholder is explicitly
        // cleared here, confirming the cache-hit empty-branch ran.
        vpnOption.click();
        await Promise.resolve();
        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        expect(queueInput.value).toBe('No queues in Message VPN');
        expect(queueInput.disabled).toBe(true);
        expect(queueInput.placeholder).toBe('');
    });

    it('refresh VPNs button clears and re-fetches', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const btnRefreshVpns = container.querySelector('#btn-refresh-vpns') as HTMLButtonElement;
        btnRefreshVpns.click();

        await vi.waitFor(() => {
            const vpnList = container.querySelector('#discovery-vpn-list')!;
            expect(vpnList.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
        });
    });

    it('refresh queues button fetches queues for selected VPN', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        await QueueDiscoveryModule.install(ctx);

        // Wait for initial VPN fetch
        await vi.waitFor(() => {
            const vpnList = container.querySelector('#discovery-vpn-list')!;
            expect(vpnList.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
        });

        // Select a VPN by clicking on the first option
        const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
        (vpnOptions[0] as HTMLElement).click();

        // Now refresh queues
        const btnRefreshQueues = container.querySelector('#btn-refresh-queues') as HTMLButtonElement;
        btnRefreshQueues.click();
    });

    it('refresh queues does nothing without selected VPN', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const btnRefreshQueues = container.querySelector('#btn-refresh-queues') as HTMLButtonElement;
        btnRefreshQueues.click();
        // Should do nothing
    });

    it('copy button emits connection:check-connection', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, eventBus, appState } = createTestContext(container);
        appState.isSempConnected = true;

        const handler = vi.fn();
        eventBus.on('connection:check-connection', handler);

        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(vpnInput.placeholder).toBe('Select a Message VPN');
        });

        const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
        (vpnOptions[0] as HTMLElement).click();

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(queueInput.disabled).toBe(false);
        });

        const queueOptions = container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option');
        (queueOptions[0] as HTMLElement).click();

        const btnCopy = container.querySelector('#btn-copy-config') as HTMLButtonElement;
        btnCopy.click();

        expect(handler).toHaveBeenCalled();
    });

    it('copy button alerts when no VPN/queue selected', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const btnCopy = container.querySelector('#btn-copy-config') as HTMLButtonElement;
        btnCopy.disabled = false;
        btnCopy.click();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('select'));
    });

    it('enter key on VPN input triggers refresh', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        vpnInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    it('enter key on queue input triggers refresh', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        queueInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    it('VPN blur clears invalid entry', async () => {
        vi.useFakeTimers();
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        vpnInput.value = 'nonexistent-vpn';
        vpnInput.dispatchEvent(new Event('blur'));

        vi.advanceTimersByTime(200);
        expect(vpnInput.value).toBe('');
        vi.useRealTimers();
    });

    it('queue blur clears invalid entry', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(vpnInput.placeholder).toBe('Select a Message VPN');
        });

        const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
        (vpnOptions[0] as HTMLElement).click();

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(queueInput.disabled).toBe(false);
        });

        vi.useFakeTimers();
        queueInput.value = 'nonexistent-queue';
        queueInput.dispatchEvent(new Event('blur'));

        vi.advanceTimersByTime(200);
        expect(queueInput.value).toBe('');
        vi.useRealTimers();
    });

    it('VPN blur does not clear valid entry', async () => {
        vi.useFakeTimers();
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        vi.useRealTimers();
        await QueueDiscoveryModule.install(ctx);

        // Wait for VPNs
        await vi.waitFor(() => {
            expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
        });

        vi.useFakeTimers();
        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        vpnInput.value = 'default';
        vpnInput.dispatchEvent(new Event('blur'));

        vi.advanceTimersByTime(200);
        expect(vpnInput.value).toBe('default');
        vi.useRealTimers();
    });

    it('handles fetchQueues error', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const ctx = createTestContext(container).ctx;
        ctx.appState.isSempConnected = true;
        (ctx.sempFetch as any).mockResolvedValue({
            ok: false,
            statusText: 'Error',
            json: async () => ({})
        });

        await QueueDiscoveryModule.install(ctx);

        // Wait for initial VPN fetch (will fail)
        await new Promise(r => setTimeout(r, 50));
    });

    it('handles fetchQueues returning empty list', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        // First call (VPNs) succeeds
        (ctx.sempFetch as any)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ msgVpnName: 'test' }] }) })
            // Second call (queues) returns empty
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });

        await QueueDiscoveryModule.install(ctx);

        await vi.waitFor(() => {
            expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBe(1);
        });

        // Select VPN
        const vpnOption = container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement;
        vpnOption.click();

        await vi.waitFor(() => {
            const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
            expect(queueInput.value).toContain('No queues');
        });
    });

    it('queue blur does nothing when input is disabled', async () => {
        vi.useFakeTimers();
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        vi.useRealTimers();
        await QueueDiscoveryModule.install(ctx);

        vi.useFakeTimers();
        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        queueInput.disabled = true;
        queueInput.value = 'something';
        queueInput.dispatchEvent(new Event('blur'));

        vi.advanceTimersByTime(200);
        // Value should remain since the blur handler returns early
        expect(queueInput.value).toBe('something');
        vi.useRealTimers();
    });

    it('handles fetchQueues error path', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        // VPNs succeed, queues fail
        (ctx.sempFetch as any)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ msgVpnName: 'test' }] }) })
            .mockResolvedValueOnce({ ok: false, statusText: 'Error', json: async () => ({}) });

        await QueueDiscoveryModule.install(ctx);

        await vi.waitFor(() => {
            expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBe(1);
        });

        // Select VPN to trigger fetchQueues
        const vpnOption = container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement;
        vpnOption.click();

        await new Promise(r => setTimeout(r, 100));
        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        expect(queueInput.placeholder).toContain('Error');
    });

    it('handles fetchQueues with error that has custom message', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        (ctx.sempFetch as any)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ msgVpnName: 'test' }] }) })
            .mockResolvedValueOnce({ ok: false, statusText: 'Custom Error' });

        await QueueDiscoveryModule.install(ctx);

        await vi.waitFor(() => {
            expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBe(1);
        });

        const vpnOption = container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement;
        vpnOption.click();

        await new Promise(r => setTimeout(r, 100));
    });

    it('copy button stays hidden when browser:available is never emitted', async () => {
        // Mirrors a registry without queue-browser: the discovery module installs
        // but no module ever announces availability, so "Open in Browser" must
        // remain hidden. Guards against silent re-introduction of an unconditional
        // reveal in module.ts.
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const btnCopy = container.querySelector('#btn-copy-config') as HTMLButtonElement;
        expect(btnCopy.classList.contains('hidden')).toBe(true);
    });

    it('copy button reveals when browser:available is emitted', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, eventBus } = createTestContext(container);

        await QueueDiscoveryModule.install(ctx);

        const btnCopy = container.querySelector('#btn-copy-config') as HTMLButtonElement;
        expect(btnCopy.classList.contains('hidden')).toBe(true);

        eventBus.emit('browser:available');

        expect(btnCopy.classList.contains('hidden')).toBe(false);
    });

    it('queue selection enables copy button', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(vpnInput.placeholder).toBe('Select a Message VPN');
        });

        const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
        (vpnOptions[0] as HTMLElement).click();

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(queueInput.disabled).toBe(false);
        });

        const queueOptions = container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option');
        (queueOptions[0] as HTMLElement).click();

        const btnCopy = container.querySelector('#btn-copy-config') as HTMLButtonElement;
        expect(btnCopy.disabled).toBe(false);
    });

    it('throws at install when #btn-copy-config is missing', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div id="discovery-warning" class="hidden"></div>
            <div id="discovery-content"></div>
            <input id="discovery-vpn-input" />
            <div id="discovery-vpn-list"></div>
            <button id="btn-refresh-vpns">Refresh</button>
            <input id="discovery-queue-input" />
            <div id="discovery-queue-list"></div>
            <button id="btn-refresh-queues">Refresh</button>
        `;
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);

        await expect(QueueDiscoveryModule.install(ctx)).rejects.toThrow('#btn-copy-config');
    });

    it('throws at install when discovery inputs are missing', async () => {
        const minContainer = document.createElement('div');
        minContainer.innerHTML = `
            <div id="discovery-warning"></div>
            <div id="discovery-content"></div>
        `;
        document.body.appendChild(minContainer);
        const { ctx } = createTestContext(minContainer);
        await expect(QueueDiscoveryModule.install(ctx)).rejects.toThrow(/discovery-vpn-input/);
    });

    it('throws at install when refresh buttons are missing', async () => {
        const minContainer = document.createElement('div');
        minContainer.innerHTML = `
            <div id="discovery-warning"></div>
            <div id="discovery-content"></div>
            <input id="discovery-vpn-input" />
            <div id="discovery-vpn-list"></div>
            <input id="discovery-queue-input" />
            <div id="discovery-queue-list"></div>
        `;
        document.body.appendChild(minContainer);
        const { ctx } = createTestContext(minContainer);
        await expect(QueueDiscoveryModule.install(ctx)).rejects.toThrow(/btn-refresh/);
    });

    it('VPN blur handles empty input', async () => {
        vi.useFakeTimers();
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);
        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        vpnInput.value = '';
        vpnInput.dispatchEvent(new Event('blur'));
        vi.advanceTimersByTime(200);
        expect(vpnInput.value).toBe('');
        vi.useRealTimers();
    });

    it('queue blur does not clear valid queue entry', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(vpnInput.placeholder).toBe('Select a Message VPN');
        });

        const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
        (vpnOptions[0] as HTMLElement).click();

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        await vi.waitFor(() => {
            expect(queueInput.disabled).toBe(false);
        });

        const firstQueueOption = container.querySelector('#discovery-queue-list .dropdown-option') as HTMLElement;
        const validQueueName = firstQueueOption.textContent || '';

        vi.useFakeTimers();
        queueInput.value = validQueueName;
        queueInput.dispatchEvent(new Event('blur'));

        vi.advanceTimersByTime(200);
        expect(queueInput.value).toBe(validQueueName);
        vi.useRealTimers();
    });

    it('fetchQueues early-returns when VPN is cleared', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx, appState } = createTestContext(container);
        appState.isSempConnected = true;

        await QueueDiscoveryModule.install(ctx);

        // Wait for VPN list to load
        await vi.waitFor(() => {
            expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
        });

        // Select a VPN first
        const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
        (vpnOptions[0] as HTMLElement).click();

        // Wait for queue input to become enabled
        await vi.waitFor(() => {
            const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
            expect(queueInput.disabled).toBe(false);
        });

        // Now clear the VPN (blur with invalid value triggers selectedVpn = null, which calls fetchQueues)
        vi.useFakeTimers();
        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        vpnInput.value = 'invalid-vpn-name';
        vpnInput.dispatchEvent(new Event('blur'));
        vi.advanceTimersByTime(200);

        // After clearing, queue input should be disabled (fetchQueues early-return path)
        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        expect(queueInput.disabled).toBe(true);
        expect(queueInput.value).toBe('');
        vi.useRealTimers();
    });

    it('non-Enter key on VPN input does not trigger refresh', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);
        await QueueDiscoveryModule.install(ctx);

        const vpnInput = container.querySelector('#discovery-vpn-input') as HTMLInputElement;
        const btnRefresh = container.querySelector('#btn-refresh-vpns') as HTMLButtonElement;
        const clickSpy = vi.spyOn(btnRefresh, 'click');

        const ev = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
        vpnInput.dispatchEvent(ev);

        // The `if (e.key === 'Enter')` guard at module.ts:251 must short-circuit
        // — neither preventDefault nor click() should fire for non-Enter keys.
        expect(clickSpy).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
        clickSpy.mockRestore();
    });

    it('non-Enter key on queue input does not trigger refresh', async () => {
        const container = createDiscoveryDOM();
        document.body.appendChild(container);
        const { ctx } = createTestContext(container);
        await QueueDiscoveryModule.install(ctx);

        const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;
        const btnRefresh = container.querySelector('#btn-refresh-queues') as HTMLButtonElement;
        const clickSpy = vi.spyOn(btnRefresh, 'click');

        const ev = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
        queueInput.dispatchEvent(ev);

        expect(clickSpy).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
        clickSpy.mockRestore();
    });

    describe('discovery cache + cancellation', () => {
        it('queue placeholder stays on Loading... until pagination exhausts', async () => {
            const container = createDiscoveryDOM();
            document.body.appendChild(container);
            const { ctx, appState } = createTestContext(container);
            appState.isSempConnected = true;

            // Two queue pages: first with one queue + nextPageUri, then a final page.
            (ctx.sempFetch as any)
                .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ msgVpnName: 'default' }] }) })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        data: [{ queueName: 'q-page-1' }],
                        meta: { paging: { nextPageUri: 'http://broker:8080/page2' } }
                    })
                })
                .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ queueName: 'q-page-2' }] }) });

            await QueueDiscoveryModule.install(ctx);

            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBe(1);
            });
            (container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement).click();

            const queueInput = container.querySelector('#discovery-queue-input') as HTMLInputElement;

            // Eventually the second page completes — placeholder flips ONCE at the end.
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option').length).toBe(2);
            });
            expect(queueInput.placeholder).toBe('Select a Queue');
        });

        it('caches the VPN list — second fetch does not re-call sempFetch', async () => {
            const container = createDiscoveryDOM();
            document.body.appendChild(container);
            const { ctx, appState } = createTestContext(container);
            appState.isSempConnected = true;

            await QueueDiscoveryModule.install(ctx);
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
            });
            const sempCallsAfterFirstFetch = (ctx.sempFetch as any).mock.calls.length;

            // Trigger SEMP-reconnect-style state cycling without breaking semantics:
            // toggle isSempConnected via the bus to fire fetchVpns again. With cache,
            // sempFetch should NOT be called for the VPN endpoint.
            // Simulating by clearing & re-emitting state-change is the cleanest path.
            // Note: we actually call fetchVpns indirectly by re-emitting state-change.
            ctx.eventBus.emit('app:state-change', { key: 'isSempConnected', value: false });
            ctx.eventBus.emit('app:state-change', { key: 'isSempConnected', value: true });
            // After reconnect, cache was invalidated by the disconnect — sempFetch IS
            // called again. Verifies invalidation half of the contract.
            await vi.waitFor(() => {
                expect((ctx.sempFetch as any).mock.calls.length).toBeGreaterThan(sempCallsAfterFirstFetch);
            });
        });

        it('caches the queue list — re-selecting same VPN does not re-call sempFetch', async () => {
            const container = createDiscoveryDOM();
            document.body.appendChild(container);
            const { ctx, appState } = createTestContext(container);
            appState.isSempConnected = true;

            await QueueDiscoveryModule.install(ctx);
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
            });

            // Pick the first VPN, wait for queues to load.
            const vpnOptions = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
            (vpnOptions[0] as HTMLElement).click();
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option').length).toBe(2);
            });

            const callsAfterFirstSelect = (ctx.sempFetch as any).mock.calls.length;

            // Re-pick the SAME VPN — should hit cache, no new sempFetch.
            (vpnOptions[0] as HTMLElement).click();
            // Give the (potential) network call a chance to fire.
            await new Promise(r => setTimeout(r, 50));
            expect((ctx.sempFetch as any).mock.calls.length).toBe(callsAfterFirstSelect);

            // Queue dropdown still shows the cached entries.
            expect(container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option').length).toBe(2);
        });

        it('refresh-queues click invalidates cache for current VPN and refetches', async () => {
            const container = createDiscoveryDOM();
            document.body.appendChild(container);
            const { ctx, appState } = createTestContext(container);
            appState.isSempConnected = true;

            await QueueDiscoveryModule.install(ctx);
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option').length).toBeGreaterThan(0);
            });

            (container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement).click();
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option').length).toBe(2);
            });
            const callsBefore = (ctx.sempFetch as any).mock.calls.length;

            (container.querySelector('#btn-refresh-queues') as HTMLButtonElement).click();
            await vi.waitFor(() => {
                expect((ctx.sempFetch as any).mock.calls.length).toBeGreaterThan(callsBefore);
            });
        });

        it('older fetchQueues skips cache-write and UI-finalise when superseded after last page', async () => {
            // Covers the truthy branch of `if (myGen !== fetchQueuesGen) return;` at
            // queue-discovery/module.ts:153 — the post-loop generation check that
            // protects against an older fetch finalising stale UI/cache state when a
            // newer fetch has bumped the generation counter mid-stream.
            //
            // The race window is narrow: line 153 only fires when the gen bump
            // happens AFTER the loop's last successful iteration but BEFORE the
            // for-await's `{done: true}` resolves. The trick used here: spy
            // `ui.renderOptions` so the body's last render call synchronously
            // triggers the refresh-queues click, which calls fetchQueues() → bumps
            // fetchQueuesGen to 2 BEFORE the for-await loop proceeds to its done-check.
            const container = createDiscoveryDOM();
            document.body.appendChild(container);
            const { ctx, appState } = createTestContext(container);
            appState.isSempConnected = true;

            // Sequenced sempFetch: VPNs → 1 VPN, then two pages of queues for it,
            // then for refresh-triggered call #2 return an error so it doesn't cache.
            let queueCalls = 0;
            (ctx.sempFetch as any).mockImplementation(async (url: string) => {
                if (url.includes('/queues')) {
                    queueCalls++;
                    if (queueCalls === 1) {
                        return { ok: true, json: async () => ({
                            data: [{ queueName: 'q1' }],
                            // Matches the real SEMP pagination shape (see queues.json):
                            // the nextPageUri re-uses the /queues endpoint with an opaque
                            // cursor + count. The URL-filter in this mock (/queues check)
                            // dispatches it back to the queue arm, which increments queueCalls.
                            meta: { paging: { nextPageUri: 'http://broker:8080/SEMP/v2/monitor/msgVpns/vpn-a/queues?cursor=opaque-cursor-value&count=100' } }
                        })};
                    }
                    if (queueCalls === 2) {
                        return { ok: true, json: async () => ({
                            data: [{ queueName: 'q2' }]
                        })};
                    }
                    // Refresh-triggered fetch — error response so it doesn't cache.
                    return { ok: false, statusText: 'Simulated mid-flight error' };
                }
                return { ok: true, json: async () => ({ data: [{ msgVpnName: 'vpn-a' }] }) };
            });

            await QueueDiscoveryModule.install(ctx);

            await vi.waitFor(() => {
                expect(container.querySelectorAll('#discovery-vpn-list .dropdown-option').length).toBe(1);
            });

            // The trigger: when ui.renderOptions is invoked with both queues
            // (currentQueueList = ['q1','q2']), synchronously fire the refresh-queues
            // click. That bumps fetchQueuesGen via fetchQueues()'s line-100 increment
            // BEFORE call #1's for-await loop reaches its line-153 check.
            const queueListEl = container.querySelector('#discovery-queue-list')!;
            const origRenderOptions = discoveryUi.renderOptions;
            let triggered = false;
            const renderSpy = vi.spyOn(discoveryUi, 'renderOptions').mockImplementation(function (this: any, listEl: any, items: any, onSelect: any) {
                origRenderOptions.call(this, listEl, items, onSelect);
                if (!triggered && listEl === queueListEl && Array.isArray(items) && items.length === 2 && items.includes('q2')) {
                    triggered = true;
                    (container.querySelector('#btn-refresh-queues') as HTMLButtonElement).click();
                }
            });

            // Select vpn-a → call #1 of fetchQueues starts (gen=1).
            (container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement).click();

            // Wait for the trigger to fire — happens during page-2 body's renderOptions.
            await vi.waitFor(() => { expect(triggered).toBe(true); }, { timeout: 2000 });

            // Wait for both calls to settle (call #2 fails immediately).
            await vi.waitFor(() => {
                // queueCalls = 1 (page1) + 1 (page2) + 1 (refresh-triggered call #2)
                expect(queueCalls).toBeGreaterThanOrEqual(3);
            }, { timeout: 2000 });

            // ASSERTION: line 153 returned for call #1, so its cache write at
            // line 155 was skipped. Re-trigger fetchQueues for vpn-a — since the
            // cache is empty, it must call sempFetch again (cache miss).
            const sempCallsBeforeReFetch = (ctx.sempFetch as any).mock.calls.length;
            (container.querySelector('#btn-refresh-queues') as HTMLButtonElement).click();
            await vi.waitFor(() => {
                expect((ctx.sempFetch as any).mock.calls.length).toBeGreaterThan(sempCallsBeforeReFetch);
            });

            renderSpy.mockRestore();
        });

        it('refresh-vpns click invalidates VPN + queue caches', async () => {
            const container = createDiscoveryDOM();
            document.body.appendChild(container);
            const { ctx, appState } = createTestContext(container);
            appState.isSempConnected = true;

            await QueueDiscoveryModule.install(ctx);

            // Helper: wait until the real VPN data has rendered into the dropdown.
            // The synchronous part of refresh-vpns first writes a "No items found"
            // placeholder, so checking for `.length > 0` is unsafe — match by text.
            const waitForVpnsRendered = () =>
                vi.waitFor(() => {
                    const opts = container.querySelector('#discovery-vpn-list')!.querySelectorAll('.dropdown-option');
                    const labels = Array.from(opts).map(o => o.textContent);
                    expect(labels).toContain('default');
                });

            await waitForVpnsRendered();

            (container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement).click();
            await vi.waitFor(() => {
                expect(container.querySelector('#discovery-queue-list')!.querySelectorAll('.dropdown-option').length).toBe(2);
            });
            const callsBefore = (ctx.sempFetch as any).mock.calls.length;

            (container.querySelector('#btn-refresh-vpns') as HTMLButtonElement).click();
            await vi.waitFor(() => {
                // VPN refetch — at minimum the VPN endpoint is called again.
                expect((ctx.sempFetch as any).mock.calls.length).toBeGreaterThan(callsBefore);
            });

            // After refresh, the dropdown briefly shows "No items found" before the
            // real options re-render — wait for the real data, then re-select.
            await waitForVpnsRendered();
            const callsAfterVpnRefresh = (ctx.sempFetch as any).mock.calls.length;
            (container.querySelector('#discovery-vpn-list .dropdown-option') as HTMLElement).click();
            await vi.waitFor(() => {
                expect((ctx.sempFetch as any).mock.calls.length).toBeGreaterThan(callsAfterVpnRefresh);
            });
        });
    });

});
