import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireUiEvents } from '../../../src/modules/queue-copy/ui-events';
import { cacheElements } from '../../../src/modules/queue-copy/ui';
import type { PrimarySnapshot } from '../../../src/modules/queue-copy/ui';
import { createInitialState } from '../../../src/modules/queue-copy/state';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createSessionMock, createBrowserMock } from '../../setup';
import type { AppContext } from '../../../src/core/types';
import { createManagedSessionStore } from '../../../src/core/services/managed-session-store';

vi.mock('../../../src/core/components/queue-picker', () => ({
    pickQueue: vi.fn(async () => ({ vpn: 'default', queue: 'picked-q' })),
}));
import { pickQueue } from '../../../src/core/components/queue-picker';

const PRIMARY: PrimarySnapshot = {
    host: 'broker.solace.com',
    solace: { protocol: 'wss', port: '443', urlPath: '', vpn: 'default', user: 'admin', pass: 'sol-secret' },
    semp: { protocol: 'https', port: '1943', urlPath: '/SEMP/v2', user: 'admin', pass: 'semp-secret' },
};

function makeCtx(overrides: Partial<AppContext['appState']> = {}): AppContext {
    return {
        container: document.createElement('div'),
        appState: {
            activeModuleId: null,
            isConnected: true,
            selectedVpn: 'default',
            solaceConnection: null,
            sempCredentials: {
                user: 'admin', pass: 'p', baseUrl: 'https://broker.solace.com:1943/SEMP/v2',
                protocol: 'https', host: 'broker.solace.com', port: '1943', urlPath: '/SEMP/v2',
            },
            isSempConnected: true,
            ...overrides,
        },
        eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), hold: vi.fn(), release: vi.fn() },
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedStore: createManagedSessionStore(),
        copyToClipboard: vi.fn(),
        config: {},
    };
}

function setup(opts: { ctx?: Partial<AppContext['appState']>; primarySnap?: PrimarySnapshot | null } = {}) {
    const container = loadModuleDOM('queue-copy');
    const els = cacheElements(container);
    const state = createInitialState();
    const ctx = makeCtx(opts.ctx);
    const session = createSessionMock();
    (session.createQueueBrowser as any).mockImplementation(() => createBrowserMock());
    // Real implementations of the gate refreshers — these normally live in
    // module.ts. Replicating the logic here keeps the existing DOM-state
    // assertions valid (instead of switching every test to "was the mock
    // called?", which is less precise).
    const refreshStartEnabled = () => {
        const destReady = state.destForm.sameVpn || state.destSession !== null;
        const ok = !!state.sourceQueue && !!state.dest.name && destReady;
        els.btnStart.disabled = !ok;
    };
    const refreshDestPickVisible = () => {
        if (state.dest.type === 'topic') { els.btnDestPick.classList.add('hidden'); return; }
        const sempReady = state.destForm.sameBroker
            ? ctx.appState.isSempConnected
            : state.destSempCtx !== null;
        els.btnDestPick.classList.toggle('hidden', !sempReady);
    };
    const services = {
        getPrimarySnapshot: vi.fn(() => opts.primarySnap === undefined ? PRIMARY : opts.primarySnap),
        getPrimarySession: vi.fn(() => session),
        connectDestSemp: vi.fn(),
        disconnectDestSemp: vi.fn(),
        connectDestSol: vi.fn(),
        disconnectDestSol: vi.fn(),
        refreshStartEnabled: vi.fn(refreshStartEnabled),
        refreshDestPickVisible: vi.fn(refreshDestPickVisible),
    };
    wireUiEvents(ctx, els, state, services);
    return { container, els, state, ctx, services };
}

describe('queue-copy/ui-events', () => {
    beforeEach(() => {
        (pickQueue as any).mockClear();
        (pickQueue as any).mockResolvedValue({ vpn: 'default', queue: 'picked-q' });
    });

    describe('initial wiring', () => {
        it('applies prefill on install (sameBroker=sameVpn=true → fields disabled)', () => {
            const { els } = setup();
            expect(els.destHost.disabled).toBe(true);
            expect(els.destHost.value).toBe('broker.solace.com');
        });

        it('Start button starts disabled (no source/dest yet)', () => {
            const { els } = setup();
            expect(els.btnStart.disabled).toBe(true);
        });

        it('initial-prefill with null primary snapshot leaves fields blank but disabled', () => {
            const { els } = setup({ primarySnap: null });
            expect(els.destHost.value).toBe('');
            expect(els.destHost.disabled).toBe(true);
        });
    });

    describe('source field + pick', () => {
        it('typing into source mirrors to state.sourceQueue and re-enables Start when dest is also set', () => {
            const { els, state } = setup();
            els.destInput.value = 'd';
            els.destInput.dispatchEvent(new Event('input'));
            els.sourceInput.value = 's';
            els.sourceInput.dispatchEvent(new Event('input'));
            expect(state.sourceQueue).toBe('s');
            expect(els.btnStart.disabled).toBe(false);
        });

        it('source pick invokes pickQueue and updates state', async () => {
            const { els, state } = setup();
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(pickQueue).toHaveBeenCalled();
            expect(state.sourceQueue).toBe('picked-q');
            expect(els.sourceInput.value).toBe('picked-q');
        });

        it('source pick is a no-op when SEMP is not connected', async () => {
            const { els } = setup({ ctx: { isSempConnected: false, sempCredentials: null } });
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(pickQueue).not.toHaveBeenCalled();
        });

        it('source pick cancel (null) leaves state untouched', async () => {
            (pickQueue as any).mockResolvedValueOnce(null);
            const { els, state } = setup();
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(state.sourceQueue).toBe('');
        });

        it('source pick uses ctx.selectedVpn as default when set', async () => {
            const { els } = setup();
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBe('default');
        });

        it('source pick falls back to undefined defaultVpn when selectedVpn is null', async () => {
            const { els } = setup({ ctx: { selectedVpn: null } });
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBeUndefined();
        });

        it('source pick with matching VPN updates state directly (no bus event)', async () => {
            const { els, ctx, state } = setup();
            (pickQueue as any).mockResolvedValueOnce({ vpn: 'default', queue: 'q-same' });
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(state.sourceQueue).toBe('q-same');
            expect(els.sourceInput.value).toBe('q-same');
            expect(ctx.eventBus.emit).not.toHaveBeenCalled();
        });

        it('source pick with DIFFERENT VPN emits connection:check-connection with returnTo=queue-copy', async () => {
            const { els, ctx, state } = setup();
            (pickQueue as any).mockResolvedValueOnce({ vpn: 'altVpn', queue: 'q-cross' });
            els.btnSourcePick.click();
            await Promise.resolve();
            await Promise.resolve();
            // Connections module owns the VPN switch + write-back via copy:vpn-switched.
            expect(ctx.eventBus.emit).toHaveBeenCalledWith('connection:check-connection', {
                vpn: 'altVpn',
                queue: 'q-cross',
                returnTo: 'queue-copy',
            });
            // Local state untouched until the bus event handler in module.ts writes it back.
            expect(state.sourceQueue).toBe('');
            expect(els.sourceInput.value).toBe('');
        });
    });

    describe('toggle prefill behavior', () => {
        it('unchecking sameBroker re-enables every dest field', () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            expect(state.destForm.sameBroker).toBe(false);
            expect(state.destForm.sameVpn).toBe(false);
            expect(els.destHost.disabled).toBe(false);
            expect(els.destSolVpn.disabled).toBe(false);
            expect(els.toggleSameVpn.disabled).toBe(true);
        });

        it('re-checking sameBroker re-locks all fields', () => {
            const { els } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            els.toggleSameBroker.checked = true;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            expect(els.destHost.disabled).toBe(true);
        });

        it('unchecking sameVpn unlocks just the VPN/user/pass fields', () => {
            const { els, state } = setup();
            els.toggleSameVpn.checked = false;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            expect(state.destForm.sameVpn).toBe(false);
            expect(els.destSolVpn.disabled).toBe(false);
            expect(els.destSolUser.disabled).toBe(false);
            expect(els.destSolPass.disabled).toBe(false);
            expect(els.destHost.disabled).toBe(true); // broker still locked
        });
    });

    describe('field mirroring', () => {
        it('host', () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            els.destHost.value = 'h';
            els.destHost.dispatchEvent(new Event('input'));
            expect(state.destForm.host).toBe('h');
        });

        it('SEMP fields', () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));

            els.destSempProtocol.value = 'http';
            els.destSempProtocol.dispatchEvent(new Event('change'));
            els.destSempPort.value = '8080';
            els.destSempPort.dispatchEvent(new Event('input'));
            els.destSempUrlPath.value = '/x';
            els.destSempUrlPath.dispatchEvent(new Event('input'));
            els.destSempUser.value = 'u';
            els.destSempUser.dispatchEvent(new Event('input'));
            els.destSempPass.value = 'p';
            els.destSempPass.dispatchEvent(new Event('input'));

            expect(state.destForm.semp).toEqual({ protocol: 'http', port: '8080', urlPath: '/x', user: 'u' });
            expect(state.destSempPass).toBe('p');
        });

        it('Solace fields', () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));

            els.destSolProtocol.value = 'ws';
            els.destSolProtocol.dispatchEvent(new Event('change'));
            els.destSolPort.value = '8008';
            els.destSolPort.dispatchEvent(new Event('input'));
            els.destSolUrlPath.value = '/y';
            els.destSolUrlPath.dispatchEvent(new Event('input'));
            els.destSolVpn.value = 'v';
            els.destSolVpn.dispatchEvent(new Event('input'));
            els.destSolUser.value = 'u';
            els.destSolUser.dispatchEvent(new Event('input'));
            els.destSolPass.value = 'p';
            els.destSolPass.dispatchEvent(new Event('input'));

            expect(state.destForm.solace).toEqual({ protocol: 'ws', port: '8008', urlPath: '/y', vpn: 'v', user: 'u' });
            expect(state.destSolacePass).toBe('p');
        });
    });

    describe('dest type + name', () => {
        it('switching the slide toggle to topic hides the dest pick icon', () => {
            const { els, state } = setup();
            els.destTypeToggle.checked = true;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            expect(state.dest.type).toBe('topic');
            expect(els.btnDestPick.classList.contains('hidden')).toBe(true);
        });

        it('switching the slide toggle back to queue with primary SEMP available reveals the icon', () => {
            const { els, state } = setup();
            els.destTypeToggle.checked = true;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            els.destTypeToggle.checked = false;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            expect(state.dest.type).toBe('queue');
            expect(els.btnDestPick.classList.contains('hidden')).toBe(false);
        });

        it('typing into dest input mirrors into state', () => {
            const { els, state } = setup();
            els.destInput.value = 'q';
            els.destInput.dispatchEvent(new Event('input'));
            expect(state.dest.name).toBe('q');
        });

        it('dest pick uses primary SEMP when sameBroker', async () => {
            const { els, state } = setup();
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(pickQueue).toHaveBeenCalled();
            expect(state.dest.name).toBe('picked-q');
        });

        it('dest pick uses destSempCtx when cross-broker', async () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            // cross-broker reveals the icon now that destSempCtx is set; force the
            // slide toggle change once more to trigger refreshDestPickVisible
            els.destTypeToggle.checked = false;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(pickQueue).toHaveBeenCalled();
        });

        it('dest pick is a no-op when no SempContext is resolvable', async () => {
            const { els, state } = setup({ ctx: { isSempConnected: false, sempCredentials: null } });
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            state.destSempCtx = null;
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(pickQueue).not.toHaveBeenCalled();
        });

        it('dest pick cancel (null) leaves state untouched', async () => {
            (pickQueue as any).mockResolvedValueOnce(null);
            const { els, state } = setup();
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(state.dest.name).toBe('');
        });

        it('dest pick defaultVpn: same-broker uses ctx.selectedVpn', async () => {
            const { els } = setup();
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBe('default');
        });

        it('dest pick defaultVpn: same-broker selectedVpn=null falls back to undefined', async () => {
            const { els } = setup({ ctx: { selectedVpn: null } });
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBeUndefined();
        });

        it('dest pick defaultVpn: cross-broker uses destForm.solace.vpn', async () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destForm.solace.vpn = 'destVpn';
            els.destTypeToggle.checked = false;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBe('destVpn');
        });

        it('dest pick with DIFFERENT VPN updates form vpn + flips off sameVpn (still same broker)', async () => {
            (pickQueue as any).mockResolvedValueOnce({ vpn: 'altVpn', queue: 'q-cross' });
            const { els, state } = setup();
            // sameBroker=sameVpn=true at install. destForm.solace.vpn synced to 'default'.
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();

            expect(state.destForm.sameVpn).toBe(false);
            expect(els.toggleSameVpn.checked).toBe(false);
            expect(state.destForm.solace.vpn).toBe('altVpn');
            expect(els.destSolVpn.value).toBe('altVpn');
            expect(state.dest.name).toBe('q-cross');
        });

        it('dest pick with matching VPN leaves toggles untouched', async () => {
            (pickQueue as any).mockResolvedValueOnce({ vpn: 'default', queue: 'q-same' });
            const { els, state } = setup();
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(state.destForm.sameVpn).toBe(true);
            expect(state.dest.name).toBe('q-same');
        });

        it('dest pick defaultVpn: cross-broker with empty form vpn falls back to undefined', async () => {
            const { els, state } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destForm.solace.vpn = '';
            els.destTypeToggle.checked = false;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect((pickQueue as any).mock.calls.at(-1)[1].defaultVpn).toBeUndefined();
        });
    });

    describe('mode radios', () => {
        it('selecting Move updates state.mode', () => {
            const { els, state } = setup();
            const move = Array.from(els.modeRadios).find(r => r.value === 'move')!;
            move.checked = true;
            move.dispatchEvent(new Event('change'));
            expect(state.mode).toBe('move');
        });

        it('non-checked radio change is a no-op', () => {
            const { els, state } = setup();
            const copy = Array.from(els.modeRadios).find(r => r.value === 'copy')!;
            copy.checked = false;
            copy.dispatchEvent(new Event('change'));
            expect(state.mode).toBe('copy');
        });
    });

    describe('Next button', () => {
        it('opens the modal when both source + dest names are set', () => {
            const { els } = setup();
            els.sourceInput.value = 's';
            els.sourceInput.dispatchEvent(new Event('input'));
            els.destInput.value = 'd';
            els.destInput.dispatchEvent(new Event('input'));
            expect(els.btnStart.disabled).toBe(false);
            els.btnStart.click();
            expect(els.modal.hasAttribute('open')).toBe(true);
        });

        it('does nothing when source is empty (button is disabled, but defensive)', () => {
            const { els, state } = setup();
            state.dest.name = 'd';
            els.btnStart.disabled = false;
            els.btnStart.click();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('does nothing when dest is empty', () => {
            const { els, state } = setup();
            state.sourceQueue = 's';
            els.btnStart.disabled = false;
            els.btnStart.click();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });
    });

    describe('modal Cancel button', () => {
        it('routes through cancelCopyModal — idle state closes modal', () => {
            const { els } = setup();
            els.modal.showModal();
            els.btnModalCancel.click();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });
    });

    describe('dest picker visibility', () => {
        it('shows immediately when primary SEMP is connected (Same broker default)', () => {
            const { els } = setup();
            // Same-broker default + primary SEMP available → picker visible
            // right away. The previous "wait for user interaction" gate has
            // been removed per the latest design.
            expect(els.btnDestPick.classList.contains('hidden')).toBe(false);
        });

        it('stays hidden when primary SEMP is not connected', () => {
            const { els } = setup({ ctx: { isSempConnected: false } });
            expect(els.btnDestPick.classList.contains('hidden')).toBe(true);
        });

        it('hides when cross-broker without a destSempCtx and shows when one is set', () => {
            const { els, state, services } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            // Cross-broker with no destSempCtx → hidden.
            expect(els.btnDestPick.classList.contains('hidden')).toBe(true);
            // Once dest SEMP context lands, the next refresh shows it.
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            services.refreshDestPickVisible();
            expect(els.btnDestPick.classList.contains('hidden')).toBe(false);
        });

        it('flipping the slide toggle to topic hides the picker (no broker-side topic list)', () => {
            const { els } = setup();
            // Same-broker + primary SEMP: picker initially visible.
            expect(els.btnDestPick.classList.contains('hidden')).toBe(false);
            els.destTypeToggle.checked = true;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            expect(els.btnDestPick.classList.contains('hidden')).toBe(true);
            els.destTypeToggle.checked = false;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            // Back to queue → visible again
            expect(els.btnDestPick.classList.contains('hidden')).toBe(false);
        });
    });

    describe('toggle-dispose: checking Same VPN disposes a live dest Client connection', () => {
        it('disconnects dest Client + clears Sol pass + resets status when sameVpn flips to true', () => {
            const { els, state, services } = setup();
            // Pre-condition: Same VPN was off and the user has connected dest Client.
            els.toggleSameVpn.checked = false;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            state.destSession = { _live: true };
            state.destSolacePass = 'secret';
            els.destSolPass.value = 'secret';
            // Now flip Same VPN ON — engine should dispose the dest Client.
            els.toggleSameVpn.checked = true;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            expect(services.disconnectDestSol).toHaveBeenCalledTimes(1);
            expect(state.destSolacePass).toBe('');
            expect(els.destSolPass.value).toBe('');
        });

        it('disconnects dest SEMP + clears SEMP pass + resets status when sameBroker flips to true', () => {
            const { els, state, services } = setup();
            // Pre-condition: Same broker was off and the user has connected dest SEMP.
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destSempPass = 'semp-secret';
            els.destSempPass.value = 'semp-secret';
            // Flip Same broker ON — dispose helper should call disconnectDestSemp.
            els.toggleSameBroker.checked = true;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            expect(services.disconnectDestSemp).toHaveBeenCalledTimes(1);
            expect(state.destSempPass).toBe('');
            expect(els.destSempPass.value).toBe('');
        });

        it('does not call disconnectDestSemp when there is no live destSempCtx', () => {
            const { els, state, services } = setup();
            // sameBroker starts true. Toggle it false (cross-broker) and back
            // true again with NO destSempCtx ever set. The dispose helper
            // should clear pass + reset status without calling the disconnect
            // service (no live SEMP to dispose).
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            state.destSempCtx = null;
            els.toggleSameBroker.checked = true;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            expect(services.disconnectDestSemp).not.toHaveBeenCalled();
        });

        it('does not call disconnectDestSol when there is no live dest Client session', () => {
            const { els, state, services } = setup();
            // sameVpn starts at true; toggle through false→true with no destSession.
            els.toggleSameVpn.checked = false;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            state.destSession = null; // no live session
            els.toggleSameVpn.checked = true;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            expect(services.disconnectDestSol).not.toHaveBeenCalled();
        });

        it('unchecking Same broker disposes both live dest SEMP and dest Client connections', () => {
            const { els, state, services } = setup();
            // Pre-condition: a previous unchecked-sameBroker pass left both
            // secondary connections live. Simulate by seeding state directly.
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destSession = { _live: true };
            state.destSempPass = 'semp-secret';
            state.destSolacePass = 'sol-secret';
            els.destSempPass.value = 'semp-secret';
            els.destSolPass.value = 'sol-secret';
            // Now uncheck Same broker — both connections must be disposed.
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            expect(services.disconnectDestSemp).toHaveBeenCalledTimes(1);
            expect(services.disconnectDestSol).toHaveBeenCalledTimes(1);
            expect(state.destSempPass).toBe('');
            expect(state.destSolacePass).toBe('');
            expect(els.destSempPass.value).toBe('');
            expect(els.destSolPass.value).toBe('');
        });

        it('unchecking Same VPN disposes both live dest SEMP and dest Client connections', () => {
            const { els, state, services } = setup();
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destSession = { _live: true };
            els.toggleSameVpn.checked = false;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            expect(services.disconnectDestSemp).toHaveBeenCalledTimes(1);
            expect(services.disconnectDestSol).toHaveBeenCalledTimes(1);
        });
    });

    describe('Enter-to-connect on destination fields', () => {
        const fireEnter = (input: HTMLElement) => {
            const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            input.dispatchEvent(e);
        };

        it('Enter in destSempPort triggers SEMP Connect', () => {
            const { els, services } = setup();
            // SEMP Connect-row needs to be visible (Same broker unchecked).
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            fireEnter(els.destSempPort);
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
        });

        it('Enter in destHost triggers SEMP Connect (shared host binds to SEMP)', () => {
            const { els, services } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            fireEnter(els.destHost);
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
        });

        it('Enter in destSempPass triggers SEMP Connect', () => {
            const { els, services } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            fireEnter(els.destSempPass);
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
        });

        it('Enter in destSolVpn triggers Client Connect', () => {
            const { els, services } = setup();
            // Client Connect-row needs to be visible (sameVpn unchecked).
            els.toggleSameVpn.checked = false;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            fireEnter(els.destSolVpn);
            expect(services.connectDestSol).toHaveBeenCalledTimes(1);
        });

        it('Enter in destSolPass triggers Client Connect', () => {
            const { els, services } = setup();
            els.toggleSameVpn.checked = false;
            els.toggleSameVpn.dispatchEvent(new Event('change'));
            fireEnter(els.destSolPass);
            expect(services.connectDestSol).toHaveBeenCalledTimes(1);
        });

        it('non-Enter key in dest fields is a no-op', () => {
            const { els, services } = setup();
            els.toggleSameBroker.checked = false;
            els.toggleSameBroker.dispatchEvent(new Event('change'));
            const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
            els.destSempPort.dispatchEvent(e);
            expect(services.connectDestSemp).not.toHaveBeenCalled();
        });
    });

    describe('destination Connect buttons', () => {
        it('SEMP Connect calls connectDestSemp when button shows Connect', () => {
            const { els, services } = setup();
            els.btnDestSempConnect.textContent = 'Connect';
            els.btnDestSempConnect.click();
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
            expect(services.disconnectDestSemp).not.toHaveBeenCalled();
        });

        it('SEMP Connect calls disconnectDestSemp when button shows Disconnect', () => {
            const { els, services } = setup();
            els.btnDestSempConnect.textContent = 'Disconnect';
            els.btnDestSempConnect.click();
            expect(services.disconnectDestSemp).toHaveBeenCalledTimes(1);
            expect(services.connectDestSemp).not.toHaveBeenCalled();
        });

        it('Client Connect calls connectDestSol when button shows Connect', () => {
            const { els, services } = setup();
            els.btnDestSolConnect.textContent = 'Connect';
            els.btnDestSolConnect.click();
            expect(services.connectDestSol).toHaveBeenCalledTimes(1);
            expect(services.disconnectDestSol).not.toHaveBeenCalled();
        });

        it('Client Connect calls disconnectDestSol when button shows Disconnect', () => {
            const { els, services } = setup();
            els.btnDestSolConnect.textContent = 'Disconnect';
            els.btnDestSolConnect.click();
            expect(services.disconnectDestSol).toHaveBeenCalledTimes(1);
            expect(services.connectDestSol).not.toHaveBeenCalled();
        });
    });
});
