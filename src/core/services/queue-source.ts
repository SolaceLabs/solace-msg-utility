import type { AppContext, ManagedSession } from '../types';
import type { SempContext } from '../connections/types';
import { createSempDiscovery, type FetchPage } from './semp-discovery';
import { unfilteredPrimarySempContext } from './sempContext';
import { isQueueVisible, isVpnVisible, canOperate } from '../rbac';

/**
 * A connection-owned discovery capability: how to list the VPNs and queues
 * reachable on a connection. The discovery analog of `SempContext` — the
 * queue-picker (and any future discovery consumer) takes a `QueueSource` and is
 * RBAC-agnostic; the source decides where the data comes from and what the
 * caller is entitled to see.
 *
 * Two facts shape this:
 *   - Discovery belongs to whoever owns the connection (the active connection
 *     module for the primary; queue-copy for its secondary/destination), NOT to
 *     the reusable consumer. Components must never run their own SEMP discovery.
 *   - VPNs and queues differ in their DATA, not their handling: VPNs are
 *     enumerable from `connections.yaml` (so managed lists the provisioned set),
 *     while queues have no inventory anywhere (RBAC specifies queue globs), so
 *     `listQueues` discovers live broker queues and filters them here.
 *
 * Entitlement is a REQUIRED constructor argument, so forgetting it is a compile
 * error rather than a silent bypass.
 */
export interface QueueSource {
    /**
     * Cache identity. The picker caches VPN/queue lists by this string, so it
     * MUST change whenever the reachable set could change (a permission or
     * provisioning edit, or a different entitlement scope) — that's what makes a
     * post-Refresh reopen re-read instead of replaying a stale list.
     */
    key: string;
    listVpns(): AsyncGenerator<FetchPage>;
    listQueues(vpn: string): AsyncGenerator<FetchPage>;
}

/**
 * FUTURE (types only, no implementation yet): the entitlement-filtered analog of
 * `QueueSource` for subscription listings. `queue-subscription-explorer` reads
 * `(vpn, queue, subscription)` triples over SEMP v1 RPC, which no filter covers,
 * so it is currently gated out of managed sessions entirely
 * (`MODULE_REQUIREMENTS` in `core/rbac.ts`). Migrating it onto a source shaped
 * like this — filtering each triple by `isQueueVisible` inside the constructor —
 * is what lets it run under RBAC. Declared here so that migration has a fixed
 * target next to the seam it mirrors.
 */
export interface SubscriptionTriple { vpn: string; queue: string; subscription: string }
export interface SubscriptionSource {
    key: string;
    listSubscriptions(): AsyncGenerator<{ ok: true; data: SubscriptionTriple[] } | { ok: false; error: string }>;
}

/**
 * What the caller intends to do with the queues it discovers. `browse` is the
 * read side (`isQueueVisible` — operate ∪ read-only); `operate` is the write
 * side (`canOperate` — operate rows only), which is what copying INTO a queue
 * requires.
 */
export type Scope = 'browse' | 'operate';

/**
 * Entitlement posture for a discovery source.
 *
 * `'unmanaged'` is a deliberate, greppable bypass: it means "no managed session
 * governs this connection" and applies no filtering. **A grep for it should only
 * ever surface the manual-credential destination and direct-mode paths.** A new
 * occurrence anywhere else needs design sign-off — it is the audit point for
 * this whole seam.
 */
export type Access =
    | { session: ManagedSession; broker: string; scope: Scope }
    | 'unmanaged';

/** Whether `access` permits the caller to see this queue. */
function permitsQueue(access: Access, vpn: string, queue: string): boolean {
    if (access === 'unmanaged') return true;
    const { session, broker, scope } = access;
    return scope === 'operate'
        ? canOperate(session, broker, vpn, queue)
        : isQueueVisible(session, broker, vpn, queue);
}

/** Whether `access` permits the caller to see this VPN at all. */
function permitsVpn(access: Access, vpn: string): boolean {
    if (access === 'unmanaged') return true;
    return isVpnVisible(access.session, access.broker, vpn);
}

/**
 * Cache-identity suffix. Folds in the scope, the broker and the entitlement
 * inputs so any change to what the caller may see produces a different key.
 * Unmanaged sources filter nothing, so they share one entry per broker.
 */
function accessKey(access: Access): string {
    if (access === 'unmanaged') return '';
    const { session, broker, scope } = access;
    const fingerprint = JSON.stringify({
        vpns: session.vpns, operate: session.operate, readOnly: session.readOnly,
    });
    return `|${scope}|${broker}|${fingerprint}`;
}

/** Drop names the access doesn't permit, preserving the page/error stream shape. */
async function* filterPages(
    pages: AsyncGenerator<FetchPage>,
    permits: (name: string) => boolean,
): AsyncGenerator<FetchPage> {
    for await (const page of pages) {
        yield page.ok ? { ok: true, data: page.data.filter(permits) } : page;
    }
}

/**
 * SEMP-backed source: both lists come from live broker discovery against the
 * given `SempContext`, filtered by `access`. Used for direct-mode primaries and
 * for queue-copy's secondary/destination connection.
 *
 * Filtering happens HERE rather than relying on the fetch-layer guardrail,
 * because a secondary `SempContext` is not wrapped by `filterSempFetch` and
 * because that wrapper cannot express the `operate` scope.
 */
export function sempQueueSource(sempCtx: SempContext, access: Access): QueueSource {
    const disco = createSempDiscovery(sempCtx);
    return {
        key: `${sempCtx.baseUrl}${accessKey(access)}`,
        listVpns: () => filterPages(disco.fetchVpns(), v => permitsVpn(access, v)),
        listQueues: (vpn: string) => filterPages(disco.fetchQueues(vpn), q => permitsQueue(access, vpn, q)),
    };
}

/**
 * Build the primary connection's `QueueSource` from `AppContext` — the discovery
 * analog of `unfilteredPrimarySempContext`, and the single place that branches
 * managed-vs-unmanaged:
 *   - VPNs: managed → the PROVISIONED set the connection published
 *     (`appState.managed.vpns`, no SEMP call); unmanaged → live SEMP discovery.
 *   - Queues: always live SEMP, filtered by `scope`.
 *
 * Returns `null` when SEMP isn't connected so callers can short-circuit (same
 * contract as `unfilteredPrimarySempContext`).
 */
export function queueSourceFrom(ctx: AppContext, scope: Scope): QueueSource | null {
    const sempCtx = unfilteredPrimarySempContext(ctx);
    if (!sempCtx) return null;

    const managed = ctx.appState.managed;
    if (!managed) return sempQueueSource(sempCtx, 'unmanaged');

    const access: Access = { session: managed, broker: managed.broker, scope };
    const disco = createSempDiscovery(sempCtx);
    const vpns = managed.vpns;
    return {
        key: `${sempCtx.baseUrl}${accessKey(access)}`,
        listVpns: async function* (): AsyncGenerator<FetchPage> {
            // Provisioned VPNs straight from the managed session — no SEMP call,
            // no entitlement-glob over-matching.
            yield { ok: true, data: [...vpns] };
        },
        listQueues: (vpn: string) => filterPages(disco.fetchQueues(vpn), q => permitsQueue(access, vpn, q)),
    };
}
