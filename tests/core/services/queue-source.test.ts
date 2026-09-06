import { describe, it, expect, vi } from 'vitest';
import { sempQueueSource, queueSourceFrom } from '../../../src/core/services/queue-source';
import type { FetchPage } from '../../../src/core/services/semp-discovery';
import type { SempContext } from '../../../src/core/connections/types';
import type { AppContext, ManagedSession, QGlob } from '../../../src/core/types';

/**
 * queue-source — the connection-owned discovery seam the queue-picker consumes.
 *
 * Entitlement is a REQUIRED argument: `queueSourceFrom(ctx, scope)` and
 * `sempQueueSource(sempCtx, access)`. Filtering happens inside the constructors
 * (`browse` ⇒ isQueueVisible, `operate` ⇒ canOperate), so consumers stay
 * RBAC-agnostic and `'unmanaged'` is the single greppable bypass.
 */

async function collect(gen: AsyncGenerator<FetchPage>): Promise<FetchPage[]> {
    const out: FetchPage[] = [];
    for await (const page of gen) out.push(page);
    return out;
}

/** A SempContext whose fetch returns canned VPN/queue list pages (single page). */
function stubbedSempCtx(vpns: string[], queues: string[], baseUrl = 'http://b:8080'): SempContext {
    const fetch = vi.fn(async (path: string) => {
        if (/\/msgVpns\/[^/]+\/queues/.test(path)) {
            return { ok: true, json: async () => ({ data: queues.map(q => ({ queueName: q })) }) } as any;
        }
        return { ok: true, json: async () => ({ data: vpns.map(v => ({ msgVpnName: v })) }) } as any;
    });
    return { fetch, baseUrl };
}

/** A SempContext whose list fetch fails, to prove error pages survive filtering. */
function failingSempCtx(): SempContext {
    return { fetch: vi.fn(async () => ({ ok: false, statusText: 'Forbidden' }) as any), baseUrl: 'http://b:8080' };
}

const ALLOW_ALL: QGlob[] = [{ brokers: '*', msgVpns: '*', queues: '*' }];

function managedSession(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false, username: 'u', token: 't', broker: 'b1',
        vpns: [], operate: ALLOW_ALL, readOnly: [],
        ...over,
    };
}

/** operate on `ops.*`, read-only on `ro.*` — so browse ⊃ operate observably. */
const SCOPED = managedSession({
    operate: [{ brokers: 'b1', msgVpns: '*', queues: 'ops.*' }],
    readOnly: [{ brokers: 'b1', msgVpns: '*', queues: 'ro.*' }],
});

function makeCtx(over: {
    connected?: boolean;
    creds?: any;
    managed?: ManagedSession | null;
    sempFetch?: any;
} = {}): AppContext {
    return {
        appState: {
            isSempConnected: over.connected ?? true,
            // `'creds' in over` so an explicit `creds: null` is honored (a plain
            // `?? default` would swallow it and the no-credentials test couldn't run).
            sempCredentials: 'creds' in over ? over.creds : { baseUrl: 'http://b:8080', user: 'u', pass: 'p', protocol: 'https', host: 'b', port: '8080', urlPath: '' },
            managed: over.managed ?? null,
        },
        sempFetch: over.sempFetch ?? vi.fn(),
    } as unknown as AppContext;
}

describe('core/services/queue-source — sempQueueSource', () => {
    it("'unmanaged' lists everything the broker reports and keys on the baseUrl alone", async () => {
        const sempCtx = stubbedSempCtx(['v1', 'v2'], ['q1', 'q2'], 'http://broker-x:9000');
        const src = sempQueueSource(sempCtx, 'unmanaged');

        expect(await collect(src.listVpns())).toEqual([{ ok: true, data: ['v1', 'v2'] }]);
        expect(await collect(src.listQueues('v1'))).toEqual([{ ok: true, data: ['q1', 'q2'] }]);
        expect((sempCtx.fetch as any)).toHaveBeenCalledWith(expect.stringContaining('/msgVpns/v1/queues'));
        // Unmanaged filters nothing, so all unmanaged consumers of a broker share
        // one picker-cache entry.
        expect(src.key).toBe('http://broker-x:9000');
    });

    it('managed access filters queues by scope — browse keeps read-only, operate drops it', async () => {
        const queues = ['ops.a', 'ro.b', 'other.c'];

        const browse = sempQueueSource(stubbedSempCtx([], queues), { session: SCOPED, broker: 'b1', scope: 'browse' });
        expect(await collect(browse.listQueues('v1'))).toEqual([{ ok: true, data: ['ops.a', 'ro.b'] }]);

        const operate = sempQueueSource(stubbedSempCtx([], queues), { session: SCOPED, broker: 'b1', scope: 'operate' });
        expect(await collect(operate.listQueues('v1'))).toEqual([{ ok: true, data: ['ops.a'] }]);
    });

    it('managed access filters the VPN list by entitlement', async () => {
        const session = managedSession({ operate: [{ brokers: 'b1', msgVpns: 'vpn-ok', queues: '*' }], readOnly: [] });
        const src = sempQueueSource(stubbedSempCtx(['vpn-ok', 'vpn-nope'], []), { session, broker: 'b1', scope: 'browse' });
        expect(await collect(src.listVpns())).toEqual([{ ok: true, data: ['vpn-ok'] }]);
    });

    it('passes error pages through the filter untouched', async () => {
        const src = sempQueueSource(failingSempCtx(), { session: SCOPED, broker: 'b1', scope: 'operate' });
        expect(await collect(src.listQueues('v1'))).toEqual([{ ok: false, error: 'Forbidden' }]);
        expect(await collect(src.listVpns())).toEqual([{ ok: false, error: 'Forbidden' }]);
    });

    it('keys differ per scope so a browse cache is never reused for operate', () => {
        const base = stubbedSempCtx([], []);
        const browse = sempQueueSource(base, { session: SCOPED, broker: 'b1', scope: 'browse' }).key;
        const operate = sempQueueSource(base, { session: SCOPED, broker: 'b1', scope: 'operate' }).key;
        const otherBroker = sempQueueSource(base, { session: SCOPED, broker: 'b2', scope: 'browse' }).key;

        expect(browse).not.toBe(operate);
        expect(browse).not.toBe(otherBroker);
    });
});

describe('core/services/queue-source — queueSourceFrom', () => {
    it('returns null when SEMP is not connected', () => {
        expect(queueSourceFrom(makeCtx({ connected: false }), 'browse')).toBeNull();
    });

    it('returns null when there are no SEMP credentials', () => {
        expect(queueSourceFrom(makeCtx({ creds: null }), 'browse')).toBeNull();
    });

    it('unmanaged (Direct): both lists come from live SEMP, unfiltered, keyed on baseUrl', async () => {
        const sempFetch = stubbedSempCtx(['live-a', 'live-b'], ['q1']).fetch;
        const source = queueSourceFrom(makeCtx({ managed: null, sempFetch }), 'operate')!;

        expect(await collect(source.listVpns())).toEqual([{ ok: true, data: ['live-a', 'live-b'] }]);
        // Direct mode is unfiltered even at 'operate' scope — no session, no RBAC.
        expect(await collect(source.listQueues('v1'))).toEqual([{ ok: true, data: ['q1'] }]);
        expect(source.key).toBe('http://b:8080');
        expect(sempFetch).toHaveBeenCalled();
    });

    it('managed: VPNs come from the provisioned set with NO SEMP call', async () => {
        const sempFetch = vi.fn();
        const managed = managedSession({ vpns: ['prov-1', 'prov-2'] });
        const source = queueSourceFrom(makeCtx({ managed, sempFetch }), 'browse')!;

        expect(await collect(source.listVpns())).toEqual([{ ok: true, data: ['prov-1', 'prov-2'] }]);
        expect(sempFetch).not.toHaveBeenCalled(); // provisioned set, no broker round-trip
    });

    it('managed: queues come from live SEMP, filtered by the requested scope', async () => {
        const queues = ['ops.a', 'ro.b'];
        const browse = queueSourceFrom(makeCtx({ managed: SCOPED, sempFetch: stubbedSempCtx([], queues).fetch }), 'browse')!;
        expect(await collect(browse.listQueues('v1'))).toEqual([{ ok: true, data: ['ops.a', 'ro.b'] }]);

        const operate = queueSourceFrom(makeCtx({ managed: SCOPED, sempFetch: stubbedSempCtx([], queues).fetch }), 'operate')!;
        expect(await collect(operate.listQueues('v1'))).toEqual([{ ok: true, data: ['ops.a'] }]);
    });

    it('managed key folds in scope + provisioned set + entitlement rows (changes invalidate the picker cache)', () => {
        const base = managedSession({ vpns: ['a'], operate: [{ brokers: 'b1', msgVpns: 'a', queues: '*' }], readOnly: [] });
        const k = (m: ManagedSession, scope: 'browse' | 'operate' = 'browse') =>
            queueSourceFrom(makeCtx({ managed: m }), scope)!.key;

        const k0 = k(base);
        expect(k(managedSession({ ...base }))).toBe(k0);                                    // identical inputs → identical key
        expect(k(base, 'operate')).not.toBe(k0);                                            // scope change
        expect(k(managedSession({ ...base, vpns: ['a', 'b'] }))).not.toBe(k0);               // provisioning change
        expect(k(managedSession({ ...base, broker: 'b9' }))).not.toBe(k0);                   // broker change
        expect(k(managedSession({ ...base, operate: [{ brokers: '*', msgVpns: '*', queues: '*' }] }))).not.toBe(k0);
        expect(k(managedSession({ ...base, readOnly: [{ brokers: 'b1', msgVpns: 'a', queues: 'x' }] }))).not.toBe(k0);
    });
});
