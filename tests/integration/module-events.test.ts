/**
 * Integration Tests — Cross-Module Event Scenarios
 *
 * Each test installs real module(s) with a shared EventBus and AppContext,
 * then asserts the event-driven reactions across module boundaries. Service
 * I/O is mocked via vi.mock so tests stay deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../../src/core/event-bus';
import { loadModuleDOM } from '../helpers/loadModuleDOM';
import type { AppContext, AppState } from '../../src/core/types';

// ---- Service mocks (hoisted) ----

const mockCreateBrowser = vi.fn();
const mockDisconnectBrowser = vi.fn();
const mockDisconnectAll = vi.fn();
const mockForwardMessage = vi.fn();
const mockDeleteMessages = vi.fn();

const mockFetchVpns = vi.fn();
const mockFetchQueues = vi.fn();

const mockSolaceInit = vi.fn();
const mockSolaceConnect = vi.fn();
const mockSolaceDisconnect = vi.fn();
const mockSolaceCleanup = vi.fn();

const mockSempConnect = vi.fn();
const mockSempDisconnect = vi.fn();

vi.mock('../../src/modules/queue-browser/service.js', () => ({
    createService: () => ({
        createBrowser: mockCreateBrowser,
        disconnectBrowser: mockDisconnectBrowser,
        disconnectAll: mockDisconnectAll,
        forwardMessage: mockForwardMessage,
        deleteMessages: mockDeleteMessages,
    })
}));

vi.mock('../../src/modules/queue-discovery/service.js', () => ({
    createService: () => ({
        fetchVpns: mockFetchVpns,
        fetchQueues: mockFetchQueues,
    })
}));

vi.mock('../../src/core/services/solace-client', () => ({
    // Factory signature changed from (ctx) to (hooks) in Stage B. The hooks
    // object is captured but not invoked here — integration tests assert on
    // cross-module events (emitted by connections module's bridging code),
    // not on factory-internal SDK wiring. Hooks are exercised in
    // tests/core/services/solace-client.test.ts and the bridging is
    // verified in tests/modules/connections/module.test.ts.
    createServiceSolace: () => ({
        init: mockSolaceInit,
        connect: mockSolaceConnect,
        disconnect: mockSolaceDisconnect,
        cleanup: mockSolaceCleanup,
    })
}));

vi.mock('../../src/core/services/semp-client', () => ({
    createServiceSemp: () => ({
        connect: mockSempConnect,
        disconnect: mockSempDisconnect,
    })
}));

// ---- Imports AFTER vi.mock declarations ----
import { ConnectionsModule } from '../../src/modules/connections/module';
import { QueueBrowserModule } from '../../src/modules/queue-browser/module';
import { QueueDiscoveryModule } from '../../src/modules/queue-discovery/module';
import { state, ingestMessage } from '../../src/modules/queue-browser/state.js';
import { resetQueueBrowserState } from '../helpers/resetQueueBrowserState';

// ---- Helpers ----

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false
    };
    const ctx: AppContext = {
        container: document.createElement('div'),
        appState,
        eventBus,
        setState: vi.fn((key: keyof AppState, value: any) => {
            (appState as any)[key] = value;
            eventBus.emit('app:state-change', { key, value });
        }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: { useMocks: false },
        ...overrides
    };
    return ctx;
}

describe('Integration: module cross-talk', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mockCreateBrowser.mockReset().mockReturnValue({ ok: true });
        mockDisconnectBrowser.mockReset();
        mockDisconnectAll.mockReset();
        mockForwardMessage.mockReset();
        mockDeleteMessages.mockReset();
        mockFetchVpns.mockReset();
        mockFetchQueues.mockReset();
        mockSolaceInit.mockReset();
        mockSolaceConnect.mockReset();
        mockSolaceDisconnect.mockReset();
        mockSolaceCleanup.mockReset();
        mockSempConnect.mockReset();
        mockSempDisconnect.mockReset();

        resetQueueBrowserState();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Scenario #2 — Discover → Browse flow', () => {
        it('connection:check-connection on same VPN emits browser:browse-queue → bind fires', async () => {
            vi.useFakeTimers();

            const ctx = makeCtx();
            // Pre-set connected state so Connections takes the synchronous path.
            // The handler only checks isConnected + els.elSolVpn.value (set below).
            ctx.appState.isConnected = true;

            const connContainer = loadModuleDOM('connections');
            await ConnectionsModule.install({ ...ctx, container: connContainer });

            const browserContainer = loadModuleDOM('queue-browser');
            await QueueBrowserModule.install({ ...ctx, container: browserContainer });

            // Match the VPN the handler will compare against — el.value is what
            // the sync-path guard checks, not appState.selectedVpn.
            const vpnInput = connContainer.querySelector<HTMLInputElement>('#solace-vpn')!;
            vpnInput.value = 'test-vpn';

            ctx.eventBus.emit('connection:check-connection', { vpn: 'test-vpn', queue: 'test-queue-1' });

            // QueueBrowser handler uses setTimeout(200) before clicking bind.
            await vi.advanceTimersByTimeAsync(200);

            // loadSelf IS called once on this path, but by queue-browser's own
            // `browser:browse-queue` handler (to bring itself to the foreground),
            // not by connections. The connections-side same-VPN-no-navigate
            // contract is locked separately in tests/modules/connections/module.test.ts
            // ("handles connection:check-connection when connected same VPN").
            expect(ctx.loadSelf).toHaveBeenCalledTimes(1);
            const bindInput = browserContainer.querySelector<HTMLInputElement>('#browser-bind-input')!;
            expect(bindInput.value).toBe('test-queue-1');
            expect(mockCreateBrowser).toHaveBeenCalledWith('test-queue-1');

            vi.useRealTimers();
        });
    });

    describe('Scenario #3 — config:max-messages-changed caps ingest', () => {
        it('cap set at connect-time bounds subsequent ingestMessage arrivals', async () => {
            // In real use, config:max-messages-changed only fires from Connections
            // at Connect click time — before any browser is bound and before any
            // messages arrive. This test mirrors that ordering: emit the cap first,
            // THEN prime the store and ingest. The cap takes effect because
            // ingestMessage reads state.maxMessagesPerQueue on every arrival.
            const ctx = makeCtx();

            const browserContainer = loadModuleDOM('queue-browser');
            await QueueBrowserModule.install({ ...ctx, container: browserContainer });

            ctx.eventBus.emit('config:max-messages-changed', { value: 5 });
            expect(state.maxMessagesPerQueue).toBe(5);

            state.messageStore.set('test-queue-1', []);
            state.currentQueue = 'test-queue-1';
            state.allMessages = state.messageStore.get('test-queue-1')!;

            for (let i = 0; i < 6; i++) {
                ingestMessage('test-queue-1', { id: `msg-${i}`, content: `body-${i}` });
            }

            const store = state.messageStore.get('test-queue-1')!;
            expect(store.length).toBe(5);
            expect(store[0].id).toBe('msg-1'); // msg-0 shifted out
            expect(store[4].id).toBe('msg-5');
        });
    });

    describe('Scenario #4 — client:disconnected triggers disconnectAll', () => {
        it('client:disconnected calls disconnectAll', async () => {
            // Post-publisher-lift, the explicit forward-queue sweep was removed
            // from queue-browser/module.ts: in-flight forward promises are
            // resolved by publisher.dispose('Client disconnected.') inside
            // service.ts, and the .then handler in ui-events.handleForwardSend
            // calls ui.updateForwardItemStatus with the disposal reason. That
            // end-to-end flow is covered by tests/core/services/solace-publisher
            // ("dispose() — honors a caller-supplied reason") and the
            // queue-browser service test ("disposes the prior publisher…").
            // Here we only verify the cross-module hand-off: disconnectAll
            // fires once on client:disconnected.
            const ctx = makeCtx();

            const browserContainer = loadModuleDOM('queue-browser');
            await QueueBrowserModule.install({ ...ctx, container: browserContainer });

            ctx.eventBus.emit('client:disconnected');

            expect(mockDisconnectAll).toHaveBeenCalledTimes(1);
        });
    });

    describe('Scenario #6 — SEMP disconnect resets QueueDiscovery UI', () => {
        it('setState(isSempConnected=false) hides content, shows warning, clears VPN input', async () => {
            // fetchVpns runs on install when isSempConnected=true — give it a valid
            // empty async iterable so the install path doesn't explode.
            mockFetchVpns.mockImplementation(async function* () {});

            const ctx = makeCtx();
            ctx.appState.isSempConnected = true;

            const discoveryContainer = loadModuleDOM('queue-discovery');
            await QueueDiscoveryModule.install({ ...ctx, container: discoveryContainer });

            // Seed each input/button to a non-default state so the reset is observable.
            const vpnInput = discoveryContainer.querySelector<HTMLInputElement>('#discovery-vpn-input')!;
            const queueInput = discoveryContainer.querySelector<HTMLInputElement>('#discovery-queue-input')!;
            const btnCopy = discoveryContainer.querySelector<HTMLButtonElement>('#btn-copy-config')!;
            const warning = discoveryContainer.querySelector<HTMLElement>('#discovery-warning')!;
            const content = discoveryContainer.querySelector<HTMLElement>('#discovery-content')!;

            vpnInput.value = 'some-vpn';
            queueInput.value = 'some-queue';
            queueInput.disabled = false;
            btnCopy.disabled = false;

            // Simulate Kernel.sempFetch's 401 path: it calls appSetState which emits
            // app:state-change. Our makeCtx wires setState to emit that event.
            ctx.setState('isSempConnected', false);

            expect(warning.classList.contains('hidden')).toBe(false);
            expect(content.classList.contains('hidden')).toBe(true);
            expect(vpnInput.value).toBe('');
            expect(queueInput.value).toBe('');
            expect(queueInput.disabled).toBe(true);
            expect(btnCopy.disabled).toBe(true);
        });
    });
});
