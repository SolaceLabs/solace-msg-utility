/**
 * The demo's single source of truth: every VPN, queue, host and identity the
 * mock broker knows about, plus the live scenario state the control panel
 * drives.
 *
 * Before this module the demo had six independently hand-written mocks, and two
 * of them disagreed — `semp-discovery-mock` advertised `test-queue-1` /
 * `Q/ORDER/NEW` while the subscription explorer's mock returned `BULKQ-001` /
 * `payments-Q`, so a queue you could pick was not a queue you could inspect.
 * Everything now reads from here, so that class of drift is structurally gone.
 *
 * Mock-only: reachable exclusively through the `mode === 'mock'` import
 * redirect, so no production bundle contains it.
 */

/* ------------------------------------------------------------------ */
/*  Hosts                                                              */
/* ------------------------------------------------------------------ */

/**
 * Host gates, preserved from the mocks this replaces so existing demo scripts
 * and the user guide keep working.
 */
export const MOCK_HOST = {
    /** The only host that connects. */
    OK: 'broker.solace.com',
    /** Substring match — simulates an untrusted broker certificate. */
    UNTRUSTED: 'untrust.com',
} as const;

/* ------------------------------------------------------------------ */
/*  Queue behaviour                                                    */
/* ------------------------------------------------------------------ */

/**
 * What a queue does when you touch it. The control panel flips a queue between
 * these; `fixtures.queueState` holds the live value.
 */
export const QUEUE_STATE = {
    /** Browsable, deletable, forwardable. */
    NORMAL: 'normal',
    /** Binds, but the SDK reports READ_ONLY — Delete hides, the badge shows. */
    READ_ONLY: 'read-only',
    /** `connect()` on the browser fails, exercising the bind-error path. */
    BIND_DENIED: 'bind-denied',
    /** Binds and reports zero messages. */
    EMPTY: 'empty',
} as const;
export type QueueState = typeof QUEUE_STATE[keyof typeof QUEUE_STATE];

/* ------------------------------------------------------------------ */
/*  Connection faults                                                  */
/* ------------------------------------------------------------------ */

/** One-shot or sticky faults the panel can arm. */
export const FAULT = {
    NONE: 'none',
    /** The next Solace connect attempt reports CONNECT_FAILED_ERROR. */
    CONNECT_FAILS: 'connect-fails',
    /** SEMP responds 401 — drives the auth-failed hook. */
    SEMP_UNAUTHORIZED: 'semp-401',
    /** SEMP responds 500 — drives the generic error hook. */
    SEMP_ERROR: 'semp-500',
} as const;
export type Fault = typeof FAULT[keyof typeof FAULT];

/* ------------------------------------------------------------------ */
/*  RBAC identities                                                    */
/* ------------------------------------------------------------------ */

/**
 * Who is signed in on the Managed tab. Switching emits `rbac:changed`, so the
 * sidebar, pickers and Queue Copy destination all re-derive exactly as they do
 * in production.
 */
export const ROLE = {
    SIGNED_OUT: 'signed-out',
    ADMIN: 'admin',
    OPERATOR: 'operator',
    READ_ONLY: 'readonly',
} as const;
export type Role = typeof ROLE[keyof typeof ROLE];

/** Entitlement rows per role, in the same shape `users.yaml` would carry. */
export const ROLE_ENTITLEMENTS: Record<Exclude<Role, 'signed-out'>, {
    admin: boolean;
    operate: { brokers: string; msgVpns: string; queues: string }[];
    readOnly: { brokers: string; msgVpns: string; queues: string }[];
}> = {
    admin: {
        admin: true,
        operate: [{ brokers: '*', msgVpns: '*', queues: '*' }],
        readOnly: [],
    },
    operator: {
        admin: false,
        operate: [{ brokers: '*', msgVpns: 'vpn-prod', queues: 'Q/ORDER/*' }],
        readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    },
    readonly: {
        admin: false,
        operate: [],
        readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    },
};

/* ------------------------------------------------------------------ */
/*  Topology                                                           */
/* ------------------------------------------------------------------ */

export interface QueueFixture {
    name: string;
    /** Messages seeded at the current volume setting; 0 for a deliberately empty queue. */
    seed: number;
    /** Topic subscriptions reported by the SEMP v1 subscriptions RPC. */
    subscriptions: string[];
    /** Starting behaviour; the panel can change it at runtime. */
    state: QueueState;
}

export interface VpnFixture {
    name: string;
    queues: QueueFixture[];
}

/**
 * The demo topology. Deliberately small enough to reason about, wide enough to
 * exercise every path: a read-only queue for the badge, a bind-denied queue for
 * the error path, an empty queue for the empty-state, and a bulk queue for
 * paging and publisher backpressure.
 */
export const VPNS: VpnFixture[] = [
    {
        name: 'default',
        queues: [
            { name: 'test-queue-1', seed: 24, subscriptions: ['orders/new/>', 'orders/amend/*'], state: QUEUE_STATE.NORMAL },
            { name: 'test-queue-2', seed: 8, subscriptions: ['telemetry/>'], state: QUEUE_STATE.NORMAL },
            { name: 'Q/EMPTY', seed: 0, subscriptions: [], state: QUEUE_STATE.EMPTY },
        ],
    },
    {
        name: 'vpn-prod',
        queues: [
            { name: 'Q/ORDER/NEW', seed: 42, subscriptions: ['orders/new/>'], state: QUEUE_STATE.NORMAL },
            { name: 'Q/ORDER/PROCESS', seed: 15, subscriptions: ['orders/process/*'], state: QUEUE_STATE.NORMAL },
            { name: 'Q/ORDER/ARCHIVE', seed: 0, subscriptions: [], state: QUEUE_STATE.NORMAL },
            { name: 'Q/LOGS/AUDIT', seed: 30, subscriptions: ['audit/>', 'audit/security/*'], state: QUEUE_STATE.READ_ONLY },
            { name: 'Q/DENIED', seed: 5, subscriptions: [], state: QUEUE_STATE.BIND_DENIED },
        ],
    },
    {
        name: 'vpn-dev',
        queues: [
            { name: 'dev-scratch', seed: 12, subscriptions: ['dev/>'], state: QUEUE_STATE.NORMAL },
            { name: 'Q/BULK', seed: 400, subscriptions: ['bulk/>'], state: QUEUE_STATE.NORMAL },
        ],
    },
    {
        name: 'vpn-finance',
        queues: [
            { name: 'payments-Q', seed: 18, subscriptions: ['payments/*/settled', 'payments/reversal/>'], state: QUEUE_STATE.NORMAL },
            { name: 'reports-daily', seed: 6, subscriptions: ['reports/daily/>'], state: QUEUE_STATE.NORMAL },
        ],
    },
];

/** The broker name the Managed tab offers, and the SEMP/client ports it reports. */
export const MANAGED_BROKER = {
    broker: 'demo-broker',
    hostname: MOCK_HOST.OK,
    sempPort: '1943',
    sempUser: 'monitor',
    clientPort: '1443',
    clientUser: 'demo',
} as const;

/**
 * Base64 seed the mock `/managed/getConnections` packs credentials against.
 * Must decode to a valid key length (32 bytes here) — the real `importSeed`
 * runs against it, so a wrong length fails loudly at sign-in.
 */
export const DEMO_SITE_SEED = 'ZGVtby1zaXRlLXNlZWQtMDEyMzQ1Njc4OWFiY2RlZmc=';

/* ------------------------------------------------------------------ */
/*  Live scenario state                                                */
/* ------------------------------------------------------------------ */

export interface ScenarioState {
    /** Per-queue behaviour overrides, keyed `vpn/queue`. */
    queueState: Map<string, QueueState>;
    /** Armed fault, consumed or sticky depending on the fault. */
    fault: Fault;
    /** Signed-in managed identity. */
    role: Role;
    /** Artificial delay applied to broker and SEMP responses, in ms. */
    latencyMs: number;
    /** Multiplier applied to every queue's `seed` when the store reseeds. */
    volume: number;
}

function seedState(): ScenarioState {
    const queueState = new Map<string, QueueState>();
    VPNS.forEach(v => v.queues.forEach(q => queueState.set(`${v.name}/${q.name}`, q.state)));
    return {
        queueState,
        fault: FAULT.NONE,
        role: ROLE.SIGNED_OUT,
        latencyMs: 120,
        volume: 1,
    };
}

/**
 * The live state object. Mutated by the control panel, read by the broker and
 * the HTTP router. Module-level because the demo is a single page with a single
 * broker — the production no-global-state rule governs `src/` proper, and this
 * tree never enters a production bundle.
 */
export const scenario: ScenarioState = seedState();

/** Restore every lever to its seeded value. Used by the panel's Reset control. */
export function resetScenario(): void {
    const fresh = seedState();
    scenario.queueState = fresh.queueState;
    scenario.fault = fresh.fault;
    scenario.role = fresh.role;
    scenario.latencyMs = fresh.latencyMs;
    scenario.volume = fresh.volume;
}

/** Behaviour currently configured for a queue; NORMAL for anything unknown. */
export function queueStateOf(vpn: string, queue: string): QueueState {
    return scenario.queueState.get(`${vpn}/${queue}`) ?? QUEUE_STATE.NORMAL;
}

/** Resolve a delay honouring the latency lever. Awaited by every fake response. */
export function delay(): Promise<void> {
    const ms = scenario.latencyMs;
    return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}
