import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { createManagedSessionStore } from '../../../src/core/services/managed-session-store';
import { fromB64, importSeed, pack } from '../../../src/core/encode';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import type { AppContext, AppState, EventBus, ManagedSession } from '../../../src/core/types';

/**
 * Provisioned destination (step 3b). A managed user selects a destination broker
 * and VPN they are entitled to instead of typing credentials; the core managed
 * store dials it, so no secret passes through this module.
 *
 * Kept separate from `module.test.ts` because it mocks the copy engine, which
 * lets the `rbac:changed` halt be observed directly on `state.job`.
 */
const { pickQueueMock } = vi.hoisted(() => ({
    pickQueueMock: vi.fn(async () => ({ vpn: 'v1', queue: 'ops.picked' })) as any,
}));
vi.mock('../../../src/core/components/queue-picker', () => ({ pickQueue: pickQueueMock }));

// Capture what reaches the destination connection factories.
const { destSempConnect, destSolConnect } = vi.hoisted(() => ({
    destSempConnect: vi.fn(), destSolConnect: vi.fn(),
}));
const { destSempHooks } = vi.hoisted(() => ({ destSempHooks: { current: null as any } }));
vi.mock('../../../src/core/services/semp-client', () => ({
    createServiceSemp: vi.fn((hooks: any) => {
        destSempHooks.current = hooks;
        return { connect: destSempConnect, disconnect: vi.fn() };
    }),
}));
vi.mock('../../../src/core/services/solace-client', () => ({
    createServiceSolace: vi.fn(() => ({ init: vi.fn(), connect: destSolConnect, disconnect: vi.fn() })),
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

const SEED_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
/** Plaintext the store must hand the factories after unpacking. */
const SECRET = { sempB1: 'semp-b1-pw', cliV1: 'cli-v1-pw', cliV2: 'cli-v2-pw' };

/**
 * The profile carries PACKED passwords, so they are produced with the real
 * transform against the real seed — a hand-written literal is rejected by
 * `unpack` and would only prove the error path.
 */
let PROFILE: any;
beforeAll(async () => {
    const seed = await importSeed(fromB64(SEED_B64));
    PROFILE = {
        admin: false,
        siteSeed: SEED_B64,
        operate: [{ brokers: '*', msgVpns: '*', queues: 'ops.*' }],
        readOnly: [],
        brokers: [
            {
                broker: 'b1', hostname: 'host1',
                semp: { port: '1943', user: 'mon', pass: await pack(SECRET.sempB1, seed) },
                msgVpns: [
                    { name: 'v1', client: { port: '1443', user: 'u1', pass: await pack(SECRET.cliV1, seed) } },
                    { name: 'v2', client: { port: '1443', user: 'u2', pass: await pack(SECRET.cliV2, seed) } },
                ],
            },
            {
                broker: 'b2', hostname: 'host2',
                semp: { port: '1943', user: 'mon', pass: await pack('semp-b2-pw', seed) },
                msgVpns: [{ name: 'w1', client: { port: '1443', user: 'u3', pass: await pack('cli-w1-pw', seed) } }],
            },
        ],
    };
});

const SESSION: ManagedSession = {
    admin: false, username: 'u', token: 't', broker: 'b1', vpns: ['v1', 'v2'],
    operate: [{ brokers: '*', msgVpns: '*', queues: 'ops.*' }], readOnly: [],
};

let container: HTMLElement;
let eventBus: EventBus;

beforeEach(() => {
    container = loadModuleDOM('queue-copy');
    eventBus = createEventBus();
    destSempConnect.mockClear();
    destSolConnect.mockClear();
    pickQueueMock.mockClear();
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
        connConfig: { connModes: 'both', defaultConn: 'direct' },
        ...over,
    };
    const ctx: AppContext = {
        container, appState, eventBus,
        setState: vi.fn((k, v) => { (appState as any)[k] = v; }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedStore: createManagedSessionStore(),
        copyToClipboard: vi.fn(),
        config: {},
    };
    if (signIn) await ctx.managedStore.setProfile(PROFILE as any);
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
        const { el, hidden } = await setupProvisioned({ connConfig: { connModes: 'managed', defaultConn: 'managed' } });
        needSecondary(el);
        expect(hidden('#copy-dest-cred-mode-row')).toBe(true);
        expect(hidden('#copy-dest-provisioned-block')).toBe(false);
        expect(el<HTMLInputElement>('#copy-dest-cred-manual').disabled).toBe(true);
    });

    it('offers Manual only in a direct deployment', async () => {
        const { el, hidden } = await setupProvisioned({
            connConfig: { connModes: 'direct', defaultConn: 'direct' }, managed: null,
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
        // 'both' deployment, empty store: Manual is a legitimate remaining option.
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
            { connConfig: { connModes: 'managed', defaultConn: 'managed' }, managed: null }, false);
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

describe('queue-copy — provisioned destination: connecting through the store', () => {
    it('dials dest SEMP with the store-supplied host and an unpacked credential', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);

        el<HTMLButtonElement>('#copy-btn-dest-semp-connect').click();
        await vi.waitFor(() => expect(destSempConnect).toHaveBeenCalled());

        const [cfg, host, pass] = destSempConnect.mock.calls[0];
        expect(host).toBe('host1');                        // from the profile, never typed
        expect(cfg).toMatchObject({ protocol: 'https', port: '1943', user: 'mon' });
        expect(pass).toBe(SECRET.sempB1);                  // unpacked, not the packed blob
    });

    it('dials dest Solace for the selected VPN with a store-composed clientName', async () => {
        const { el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        const vpnSel = el<HTMLSelectElement>('#copy-dest-prov-vpn');
        vpnSel.value = 'v2';
        vpnSel.dispatchEvent(new Event('change'));

        el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
        await vi.waitFor(() => expect(destSolConnect).toHaveBeenCalled());

        const [cfg, host, pass, clientName] = destSolConnect.mock.calls[0];
        expect(host).toBe('host1');
        expect(cfg).toMatchObject({ vpn: 'v2', user: 'u2', port: '1443' });
        expect(pass).toBe(SECRET.cliV2);
        expect(clientName).toMatch(/^SolMsgUtil\/\d{14}\/.+$/);
    });

    it('surfaces a store refusal on the destination card instead of throwing', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        ctx.managedStore.clear();      // signed out underneath the click

        el<HTMLButtonElement>('#copy-btn-dest-semp-connect').click();
        await vi.waitFor(() =>
            expect(el('#copy-dest-semp-error').textContent).toMatch(/requires a managed session/i));
        expect(destSempConnect).not.toHaveBeenCalled();
    });

    it('surfaces a Solace store refusal too', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        ctx.managedStore.clear();

        el<HTMLButtonElement>('#copy-btn-dest-sol-connect').click();
        await vi.waitFor(() =>
            expect(el('#copy-dest-sol-error').textContent).toMatch(/requires a managed session/i));
        expect(destSolConnect).not.toHaveBeenCalled();
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

    it('drops the chosen target when the provisioned VPN disappears', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);
        el<HTMLInputElement>('#copy-dest-input').value = 'ops.dest';
        el<HTMLInputElement>('#copy-dest-input').dispatchEvent(new Event('input'));

        await ctx.managedStore.setProfile({
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

        await ctx.managedStore.setProfile(PROFILE);     // same provisioning
        eventBus.emit('rbac:changed');

        expect(el<HTMLInputElement>('#copy-dest-input').value).toBe('ops.dest');
    });

    it('re-lists the provisioned brokers after a refresh changes the profile', async () => {
        const { ctx, el } = await setupProvisioned();
        needSecondary(el);
        chooseProvisioned(el);

        await ctx.managedStore.setProfile({ ...PROFILE, brokers: [PROFILE.brokers[1]] } as any);
        eventBus.emit('rbac:changed');

        expect(Array.from(el<HTMLSelectElement>('#copy-dest-prov-broker').options).map(o => o.value))
            .toEqual(['b2']);
    });
});
