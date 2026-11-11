import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedProfile } from '../../../src/core/services/managed-profile';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus, ManagedSession } from '../../../src/core/types';

/**
 * Provisioned destination. When the primary connection is Provisioned (a managed
 * profile is signed in), the destination is ONE shared provisioned connection card
 * -- Broker + Message VPN pickers and a single Connect -- instead of the typed
 * Broker host, SEMP and Client cards. The core managed profile connects SEMP
 * through the gateway's relay and dials SMF, so the only secret this module ever
 * handles is the dialled password it passes to the SDK. With a Direct primary the
 * typed cards stay.
 *
 * Kept separate from `module.test.ts` because it mocks the copy engine, which
 * lets the `rbac:changed` halt be observed directly on `state.job`.
 */
const { pickQueueMock } = vi.hoisted(() => ({
    pickQueueMock: vi.fn(async () => ({ vpn: 'v1', queue: 'ops.picked' })) as any,
}));
vi.mock('../../../src/core/components/queue-picker', () => ({ pickQueue: pickQueueMock }));

// Capture what reaches the destination connection factories.
const { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect } = vi.hoisted(() => ({
    destSempConnect: vi.fn(), destSempDisconnect: vi.fn(), destSolConnect: vi.fn(), destSolDisconnect: vi.fn(),
}));
const { destSempHooks, destSolHooks } = vi.hoisted(() => ({
    destSempHooks: { current: null as any }, destSolHooks: { current: null as any },
}));
vi.mock('../../../src/core/services/semp-client', () => ({
    createServiceSemp: vi.fn((hooks: any) => {
        destSempHooks.current = hooks;
        return { connect: destSempConnect, disconnect: destSempDisconnect };
    }),
}));
vi.mock('../../../src/core/services/solace-client', () => ({
    createServiceSolace: vi.fn((hooks: any) => {
        destSolHooks.current = hooks;
        return { init: vi.fn(), connect: destSolConnect, disconnect: destSolDisconnect };
    }),
}));

// Stub verify so clicking Next reaches an enabled Start without touching SEMP.
const { verifySourceMock } = vi.hoisted(() => ({ verifySourceMock: vi.fn() as any }));
verifySourceMock.mockResolvedValue({
    sourceOk: true, via: 'semp', errors: [],
    messageVpn: 'v1', messageCount: 5, spoolUsageBytes: 100, quotaBytes: null, maxMessageSize: null,
    oldestMsgId: '1', newestMsgId: '5', accessType: 'read-write', owner: null,
});
vi.mock('../../../src/modules/queue-copy/service-verify', async () => {
    const actual = await vi.importActual<any>('../../../src/modules/queue-copy/service-verify');
    return { ...actual, verifySource: verifySourceMock };
});

// Mock the engine so a "run in progress" can be staged and its halt observed.
const { runCopyJobMock, captured } = vi.hoisted(() => ({
    runCopyJobMock: vi.fn() as any,
    captured: { state: null as any },
}));
vi.mock('../../../src/modules/queue-copy/service-copy', async () => {
    const actual = await vi.importActual<any>('../../../src/modules/queue-copy/service-copy');
    return { ...actual, runCopyJob: runCopyJobMock };
});

import { QueueCopyModule } from '../../../src/modules/queue-copy/module';
import { destinationRefusal } from '../../../src/modules/queue-copy/ui-modal';
import { createInitialState } from '../../../src/modules/queue-copy/state';
import { DEST_TARGET_LOCKED_TITLE } from '../../../src/modules/queue-copy/ui';
import { completeContext } from '../../helpers/appContext';

/** The /managed/me profile: names only, as the gateway sends it. */
const PROFILE: any = {
    username: 'u', admin: false, modules: ['queue-copy'],
    operate: [{ brokers: '*', msgVpns: '*', queues: 'ops.*' }],
    readOnly: [],
    brokers: [
        { broker: 'b1', msgVpns: [{ name: 'v1' }, { name: 'v2' }] },
        { broker: 'b2', msgVpns: [{ name: 'w1' }] },
    ],
};

/** The gateway calls the managed entry attaches to the profile. */
const dialMock = vi.fn();
const DIALER = { dial: dialMock, relayBase: (broker: string) => `/managed/relay/${broker}` };

const SESSION: ManagedSession = {
    admin: false, username: 'u', broker: 'b1', vpns: ['v1', 'v2'],
    operate: [{ brokers: '*', msgVpns: '*', queues: 'ops.*' }], readOnly: [], modules: ['queue-copy'],
};

let container: HTMLElement;
let eventBus: EventBus;

beforeEach(() => {
    container = loadModuleDOM('queue-copy');
    eventBus = createEventBus();
    destSempConnect.mockClear();
    destSempDisconnect.mockClear();
    destSolConnect.mockClear();
    destSolDisconnect.mockClear();
    pickQueueMock.mockClear();
    dialMock.mockReset();
    dialMock.mockImplementation(async (broker: string, vpn: string) => ({
        ok: true, data: { smfPath: `/managed/smf/${broker}/${vpn}`, vpn, user: `u-${vpn}`, pass: `pw-${vpn}` },
    }));
    runCopyJobMock.mockReset();
    captured.state = null;
});

async function setupProvisioned(over: Partial<AppState> = {}, signIn = true) {
    const appState: AppState = {
        activeModuleId: null,
        isConnected: true,
        isSempConnected: true,
        selectedVpn: 'v1',
        solaceConnection: {
            host: 'host1', protocol: 'wss', port: '1443', urlPath: '', vpn: 'v1', user: 'u1', pass: 'p',
        },
        sempCredentials: {
            user: 'mon', pass: 'p', baseUrl: 'https://host1:1943/SEMP/v2',
            protocol: 'https', host: 'host1', port: '1943', urlPath: '/SEMP/v2',
        },
        managed: SESSION,
        connConfig: { hosted: true, connModes: 'both', defaultConn: 'direct' },
        ...over,
    };
    const ctx: AppContext = completeContext({
        container, appState, eventBus,
        setState: vi.fn((k, v) => { (appState as any)[k] = v; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedProfile: createManagedProfile(),
        copyToClipboard: vi.fn(),
        config: {},
    });
    ctx.managedProfile.attachDialer(DIALER);
    if (signIn) ctx.managedProfile.setProfile(PROFILE);
    await QueueCopyModule.install(ctx);
    const el = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
    const hidden = (sel: string) => el(sel).classList.contains('hidden');
    return { ctx, appState, el, hidden };
}

type El = <T extends HTMLElement>(s: string) => T;

/** Ask for a secondary connection (a different broker), so the destination needs a connection of its own. */
function needSecondary(el: El): void {
    const sameBroker = el<HTMLInputElement>('#copy-toggle-same-broker');
    sameBroker.checked = false;
    sameBroker.dispatchEvent(new Event('change'));
}
/** Same broker, another Message VPN. */
function otherVpn(el: El): void {
    const sameVpn = el<HTMLInputElement>('#copy-toggle-same-vpn');
    sameVpn.checked = false;
    sameVpn.dispatchEvent(new Event('change'));
}
/** The provisioned card's Broker and VPN pickers, by the ids this module gives them. */
function pick(el: El, broker: string, vpn?: string): void {
    const b = el<HTMLSelectElement>('#copy-dest-prov-broker');
    b.value = broker;
    b.dispatchEvent(new Event('change'));
    if (vpn === undefined) return;
    const v = el<HTMLSelectElement>('#copy-dest-prov-vpn');
    v.value = vpn;
    v.dispatchEvent(new Event('change'));
}
const options = (el: El, sel: string) => Array.from(el<HTMLSelectElement>(sel).options).map(o => o.value);
const connectBtn = (el: El) => el<HTMLButtonElement>('#copy-btn-dest-prov-connect');
const cardStatus = (el: El) => el('#copy-dest-prov-card .prov-conn-status').textContent;
const cardError = (el: El) => el('#copy-dest-prov-error').textContent;

describe('queue-copy -- the destination follows the primary connection mode', () => {
    it('Provisioned primary: the card replaces the host field, the SEMP and Client cards and the credential radio', async () => {
        const { el, hidden } = await setupProvisioned();
        needSecondary(el);

        expect(hidden('#copy-dest-prov')).toBe(false);
        expect(hidden('#copy-dest-prov-card')).toBe(false);
        expect(hidden('#copy-dest-host-group')).toBe(true);
        expect(hidden('#copy-dest-semp-card')).toBe(true);
        expect(hidden('#copy-dest-sol-card')).toBe(true);
        // The Provisioned / Manual radio is gone from the template altogether.
        expect(container.querySelector('#copy-dest-cred-mode-row')).toBeNull();
        expect(el('#copy-dest-prov-card .prov-conn-title').textContent).toBe('Destination Connection');
        expect(options(el, '#copy-dest-prov-broker')).toEqual(['b1', 'b2']);
        expect(options(el, '#copy-dest-prov-vpn')).toEqual(['v1', 'v2']);
    });

    it('re-lists the VPNs when the card\'s broker changes', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        pick(el, 'b2');
        expect(options(el, '#copy-dest-prov-vpn')).toEqual(['w1']);
    });

    it('shows a note instead of the card while the destination IS the primary connection', async () => {
        const { hidden } = await setupProvisioned();
        expect(hidden('#copy-dest-prov')).toBe(false);
        expect(hidden('#copy-dest-prov-card')).toBe(true);
        expect(hidden('#copy-dest-prov-same')).toBe(false);
    });

    it('Same broker with another VPN offers only the primary\'s own broker', async () => {
        const { el, hidden } = await setupProvisioned();
        otherVpn(el);
        expect(hidden('#copy-dest-prov-card')).toBe(false);
        expect(options(el, '#copy-dest-prov-broker')).toEqual(['b1']);
        expect(options(el, '#copy-dest-prov-vpn')).toEqual(['v1', 'v2']);
    });

    it('with no primary broker on record, Same broker leaves nothing to pick and the card says so', async () => {
        const { el, hidden } = await setupProvisioned({ managed: null });
        otherVpn(el);
        expect(options(el, '#copy-dest-prov-broker')).toEqual([]);
        expect(el('#copy-dest-prov-card .prov-conn-empty').classList.contains('hidden')).toBe(false);
        expect(hidden('#copy-dest-prov-card')).toBe(false);
    });

    it('Direct primary: the typed Broker host, SEMP and Client cards stay, and no provisioned card shows', async () => {
        const { el, hidden } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);
        expect(hidden('#copy-dest-prov')).toBe(true);
        expect(hidden('#copy-dest-host-group')).toBe(false);
        expect(hidden('#copy-dest-semp-card')).toBe(false);
        expect(hidden('#copy-dest-sol-card')).toBe(false);
        expect(el<HTMLInputElement>('#copy-dest-host').disabled).toBe(false);
    });

    it('a sign-in after install flips a Direct destination to the card: the typed destination is dropped', async () => {
        const { ctx, appState, el, hidden } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);
        destSempHooks.current.onConnected({ fetch: vi.fn(), baseUrl: 'https://x/SEMP/v2' }, { user: 'u', pass: 'p' });
        el<HTMLInputElement>('#copy-dest-input').value = 'typed.dest';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        ctx.managedProfile.setProfile(PROFILE);
        appState.managed = SESSION;
        eventBus.emit('rbac:changed');

        expect(hidden('#copy-dest-prov-card')).toBe(false);
        expect(destSempDisconnect).toHaveBeenCalledTimes(1);
        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('');
        expect(options(el, '#copy-dest-prov-broker')).toEqual(['b1', 'b2']);
    });
});

describe('queue-copy -- provisioned destination: connecting through the profile', () => {
    it('one Connect dials the chosen VPN and opens destination SEMP through the relay, with no credential for SEMP', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        pick(el, 'b2', 'w1');

        connectBtn(el).click();
        expect(cardStatus(el)).toBe('Connecting to broker "b2", VPN "w1"...');
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        await vi.waitFor(() => expect(destSempConnect).toHaveBeenCalled());

        // SMF: the dialled credential goes straight to the SDK, with a profile-composed clientName.
        const [cfg, host, pass, clientName] = destSolConnect.mock.calls[0];
        expect(dialMock).toHaveBeenCalledTimes(1);
        expect(dialMock).toHaveBeenCalledWith('b2', 'w1');
        expect(host).toBe('b2');
        expect(cfg).toMatchObject({ vpn: 'w1', user: 'u-w1', smfPath: '/managed/smf/b2/w1' });
        expect(pass).toBe('pw-w1');
        expect(clientName).toMatch(/^SolMsgUtil\/\d{14}\/.+$/);
        // SEMP: the gateway relay for the broker, never an address or a password.
        const [sempCfg, sempHost, sempPass] = destSempConnect.mock.calls[0];
        expect(sempHost).toBe('b2');
        expect(sempCfg).toMatchObject({ relayBase: '/managed/relay/b2', user: '' });
        expect(sempPass).toBe('');
    });

    it('with Same broker only the Client credential is dialled: the primary\'s SEMP serves the picker', async () => {
        const { el } = await setupProvisioned();
        otherVpn(el);
        pick(el, 'b1', 'v2');

        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());

        expect(dialMock).toHaveBeenCalledWith('b1', 'v2');
        expect(destSempConnect).not.toHaveBeenCalled();
    });

    it('shows Connected with the broker and VPN once UP lands; Disconnect tears both connections down', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());

        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        expect(cardStatus(el)).toBe('Broker "b1", VPN "v1"');
        expect(connectBtn(el).textContent).toBe('Disconnect');
        expect(connectBtn(el).disabled).toBe(false);

        connectBtn(el).click();
        expect(destSolDisconnect).toHaveBeenCalledTimes(1);
        expect(destSempDisconnect).toHaveBeenCalledTimes(1);

        destSolHooks.current.onDisconnected();
        expect(connectBtn(el).textContent).toBe('Connect');
        expect(cardStatus(el)).toBe('');
    });

    it('a failed SEMP leaves the copy possible: the card stays connected and says the queue list is unavailable', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');

        destSempHooks.current.onError({ message: 'boom' });
        expect(connectBtn(el).textContent).toBe('Disconnect');
        expect(cardStatus(el)).toBe('Broker "b1", VPN "v1" -- queue list unavailable: SEMP error: boom');

        // A later SEMP UP clears the note.
        destSempHooks.current.onConnected({ fetch: vi.fn(), baseUrl: 'https://x/SEMP/v2' }, { user: 'u', pass: 'p' });
        expect(cardStatus(el)).toBe('Broker "b1", VPN "v1"');
    });

    it('a SEMP dial that fails before the Client is up shows in the card once it is', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        destSempConnect.mockRejectedValueOnce(new Error('relay down'));
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        await vi.waitFor(() => expect(el('#copy-dest-semp-error').textContent).toBe('relay down'));

        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        expect(cardStatus(el)).toBe('Broker "b1", VPN "v1" -- queue list unavailable: relay down');
    });

    it('a relay 401 asks for a sign-out and is noted on the card', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        const signOut = vi.fn();
        eventBus.on('rbac:sign-out-requested', signOut);

        destSempHooks.current.onAuthFailed();
        expect(el('#copy-dest-semp-error').textContent).toBe('Your session has ended. Sign in again.');
        expect(cardStatus(el)).toContain('queue list unavailable: Your session has ended. Sign in again.');
        expect(signOut).toHaveBeenCalledTimes(1);
    });

    it('a dial refused because the gateway session ended shows on the card and asks for a sign-out', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        const signOut = vi.fn();
        eventBus.on('rbac:sign-out-requested', signOut);
        dialMock.mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthenticated' });

        connectBtn(el).click();
        await vi.waitFor(() => expect(cardError(el)).toBe('Your session has ended. Sign in again.'));
        expect(signOut).toHaveBeenCalledTimes(1);
        expect(destSolConnect).not.toHaveBeenCalled();
        expect(connectBtn(el).disabled).toBe(false);
    });

    it('a profile refusal (signed out under the click) shows on the card without a sign-out request', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        ctx.managedProfile.clear();
        const signOut = vi.fn();
        eventBus.on('rbac:sign-out-requested', signOut);

        connectBtn(el).click();
        await vi.waitFor(() => expect(cardError(el)).toMatch(/requires a sign-in session/i));
        expect(destSolConnect).not.toHaveBeenCalled();
        expect(destSempConnect).not.toHaveBeenCalled();
        expect(signOut).not.toHaveBeenCalled();
    });

    it('a failed connect shows its reason, and the disconnect that follows does not wipe it', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());

        destSolHooks.current.onConnectFailed({ infoStr: 'timeout' });
        expect(cardError(el)).toBe('Connection failed: timeout');
        destSolHooks.current.onDisconnected();
        expect(cardError(el)).toBe('Connection failed: timeout');
        expect(connectBtn(el).disabled).toBe(false);
        expect(connectBtn(el).textContent).toBe('Connect');
    });

    it('an SDK error shows on the card too', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onError(new Error('socket reset'));
        expect(cardError(el)).toBe('socket reset');
    });

    it('a Direct destination reports only on its own rows: the hidden card is left alone', async () => {
        const { el } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);
        destSolHooks.current.onError(new Error('x'));
        destSempHooks.current.onError({ message: 'y' });
        expect(cardError(el)).toBe('');
        expect(el('#copy-dest-sol-error').textContent).toBe('x');
    });
});

describe('queue-copy -- provisioned destination: a connect in flight', () => {
    const DIALLED_V1 = { ok: true, data: { smfPath: '/managed/smf/b1/v1', vpn: 'v1', user: 'u-v1', pass: 'pw-v1' } };

    /** Broker b1, VPN v1 chosen and the card's Connect clicked, with a dial the test answers by hand. */
    async function dialling() {
        const h = await setupProvisioned();
        needSecondary(h.el);
        let answer: (v: any) => void = () => {};
        dialMock.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
        connectBtn(h.el).click();
        await vi.waitFor(() => expect(dialMock).toHaveBeenCalledWith('b1', 'v1'));
        return { ...h, answerDial: (v: any) => answer(v) };
    }

    /** Fill both names so Next is gated only on the destination connection. */
    function names(el: El): void {
        for (const [sel, v] of [['#copy-source-input', 'ops.src'], ['#copy-dest-input', 'ops.dest']]) {
            el<HTMLInputElement>(sel).value = v;
            el<HTMLInputElement>(sel).dispatchEvent(new Event('input'));
        }
    }

    it('locks the card and the toggles while dialling; a refused dial unlocks them and shows why', async () => {
        const { el, answerDial } = await dialling();
        for (const sel of ['#copy-dest-prov-broker', '#copy-dest-prov-vpn', '#copy-btn-dest-prov-connect']) {
            expect(el<HTMLInputElement>(sel).disabled).toBe(true);
        }
        expect(connectBtn(el).textContent).toBe('Connecting...');
        for (const sel of ['#copy-toggle-same-broker', '#copy-toggle-same-vpn']) {
            expect(el<HTMLInputElement>(sel).disabled).toBe(true);
            expect(el<HTMLInputElement>(sel).title).toBe(DEST_TARGET_LOCKED_TITLE);
        }

        answerDial({ ok: false, status: 503, code: 'upstream_unavailable' });
        await vi.waitFor(() => expect(connectBtn(el).textContent).toBe('Connect'));

        expect(cardError(el)).not.toBe('');
        expect(el<HTMLSelectElement>('#copy-dest-prov-broker').disabled).toBe(false);
        expect(el<HTMLSelectElement>('#copy-dest-prov-vpn').disabled).toBe(false);
        expect(connectBtn(el).disabled).toBe(false);
        expect(el<HTMLInputElement>('#copy-toggle-same-broker').disabled).toBe(false);
        // Same VPN keeps its own rule: it means nothing without Same broker.
        expect(el<HTMLInputElement>('#copy-toggle-same-vpn').disabled).toBe(true);
        expect(destSolConnect).not.toHaveBeenCalled();
    });

    it('a second click on the busy Connect starts nothing more', async () => {
        const { el } = await dialling();
        connectBtn(el).click();
        expect(dialMock).toHaveBeenCalledTimes(1);
    });

    it('a refresh while dialling re-renders the card but keeps it locked', async () => {
        const { ctx, el } = await dialling();
        ctx.managedProfile.setProfile(PROFILE);
        eventBus.emit('rbac:changed');
        expect(el<HTMLSelectElement>('#copy-dest-prov-vpn').disabled).toBe(true);
        expect(el<HTMLSelectElement>('#copy-dest-prov-broker').disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-toggle-same-broker').disabled).toBe(true);
    });

    it('the VPN withdrawn during the dial: the connect is cancelled, the late session is discarded and nothing can start', async () => {
        const { ctx, el, answerDial } = await dialling();
        ctx.managedProfile.setProfile({
            ...PROFILE, brokers: [{ broker: 'b1', msgVpns: [{ name: 'v2' }] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');
        // The refresh tears the destination down at once, the connect in flight included.
        expect(destSolDisconnect).toHaveBeenCalledTimes(1);

        answerDial(DIALLED_V1);
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');

        expect(destSolDisconnect).toHaveBeenCalledTimes(2);
        expect(cardError(el)).toMatch(/changed while connecting/);
        expect(connectBtn(el).textContent).toBe('Connect');
        names(el);
        expect(el<HTMLButtonElement>('#copy-btn-start').disabled).toBe(true);
    });

    it('a live session whose VPN is withdrawn is torn down, and the chosen queue goes with it', async () => {
        const { ctx, el, answerDial } = await dialling();
        answerDial(DIALLED_V1);
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        names(el);
        expect(el<HTMLButtonElement>('#copy-btn-start').disabled).toBe(false);

        ctx.managedProfile.setProfile({
            ...PROFILE, brokers: [{ broker: 'b1', msgVpns: [{ name: 'v2' }] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');

        expect(destSolDisconnect).toHaveBeenCalledTimes(1);
        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('');
        destSolHooks.current.onDisconnected();
        expect(connectBtn(el).textContent).toBe('Connect');
        expect(el<HTMLButtonElement>('#copy-btn-start').disabled).toBe(true);
    });

    it('switching a toggle on a connected destination drops it and the card reads Connect again', async () => {
        const { el, answerDial } = await dialling();
        answerDial(DIALLED_V1);
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        expect(connectBtn(el).textContent).toBe('Disconnect');

        otherVpn(el);
        expect(destSolDisconnect).toHaveBeenCalledTimes(1);
        expect(connectBtn(el).textContent).toBe('Connect');
        expect(cardStatus(el)).toBe('');
    });
});

describe('queue-copy -- provisioned destination: topic availability', () => {
    it('blocks Topic while the publish path uses provisioned credentials', async () => {
        const { el, hidden } = await setupProvisioned();
        // sameBroker+sameVpn => publishes through the managed primary.
        expect(el<HTMLInputElement>('#copy-dest-type-toggle').disabled).toBe(true);
        expect(hidden('#copy-dest-topic-blocked')).toBe(false);
    });

    it('blocks Topic on a provisioned secondary too', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        expect(el<HTMLInputElement>('#copy-dest-type-toggle').disabled).toBe(true);
    });

    it('resets an already-chosen Topic back to Queue when a sign-in makes the path provisioned', async () => {
        const { ctx, appState, el } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);                       // Direct => topic allowed
        const toggle = el<HTMLInputElement>('#copy-dest-type-toggle');
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        el<HTMLInputElement>('#copy-dest-input').value = 'some/topic';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        ctx.managedProfile.setProfile(PROFILE);
        appState.managed = SESSION;
        eventBus.emit('rbac:changed');           // => topic no longer expressible

        expect(toggle.disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('');
    });

    it('allows Topic with a Direct primary and its own destination', async () => {
        const { el, hidden } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);
        expect(el<HTMLInputElement>('#copy-dest-type-toggle').disabled).toBe(false);
        expect(hidden('#copy-dest-topic-blocked')).toBe(true);
    });
});

describe('queue-copy -- provisioned destination: the destination picker', () => {
    /** Bring the secondary SEMP connection up, as the connect hook would. */
    function connectDestSemp(): void {
        destSempHooks.current.onConnected(
            { fetch: vi.fn(), baseUrl: 'https://host1:1943/SEMP/v2' },
            { user: 'mon', pass: 'x' },
        );
    }

    it('picks against the DESTINATION broker at operate scope', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSempConnect).toHaveBeenCalled());
        connectDestSemp();

        el<HTMLButtonElement>('#copy-btn-dest-pick').click();
        await vi.waitFor(() => expect(pickQueueMock).toHaveBeenCalled());

        // The key carries scope + broker + entitlement fingerprint, so the
        // picker cache cannot serve a list built for another identity.
        const [source] = pickQueueMock.mock.calls[0];
        expect(source.key).toContain('|operate|b1|');
        expect(source.key).toContain('ops.*');
    });

    it('picks unfiltered when the destination uses typed credentials (Direct primary)', async () => {
        const { el } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);
        connectDestSemp();

        el<HTMLButtonElement>('#copy-btn-dest-pick').click();
        await vi.waitFor(() => expect(pickQueueMock).toHaveBeenCalled());

        const [source] = pickQueueMock.mock.calls[0];
        expect(source.key).toBe('https://host1:1943/SEMP/v2');
    });
});

describe('queue-copy -- provisioned destination: the destination gate', () => {
    const access = { session: SESSION, broker: 'b1', vpn: 'v1' };

    /** A destination reached over a store-dialled secondary connection. */
    function provisionedSecondary(name: string, prov = { broker: 'b1', vpn: 'v1' }) {
        const state = createInitialState();
        state.destForm.sameBroker = false;
        state.destForm.sameVpn = false;
        state.destForm.credMode = 'provisioned';
        state.destForm.provisioned = prov;
        state.dest = { type: 'queue', name };
        return state;
    }

    it('refuses a provisioned secondary target outside the operate entitlement', () => {
        expect(destinationRefusal(provisionedSecondary('other.dest'), access))
            .toMatch(/not entitled to write/i);
    });

    it('permits a provisioned secondary target inside the operate entitlement', () => {
        expect(destinationRefusal(provisionedSecondary('ops.dest'), access)).toBeNull();
    });

    it('checks the PROVISIONED broker and VPN, not the source ones', () => {
        // Entitled on b1/v1 only; the secondary lands on b2/w1.
        const scoped: ManagedSession = {
            ...SESSION, operate: [{ brokers: 'b1', msgVpns: 'v1', queues: 'ops.*' }],
        };
        const state = provisionedSecondary('ops.dest', { broker: 'b2', vpn: 'w1' });
        expect(destinationRefusal(state, { session: scoped, broker: 'b1', vpn: 'v1' }))
            .toMatch(/not entitled to write/i);
    });

    it('refuses a topic on a provisioned secondary', () => {
        const state = provisionedSecondary('some/topic');
        state.dest.type = 'topic';
        expect(destinationRefusal(state, access)).toMatch(/Topic destinations are unavailable/i);
    });

    it('leaves a typed-credential secondary ungated -- the documented bypass', () => {
        const state = provisionedSecondary('other.dest');
        state.destForm.credMode = 'manual';
        expect(destinationRefusal(state, access)).toBeNull();
    });
});

describe('queue-copy -- provisioned destination: rbac:changed lifecycle', () => {
    /**
     * Drive the module's real Start path so the engine mock receives the module's
     * own `state`, then leave the run unsettled so it counts as active.
     */
    async function startRun(over: Partial<AppState> = {}) {
        const h = await setupProvisioned(over);
        runCopyJobMock.mockImplementation((state: any) => {
            captured.state = state;
            state.job = { total: 5, copied: 0, cancelRequested: false, lastError: null, status: 'running' };
            return new Promise(() => { /* never settles: the run stays active */ });
        });
        // The module tracks the primary session from the bus, not AppState.
        eventBus.emit('client:connected', {
            session: { on: vi.fn(), getSessionProperties: () => ({ userName: 'u1' }) },
        });
        const set = (sel: string, v: string) => {
            const input = h.el<HTMLInputElement>(sel);
            input.value = v;
            input.dispatchEvent(new Event('input'));
        };
        set('#copy-source-input', 'ops.src');
        set('#copy-dest-input', 'ops.dest');
        h.el<HTMLButtonElement>('#copy-btn-start').click();                 // opens the modal
        await vi.waitFor(() => expect(h.el<HTMLButtonElement>('#copy-modal-start').disabled).toBe(false));
        h.el<HTMLButtonElement>('#copy-modal-start').click();           // starts the run
        await vi.waitFor(() => expect(captured.state).not.toBeNull());
        return h;
    }

    it('halts an active run when the source entitlement is revoked', async () => {
        const { appState } = await startRun();
        expect(captured.state.job.cancelRequested).toBe(false);

        appState.managed = { ...SESSION, operate: [], readOnly: [] };
        eventBus.emit('rbac:changed');

        // Same halt the Cancel button uses -- the treatment is identical.
        expect(captured.state.job.cancelRequested).toBe(true);
    });

    it('halts a MOVE run when operate is revoked even though the queue stays visible', async () => {
        const { appState } = await startRun();
        captured.state.mode = 'move';
        // Visible read-only: browse still permitted, operate withdrawn.
        appState.managed = {
            ...SESSION, operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: 'ops.*' }],
        };
        eventBus.emit('rbac:changed');
        expect(captured.state.job.cancelRequested).toBe(true);
    });

    it('leaves a COPY run alone when only operate is revoked', async () => {
        const { appState } = await startRun();
        captured.state.mode = 'copy';
        appState.managed = {
            ...SESSION, operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: 'ops.*' }],
        };
        eventBus.emit('rbac:changed');
        expect(captured.state.job.cancelRequested).toBe(false);
    });

    it('a run on the primary itself (Same broker, Same VPN) is not halted by a refresh that changes nothing', async () => {
        const { ctx } = await startRun();
        ctx.managedProfile.setProfile(PROFILE);
        eventBus.emit('rbac:changed');
        // No destination was ever chosen on the card; that is not a revoked one.
        expect(captured.state.job.cancelRequested).toBe(false);
    });

    it('degrades to allow-all when a logout clears the session mid-run', async () => {
        const { appState } = await startRun();
        // Logout clears both; the connection teardown that follows is the
        // connections module's job, so this handler must not halt on its own.
        appState.managed = null;
        appState.selectedVpn = null;
        eventBus.emit('rbac:changed');
        expect(captured.state.job.cancelRequested).toBe(false);
    });

    it('never disconnects the primary -- the source rides a connection this module does not own', async () => {
        const { appState } = await startRun();
        appState.managed = { ...SESSION, operate: [], readOnly: [] };
        eventBus.emit('rbac:changed');
        expect(appState.isConnected).toBe(true);
        expect(appState.isSempConnected).toBe(true);
    });

    it('a finished run no longer blocks tearing down a destination whose provisioning was revoked', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');

        // The run settles at once through the module's own onComplete.
        runCopyJobMock.mockImplementation((state: any, _session: any, hooks: any) => {
            state.job = { total: 5, copied: 5, cancelRequested: false, lastError: null, status: 'completed' };
            hooks.onComplete(state.job);
            return Promise.resolve();
        });
        eventBus.emit('client:connected', { session: { on: vi.fn() } });
        for (const [sel, v] of [['#copy-source-input', 'ops.src'], ['#copy-dest-input', 'ops.dest']]) {
            el<HTMLInputElement>(sel).value = v;
            el<HTMLInputElement>(sel).dispatchEvent(new Event('input'));
        }
        el<HTMLButtonElement>('#copy-btn-start').click();
        await vi.waitFor(() => expect(el<HTMLButtonElement>('#copy-modal-start').disabled).toBe(false));
        el<HTMLButtonElement>('#copy-modal-start').click();
        expect(el('#copy-modal-title').textContent).toBe('Completed');

        // v1 is revoked after the run finished: the destination connections go.
        ctx.managedProfile.setProfile({
            ...PROFILE, brokers: [{ broker: 'b1', msgVpns: [] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');

        expect(destSolDisconnect).toHaveBeenCalledTimes(1);
        expect(destSempDisconnect).toHaveBeenCalledTimes(1);
    });

    /** A connected provisioned destination b1/v1 with a chosen queue. */
    async function connectedWithTarget() {
        const h = await setupProvisioned();
        needSecondary(h.el);
        connectBtn(h.el).click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        h.el<HTMLInputElement>('#copy-dest-input').value = 'ops.dest';
        h.el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));
        return h;
    }

    it('a destination whose Client failed but whose SEMP is up is still torn down when its VPN is withdrawn', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        connectBtn(el).click();
        await vi.waitFor(() => expect(destSempConnect).toHaveBeenCalled());
        destSolHooks.current.onConnectFailed({ infoStr: 'refused' });
        destSempHooks.current.onConnected({ fetch: vi.fn(), baseUrl: 'https://x/SEMP/v2' }, { user: 'u', pass: 'p' });

        ctx.managedProfile.setProfile({
            ...PROFILE, brokers: [{ broker: 'b1', msgVpns: [{ name: 'v2' }] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');

        expect(destSempDisconnect).toHaveBeenCalledTimes(1);
    });

    it('drops the chosen target when the connected VPN disappears', async () => {
        const { ctx, el } = await connectedWithTarget();
        ctx.managedProfile.setProfile({
            ...PROFILE,
            brokers: [{ ...PROFILE.brokers[0], msgVpns: [] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');

        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('');
    });

    it('keeps the chosen target when the refresh leaves the VPN provisioned', async () => {
        const { ctx, el } = await connectedWithTarget();
        ctx.managedProfile.setProfile(PROFILE);     // same provisioning
        eventBus.emit('rbac:changed');

        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('ops.dest');
    });

    it('a refresh never wipes a queue typed before any destination was connected', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        el<HTMLInputElement>('#copy-dest-input').value = 'ops.dest';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        ctx.managedProfile.setProfile(PROFILE);
        eventBus.emit('rbac:changed');

        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('ops.dest');
    });

    it('re-lists the provisioned brokers after a refresh changes the profile', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);

        ctx.managedProfile.setProfile({ ...PROFILE, brokers: [PROFILE.brokers[1]] });
        eventBus.emit('rbac:changed');

        expect(options(el, '#copy-dest-prov-broker')).toEqual(['b2']);
    });
});
