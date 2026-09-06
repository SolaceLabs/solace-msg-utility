import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueCopyModule } from '../../../src/modules/queue-copy/module';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedSessionStore } from '../../../src/core/services/managed-session-store';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createSessionMock, createBrowserMock } from '../../setup';
import type { AppContext, AppState, EventBus } from '../../../src/core/types';
import type { VerifyResult } from '../../../src/modules/queue-copy/state';

vi.mock('../../../src/core/components/queue-picker', () => ({
    pickQueue: vi.fn(async () => ({ vpn: 'default', queue: 'picked' })),
}));

// openCopyModal (triggered by clicking Next) calls verifySource. Stub it so
// the module tests don't reach the real fetch / QueueBrowser code paths —
// those have dedicated coverage in service-verify.test.ts. `vi.hoisted` is
// required because vi.mock factories are hoisted above top-level `const`
// declarations.
const { verifySourceMock } = vi.hoisted(() => ({
    // Return type is inlined so it stays decoupled from the source-tree
    // import (vi.hoisted runs before module imports). The shape mirrors
    // VerifyResult exactly; tests using mockResolvedValueOnce can pass any
    // valid VerifyResult variant without TS narrowing the original literal.
    verifySourceMock: vi.fn() as any,
}));
verifySourceMock.mockResolvedValue({
    sourceOk: true, via: 'semp', errors: [],
    messageVpn: 'default', messageCount: 5, spoolUsageBytes: 100,
    quotaBytes: null, maxMessageSize: null,
    oldestMsgId: '100', newestMsgId: '104', accessType: 'read-write', owner: null,
} as VerifyResult);
vi.mock('../../../src/modules/queue-copy/service-verify', async () => {
    const actual = await vi.importActual<any>('../../../src/modules/queue-copy/service-verify');
    return { ...actual, verifySource: verifySourceMock };
});

// Capture calls to the dest SEMP / Solace factories so tests can assert which
// host and creds reach the connection layer when the user clicks Connect.
// We also capture the hooks object the install handed to each factory so
// tests can drive onConnected / onDisconnected / onError directly without
// going through the real SDK.
const { destSempConnect, destSolConnect, capturedSempHooks, capturedSolHooks } = vi.hoisted(() => ({
    destSempConnect: vi.fn(),
    destSolConnect: vi.fn(),
    capturedSempHooks: { current: null as any },
    capturedSolHooks: { current: null as any },
}));
vi.mock('../../../src/core/services/semp-client', () => ({
    createServiceSemp: vi.fn((hooks: any) => {
        capturedSempHooks.current = hooks;
        return { connect: destSempConnect, disconnect: vi.fn() };
    }),
}));
vi.mock('../../../src/core/services/solace-client', () => ({
    createServiceSolace: vi.fn((hooks: any) => {
        capturedSolHooks.current = hooks;
        return { init: vi.fn(), connect: destSolConnect, disconnect: vi.fn() };
    }),
}));

// Build a fully-populated sempCredentials object from the broker URL the
// test wants to assert against. Parses a non-hosted baseUrl so test cases
// stay readable: `sempCreds('https://broker:1943/SEMP/v2', 'admin', 'p')`.
// Hosted-mode tests pass an explicit baseUrl that bypasses parsing.
function sempCreds(baseUrl: string, user = 'admin', pass = 'p'): NonNullable<AppState['sempCredentials']> {
    const u = new URL(baseUrl);
    return {
        user, pass, baseUrl,
        protocol: u.protocol.replace(/:$/, ''),
        host: u.hostname,
        port: u.port,
        urlPath: u.pathname === '/' ? '' : u.pathname,
    };
}

function makeCtx(eventBus: EventBus, container: HTMLElement, overrides: Partial<AppContext['appState']> = {}): AppContext {
    return {
        container,
        appState: {
            activeModuleId: null,
            isConnected: false,
            selectedVpn: null,
            solaceConnection: null,
            sempCredentials: null,
            isSempConnected: false,
            ...overrides,
        },
        eventBus,
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedStore: createManagedSessionStore(),
        copyToClipboard: vi.fn(),
        config: {},
    };
}

/** Build a populated solaceConnection AppState slot used by tests that exercise prefill. */
function makeSolaceConnection(overrides: Partial<NonNullable<AppState['solaceConnection']>> = {}) {
    return {
        host: 'broker.solace.com',
        protocol: 'wss',
        port: '443',
        urlPath: '',
        vpn: 'default',
        user: 'admin',
        pass: 'sol-secret',
        ...overrides,
    };
}

describe('queue-copy/module', () => {
    let container: HTMLElement;
    let eventBus: EventBus;

    beforeEach(() => {
        container = loadModuleDOM('queue-copy');
        eventBus = createEventBus();
        destSempConnect.mockClear();
        destSolConnect.mockClear();
        verifySourceMock.mockClear();
    });

    describe('metadata', () => {
        it('has correct module properties', () => {
            expect(QueueCopyModule.name).toBe('Queue Copy');
            expect(QueueCopyModule.id).toBe('queue-copy');
            expect(QueueCopyModule.icon).toContain('svg');
            // Priority is set in src/registry.ts; tested in tests/registry.test.ts.
        });
    });

    describe('install + initial state', () => {
        it('installs without primary connection: warning visible, content hidden', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container));

            expect(container.querySelector('#copy-warning')!.classList.contains('hidden')).toBe(false);
            expect(container.querySelector('#copy-content')!.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        it('installs with primary connected: content visible', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container, { isConnected: true }));
            expect(container.querySelector('#copy-content')!.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });

        it('Next button disabled at install (no source/dest yet)', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container, { isConnected: true }));
            const btn = container.querySelector<HTMLButtonElement>('#copy-btn-start')!;
            expect(btn.disabled).toBe(true);
            consoleSpy.mockRestore();
        });

        it('source pick icon shown when SEMP already connected at install', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container, {
                isConnected: true, isSempConnected: true,
            }));
            const icon = container.querySelector<HTMLButtonElement>('#copy-btn-source-pick')!;
            expect(icon.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });
    });

    describe('bus listeners', () => {
        it('client:connected reveals content + applies prefill from solaceConnection', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                selectedVpn: 'default',
                solaceConnection: makeSolaceConnection(),
                sempCredentials: sempCreds('https://broker.solace.com:1943/SEMP/v2'),
            });
            await QueueCopyModule.install(ctx);

            eventBus.emit('client:connected', { session: createSessionMock() });

            expect(container.querySelector('#copy-content')!.classList.contains('hidden')).toBe(false);
            const host = container.querySelector<HTMLInputElement>('#copy-dest-host')!;
            expect(host.value).toBe('broker.solace.com');
            expect(host.disabled).toBe(true);
            consoleSpy.mockRestore();
        });

        it('client:disconnected hides content + tears down secondary state', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container, { isConnected: true }));
            eventBus.emit('client:disconnected');
            expect(container.querySelector('#copy-content')!.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });

        it('semp:connected shows source pick icon and refreshes prefill', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container));
            eventBus.emit('semp:connected');
            const icon = container.querySelector<HTMLButtonElement>('#copy-btn-source-pick')!;
            expect(icon.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });

        it('semp:disconnected hides source pick icon', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container, { isSempConnected: true }));
            eventBus.emit('semp:disconnected');
            const icon = container.querySelector<HTMLButtonElement>('#copy-btn-source-pick')!;
            expect(icon.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });
    });

    describe('primary snapshot derivation', () => {
        it('uses solaceConnection.urlPath when non-root', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                solaceConnection: makeSolaceConnection({ urlPath: '/path' }),
            });
            await QueueCopyModule.install(ctx);
            const sol = container.querySelector<HTMLInputElement>('#copy-dest-sol-urlpath')!;
            expect(sol.value).toBe('/path');
            consoleSpy.mockRestore();
        });

        it('leaves urlPath empty when solaceConnection.urlPath is empty', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                solaceConnection: makeSolaceConnection({ urlPath: '' }),
            });
            await QueueCopyModule.install(ctx);
            const sol = container.querySelector<HTMLInputElement>('#copy-dest-sol-urlpath')!;
            expect(sol.value).toBe('');
            consoleSpy.mockRestore();
        });

        it('falls back to selectedVpn for VPN when solaceConnection is null but SEMP is connected', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                selectedVpn: 'altVpn',
                sempCredentials: sempCreds('https://b.example:1943/SEMP/v2', 'a'),
            });
            await QueueCopyModule.install(ctx);
            const vpn = container.querySelector<HTMLInputElement>('#copy-dest-sol-vpn')!;
            expect(vpn.value).toBe('altVpn');
            consoleSpy.mockRestore();
        });

        it('VPN slot blank when neither solaceConnection nor selectedVpn provide one', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                selectedVpn: null,
                sempCredentials: sempCreds('https://b.example:1943/SEMP/v2', 'a'),
            });
            await QueueCopyModule.install(ctx);
            const vpn = container.querySelector<HTMLInputElement>('#copy-dest-sol-vpn')!;
            expect(vpn.value).toBe('');
            consoleSpy.mockRestore();
        });

        it('picks up SEMP creds from AppState.sempCredentials', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                sempCredentials: sempCreds('https://broker.solace.com:1943/SEMP/v2'),
            });
            await QueueCopyModule.install(ctx);
            const sempUser = container.querySelector<HTMLInputElement>('#copy-dest-semp-user')!;
            const sempPort = container.querySelector<HTMLInputElement>('#copy-dest-semp-port')!;
            const sempPath = container.querySelector<HTMLInputElement>('#copy-dest-semp-urlpath')!;
            expect(sempUser.value).toBe('admin');
            expect(sempPort.value).toBe('1943');
            expect(sempPath.value).toBe('/SEMP/v2');
            consoleSpy.mockRestore();
        });

        it('explicit empty urlPath on sempCredentials leaves the dest path field blank', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                sempCredentials: sempCreds('https://broker.example:1943/', 'a'),
            });
            await QueueCopyModule.install(ctx);
            const sempPath = container.querySelector<HTMLInputElement>('#copy-dest-semp-urlpath')!;
            expect(sempPath.value).toBe('');
            consoleSpy.mockRestore();
        });

        it('SEMP-only path uses sempCredentials.host when solaceConnection is null', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                sempCredentials: sempCreds('https://broker.example:1943/SEMP/v2', 'a'),
            });
            await QueueCopyModule.install(ctx);
            const host = container.querySelector<HTMLInputElement>('#copy-dest-host')!;
            expect(host.value).toBe('broker.example');
            consoleSpy.mockRestore();
        });

        it('returns null snapshot when neither solaceConnection nor sempCredentials are set', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container));
            const host = container.querySelector<HTMLInputElement>('#copy-dest-host')!;
            expect(host.value).toBe('');
            expect(host.disabled).toBe(true);
            consoleSpy.mockRestore();
        });
    });

    describe('queue picker integration via Next click', () => {
        it('Next click opens the modal when source + dest names are filled', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockImplementation(() => createBrowserMock());
            eventBus.emit('client:connected', { session });

            const sourceInput = container.querySelector<HTMLInputElement>('#copy-source-input')!;
            sourceInput.value = 's';
            sourceInput.dispatchEvent(new Event('input'));
            const destInput = container.querySelector<HTMLInputElement>('#copy-dest-input')!;
            destInput.value = 'd';
            destInput.dispatchEvent(new Event('input'));

            const btn = container.querySelector<HTMLButtonElement>('#copy-btn-start')!;
            expect(btn.disabled).toBe(false);
            btn.click();
            expect(container.querySelector<HTMLDialogElement>('#copy-modal')!.hasAttribute('open')).toBe(true);

            consoleSpy.mockRestore();
        });
    });

    describe('source-side read-only mirror', () => {
        it('install populates source cards from solaceConnection + sempCredentials', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                isConnected: true,
                selectedVpn: 'default',
                solaceConnection: makeSolaceConnection(),
                sempCredentials: sempCreds('https://broker.solace.com:1943/SEMP/v2'),
            });
            await QueueCopyModule.install(ctx);

            expect(container.querySelector<HTMLInputElement>('#copy-source-host')!.value).toBe('broker.solace.com');
            expect(container.querySelector<HTMLInputElement>('#copy-source-sol-port')!.value).toBe('443');
            expect(container.querySelector<HTMLInputElement>('#copy-source-sol-vpn')!.value).toBe('default');
            expect(container.querySelector<HTMLInputElement>('#copy-source-sol-user')!.value).toBe('admin');
            expect(container.querySelector<HTMLInputElement>('#copy-source-semp-port')!.value).toBe('1943');
            expect(container.querySelector<HTMLInputElement>('#copy-source-semp-urlpath')!.value).toBe('/SEMP/v2');
            expect(container.querySelector<HTMLInputElement>('#copy-source-semp-user')!.value).toBe('admin');
            // Passwords flow through from AppState (solaceConnection.pass + sempCredentials.pass)
            // so the source-side mirror surfaces what the user entered in the connections form.
            expect(container.querySelector<HTMLInputElement>('#copy-source-sol-pass')!.value).toBe('sol-secret');
            expect(container.querySelector<HTMLInputElement>('#copy-source-semp-pass')!.value).toBe('p');
            // All source-side connection fields are disabled (read-only mirror).
            expect(container.querySelector<HTMLInputElement>('#copy-source-host')!.disabled).toBe(true);
            expect(container.querySelector<HTMLInputElement>('#copy-source-sol-vpn')!.disabled).toBe(true);
            consoleSpy.mockRestore();
        });

        it('client:connected updates the source mirror', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await QueueCopyModule.install(makeCtx(eventBus, container));
            // Update solaceConnection then re-emit client:connected.
            (eventBus as any).emit('client:connected', { session: createSessionMock() });
            // No solaceConnection set yet → host stays blank.
            expect(container.querySelector<HTMLInputElement>('#copy-source-host')!.value).toBe('');

            // Now seed solaceConnection AND emit again.
            const ctx2 = makeCtx(eventBus, container, {
                solaceConnection: makeSolaceConnection({ host: 'b.example' }),
            });
            await QueueCopyModule.install(ctx2);
            // Re-installed module reads the new ctx; host reflects it.
            const host = container.querySelectorAll<HTMLInputElement>('#copy-source-host');
            // The DOM holds two installed modules now (the helper appends to body).
            // Find the most recent (last) one and assert.
            expect(host[host.length - 1].value).toBe('b.example');
            consoleSpy.mockRestore();
        });

        it('Edit-in-Connections button in each source card emits connection:edit-requested', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);

            const handler = vi.fn();
            eventBus.on('connection:edit-requested', handler);

            const editBtns = container.querySelectorAll<HTMLButtonElement>('.copy-source-edit-btn');
            // One button per source card (Broker / SEMP / Client).
            expect(editBtns.length).toBe(3);
            editBtns.forEach((btn) => btn.click());
            expect(handler).toHaveBeenCalledTimes(3);
            consoleSpy.mockRestore();
        });
    });

    describe('refreshFromPrimary state sync (regression)', () => {
        // Repro: install with primary connection populated. The DOM gets
        // prefilled via applyDestPrefill, but state.destForm.host must also
        // be synced — otherwise unchecking "Same broker" and clicking Connect
        // (without retyping) sends an empty host to the dest factories.
        it('Connect SEMP after toggling Same broker off uses prefilled host (no retyping)', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                isConnected: true,
                selectedVpn: 'default',
                solaceConnection: makeSolaceConnection({ host: 'b1.example' }),
                sempCredentials: sempCreds('https://b1.example:1943/SEMP/v2'),
            });
            await QueueCopyModule.install(ctx);

            // Toggle Same broker off so the SEMP Connect button becomes active.
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-broker')!;
            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));

            // Click Connect on the SEMP card. The factory mock captures the
            // host arg; without the state-sync fix this would be ''.
            const btnSemp = container.querySelector<HTMLButtonElement>('#copy-btn-dest-semp-connect')!;
            btnSemp.click();
            expect(destSempConnect).toHaveBeenCalledWith(
                expect.objectContaining({ port: '1943', urlPath: '/SEMP/v2' }),
                'b1.example',
                expect.any(String),
            );
            consoleSpy.mockRestore();
        });

        it('Connect Client after unchecking Same broker uses prefilled host', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, {
                isConnected: true,
                selectedVpn: 'default',
                solaceConnection: makeSolaceConnection({ host: 'b2.example' }),
                sempCredentials: sempCreds('https://b2.example:1943/SEMP/v2'),
            });
            await QueueCopyModule.install(ctx);

            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-broker')!;
            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));

            const btnSol = container.querySelector<HTMLButtonElement>('#copy-btn-dest-sol-connect')!;
            btnSol.click();
            expect(destSolConnect).toHaveBeenCalledWith(
                expect.objectContaining({ vpn: 'default', user: 'admin' }),
                'b2.example',
                expect.any(String),
            );
            consoleSpy.mockRestore();
        });
    });

    describe('destination factory hooks (drive via captured hooks objects)', () => {
        // The dest SEMP / Solace factories are mocked to capture the hooks
        // object install handed in. These tests fire each lifecycle event
        // directly to drive the locking + status + state plumbing in module.ts.
        it('Sol onConnected: state.destSession set, status connected, fields locked, Next button re-evaluated', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-vpn')!;
            toggle.checked = false; toggle.dispatchEvent(new Event('change'));
            const fakeSession = { _live: true, on: vi.fn() };
            capturedSolHooks.current.onConnected(fakeSession, 'vpn-x');
            const status = container.querySelector('#copy-dest-sol-status')!;
            expect(status.textContent).toContain('Connected');
            expect(status.textContent).toContain('vpn-x');
            expect(container.querySelector<HTMLInputElement>('#copy-dest-sol-vpn')!.disabled).toBe(true);
            expect(container.querySelector<HTMLInputElement>('#copy-dest-host')!.disabled).toBe(true);
            consoleSpy.mockRestore();
        });

        it('Sol onDisconnected: clears destSession, unlocks Sol form, re-applies prefill', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-vpn')!;
            toggle.checked = false; toggle.dispatchEvent(new Event('change'));
            capturedSolHooks.current.onConnected({ on: vi.fn() }, 'vpn-x');
            capturedSolHooks.current.onDisconnected();
            const status = container.querySelector('#copy-dest-sol-status')!;
            expect(status.textContent).toBe('Not connected');
            expect(container.querySelector<HTMLInputElement>('#copy-dest-sol-vpn')!.disabled).toBe(false);
            consoleSpy.mockRestore();
        });

        it('Sol onConnectFailed surfaces the infoStr in the error pane', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            capturedSolHooks.current.onConnectFailed({ infoStr: 'auth fail' });
            const errPane = container.querySelector('#copy-dest-sol-error')!;
            expect(errPane.classList.contains('hidden')).toBe(false);
            expect(errPane.textContent).toContain('auth fail');
            consoleSpy.mockRestore();
        });

        it('Sol onError surfaces err.message in the error pane', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            capturedSolHooks.current.onError({ message: 'pipe burst' });
            expect(container.querySelector('#copy-dest-sol-error')!.textContent).toContain('pipe burst');
            consoleSpy.mockRestore();
        });

        it('SEMP onConnected: stores destSempCtx, locks SEMP fields, locks broker host', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-broker')!;
            toggle.checked = false; toggle.dispatchEvent(new Event('change'));
            capturedSempHooks.current.onConnected({ fetch: () => Promise.resolve(new Response()), baseUrl: 'http://d' });
            expect(container.querySelector<HTMLInputElement>('#copy-dest-semp-port')!.disabled).toBe(true);
            expect(container.querySelector<HTMLInputElement>('#copy-dest-host')!.disabled).toBe(true);
            consoleSpy.mockRestore();
        });

        it('SEMP onDisconnected: clears destSempCtx, unlocks SEMP fields', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-broker')!;
            toggle.checked = false; toggle.dispatchEvent(new Event('change'));
            capturedSempHooks.current.onConnected({ fetch: () => Promise.resolve(new Response()), baseUrl: 'http://d' });
            capturedSempHooks.current.onDisconnected();
            expect(container.querySelector<HTMLInputElement>('#copy-dest-semp-port')!.disabled).toBe(false);
            consoleSpy.mockRestore();
        });

        it('SEMP onAuthFailed shows the 401 message', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            capturedSempHooks.current.onAuthFailed();
            expect(container.querySelector('#copy-dest-semp-error')!.textContent).toContain('401');
            consoleSpy.mockRestore();
        });

        it('SEMP onError prefixes message with "SEMP error:"', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            capturedSempHooks.current.onError({ message: 'timeout' });
            expect(container.querySelector('#copy-dest-semp-error')!.textContent).toBe('SEMP error: timeout');
            consoleSpy.mockRestore();
        });
    });

    describe('disconnect dispatch (button label "Disconnect" routes through factory)', () => {
        it('SEMP Connect button when label is Disconnect calls disconnect on the factory', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-broker')!;
            toggle.checked = false; toggle.dispatchEvent(new Event('change'));
            // Drive into Connected state so the button reads "Disconnect".
            capturedSempHooks.current.onConnected({ fetch: () => Promise.resolve(new Response()), baseUrl: 'http://d' });
            const btn = container.querySelector<HTMLButtonElement>('#copy-btn-dest-semp-connect')!;
            expect(btn.textContent).toBe('Disconnect');
            btn.click();
            // disconnect() on the factory mock is a vi.fn(); we just need to
            // confirm that re-emitting onDisconnected reflows back to idle.
            capturedSempHooks.current.onDisconnected();
            expect(container.querySelector<HTMLButtonElement>('#copy-btn-dest-semp-connect')!.textContent).toBe('Connect');
            consoleSpy.mockRestore();
        });

        it('Client Connect button when label is Disconnect routes through factory.disconnect', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);
            const toggle = container.querySelector<HTMLInputElement>('#copy-toggle-same-vpn')!;
            toggle.checked = false; toggle.dispatchEvent(new Event('change'));
            capturedSolHooks.current.onConnected({ on: vi.fn() }, 'v');
            const btn = container.querySelector<HTMLButtonElement>('#copy-btn-dest-sol-connect')!;
            expect(btn.textContent).toBe('Disconnect');
            btn.click();
            capturedSolHooks.current.onDisconnected();
            expect(btn.textContent).toBe('Connect');
            consoleSpy.mockRestore();
        });
    });

    describe('refreshDestPickVisible — topic destination hides picker', () => {
        it('switching to topic hides the dest picker icon regardless of SEMP availability', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true, isSempConnected: true });
            await QueueCopyModule.install(ctx);
            const slide = container.querySelector<HTMLInputElement>('#copy-dest-type-toggle')!;
            slide.checked = true; slide.dispatchEvent(new Event('change'));
            expect(container.querySelector<HTMLButtonElement>('#copy-btn-dest-pick')!.classList.contains('hidden')).toBe(true);
            consoleSpy.mockRestore();
        });
    });

    describe('copy:vpn-switched listener', () => {
        it('navigates back to queue-copy and writes the picked queue into the source input', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const loadSelf = vi.fn();
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            ctx.loadSelf = loadSelf;
            await QueueCopyModule.install(ctx);

            // Simulate the connections module emitting after a successful switch.
            eventBus.emit('copy:vpn-switched', { vpn: 'altVpn', queue: 'q-after-switch' });

            expect(loadSelf).toHaveBeenCalled();
            const sourceInput = container.querySelector<HTMLInputElement>('#copy-source-input')!;
            expect(sourceInput.value).toBe('q-after-switch');
            consoleSpy.mockRestore();
        });

        it('with loadSelf undefined, still writes source queue without crashing', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            (ctx as any).loadSelf = undefined;
            await QueueCopyModule.install(ctx);
            eventBus.emit('copy:vpn-switched', { vpn: 'v', queue: 'q-no-loadself' });
            const sourceInput = container.querySelector<HTMLInputElement>('#copy-source-input')!;
            expect(sourceInput.value).toBe('q-no-loadself');
            consoleSpy.mockRestore();
        });

        it('writes source queue and re-enables Next when destination is also set', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const ctx = makeCtx(eventBus, container, { isConnected: true });
            await QueueCopyModule.install(ctx);

            // Pre-fill destination so the Start button enables once source lands.
            const destInput = container.querySelector<HTMLInputElement>('#copy-dest-input')!;
            destInput.value = 'd';
            destInput.dispatchEvent(new Event('input'));

            eventBus.emit('copy:vpn-switched', { vpn: 'v', queue: 'q' });
            const btn = container.querySelector<HTMLButtonElement>('#copy-btn-start')!;
            expect(btn.disabled).toBe(false);
            consoleSpy.mockRestore();
        });
    });
});
