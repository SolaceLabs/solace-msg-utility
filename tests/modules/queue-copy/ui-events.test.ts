import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireUiEvents } from '../../../src/modules/queue-copy/ui-events';
import { cacheElements } from '../../../src/modules/queue-copy/ui';
import type { CopyUiElements, PrimarySnapshot } from '../../../src/modules/queue-copy/ui';
import { createInitialState, type DestScope } from '../../../src/modules/queue-copy/state';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createSessionMock, createBrowserMock } from '../../setup';
import type { AppContext } from '../../../src/core/types';
import { createManagedProfile } from '../../../src/core/services/managed-profile';

import { completeContext } from '../../helpers/appContext';

/** The context's queue picker: `ctx.queuePicker.pick`. */
/** Press one part of the Copy to button. */
function pickScope(els: CopyUiElements, scope: DestScope): void {
    els.destScopeGroup.querySelector<HTMLButtonElement>(`[data-dest-scope="${scope}"]`)!.click();
}

const pickQueue = vi.fn(async (..._args: unknown[]): Promise<{ vpn: string; queue: string } | null> => ({ vpn: 'default', queue: 'picked-q' }));

const PRIMARY: PrimarySnapshot = {
    host: 'broker.solace.com',
    solace: { protocol: 'wss', port: '443', urlPath: '', vpn: 'default', user: 'admin', pass: 'sol-secret' },
    semp: { protocol: 'https', port: '1943', urlPath: '/SEMP/v2', user: 'admin', pass: 'semp-secret' },
};

function makeCtx(overrides: Partial<AppContext['appState']> = {}): AppContext {
    return completeContext({
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
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        queuePicker: { pick: pickQueue },
    });
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
        connectDestProvisioned: vi.fn(),
        disconnectDestProvisioned: vi.fn(),
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

    describe('Copy to prefill behavior', () => {
        it('Another broker re-enables every dest field', () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');
            expect(state.destForm.sameBroker).toBe(false);
            expect(state.destForm.sameVpn).toBe(false);
            expect(els.destHost.disabled).toBe(false);
            expect(els.destSolVpn.disabled).toBe(false);
            expect(els.destScope.value()).toBe('another-broker');
        });

        it('back on the source\'s broker, the broker fields lock again', () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');
            pickScope(els, 'another-vpn');
            expect([state.destForm.sameBroker, state.destForm.sameVpn]).toEqual([true, false]);
            expect(els.destHost.disabled).toBe(true);
        });

        it('Another VPN unlocks just the VPN/user/pass fields', () => {
            const { els, state } = setup();
            pickScope(els, 'another-vpn');
            expect(state.destForm.sameVpn).toBe(false);
            expect(els.destSolVpn.disabled).toBe(false);
            expect(els.destSolUser.disabled).toBe(false);
            expect(els.destSolPass.disabled).toBe(false);
            expect(els.destHost.disabled).toBe(true); // broker still locked
        });

        it('This VPN, straight from Another broker, locks everything again', () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');
            pickScope(els, 'this-vpn');
            expect([state.destForm.sameBroker, state.destForm.sameVpn]).toEqual([true, true]);
            expect([els.destHost.disabled, els.destSolVpn.disabled]).toEqual([true, true]);
        });

        it('says under the button what the choice leaves to fill in', () => {
            const { els } = setup();
            expect(els.destScopeHint.textContent).toBe('The connection you already have: same broker, same Message VPN. Nothing to fill in.');
            pickScope(els, 'another-broker');
            expect(els.destScopeHint.textContent).toBe('A different broker. Give its address and both logins below.');
        });
    });

    describe('field mirroring', () => {
        it('host', () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');
            els.destHost.value = 'h';
            els.destHost.dispatchEvent(new Event('input'));
            expect(state.destForm.host).toBe('h');
        });

        it('an appliance\'s two hosts, and one host again once the type is back on Software / Cloud', () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');
            const typeButton = (type: string) => els.destBrokerType.querySelector<HTMLButtonElement>(`[data-broker-type="${type}"]`)!;

            typeButton('appliance').click();
            els.destHost.value = ' mgmt ';
            els.destHost.dispatchEvent(new Event('input'));
            els.destSolHost.value = ' msg ';
            els.destSolHost.dispatchEvent(new Event('input'));
            expect([state.destForm.host, state.destForm.messagingHost]).toEqual(['mgmt', 'msg']);

            typeButton('software').click();
            expect([state.destForm.host, state.destForm.messagingHost]).toEqual(['mgmt', undefined]);
        });

        it('SEMP fields', () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');

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
            pickScope(els, 'another-broker');

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
            expect((pickQueue as any).mock.calls.at(-1)[0].key).toBe('https://broker.solace.com:1943/SEMP/v2');
            expect(state.dest.name).toBe('picked-q');
        });

        it('dest pick uses destSempCtx when cross-broker', async () => {
            const { els, state } = setup();
            pickScope(els, 'another-broker');
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            // cross-broker reveals the icon now that destSempCtx is set; force the
            // slide toggle change once more to trigger refreshDestPickVisible
            els.destTypeToggle.checked = false;
            els.destTypeToggle.dispatchEvent(new Event('change'));
            els.btnDestPick.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(pickQueue).toHaveBeenCalled();
            expect((pickQueue as any).mock.calls.at(-1)[0].key).toBe('http://d');
        });

        it('dest pick is a no-op when no SempContext is resolvable', async () => {
            const { els, state } = setup({ ctx: { isSempConnected: false, sempCredentials: null } });
            pickScope(els, 'another-broker');
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
            pickScope(els, 'another-broker');
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
            expect(els.destScope.value()).toBe('another-vpn');
            expect(state.destForm.solace.vpn).toBe('altVpn');
            expect(els.destSolVpn.value).toBe('altVpn');
            expect(state.dest.name).toBe('q-cross');
        });

        it('dest pick with matching VPN leaves the Copy to choice untouched', async () => {
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
            pickScope(els, 'another-broker');
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

    describe('mode slide toggle', () => {
        const slide = (els: CopyUiElements, on: boolean) => {
            els.modeToggle.checked = on;
            els.modeToggle.dispatchEvent(new Event('change'));
        };

        it('sliding to Move updates state.mode and highlights that side', () => {
            const { els, state } = setup();
            slide(els, true);
            expect(state.mode).toBe('move');
            expect([els.modeLabelCopy.classList.contains('active'), els.modeLabelMove.classList.contains('active')]).toEqual([false, true]);
        });

        it('sliding back makes it a copy again', () => {
            const { els, state } = setup();
            slide(els, true);
            slide(els, false);
            expect(state.mode).toBe('copy');
            expect([els.modeLabelCopy.classList.contains('active'), els.modeLabelMove.classList.contains('active')]).toEqual([true, false]);
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
    });

    describe('modal Cancel button', () => {
        it('routes through cancelCopyModal — idle state closes modal', () => {
            const { els } = setup();
            els.modal.showModal();
            els.btnModalCancel.click();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });
    });

    describe('modal Esc (the dialog cancel event) behaves exactly like Cancel', () => {
        const pressEsc = (modal: HTMLDialogElement): Event => {
            const e = new Event('cancel', { cancelable: true });
            modal.dispatchEvent(e);
            return e;
        };

        it('during verify: aborts the probe and closes the dialog', () => {
            const { els, state } = setup();
            const abort = new AbortController();
            state.verify = { inProgress: true, abort, result: null };
            els.modal.showModal();

            const e = pressEsc(els.modal);

            expect(e.defaultPrevented).toBe(true);
            expect(abort.signal.aborted).toBe(true);
            expect(state.verify).toBeNull();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('during a run: flags the cancel and keeps the dialog open until the run ends', () => {
            const { els, state } = setup();
            state.job = { total: 5, copied: 2, cancelRequested: false, lastError: null, status: 'running' };
            els.modal.showModal();

            const e = pressEsc(els.modal);

            expect(e.defaultPrevented).toBe(true);
            expect(state.job.cancelRequested).toBe(true);
            expect(els.modal.hasAttribute('open')).toBe(true);
        });
    });

    describe('dest picker visibility', () => {
        it('shows immediately when primary SEMP is connected (the source\'s broker by default)', () => {
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
            pickScope(els, 'another-broker');
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

    describe('a change of the Copy to choice disposes the live destination connections', () => {
        it('disconnects dest Client + clears Sol pass + resets status when the choice becomes This VPN', () => {
            const { els, state, services } = setup();
            // Pre-condition: the choice was Another VPN and the user has connected dest Client.
            pickScope(els, 'another-vpn');
            state.destSession = { _live: true };
            state.destSolacePass = 'secret';
            els.destSolPass.value = 'secret';
            // Now choose This VPN — engine should dispose the dest Client.
            pickScope(els, 'this-vpn');
            expect(services.disconnectDestSol).toHaveBeenCalledTimes(1);
            expect(state.destSolacePass).toBe('');
            expect(els.destSolPass.value).toBe('');
        });

        it('disconnects dest SEMP + clears SEMP pass + resets status when the choice comes back to the source\'s broker', () => {
            const { els, state, services } = setup();
            // Pre-condition: the choice was Another broker and the user has connected dest SEMP.
            pickScope(els, 'another-broker');
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destSempPass = 'semp-secret';
            els.destSempPass.value = 'semp-secret';
            // Back on the source's broker — dispose helper should call disconnectDestSemp.
            pickScope(els, 'another-vpn');
            expect(services.disconnectDestSemp).toHaveBeenCalledTimes(1);
            expect(state.destSempPass).toBe('');
            expect(els.destSempPass.value).toBe('');
        });

        it('does not call disconnectDestSemp when there is no live destSempCtx', () => {
            const { els, state, services } = setup();
            // The choice starts on the source's broker. Go to Another broker and
            // back with NO destSempCtx ever set. The dispose helper
            // should clear pass + reset status without calling the disconnect
            // service (no live SEMP to dispose).
            pickScope(els, 'another-broker');
            state.destSempCtx = null;
            pickScope(els, 'another-vpn');
            expect(services.disconnectDestSemp).not.toHaveBeenCalled();
        });

        it('does not call disconnectDestSol when there is no live dest Client session', () => {
            const { els, state, services } = setup();
            // The choice starts on This VPN; go to Another VPN and back with no destSession.
            pickScope(els, 'another-vpn');
            state.destSession = null; // no live session
            pickScope(els, 'this-vpn');
            expect(services.disconnectDestSol).not.toHaveBeenCalled();
        });

        it('Another broker disposes both live dest SEMP and dest Client connections', () => {
            const { els, state, services } = setup();
            // Pre-condition: both secondary connections are live. Simulate by
            // seeding state directly.
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destSession = { _live: true };
            state.destSempPass = 'semp-secret';
            state.destSolacePass = 'sol-secret';
            els.destSempPass.value = 'semp-secret';
            els.destSolPass.value = 'sol-secret';
            // Now choose Another broker — both connections must be disposed.
            pickScope(els, 'another-broker');
            expect(services.disconnectDestSemp).toHaveBeenCalledTimes(1);
            expect(services.disconnectDestSol).toHaveBeenCalledTimes(1);
            expect(state.destSempPass).toBe('');
            expect(state.destSolacePass).toBe('');
            expect(els.destSempPass.value).toBe('');
            expect(els.destSolPass.value).toBe('');
        });

        it('Another VPN disposes both live dest SEMP and dest Client connections', () => {
            const { els, state, services } = setup();
            state.destSempCtx = { fetch: async () => new Response(), baseUrl: 'http://d' };
            state.destSession = { _live: true };
            pickScope(els, 'another-vpn');
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
            // SEMP Connect-row needs to be visible (Another broker).
            pickScope(els, 'another-broker');
            fireEnter(els.destSempPort);
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
        });

        it('Enter in destHost triggers SEMP Connect (the host sits in the SEMP card)', () => {
            const { els, services } = setup();
            pickScope(els, 'another-broker');
            fireEnter(els.destHost);
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
        });

        it('Enter in an appliance\'s destSolHost triggers the Client Connect', () => {
            const { els, services } = setup();
            pickScope(els, 'another-broker');
            fireEnter(els.destSolHost);
            expect(services.connectDestSol).toHaveBeenCalledTimes(1);
            expect(services.connectDestSemp).not.toHaveBeenCalled();
        });

        it('Enter in destSempPass triggers SEMP Connect', () => {
            const { els, services } = setup();
            pickScope(els, 'another-broker');
            fireEnter(els.destSempPass);
            expect(services.connectDestSemp).toHaveBeenCalledTimes(1);
        });

        it('Enter in destSolVpn triggers Client Connect', () => {
            const { els, services } = setup();
            // Client Connect-row needs to be visible (Another VPN).
            pickScope(els, 'another-vpn');
            fireEnter(els.destSolVpn);
            expect(services.connectDestSol).toHaveBeenCalledTimes(1);
        });

        it('Enter in destSolPass triggers Client Connect', () => {
            const { els, services } = setup();
            pickScope(els, 'another-vpn');
            fireEnter(els.destSolPass);
            expect(services.connectDestSol).toHaveBeenCalledTimes(1);
        });

        it('non-Enter key in dest fields is a no-op', () => {
            const { els, services } = setup();
            pickScope(els, 'another-broker');
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
