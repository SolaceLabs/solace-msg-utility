import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionsModule } from '../../../src/modules/connections/module';
import { ui } from '../../../src/modules/connections/ui.js';
import { config } from '../../../src/modules/connections/config.js';
import { createEventBus } from '../../../src/core/event-bus';
import { INPUT_DEBOUNCE_MS } from '../../../src/core/timing';
import { isHosted, setHosted } from '../../../src/core/hosted';
import { createSolaceMock } from '../../setup';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus } from '../../../src/core/types';

function createConnectionsDOM() {
    // Load the real connections template so the test DOM matches what ships.
    return loadModuleDOM('connections');
}

function createTestContext(container: HTMLElement): { ctx: AppContext; eventBus: EventBus; appState: AppState } {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false
    };
    const ctx: AppContext = {
        container,
        appState,
        eventBus,
        setState: vi.fn((key: keyof AppState, value: any) => { (appState as any)[key] = value; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: { useMocks: false }
    };
    return { ctx, eventBus, appState };
}

describe('ConnectionsModule', () => {
    let container: HTMLElement;

    beforeEach(() => {
        const solaceMock = createSolaceMock();
        (window as any).solace = solaceMock;
        container = createConnectionsDOM();
        document.body.appendChild(container);
    });

    it('has correct metadata', () => {
        expect(ConnectionsModule.name).toBe('Connections');
        expect(ConnectionsModule.id).toBe('connections');
        expect(ConnectionsModule.icon).toContain('svg');
        // Priority is set in src/registry.ts; tested in tests/registry.test.ts.
    });

    it('loads saved config on install', async () => {
        const savedCfg = {
            host: 'saved.test',
            solace: { protocol: 'ws', port: '9090', vpn: 'saved-vpn', user: 'saved-user', authMode: 'basic' },
            semp: { protocol: 'https', port: '1234', user: 'semp-user' }
        };
        vi.spyOn(config, 'load').mockReturnValue(savedCfg);

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        expect(host.value).toBe('saved.test');
    });

    // applyConfig (module.ts:42, 44, 62) guards each top-level field individually
    // so a corrupted/partial localStorage blob — manual user edit, browser-extension
    // write, future cross-version migration — doesn't crash install with a TypeError
    // on `cfg.solace.protocol` etc. The two tests below exercise the falsy branches.
    it('applyConfig with sparse object (host only) does not throw on missing solace/semp', async () => {
        vi.spyOn(config, 'load').mockReturnValue({ host: 'broker.test' } as any);
        const port = container.querySelector('#solace-port') as HTMLInputElement;
        const sempUser = container.querySelector('#semp-username') as HTMLInputElement;
        const portBefore = port.value;
        const sempUserBefore = sempUser.value;

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        expect(host.value).toBe('broker.test');
        // The missing solace/semp branches were skipped — fields untouched.
        expect(port.value).toBe(portBefore);
        expect(sempUser.value).toBe(sempUserBefore);
    });

    it('applyConfig with sparse object (solace.vpn only) does not throw on missing host/semp', async () => {
        vi.spyOn(config, 'load').mockReturnValue({ solace: { vpn: 'sparse-vpn' } } as any);
        const host = container.querySelector('#conn-host') as HTMLInputElement;
        const sempUser = container.querySelector('#semp-username') as HTMLInputElement;
        const hostBefore = host.value;
        const sempUserBefore = sempUser.value;

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const vpn = container.querySelector('#solace-vpn') as HTMLInputElement;
        expect(vpn.value).toBe('sparse-vpn');
        // The missing host + semp branches were skipped — fields untouched.
        expect(host.value).toBe(hostBefore);
        expect(sempUser.value).toBe(sempUserBefore);
    });

    it('save button saves config to localStorage and shows a toast', async () => {
        // Ensure the toast container exists (injected by src/index.html in prod;
        // our module test DOM only has the connections template).
        if (!document.getElementById('toast-container')) {
            const c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
        btnSave.click();

        expect(localStorage.setItem).toHaveBeenCalled();
        const toast = document.querySelector('#toast-container .toast.toast--ok');
        expect(toast).not.toBeNull();
        expect(toast!.textContent).toMatch(/saved/i);
    });

    it('save button shows error toast when config.save returns false', async () => {
        if (!document.getElementById('toast-container')) {
            const c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }

        vi.spyOn(config, 'save').mockReturnValue(false);

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
        btnSave.click();

        const errorToast = document.querySelector('#toast-container .toast.toast--error');
        expect(errorToast).not.toBeNull();
        expect(errorToast!.textContent).toMatch(/failed/i);
        // No success toast should have been added.
        expect(document.querySelector('#toast-container .toast.toast--ok')).toBeNull();
    });

    describe('client name identifier validation', () => {
        // Closes COV-5: the >100-char branch and the save-button early-return
        // on invalid clientNameId are otherwise unexercised. A regression that
        // dropped either check would silently forward an over-length or
        // invalid identifier to the SDK, where it would fail late at connect
        // time with a generic broker error instead of the inline UI message.
        it('blocks save and shows inline error when clientNameId exceeds 100 characters', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            const errEl = container.querySelector('#solace-client-name-id-error') as HTMLElement;
            input.value = 'a'.repeat(101);

            const saveSpy = vi.spyOn(config, 'save');
            const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
            btnSave.click();

            expect(errEl.textContent).toBe('Must not exceed 100 characters.');
            expect(input.classList.contains('is-invalid')).toBe(true);
            // Early-return at the >100-char validation path must skip the save.
            expect(saveSpy).not.toHaveBeenCalled();
            saveSpy.mockRestore();
        });

        it('clears the is-invalid class and error text eagerly on the first input event after a failure', async () => {
            // Covers the truthy branch of the `classList.contains('is-invalid')`
            // guard at module.ts:275 — the user-facing "red border clears as
            // soon as I start correcting" behavior. The save-button >100-char
            // test above installs the invalid state; this test installs it
            // via blur (the second site that adds is-invalid) and then drives
            // the input handler to clear it.
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            const errEl = container.querySelector('#solace-client-name-id-error') as HTMLElement;

            // Install invalid state via the blur path (>100 chars triggers
            // validateClientNameId's overlength branch on blur).
            input.value = 'a'.repeat(101);
            input.dispatchEvent(new Event('blur'));
            expect(input.classList.contains('is-invalid')).toBe(true);
            expect(errEl.textContent).toBe('Must not exceed 100 characters.');

            // First input event after the error: truthy branch fires, class
            // and error text are cleared eagerly so the user doesn't see a
            // stuck red border while correcting.
            input.value = 'a'.repeat(50);
            input.dispatchEvent(new Event('input'));
            expect(input.classList.contains('is-invalid')).toBe(false);
            expect(errEl.textContent).toBe('');

            // Falsy-branch anchor: a second input event with no error
            // present is a no-op (the `if` short-circuits without writing
            // textContent — anything we put there stays).
            errEl.textContent = 'sentinel';
            input.dispatchEvent(new Event('input'));
            expect(errEl.textContent).toBe('sentinel');
        });
    });

    describe('max-messages cap validation', () => {
        it('persists a valid integer value to localStorage on Save (without emitting — Connect is the only emitter)', async () => {
            vi.useFakeTimers();
            const { ctx, eventBus } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const received: number[] = [];
            eventBus.on('config:max-messages-changed', ({ value }) => received.push(value));

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            input.value = '250';

            const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
            btnSave.click();

            // Save persists but does NOT emit — the cap only takes effect at Connect.
            expect(received).toEqual([]);
            // Decode via config.load() rather than JSON.parse — storage is OBF1-encoded.
            const storedValue = (localStorage.setItem as any).mock.calls.at(-1)[1];
            (localStorage.getItem as any).mockReturnValue(storedValue);
            const saved = config.load();
            expect(saved.solace.maxMessagesPerQueue).toBe(250);
            vi.useRealTimers();
        });

        it('blocks save and shows inline error when value is non-integer', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            const errBox = container.querySelector('#sol-max-messages-error') as HTMLElement;
            input.value = '3.5';

            const calls = (localStorage.setItem as any).mock.calls.length;
            const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
            btnSave.click();

            expect((localStorage.setItem as any).mock.calls.length).toBe(calls);
            expect(input.classList.contains('is-invalid')).toBe(true);
            expect(errBox.textContent).toMatch(/whole number/i);
        });

        it('blocks save and shows inline error when value exceeds 10000', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            const errBox = container.querySelector('#sol-max-messages-error') as HTMLElement;
            input.value = '10001';

            const calls = (localStorage.setItem as any).mock.calls.length;
            const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
            btnSave.click();

            expect((localStorage.setItem as any).mock.calls.length).toBe(calls);
            expect(input.classList.contains('is-invalid')).toBe(true);
            expect(errBox.textContent).toMatch(/10000/);
        });

        it('blocks save for empty or zero or negative values', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;

            for (const bad of ['', '0', '-5', 'abc']) {
                (localStorage.setItem as any).mockClear();
                input.value = bad;
                btnSave.click();
                expect((localStorage.setItem as any).mock.calls.length).toBe(0);
                expect(input.classList.contains('is-invalid')).toBe(true);
            }
        });

        it('debounces input validation and clears inline error after the debounce window', async () => {
            vi.useFakeTimers();
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            const errBox = container.querySelector('#sol-max-messages-error') as HTMLElement;

            // Put the input in an invalid state via blur (synchronous — blur runs validate immediately).
            input.value = '10001';
            input.dispatchEvent(new Event('blur'));
            expect(input.classList.contains('is-invalid')).toBe(true);

            // Typing a valid value schedules validation; not yet committed.
            input.value = '500';
            input.dispatchEvent(new Event('input'));
            expect(input.classList.contains('is-invalid')).toBe(true);
            expect(errBox.textContent).not.toBe('');

            // After the debounce window, validation runs and clears the error.
            vi.advanceTimersByTime(INPUT_DEBOUNCE_MS);
            expect(input.classList.contains('is-invalid')).toBe(false);
            expect(errBox.textContent).toBe('');

            vi.useRealTimers();
        });

        it('a second input event before the debounce window cancels the prior timer', async () => {
            // Covers the truthy branch of the input-listener's
            // `if (validateTimer !== null) clearTimeout(validateTimer)` at
            // module.ts:113. Without the cancel, every keystroke would queue
            // its own timer — N keystrokes → N validations, with intermediate
            // is-invalid flicker for stale values. The test types '10001' (invalid)
            // then '500' (valid) in quick succession; after the debounce window
            // only the second timer's validation must have run, leaving the
            // input clean.
            vi.useFakeTimers();
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            const errBox = container.querySelector('#sol-max-messages-error') as HTMLElement;

            // First keystroke: schedules timer A for an invalid value.
            input.value = '10001';
            input.dispatchEvent(new Event('input'));

            // Advance partway — not enough for timer A to fire.
            vi.advanceTimersByTime(100);
            expect(input.classList.contains('is-invalid')).toBe(false);

            // Second keystroke before the debounce window expires: must clear
            // timer A and schedule timer B for the valid value.
            input.value = '500';
            input.dispatchEvent(new Event('input'));

            // Advance past the original debounce horizon. Only timer B's
            // validation should have run.
            vi.advanceTimersByTime(INPUT_DEBOUNCE_MS);
            // If timer A had survived, the input would have been left invalid
            // from validating '10001'. The clean state proves timer A was cancelled.
            expect(input.classList.contains('is-invalid')).toBe(false);
            expect(errBox.textContent).toBe('');

            vi.useRealTimers();
        });

        it('blur cancels a pending input-debounce timer and validates immediately', async () => {
            vi.useFakeTimers();
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            const errBox = container.querySelector('#sol-max-messages-error') as HTMLElement;

            // Start with an invalid+blurred state.
            input.value = '10001';
            input.dispatchEvent(new Event('blur'));
            expect(input.classList.contains('is-invalid')).toBe(true);

            // Type a valid value — schedules debounced validation.
            input.value = '500';
            input.dispatchEvent(new Event('input'));
            expect(input.classList.contains('is-invalid')).toBe(true);  // not committed yet

            // Blur before the debounce fires — must cancel the timer and run validate now.
            input.dispatchEvent(new Event('blur'));
            expect(input.classList.contains('is-invalid')).toBe(false);
            expect(errBox.textContent).toBe('');

            // Advance past the original debounce window — no double-fire side effect.
            vi.advanceTimersByTime(INPUT_DEBOUNCE_MS * 2);
            expect(input.classList.contains('is-invalid')).toBe(false);

            vi.useRealTimers();
        });

        it('loads saved maxMessagesPerQueue into the input on install', async () => {
            const savedCfg = {
                host: 'x', solace: { maxMessagesPerQueue: 1500 }, semp: {}
            };
            vi.spyOn(config, 'load').mockReturnValue(savedCfg);
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            const input = container.querySelector('#sol-max-messages') as HTMLInputElement;
            expect(input.value).toBe('1500');
        });

        it('emits config:max-messages-changed on Connect click from the live input value (no Save required)', async () => {
            const { ctx, eventBus } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const received: number[] = [];
            eventBus.on('config:max-messages-changed', ({ value }) => received.push(value));

            // Populate the required fields + edit cap in modal without saving.
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#sol-max-messages') as HTMLInputElement).value = '42';

            const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
            btnSolace.click();

            expect(received).toEqual([42]);
        });

        it('does not emit on Connect when cap input is invalid', async () => {
            const { ctx, eventBus } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const received: number[] = [];
            eventBus.on('config:max-messages-changed', ({ value }) => received.push(value));

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#sol-max-messages') as HTMLInputElement).value = '99999';

            const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
            btnSolace.click();

            expect(received).toEqual([]);
        });
    });

    it('load button loads config from localStorage', async () => {
        vi.useFakeTimers();
        const savedCfg = { host: 'loaded.test', solace: { vpn: 'loaded-vpn' }, semp: {} };
        vi.spyOn(config, 'load').mockReturnValue(savedCfg);

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const btnLoad = container.querySelector('#btn-load-config') as HTMLButtonElement;
        btnLoad.click();

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        expect(host.value).toBe('loaded.test');
        vi.useRealTimers();
    });

    it('reset button clears all fields', async () => {
        vi.useFakeTimers();
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        // Pre-populate URL Paths so we can prove the reset reaches both —
        // the fields default to empty in the template, so a no-op reset would
        // pass the assertion vacuously.
        const solUrlPath = container.querySelector('#solace-url-path') as HTMLInputElement;
        const sempUrlPath = container.querySelector('#semp-url-path') as HTMLInputElement;
        solUrlPath.value = '/solace';
        sempUrlPath.value = '/api';

        const btnReset = container.querySelector('#btn-reset-form') as HTMLButtonElement;
        btnReset.click();

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        expect(host.value).toBe('');
        const vpn = container.querySelector('#solace-vpn') as HTMLInputElement;
        expect(vpn.value).toBe('');
        expect(solUrlPath.value).toBe('');
        expect(sempUrlPath.value).toBe('');
        vi.useRealTimers();
    });

    // URL Path round-trip: save persists what the user typed, applyConfig
    // restores it on install. These two halves together prove a user's path
    // survives a browser refresh — the only behaviour that matters.
    describe('URL Path persistence', () => {
        it('save persists both Solace and SEMP URL paths into the saved config', async () => {
            if (!document.getElementById('toast-container')) {
                const c = document.createElement('div');
                c.id = 'toast-container';
                document.body.appendChild(c);
            }

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#solace-url-path') as HTMLInputElement).value = '/solace';
            (container.querySelector('#semp-url-path') as HTMLInputElement).value = '/api';

            const btnSave = container.querySelector('#btn-save-config') as HTMLButtonElement;
            btnSave.click();

            // Decode via config.load() — storage is OBF1-encoded.
            const storedValue = (localStorage.setItem as any).mock.calls.at(-1)[1];
            (localStorage.getItem as any).mockReturnValue(storedValue);
            const saved = config.load();
            expect(saved.solace.urlPath).toBe('/solace');
            expect(saved.semp.urlPath).toBe('/api');
        });

        it('applyConfig populates URL Path inputs from saved config on install', async () => {
            const savedCfg = {
                host: 'broker.test',
                solace: { urlPath: '/solace' },
                semp: { urlPath: '/api' }
            };
            vi.spyOn(config, 'load').mockReturnValue(savedCfg);

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const solUrlPath = container.querySelector('#solace-url-path') as HTMLInputElement;
            const sempUrlPath = container.querySelector('#semp-url-path') as HTMLInputElement;
            expect(solUrlPath.value).toBe('/solace');
            expect(sempUrlPath.value).toBe('/api');
        });

        it('applyConfig preserves an empty saved urlPath without overwriting an in-DOM value', async () => {
            // Guards the `urlPath !== undefined` branch in module.ts:applyConfig:
            // if a user previously had a path, then saved with the field cleared,
            // load must restore the empty value (not skip the field).
            const savedCfg = {
                host: 'broker.test',
                solace: { urlPath: '' },
                semp: {}
            };
            vi.spyOn(config, 'load').mockReturnValue(savedCfg);

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const solUrlPath = container.querySelector('#solace-url-path') as HTMLInputElement;
            // Note: the SEMP cfg has no urlPath key at all (undefined branch) —
            // the field stays at its template default (empty).
            const sempUrlPath = container.querySelector('#semp-url-path') as HTMLInputElement;
            expect(solUrlPath.value).toBe('');
            expect(sempUrlPath.value).toBe('');
        });
    });

    it('solace connect button validates and connects', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        // Real template ships empty inputs; populate to satisfy validation.
        (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
        (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
        (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';

        const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
        btnSolace.click();

        expect((window as any).solace.SolclientFactory.createSession).toHaveBeenCalled();
    });

    it('solace connect button disconnects when connected', async () => {
        // Realistic flow: connect (UP_NOTICE fires bridging onConnected) → click
        // again to disconnect → SDK DISCONNECTED fires bridging onDisconnected.
        // After the Stage B refactor the factory no longer reaches into AppState
        // directly — state writes happen exclusively through bridging hooks fired
        // from real SDK lifecycle events.
        const { ctx, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
        (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
        (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';

        const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
        btnSolace.click();

        const sessionMock = (window as any).solace.SolclientFactory.createSession.mock.results[0].value;
        const upHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'UP_NOTICE')[1];
        upHandler();
        expect(appState.isConnected).toBe(true);

        btnSolace.click();
        expect(sessionMock.disconnect).toHaveBeenCalled();

        const discHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'DISCONNECTED')[1];
        discHandler();
        expect(ctx.setState).toHaveBeenCalledWith('isConnected', false);
    });

    it('solace connect fails validation with empty host', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        host.value = '';
        const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
        btnSolace.click();

        expect(host.classList.contains('is-invalid')).toBe(true);
    });

    it('semp connect button validates and connects', async () => {
        const { ctx } = createTestContext(container);
        (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

        await ConnectionsModule.install(ctx);

        (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
        (container.querySelector('#semp-port') as HTMLInputElement).value = '943';
        (container.querySelector('#semp-username') as HTMLInputElement).value = 'admin';
        (container.querySelector('#semp-password') as HTMLInputElement).value = 'admin';

        const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
        btnSemp.click();

        await vi.waitFor(() => {
            expect(ctx.setState).toHaveBeenCalledWith('isSempConnected', true);
        });
    });

    it('semp connect button disconnects when connected', async () => {
        const { ctx, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isSempConnected = true;
        const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
        btnSemp.click();

        expect(ctx.setState).toHaveBeenCalledWith('isSempConnected', false);
    });

    it('semp validation fails with empty fields', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const sempUser = container.querySelector('#semp-username') as HTMLInputElement;
        sempUser.value = '';
        const sempPass = container.querySelector('#semp-password') as HTMLInputElement;
        sempPass.value = '';

        const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
        btnSemp.click();

        expect(sempUser.classList.contains('is-invalid')).toBe(true);
    });

    it('listens for connection events and updates input state', async () => {
        const { ctx, eventBus } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        // install() calls ui.updateInputState once at module.ts:284 — clear that
        // baseline so the assertion sees only the four event-driven invocations.
        const updateSpy = vi.spyOn(ui, 'updateInputState');

        eventBus.emit('client:connected', { session: {} });
        eventBus.emit('client:disconnected');
        eventBus.emit('semp:connected');
        eventBus.emit('semp:disconnected');

        expect(updateSpy).toHaveBeenCalledTimes(4);
        updateSpy.mockRestore();
    });

    it('handles connection:check-connection when not connected', async () => {
        const { ctx, eventBus } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        eventBus.emit('connection:check-connection', { vpn: 'target-vpn', queue: 'target-queue' });
        expect(ctx.loadSelf).toHaveBeenCalled();
    });

    it('handles connection:check-connection when connected same VPN', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.value = 'same-vpn';
        (ctx.loadSelf as any).mockClear();

        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);

        eventBus.emit('connection:check-connection', { vpn: 'same-vpn', queue: 'test-queue' });

        expect(browseHandler).toHaveBeenCalledWith({ queue: 'test-queue' });
        // Same-VPN path never navigates — connections has nothing to do.
        expect(ctx.loadSelf).not.toHaveBeenCalled();
    });

    it('handles connection:check-connection when connected different VPN (user confirms)', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.value = 'old-vpn';

        (globalThis.confirm as any).mockReturnValue(true);

        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'test-queue' });

        expect(globalThis.confirm).toHaveBeenCalled();
        // Event-driven handoff: simulate the SDK's teardown signal.
        eventBus.emit('client:disconnected');
        // VPN input should now reflect the requested target.
        expect(vpnInput.value).toBe('new-vpn');
    });

    it('handles connection:check-connection when connected different VPN (user cancels)', async () => {
        // Regression: previously the navigateToConnections() call ran BEFORE
        // confirm() for the queue-browser flow, so a Cancel left the user
        // stranded on the connections page even though they declined the switch.
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.value = 'old-vpn';
        (ctx.loadSelf as any).mockClear();

        (globalThis.confirm as any).mockReturnValue(false);

        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);

        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'test-queue' });

        expect(browseHandler).not.toHaveBeenCalled();
        // User stays on queue-browser — no navigation when confirm was cancelled.
        expect(ctx.loadSelf).not.toHaveBeenCalled();
    });

    it('enter key on solace inputs triggers connect', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
        (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
        (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';

        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

        expect((window as any).solace.SolclientFactory.createSession).toHaveBeenCalled();
    });

    it('enter key on semp inputs triggers connect', async () => {
        const { ctx } = createTestContext(container);
        (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

        await ConnectionsModule.install(ctx);

        const sempPass = container.querySelector('#semp-password') as HTMLInputElement;
        sempPass.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    it('non-Enter key does not trigger connect', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        (window as any).solace.SolclientFactory.createSession.mockClear();
        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect((window as any).solace.SolclientFactory.createSession).not.toHaveBeenCalled();
    });

    it('solace validation fails with invalid port', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const port = container.querySelector('#solace-port') as HTMLInputElement;
        port.value = 'abc';
        const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
        btnSolace.click();
        expect(port.classList.contains('is-invalid')).toBe(true);
    });

    it('solace validation fails with empty vpn', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const vpn = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpn.value = '';
        const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
        btnSolace.click();
        expect(vpn.classList.contains('is-invalid')).toBe(true);
    });

    it('solace validation fails with empty user', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const user = container.querySelector('#solace-username') as HTMLInputElement;
        user.value = '';
        const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
        btnSolace.click();
        expect(user.classList.contains('is-invalid')).toBe(true);
    });

    it('semp validation fails with invalid port', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const port = container.querySelector('#semp-port') as HTMLInputElement;
        port.value = '-1';
        const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
        btnSemp.click();
        expect(port.classList.contains('is-invalid')).toBe(true);
    });

    it('semp validation fails with empty host', async () => {
        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        host.value = '';
        const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
        btnSemp.click();
        expect(host.classList.contains('is-invalid')).toBe(true);
    });

    it('applyConfig handles config with advanced settings', async () => {
        const savedCfg = {
            host: 'saved.test',
            solace: {
                protocol: 'ws', port: '9090', vpn: 'test', user: 'test',
                authMode: 'oauth',
                connectRetries: 5, connectTimeout: 20000,
                reconnectRetries: 10, reconnectWait: 5000
            },
            semp: { protocol: 'https', port: '8080', user: 'semp-user' }
        };
        vi.spyOn(config, 'load').mockReturnValue(savedCfg);

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        expect((container.querySelector('#sol-connect-retries') as HTMLInputElement).value).toBe('5');
        expect((container.querySelector('#sol-connect-timeout') as HTMLInputElement).value).toBe('20000');
        expect((container.querySelector('#sol-reconnect-retries') as HTMLInputElement).value).toBe('10');
        expect((container.querySelector('#sol-reconnect-wait') as HTMLInputElement).value).toBe('5000');
    });

    it('applyConfig with null config does nothing', async () => {
        (localStorage.getItem as any).mockReturnValue(null);
        const host = container.querySelector('#conn-host') as HTMLInputElement;
        const hostBefore = host.value;
        const port = container.querySelector('#solace-port') as HTMLInputElement;
        const portBefore = port.value;

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        // Proves the `if (cfg)` guard at module.ts:71 short-circuited — input
        // values were never overwritten by a missing-config applyConfig call.
        expect(host.value).toBe(hostBefore);
        expect(port.value).toBe(portBefore);
    });

    it('load button does nothing if no saved config', async () => {
        if (!document.getElementById('toast-container')) {
            const c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        const toastContainer = document.getElementById('toast-container')!;

        const { ctx } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const host = container.querySelector('#conn-host') as HTMLInputElement;
        const hostBefore = host.value;

        (localStorage.getItem as any).mockReturnValue(null);
        const btnLoad = container.querySelector('#btn-load-config') as HTMLButtonElement;
        btnLoad.click();

        // Both applyConfig and showToast should be short-circuited by the `if (c)` guard.
        expect(host.value).toBe(hostBefore);
        expect(toastContainer.querySelector('.toast')).toBeNull();
    });

    it('connection:check-connection auto-connect success triggers browse', async () => {
        const { ctx, eventBus } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);

        eventBus.emit('connection:check-connection', { vpn: 'target-vpn', queue: 'q1' });

        // Simulate successful auto-connection
        eventBus.emit('client:connected', { session: {} });
        expect(browseHandler).toHaveBeenCalledWith({ queue: 'q1' });
    });

    it('connection:check-connection auto-connect registers failure cleanup', async () => {
        const { ctx, eventBus } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        // Emit check-connection while not connected
        eventBus.emit('connection:check-connection', { vpn: 'target-vpn', queue: 'q1' });

        // Simulate failed connection
        eventBus.emit('client:disconnected');

        // Subsequent connect should not trigger stale handlers
        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);
        eventBus.emit('client:connected', { session: {} });
        // Only the module's own client:connected handler fires, not the stale onSuccess
    });

    it('connection:check-connection VPN switch waits for client:disconnected then reconnects + browses', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.value = 'old-vpn';

        (globalThis.confirm as any).mockReturnValue(true);

        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);

        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'test-queue' });

        // Before client:disconnected, we're still in the 'waiting for teardown' phase —
        // client:connected should be a no-op (no listener for connect yet).
        eventBus.emit('client:connected', { session: {} });
        expect(browseHandler).not.toHaveBeenCalled();

        // Teardown signal arrives → handler flips VPN input and registers waitForConnect
        eventBus.emit('client:disconnected');
        expect(vpnInput.value).toBe('new-vpn');

        // Now the reconnect's UP_NOTICE triggers the browse.
        eventBus.emit('client:connected', { session: {} });
        expect(browseHandler).toHaveBeenCalledWith({ queue: 'test-queue' });
    });

    it('connection:check-connection VPN switch failure cleans up (reconnect fails after teardown)', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        const vpnInput = container.querySelector('#solace-vpn') as HTMLInputElement;
        vpnInput.value = 'old-vpn';

        (globalThis.confirm as any).mockReturnValue(true);

        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'test-queue' });
        eventBus.emit('client:disconnected'); // teardown completes → reconnect phase begins

        // Reconnect fails — no stale browse should fire later.
        eventBus.emit('client:disconnected');

        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);
        eventBus.emit('client:connected', { session: {} });
        expect(browseHandler).not.toHaveBeenCalled();
    });

    it('connection:check-connection VPN switch disconnect timeout clears opInProgress (10s)', async () => {
        vi.useFakeTimers();
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'old-vpn';
        (globalThis.confirm as any).mockReturnValue(true);

        // First request starts the VPN switch and sets opInProgress=true.
        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'q1' });
        expect(ctx.loadSelf).toHaveBeenCalledTimes(1);

        // Disconnect never arrives — timeout should eventually free the flag so a
        // follow-up request is accepted. Use `loadSelf` call count as the "accepted"
        // signal (it runs on every non-guarded entry, regardless of branch). Asserting
        // on `confirm` would be flaky because the first emit's disconnect() synchronously
        // flips isConnected→false in the test (no real session), so the second request
        // naturally takes the auto-connect branch rather than the confirm branch.
        vi.advanceTimersByTime(10_000);

        eventBus.emit('connection:check-connection', { vpn: 'another-vpn', queue: 'q2' });
        expect(ctx.loadSelf).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });

    it('connection:edit-requested navigates the user to the connections form', async () => {
        const { ctx, eventBus } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        (ctx.loadSelf as any).mockClear();
        eventBus.emit('connection:edit-requested');
        expect(ctx.loadSelf).toHaveBeenCalledTimes(1);
    });

    it('connection:edit-requested with loadSelf undefined is a no-op AND leaves the bus functional for downstream emits', async () => {
        const { ctx, eventBus } = createTestContext(container);
        (ctx as any).loadSelf = undefined;
        await ConnectionsModule.install(ctx);

        // Probe listener registered BEFORE the suspect emit. If the listener
        // body throws and pollutes the bus's dispatch loop, the probe won't
        // fire on the follow-up emit.
        const probe = vi.fn();
        eventBus.on('client:disconnected', probe);

        eventBus.emit('connection:edit-requested');

        // The event bus is still capable of dispatching — proves the prior
        // emit didn't poison its internal listener registry. A bare
        // .not.toThrow() would also pass even if the bus had silently
        // captured the throw and corrupted state for subsequent emits.
        eventBus.emit('client:disconnected');
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it('check-connection returnTo=queue-copy: already-on-right-VPN path emits copy:vpn-switched WITHOUT navigating', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'match-vpn';
        (ctx.loadSelf as any).mockClear();

        const copyHandler = vi.fn();
        const browseHandler = vi.fn();
        eventBus.on('copy:vpn-switched', copyHandler);
        eventBus.on('browser:browse-queue', browseHandler);

        eventBus.emit('connection:check-connection', { vpn: 'match-vpn', queue: 'q', returnTo: 'queue-copy' });

        // No navigation when queue-copy flow is already on the right VPN —
        // user stays put, gets the write-back event directly.
        expect(ctx.loadSelf).not.toHaveBeenCalled();
        expect(copyHandler).toHaveBeenCalledWith({ vpn: 'match-vpn', queue: 'q' });
        expect(browseHandler).not.toHaveBeenCalled();
    });

    it('check-connection returnTo=queue-copy: auto-connect path navigates then emits copy:vpn-switched on success', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = false;
        (ctx.loadSelf as any).mockClear();

        const copyHandler = vi.fn();
        eventBus.on('copy:vpn-switched', copyHandler);

        eventBus.emit('connection:check-connection', { vpn: 'target-vpn', queue: 'q-target', returnTo: 'queue-copy' });
        expect(ctx.loadSelf).toHaveBeenCalled();

        eventBus.emit('client:connected', { session: {} });
        expect(copyHandler).toHaveBeenCalledWith({ vpn: 'target-vpn', queue: 'q-target' });
    });

    it('check-connection returnTo=queue-copy: VPN switch with user-cancel does NOT navigate (stays on queue-copy)', async () => {
        // Regression: previously the navigateToConnections() call ran BEFORE
        // confirm(), so a Cancel left the user stranded on the connections
        // page even though they declined the switch.
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'old-vpn';
        (globalThis.confirm as any).mockReturnValue(false);
        (ctx.loadSelf as any).mockClear();

        const copyHandler = vi.fn();
        eventBus.on('copy:vpn-switched', copyHandler);

        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'q', returnTo: 'queue-copy' });

        // No navigation, no copy-vpn-switched event — user stayed on queue-copy.
        expect(ctx.loadSelf).not.toHaveBeenCalled();
        expect(copyHandler).not.toHaveBeenCalled();
    });

    it('check-connection returnTo=queue-copy: VPN switch navigates then emits copy:vpn-switched after reconnect', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = true;
        (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'old-vpn';
        (globalThis.confirm as any).mockReturnValue(true);
        (ctx.loadSelf as any).mockClear();

        const copyHandler = vi.fn();
        const browseHandler = vi.fn();
        eventBus.on('copy:vpn-switched', copyHandler);
        eventBus.on('browser:browse-queue', browseHandler);

        eventBus.emit('connection:check-connection', { vpn: 'new-vpn', queue: 'q', returnTo: 'queue-copy' });
        expect(ctx.loadSelf).toHaveBeenCalled();

        eventBus.emit('client:disconnected');  // teardown
        eventBus.emit('client:connected', { session: {} });  // reconnect UP

        expect(copyHandler).toHaveBeenCalledWith({ vpn: 'new-vpn', queue: 'q' });
        expect(browseHandler).not.toHaveBeenCalled();
    });

    it('connection:check-connection ignores duplicate requests while operation in progress', async () => {
        const { ctx, eventBus, appState } = createTestContext(container);
        await ConnectionsModule.install(ctx);

        appState.isConnected = false;
        const browseHandler = vi.fn();
        eventBus.on('browser:browse-queue', browseHandler);

        // First request kicks off auto-connect; opInProgress is set.
        eventBus.emit('connection:check-connection', { vpn: 'vpn-a', queue: 'q1' });

        // Second, overlapping request should be ignored — only one waitForConnect
        // listener pair exists, so client:connected fires once → browse once.
        eventBus.emit('connection:check-connection', { vpn: 'vpn-b', queue: 'q2' });

        eventBus.emit('client:connected', { session: {} });
        expect(browseHandler).toHaveBeenCalledTimes(1);
        expect(browseHandler).toHaveBeenCalledWith({ queue: 'q1' });
    });

    // ====================================================================
    // Bridging: factory hooks → UI updates + AppState writes + bus emits.
    // After the Stage B refactor, the broker-side factories live in
    // src/core/services/ and are pure (no AppContext, no UI). The connections
    // module wires lifecycle hooks that route factory events into global
    // state, the event bus, and the connections form's UI. These tests
    // exercise that bridging by driving the SDK-mock events that the factory
    // forwards into the hooks.
    // ====================================================================
    describe('Solace bridging hooks', () => {
        async function setupConnectedFlow() {
            const { ctx, appState, eventBus } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            const btnSolace = container.querySelector('#btn-solace-connect') as HTMLButtonElement;
            btnSolace.click();
            const sessionMock = (window as any).solace.SolclientFactory.createSession.mock.results[0].value;
            return { ctx, appState, eventBus, btnSolace, sessionMock };
        }

        function findHandler(sessionMock: any, event: string): Function {
            return sessionMock.on.mock.calls.find((c: any[]) => c[0] === event)[1];
        }

        it('onConnected → setState(isConnected=true), setState(selectedVpn), setState(solaceConnection), emit client:connected, button to Disconnect', async () => {
            const { ctx, appState, eventBus, btnSolace, sessionMock } = await setupConnectedFlow();
            const connectedHandler = vi.fn();
            eventBus.on('client:connected', connectedHandler);

            findHandler(sessionMock, 'UP_NOTICE')();

            expect(ctx.setState).toHaveBeenCalledWith('isConnected', true);
            expect(ctx.setState).toHaveBeenCalledWith('selectedVpn', 'default');
            // The new solaceConnection AppState slot carries connection details
            // (including the password the user entered, captured at click time)
            // so cross-module consumers (queue-copy) can prefill forms and
            // surface the source-side password mirror.
            expect(ctx.setState).toHaveBeenCalledWith('solaceConnection', expect.objectContaining({
                host: expect.any(String),
                vpn: 'default',
                pass: expect.any(String),
            }));
            expect(appState.isConnected).toBe(true);
            expect(connectedHandler).toHaveBeenCalledWith(expect.objectContaining({ session: expect.any(Object) }));
            expect(btnSolace.textContent).toBe('Disconnect');
            expect(btnSolace.classList.contains('btn-danger')).toBe(true);
            expect(btnSolace.classList.contains('btn-primary')).toBe(false);
        });

        it('onDisconnected (via SDK DISCONNECTED) → setState false, clears solaceConnection, emit client:disconnected, button to Connect', async () => {
            const { ctx, eventBus, btnSolace, sessionMock } = await setupConnectedFlow();
            findHandler(sessionMock, 'UP_NOTICE')();
            const disconnectedHandler = vi.fn();
            eventBus.on('client:disconnected', disconnectedHandler);

            findHandler(sessionMock, 'DISCONNECTED')();

            expect(ctx.setState).toHaveBeenCalledWith('isConnected', false);
            expect(ctx.setState).toHaveBeenCalledWith('selectedVpn', null);
            expect(ctx.setState).toHaveBeenCalledWith('solaceConnection', null);
            expect(disconnectedHandler).toHaveBeenCalled();
            expect(btnSolace.textContent).toBe('Connect');
            expect(btnSolace.classList.contains('btn-primary')).toBe(true);
            expect(btnSolace.classList.contains('btn-danger')).toBe(false);
        });

        it('onConnectFailed with "Connection error" surfaces a helpUrl link to the SEMP base', async () => {
            const { btnSolace, sessionMock } = await setupConnectedFlow();
            // Populate SEMP form so the help URL builder has values to read.
            (container.querySelector('#semp-protocol') as HTMLSelectElement).value = 'https';
            (container.querySelector('#semp-port') as HTMLInputElement).value = '1943';
            (container.querySelector('#semp-url-path') as HTMLInputElement).value = '/api';

            findHandler(sessionMock, 'CONNECT_FAILED_ERROR')({ infoStr: 'Connection error to host' });

            const errorEl = container.querySelector('#solace-connect-error') as HTMLElement;
            expect(errorEl.textContent).toContain('Connection Failed');
            expect(errorEl.textContent).toContain('Connection error to host');
            expect(errorEl.querySelector('a')).toBeTruthy();
            expect(btnSolace.textContent).toBe('Connect');
        });

        it('onConnectFailed without "Connection error" leaves the helpUrl link absent', async () => {
            const { sessionMock } = await setupConnectedFlow();
            findHandler(sessionMock, 'CONNECT_FAILED_ERROR')({ infoStr: 'Auth failed' });

            const errorEl = container.querySelector('#solace-connect-error') as HTMLElement;
            expect(errorEl.querySelector('a')).toBeNull();
        });

        it('onError with "Certificate" message surfaces a helpUrl link', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            (window as any).solace.SolclientFactory.createSession.mockImplementation(() => {
                throw new Error('Certificate Not Trusted');
            });

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#semp-port') as HTMLInputElement).value = '1943';

            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            const errorEl = container.querySelector('#solace-connect-error') as HTMLElement;
            expect(errorEl.textContent).toContain('Certificate');
            expect(errorEl.querySelector('a')).toBeTruthy();
            consoleSpy.mockRestore();
        });

        it('onError without "Certificate" leaves the helpUrl link absent', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            (window as any).solace.SolclientFactory.createSession.mockImplementation(() => { throw new Error('generic error'); });

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';

            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            const errorEl = container.querySelector('#solace-connect-error') as HTMLElement;
            expect(errorEl.querySelector('a')).toBeNull();
            consoleSpy.mockRestore();
        });

        it('onError when window.solace is undefined surfaces "Solace API not loaded"', async () => {
            (window as any).solace = undefined;
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';

            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            const errorEl = container.querySelector('#solace-connect-error') as HTMLElement;
            expect(errorEl.textContent).toContain('Solace API not loaded');
            consoleSpy.mockRestore();
        });
    });

    describe('SEMP bridging hooks', () => {
        async function setupSempInstall() {
            const { ctx, appState, eventBus } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#semp-port') as HTMLInputElement).value = '943';
            (container.querySelector('#semp-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#semp-password') as HTMLInputElement).value = 'admin';
            return { ctx, appState, eventBus };
        }

        it('onConnected (200) → setState sempCredentials, isSempConnected, emit semp:connected, button → Disconnect, clear input errors', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            const { ctx, eventBus } = await setupSempInstall();

            // Mark inputs invalid first so we can verify they get cleared.
            const sempUser = container.querySelector('#semp-username') as HTMLInputElement;
            const sempPass = container.querySelector('#semp-password') as HTMLInputElement;
            sempUser.classList.add('is-invalid');
            sempPass.classList.add('is-invalid');

            const sempConnectedHandler = vi.fn();
            eventBus.on('semp:connected', sempConnectedHandler);

            const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
            btnSemp.click();

            await vi.waitFor(() => {
                expect(ctx.setState).toHaveBeenCalledWith('isSempConnected', true);
            });
            expect(ctx.setState).toHaveBeenCalledWith('sempCredentials', expect.objectContaining({
                user: 'admin', pass: 'admin', baseUrl: 'https://broker.test:943'
            }));
            expect(sempConnectedHandler).toHaveBeenCalled();
            expect(btnSemp.textContent).toBe('Disconnect');
            expect(sempUser.classList.contains('is-invalid')).toBe(false);
            expect(sempPass.classList.contains('is-invalid')).toBe(false);
        });

        it('onAuthFailed (401) → 401-specific error text, no helpUrl link', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
            await setupSempInstall();

            (container.querySelector('#btn-semp-connect') as HTMLButtonElement).click();

            await vi.waitFor(() => {
                const errorEl = container.querySelector('#semp-connect-error') as HTMLElement;
                expect(errorEl.textContent).toBe('Authentication Failed (401). Check username/password.');
            });
        });

        it('onError (500) → status-code error text, no helpUrl link', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
            await setupSempInstall();

            (container.querySelector('#btn-semp-connect') as HTMLButtonElement).click();

            await vi.waitFor(() => {
                const errorEl = container.querySelector('#semp-connect-error') as HTMLElement;
                expect(errorEl.textContent).toContain('500 Internal Server Error');
                expect(errorEl.querySelector('a')).toBeNull();
            });
        });

        it('onError isNetworkError ("Failed to fetch") → error text + helpUrl link', async () => {
            (globalThis.fetch as any).mockRejectedValue(new Error('Failed to fetch'));
            await setupSempInstall();

            (container.querySelector('#btn-semp-connect') as HTMLButtonElement).click();

            await vi.waitFor(() => {
                const errorEl = container.querySelector('#semp-connect-error') as HTMLElement;
                expect(errorEl.textContent).toMatch(/^SEMP Network Error: Failed to fetch/);
                expect(errorEl.querySelector('a')).toBeTruthy();
            });
        });

        it('onError generic exception ("Timeout") → error text without helpUrl link', async () => {
            (globalThis.fetch as any).mockRejectedValue(new Error('Timeout'));
            await setupSempInstall();

            (container.querySelector('#btn-semp-connect') as HTMLButtonElement).click();

            await vi.waitFor(() => {
                const errorEl = container.querySelector('#semp-connect-error') as HTMLElement;
                expect(errorEl.textContent).toBe('SEMP Network Error: Timeout');
                expect(errorEl.querySelector('a')).toBeNull();
            });
        });

        it('onError synthetic Certificate (untrust.com) → error text mentioning Certificate', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            (container.querySelector('#conn-host') as HTMLInputElement).value = 'foo.untrust.com';
            (container.querySelector('#semp-port') as HTMLInputElement).value = '943';
            (container.querySelector('#semp-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#semp-password') as HTMLInputElement).value = 'admin';

            (container.querySelector('#btn-semp-connect') as HTMLButtonElement).click();

            await vi.waitFor(() => {
                const errorEl = container.querySelector('#semp-connect-error') as HTMLElement;
                expect(errorEl.textContent).toMatch(/^SEMP Network Error: Certificate/);
            });
        });

        it('onDisconnected → setState false, emit semp:disconnected, button → Connect', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            const { ctx, appState, eventBus } = await setupSempInstall();

            const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
            btnSemp.click();
            await vi.waitFor(() => expect(appState.isSempConnected).toBe(true));

            const sempDisconnectedHandler = vi.fn();
            eventBus.on('semp:disconnected', sempDisconnectedHandler);

            // Click again — appState.isSempConnected is true → triggers disconnect path.
            btnSemp.click();
            await vi.waitFor(() => {
                expect(ctx.setState).toHaveBeenCalledWith('isSempConnected', false);
            });
            expect(ctx.setState).toHaveBeenCalledWith('sempCredentials', null);
            expect(sempDisconnectedHandler).toHaveBeenCalled();
            expect(btnSemp.textContent).toBe('Connect');
        });

        it('button finally block re-enables button and resets text after a 401 failure', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
            await setupSempInstall();

            const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
            btnSemp.click();

            await vi.waitFor(() => {
                expect(btnSemp.disabled).toBe(false);
                expect(btnSemp.innerHTML).toBe('Connect');
            });
        });

        it('button finally block sets text to "Disconnect" when a connect succeeded', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
            await setupSempInstall();

            const btnSemp = container.querySelector('#btn-semp-connect') as HTMLButtonElement;
            btnSemp.click();

            await vi.waitFor(() => {
                expect(btnSemp.disabled).toBe(false);
                expect(btnSemp.innerHTML).toBe('Disconnect');
            });
        });
    });

    // Client Name Identifier — autofill on install, validation, persistence,
    // and connect-time composition into the SDK `clientName` session property
    // as `SolMsgUtil/YYYYMMDDHHMMSS/{identifier}`.
    describe('Client Name Identifier', () => {
        it('autofills the identifier input with a generated UUID when no saved value exists', async () => {
            (localStorage.getItem as any).mockReturnValue(null);
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            // UUID v4 shape — 8-4-4-4-12 hex with dashes.
            expect(input.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        it('preserves a saved identifier on install instead of overwriting with a fresh UUID', async () => {
            vi.spyOn(config, 'load').mockReturnValue({
                host: 'x', solace: { clientNameId: 'my-saved-id' }, semp: {}
            } as any);
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            expect(input.value).toBe('my-saved-id');
        });

        it('rejects empty identifier on Connect and blocks the SDK call', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.value = '';

            (window as any).solace.SolclientFactory.createSession.mockClear();
            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            expect(input.classList.contains('is-invalid')).toBe(true);
            expect((window as any).solace.SolclientFactory.createSession).not.toHaveBeenCalled();
        });

        it('rejects disallowed characters (e.g. spaces) and blocks the SDK call', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            // Space is not in the allowed set (alphanumerics + !@#$%^&*-=_+/.,).
            input.value = 'has space';

            (window as any).solace.SolclientFactory.createSession.mockClear();
            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            const errBox = container.querySelector('#solace-client-name-id-error') as HTMLElement;
            expect(input.classList.contains('is-invalid')).toBe(true);
            expect(errBox.textContent).toMatch(/allowed/i);
            expect((window as any).solace.SolclientFactory.createSession).not.toHaveBeenCalled();
        });

        it('accepts the full allowed symbol set without flagging an error', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.value = 'AaZz09!@#$%^&*-=_+/.,';
            input.dispatchEvent(new Event('blur'));

            expect(input.classList.contains('is-invalid')).toBe(false);
        });

        it('persists the identifier to localStorage on Save', async () => {
            if (!document.getElementById('toast-container')) {
                const c = document.createElement('div');
                c.id = 'toast-container';
                document.body.appendChild(c);
            }
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.value = 'saved-client-id';

            (container.querySelector('#btn-save-config') as HTMLButtonElement).click();

            const storedValue = (localStorage.setItem as any).mock.calls.at(-1)[1];
            (localStorage.getItem as any).mockReturnValue(storedValue);
            const saved = config.load()!;
            expect(saved.solace.clientNameId).toBe('saved-client-id');
        });

        it('Reset regenerates a fresh UUID rather than blanking the identifier', async () => {
            vi.useFakeTimers();
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            const before = input.value;
            // Reset must replace, not clear — a blank field would immediately
            // fail validation on the next Connect.
            (container.querySelector('#btn-reset-form') as HTMLButtonElement).click();
            const after = input.value;

            expect(after).not.toBe('');
            expect(after).not.toBe(before);
            expect(after).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            vi.useRealTimers();
        });

        it('composes SDK clientName as SolMsgUtil/YYYYMMDDHHMMSS/{identifier} at Connect time', async () => {
            // Pin the clock so the asserted timestamp segment is deterministic.
            vi.useFakeTimers();
            vi.setSystemTime(new Date(2026, 4, 17, 14, 30, 25)); // 2026-05-17 14:30:25 local

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#solace-client-name-id') as HTMLInputElement).value = 'abc-123';

            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            const propsObj = (window as any).solace.SessionProperties.mock.results[0].value;
            expect(propsObj.clientName).toBe('SolMsgUtil/20260517143025/abc-123');

            vi.useRealTimers();
        });

        it('Enter inside the settings modal does NOT trigger Connect (identifier lives with other advanced fields)', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';

            (window as any).solace.SolclientFactory.createSession.mockClear();
            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

            // Modal-bound fields shouldn't dismiss the modal AND start a connect —
            // matches the existing convention for sol-connect-retries etc.
            expect((window as any).solace.SolclientFactory.createSession).not.toHaveBeenCalled();
        });

        it('blur trims surrounding whitespace and writes the trimmed value back to the input', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.value = '   padded-id   ';
            input.dispatchEvent(new Event('blur'));

            // Surrounding whitespace is stripped — DOM reflects what the SDK gets.
            expect(input.value).toBe('padded-id');
            expect(input.classList.contains('is-invalid')).toBe(false);
        });

        it('blur autofills a fresh UUID when the value is empty or whitespace-only', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.value = '     ';
            input.dispatchEvent(new Event('blur'));

            // Whitespace collapses to '' → regenerate rather than leave the
            // user staring at an empty field with an error.
            expect(input.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(input.classList.contains('is-invalid')).toBe(false);
        });

        it('forwards a trimmed identifier to the SDK clientName even when blur was skipped (Enter path)', async () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(2026, 4, 17, 14, 30, 25));

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            input.value = '  trim-me  ';

            // Press Enter directly on a different field — bypasses the blur on
            // the identifier input, but the Connect handler must still trim.
            (container.querySelector('#solace-vpn') as HTMLInputElement)
                .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

            const propsObj = (window as any).solace.SessionProperties.mock.results[0].value;
            expect(propsObj.clientName).toBe('SolMsgUtil/20260517143025/trim-me');

            vi.useRealTimers();
        });

        it('clears a stale invalid state eagerly while the user types a correction', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            const input = container.querySelector('#solace-client-name-id') as HTMLInputElement;
            const errBox = container.querySelector('#solace-client-name-id-error') as HTMLElement;

            // Force invalid state via blur on disallowed value.
            input.value = 'has space';
            input.dispatchEvent(new Event('blur'));
            expect(input.classList.contains('is-invalid')).toBe(true);
            expect(errBox.textContent).not.toBe('');

            // First input event with a non-empty corrective value clears the
            // red flag eagerly so the user isn't stared at while editing.
            input.value = 'fixed';
            input.dispatchEvent(new Event('input'));
            expect(input.classList.contains('is-invalid')).toBe(false);
            expect(errBox.textContent).toBe('');
        });
    });

    it('connection:check-connection with null loadSelf does not throw', async () => {
        // Auto-connect path navigates — exercises the `if (loadSelf)` falsy branch
        // in navigateToConnections without throwing.
        const { ctx, eventBus, appState } = createTestContext(container);
        ctx.loadSelf = null as any;
        await ConnectionsModule.install(ctx);

        appState.isConnected = false;

        expect(() => {
            eventBus.emit('connection:check-connection', { vpn: 'target-vpn', queue: 'q1' });
        }).not.toThrow();
    });

    // The connections module probes `/hosted` once at install. A 200 response
    // with body "true" flips the hosted singleton on; anything else leaves it
    // off (direct-connection mode).
    describe('/hosted probe at install', () => {
        afterEach(() => setHosted(false));

        // Branches `fetch('/hosted', …)` to a custom response and forwards
        // every other URL to the default `{ok: true, status: 200}` so existing
        // SEMP / Solace fetches in this suite are unaffected.
        function stubHostedFetch(hostedResponse: any) {
            (globalThis.fetch as any).mockImplementation((url: string, _init?: RequestInit) => {
                if (url === '/hosted') return Promise.resolve(hostedResponse);
                return Promise.resolve({ ok: true, status: 200 });
            });
        }

        it('enables hosted mode when /hosted returns 200 with body "true"', async () => {
            stubHostedFetch({ ok: true, status: 200, text: () => Promise.resolve('true') });
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            expect(isHosted()).toBe(true);
        });

        it('keeps direct mode when /hosted returns 200 with body "false"', async () => {
            stubHostedFetch({ ok: true, status: 200, text: () => Promise.resolve('false') });
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            expect(isHosted()).toBe(false);
        });

        it('keeps direct mode when /hosted returns 404 (standalone deployment)', async () => {
            stubHostedFetch({ ok: false, status: 404, text: () => Promise.resolve('Not Found') });
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            expect(isHosted()).toBe(false);
        });
    });

    // In hosted mode, the helpUrl link in connection-error toasts is
    // suppressed because the broker is internal and the user can't reach
    // its TLS endpoint to accept a self-signed cert. The hooks read
    // isHosted() at failure time (not install time), so we flip the
    // singleton AFTER install — the install-time probe would otherwise
    // reset the flag based on the default fetch mock's behavior.
    describe('helpUrl suppression in hosted mode', () => {
        afterEach(() => setHosted(false));

        it('omits the helpUrl link on Solace onConnectFailed when hosted', async () => {
            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);
            setHosted(true);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#solace-port') as HTMLInputElement).value = '8080';
            (container.querySelector('#solace-vpn') as HTMLInputElement).value = 'default';
            (container.querySelector('#solace-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#solace-password') as HTMLInputElement).value = 'pw';
            (container.querySelector('#semp-protocol') as HTMLSelectElement).value = 'https';
            (container.querySelector('#semp-port') as HTMLInputElement).value = '1943';
            (container.querySelector('#semp-url-path') as HTMLInputElement).value = '/api';

            (container.querySelector('#btn-solace-connect') as HTMLButtonElement).click();

            // Drive the typed handler (the FIRST registration for this event).
            // The connections module also registers a generic debug listener
            // LAST in a for-loop, so `_handlers[CONNECT_FAILED_ERROR]` would
            // point at the debug listener — we want the typed onConnectFailed
            // bridge here.
            const sessionMock = (window as any).solace.SolclientFactory.createSession.mock.results[0].value;
            const typedHandler = sessionMock.on.mock.calls.find((c: any[]) => c[0] === 'CONNECT_FAILED_ERROR')[1];
            typedHandler({ infoStr: 'Connection error: refused' });

            const errorEl = container.querySelector('#solace-connect-error') as HTMLElement;
            expect(errorEl.textContent).toMatch(/Connection error: refused/);
            // No anchor — the help link was suppressed because broker is internal.
            expect(errorEl.querySelector('a')).toBeNull();
        });
    });

    // Hosted mode publishes the user-typed protocol/host/port/urlPath on
    // sempCredentials alongside the gateway-prefixed baseUrl so downstream
    // UI (queue-copy) can display the real broker the user reached for.
    describe('sempCredentials structured fields', () => {
        it('publishes protocol/host/port/urlPath alongside baseUrl on SEMP onConnected', async () => {
            (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });

            const { ctx } = createTestContext(container);
            await ConnectionsModule.install(ctx);

            (container.querySelector('#conn-host') as HTMLInputElement).value = 'broker.test';
            (container.querySelector('#semp-protocol') as HTMLSelectElement).value = 'https';
            (container.querySelector('#semp-port') as HTMLInputElement).value = '943';
            (container.querySelector('#semp-url-path') as HTMLInputElement).value = '/api';
            (container.querySelector('#semp-username') as HTMLInputElement).value = 'admin';
            (container.querySelector('#semp-password') as HTMLInputElement).value = 'admin';

            (container.querySelector('#btn-semp-connect') as HTMLButtonElement).click();

            await vi.waitFor(() => {
                expect(ctx.setState).toHaveBeenCalledWith('sempCredentials', expect.objectContaining({
                    user: 'admin', pass: 'admin',
                    baseUrl: 'https://broker.test:943/api',
                    protocol: 'https', host: 'broker.test', port: '943', urlPath: '/api',
                }));
            });
        });
    });

});
