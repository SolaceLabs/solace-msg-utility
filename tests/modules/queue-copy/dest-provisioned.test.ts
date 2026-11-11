import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedProfile } from '../../../src/core/services/managed-profile';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus, ManagedSession } from '../../../src/core/types';

/**
 * Provisioned destination (step 3b). A managed user selects a destination broker
 * and VPN they are entitled to instead of typing credentials; the core managed
 * profile connects SEMP through the gateway's relay and dials SMF, so the only
 * secret this module ever handles is the dialled password it passes to the SDK.
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

/** Ask for a secondary connection so the credential control becomes relevant. */
function needSecondary(el: El): void {
    const sameBroker = el<HTMLInputElement>('#copy-toggle-same-broker');
    sameBroker.checked = false;
    sameBroker.dispatchEvent(new Event('change'));
}
function chooseProvisioned(el: El): void {
    const radio = el<HTMLInputElement>('#copy-dest-cred-provisioned');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
}

describe('queue-copy — provisioned destination: credential-source control', () => {
    it('offers both sources and lists provisioned brokers + VPNs when chosen', async () => {
        const { el, hidden } = await setupProvisioned();
        needSecondary(el);
        expect(hidden('#copy-dest-cred-mode-row')).toBe(false);

        chooseProvisioned(el);
        expect(hidden('#copy-dest-provisioned-block')).toBe(false);
        expect(Array.from(el<HTMLSelectElement>('#copy-dest-prov-broker').options).map(o => o.value))
            .toEqual(['b1', 'b2']);
        expect(Array.from(el<HTMLSelectElement>('#copy-dest-prov-vpn').options).map(o => o.value))
            .toEqual(['v1', 'v2']);
    });

    it('re-lists VPNs when the provisioned broker changes', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const broker = el<HTMLSelectElement>('#copy-dest-prov-broker');
        broker.value = 'b2';
        broker.dispatchEvent(new Event('change'));
        expect(Array.from(el<HTMLSelectElement>('#copy-dest-prov-vpn').options).map(o => o.value)).toEqual(['w1']);
    });

    it('disables every typed credential field in provisioned mode and clears typed passwords', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        el<HTMLInputElement>('#copy-dest-semp-pass').value = 'typed';
        chooseProvisioned(el);

        expect(el<HTMLInputElement>('#copy-dest-host').disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-semp-user').disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-sol-user').disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-semp-pass').value).toBe('');
    });

    it('switching back to Manual restores the fields the toggles allow', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const manual = el<HTMLInputElement>('#copy-dest-cred-manual');
        manual.checked = true;
        manual.dispatchEvent(new Event('change'));
        // sameBroker is off, so the host field is the user's to type again.
        expect(el<HTMLInputElement>('#copy-dest-host').disabled).toBe(false);
    });

    it('pins Provisioned with no control (and no Manual escape) in a managed-only deployment', async () => {
        const { el, hidden } = await setupProvisioned({ connConfig: { hosted: true, connModes: 'provisioned', defaultConn: 'provisioned' } });
        needSecondary(el);
        expect(hidden('#copy-dest-cred-mode-row')).toBe(true);
        expect(hidden('#copy-dest-provisioned-block')).toBe(false);
        expect(el<HTMLInputElement>('#copy-dest-cred-manual').disabled).toBe(true);
    });

    it('offers Manual only in a direct deployment', async () => {
        const { el, hidden } = await setupProvisioned({
            connConfig: { hosted: false, connModes: 'direct', defaultConn: 'direct' }, managed: null,
        });
        needSecondary(el);
        expect(hidden('#copy-dest-cred-mode-row')).toBe(true);
        expect(hidden('#copy-dest-provisioned-block')).toBe(true);
    });

    it('hides the control while the destination IS the primary connection', async () => {
        const { hidden } = await setupProvisioned();
        expect(hidden('#copy-dest-cred-mode-row')).toBe(true);
        expect(hidden('#copy-dest-provisioned-block')).toBe(true);
    });

    it('drops Provisioned from the offer when nothing is signed in', async () => {
        // 'both' deployment, no profile: Manual is a legitimate remaining option.
        const { el, hidden } = await setupProvisioned({ managed: null }, false);
        needSecondary(el);
        expect(hidden('#copy-dest-cred-mode-row')).toBe(true);
        expect(hidden('#copy-dest-provisioned-block')).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-host').disabled).toBe(false);
    });

    it('keeps Provisioned on offer when signed out of a managed-only deployment', async () => {
        // Filtering by "signed in" would leave nothing — and falling back to
        // Manual would hand out the very bypass this deployment forbids.
        const { el, hidden } = await setupProvisioned(
            { connConfig: { hosted: true, connModes: 'provisioned', defaultConn: 'provisioned' }, managed: null }, false);
        needSecondary(el);
        expect(hidden('#copy-dest-provisioned-block')).toBe(false);
        expect(el<HTMLSelectElement>('#copy-dest-prov-broker').options.length).toBe(0);
        expect(el<HTMLInputElement>('#copy-dest-host').disabled).toBe(true);
    });

    it('re-selecting the active credential source keeps the chosen target', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const destInput = el<HTMLInputElement>('#copy-dest-input');
        destInput.value = 'ops.dest';
        destInput.dispatchEvent(new Event('input'));

        chooseProvisioned(el);                      // same source again — a no-op
        expect(destInput.value).toBe('ops.dest');
    });
});

describe('queue-copy -- provisioned destination: connecting through the profile', () => {
    it('connects dest SEMP through the gateway relay, with no credential and no dial', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);

        el<HTMLButtonElement>('#copy-btn-dest-semp-connect').click();
        await vi.waitFor(() => expect(destSempConnect).toHaveBeenCalled());

        const [cfg, host, pass] = destSempConnect.mock.calls[0];
        expect(host).toBe('b1');                           // the provisioned name, never an address
        expect(cfg).toMatchObject({ relayBase: '/managed/relay/b1', user: '' });
        expect(pass).toBe('');
        expect(dialMock).not.toHaveBeenCalled();
    });

    it('dials dest Solace for the selected VPN with a profile-composed clientName', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const vpnSel = el<HTMLSelectElement>('#copy-dest-prov-vpn');
        vpnSel.value = 'v2';
        vpnSel.dispatchEvent(new Event('change'));

        el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());

        const [cfg, host, pass, clientName] = destSolConnect.mock.calls[0];
        expect(dialMock).toHaveBeenCalledWith('b1', 'v2');
        expect(host).toBe('b1');
        expect(cfg).toMatchObject({ vpn: 'v2', user: 'u-v2', smfPath: '/managed/smf/b1/v2' });
        expect(pass).toBe('pw-v2');
        expect(clientName).toMatch(/^SolMsgUtil\/\d{14}\/.+$/);
    });

    it('a dial refused because the gateway session ended asks for a sign-out', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const signOut = vi.fn();
        eventBus.on('rbac:sign-out-requested', signOut);
        dialMock.mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthenticated' });

        el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
        await vi.waitFor(() => expect(el('#copy-dest-sol-error').textContent).toBe('Your session has ended. Sign in again.'));
        expect(signOut).toHaveBeenCalledTimes(1);
        expect(destSolConnect).not.toHaveBeenCalled();
    });

    it('a relay 401 on the provisioned destination asks for a sign-out', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const signOut = vi.fn();
        eventBus.on('rbac:sign-out-requested', signOut);

        destSempHooks.current.onAuthFailed();
        expect(el('#copy-dest-semp-error').textContent).toBe('Your session has ended. Sign in again.');
        expect(signOut).toHaveBeenCalledTimes(1);
    });

    it('surfaces a profile refusal on the destination card instead of throwing', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        ctx.managedProfile.clear();    // signed out underneath the click

        el<HTMLButtonElement>('#copy-btn-dest-semp-connect').click();
        await vi.waitFor(() =>
            expect(el('#copy-dest-semp-error').textContent).toMatch(/requires a sign-in session/i));
        expect(destSempConnect).not.toHaveBeenCalled();
    });

    it('surfaces a Solace profile refusal too, without asking for a sign-out', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        ctx.managedProfile.clear();
        const signOut = vi.fn();
        eventBus.on('rbac:sign-out-requested', signOut);

        el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
        await vi.waitFor(() =>
            expect(el('#copy-dest-sol-error').textContent).toMatch(/requires a sign-in session/i));
        expect(destSolConnect).not.toHaveBeenCalled();
        expect(signOut).not.toHaveBeenCalled();
    });
});

describe('queue-copy -- provisioned destination: a connect in flight', () => {
    const DIALLED_V1 = { ok: true, data: { smfPath: '/managed/smf/b1/v1', vpn: 'v1', user: 'u-v1', pass: 'pw-v1' } };

    /** Provisioned b1/v1 chosen and Connect Client clicked, with a dial the test answers by hand. */
    async function dialling() {
        const h = await setupProvisioned();
        needSecondary(h.el);
        chooseProvisioned(h.el);
        let answer: (v: any) => void = () => {};
        dialMock.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
        h.el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
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

    it('locks what chooses the destination while dialling; a refused dial unlocks it', async () => {
        const { el, answerDial } = await dialling();
        const locked = ['#copy-dest-prov-broker', '#copy-dest-prov-vpn',
            '#copy-dest-cred-provisioned', '#copy-dest-cred-manual', '#copy-toggle-same-broker'];
        for (const sel of locked) {
            expect(el<HTMLInputElement>(sel).disabled).toBe(true);
            expect(el<HTMLInputElement>(sel).title).toBe(DEST_TARGET_LOCKED_TITLE);
        }

        answerDial({ ok: false, status: 503, code: 'upstream_unavailable' });
        await vi.waitFor(() => expect(el('#copy-dest-sol-status').textContent).toBe('Not connected'));

        for (const sel of locked) expect(el<HTMLInputElement>(sel).disabled).toBe(false);
        // Same VPN keeps its own rule: it means nothing without Same broker.
        expect(el<HTMLInputElement>('#copy-toggle-same-vpn').disabled).toBe(true);
        expect(destSolConnect).not.toHaveBeenCalled();
    });

    it('a refresh while dialling re-renders the selectors but keeps them locked', async () => {
        const { ctx, el } = await dialling();
        ctx.managedProfile.setProfile(PROFILE);
        eventBus.emit('rbac:changed');
        expect(el<HTMLSelectElement>('#copy-dest-prov-vpn').disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-cred-manual').disabled).toBe(true);
    });

    it('a VPN changed during the dial: the late session is discarded and nothing can start', async () => {
        const { el, answerDial } = await dialling();
        // The selector is locked; dispatching the change models the race the lock closes.
        const vpnSel = el<HTMLSelectElement>('#copy-dest-prov-vpn');
        vpnSel.value = 'v2';
        vpnSel.dispatchEvent(new Event('change'));
        expect(destSolDisconnect).toHaveBeenCalledTimes(1);

        answerDial(DIALLED_V1);
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');

        expect(destSolDisconnect).toHaveBeenCalledTimes(2);
        expect(el('#copy-dest-sol-status').textContent).toBe('Not connected');
        names(el);
        expect(el<HTMLButtonElement>('#copy-btn-start').disabled).toBe(true);
    });

    it('a refresh that moves the VPN under a live destination session: Start is refused', async () => {
        const { ctx, el, answerDial } = await dialling();
        answerDial(DIALLED_V1);
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());
        destSolHooks.current.onConnected({ on: vi.fn() }, 'v1');
        expect(el('#copy-dest-sol-status').textContent).toBe('Connected (v1)');

        // v1 is withdrawn, v2 stays: the selector moves to v2 while the v1 session lives on.
        ctx.managedProfile.setProfile({
            ...PROFILE, brokers: [{ broker: 'b1', msgVpns: [{ name: 'v2' }] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');
        expect(el<HTMLSelectElement>('#copy-dest-prov-vpn').value).toBe('v2');

        eventBus.emit('client:connected', { session: { on: vi.fn() } });
        names(el);
        el<HTMLButtonElement>('#copy-btn-start').click();
        await vi.waitFor(() => expect(el<HTMLButtonElement>('#copy-modal-start').disabled).toBe(false));
        el<HTMLButtonElement>('#copy-modal-start').click();

        expect(el('#copy-run-error').textContent).toMatch(/does not match the destination selected/);
        expect(runCopyJobMock).not.toHaveBeenCalled();
    });
});

describe('queue-copy — provisioned destination: topic availability', () => {
    it('blocks Topic while the publish path uses provisioned credentials', async () => {
        const { el, hidden } = await setupProvisioned();
        // sameBroker+sameVpn ⇒ publishes through the managed primary.
        expect(el<HTMLInputElement>('#copy-dest-type-toggle').disabled).toBe(true);
        expect(hidden('#copy-dest-topic-blocked')).toBe(false);
    });

    it('resets an already-chosen Topic back to Queue when the path becomes provisioned', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);                       // manual ⇒ topic allowed
        const toggle = el<HTMLInputElement>('#copy-dest-type-toggle');
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        el<HTMLInputElement>('#copy-dest-input').value = 'some/topic';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        chooseProvisioned(el);                   // ⇒ topic no longer expressible

        expect(toggle.disabled).toBe(true);
        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('');
    });

    it('allows Topic with manual credentials', async () => {
        const { el, hidden } = await setupProvisioned();
        needSecondary(el);
        expect(el<HTMLInputElement>('#copy-dest-type-toggle').disabled).toBe(false);
        expect(hidden('#copy-dest-topic-blocked')).toBe(true);
    });

    it('allows Topic in a direct session', async () => {
        const { el } = await setupProvisioned({ managed: null });
        expect(el<HTMLInputElement>('#copy-dest-type-toggle').disabled).toBe(false);
    });
});

describe('queue-copy — provisioned destination: the destination picker', () => {
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
        chooseProvisioned(el);
        connectDestSemp();

        el<HTMLButtonElement>('#copy-btn-dest-pick').click();
        await vi.waitFor(() => expect(pickQueueMock).toHaveBeenCalled());

        // The key carries scope + broker + entitlement fingerprint, so the
        // picker cache cannot serve a list built for another identity.
        const [source] = pickQueueMock.mock.calls[0];
        expect(source.key).toContain('|operate|b1|');
        expect(source.key).toContain('ops.*');
    });

    it('picks unfiltered when the destination uses typed credentials', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);            // manual is this deployment's default
        connectDestSemp();

        el<HTMLButtonElement>('#copy-btn-dest-pick').click();
        await vi.waitFor(() => expect(pickQueueMock).toHaveBeenCalled());

        const [source] = pickQueueMock.mock.calls[0];
        expect(source.key).toBe('https://host1:1943/SEMP/v2');
    });
});

describe('queue-copy — provisioned destination: the destination gate', () => {
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

    it('leaves a typed-credential secondary ungated — the documented bypass', () => {
        const state = provisionedSecondary('other.dest');
        state.destForm.credMode = 'manual';
        expect(destinationRefusal(state, access)).toBeNull();
    });
});

describe('queue-copy — provisioned destination: rbac:changed lifecycle', () => {
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

        // Same halt the Cancel button uses — the treatment is identical.
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

    it('degrades to allow-all when a logout clears the session mid-run', async () => {
        const { appState } = await startRun();
        // Logout clears both; the connection teardown that follows is the
        // connections module's job, so this handler must not halt on its own.
        appState.managed = null;
        appState.selectedVpn = null;
        eventBus.emit('rbac:changed');
        expect(captured.state.job.cancelRequested).toBe(false);
    });

    it('never disconnects the primary — the source rides a connection this module does not own', async () => {
        const { appState } = await startRun();
        appState.managed = { ...SESSION, operate: [], readOnly: [] };
        eventBus.emit('rbac:changed');
        expect(appState.isConnected).toBe(true);
        expect(appState.isSempConnected).toBe(true);
    });

    it('a finished run no longer blocks tearing down a destination whose provisioning was revoked', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
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

    it('drops the chosen target when the provisioned VPN disappears', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        el<HTMLInputElement>('#copy-dest-input').value = 'ops.dest';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        ctx.managedProfile.setProfile({
            ...PROFILE,
            brokers: [{ ...PROFILE.brokers[0], msgVpns: [] }, PROFILE.brokers[1]],
        } as any);
        eventBus.emit('rbac:changed');

        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('');
    });

    it('keeps the chosen target when the refresh leaves the VPN provisioned', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        el<HTMLInputElement>('#copy-dest-input').value = 'ops.dest';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        ctx.managedProfile.setProfile(PROFILE);     // same provisioning
        eventBus.emit('rbac:changed');

        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('ops.dest');
    });

    it('re-lists the provisioned brokers after a refresh changes the profile', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);

        ctx.managedProfile.setProfile({ ...PROFILE, brokers: [PROFILE.brokers[1]] });
        eventBus.emit('rbac:changed');

        expect(Array.from(el<HTMLSelectElement>('#copy-dest-prov-broker').options).map(o => o.value))
            .toEqual(['b2']);
    });
});
