/**
 * Managed-mode SEMP discovery filter.
 *
 * Wraps a SEMP `fetch` so the two monitor LIST responses are filtered before any
 * consumer parses them:
 *   - `/SEMP/v2/monitor/msgVpns`            → keep only PROVISIONED VPNs
 *     (`managed.vpns`); falls back to the `isVpnVisible` glob check before a
 *     connection has published its provisioned set
 *   - `/SEMP/v2/monitor/msgVpns/{vpn}/queues` → drop queues failing `isQueueVisible`
 * `meta` is preserved so pagination still works. Every other SEMP call (the v1
 * RPC `POST /SEMP`, single-VPN GETs, non-200s, non-JSON) passes through untouched.
 * A v1 reader that lists queues across VPNs (queue-subscription-explorer) filters
 * its parsed rows with `visibleQueueRows` below: the same two rules, applied to
 * rows instead of a JSON list.
 *
 * This is a CLIENT-SIDE guardrail: the proxy returns the full list and the
 * browser drops non-entitled entries (the relay is ungated — see the plan's
 * threat model). It is wired in only for a managed session (by
 * `unfilteredPrimarySempContext`), so non-managed variants are unaffected. Note the
 * primary discovery path now sources VPNs from `managed.vpns` directly via
 * `queueSourceFrom`, so this filter's VPN branch is mainly a defense-in-depth
 * backstop for any other SEMP VPN-list call; the queue branch is the live filter.
 */
import { isVpnVisible, isQueueVisible } from './rbac';
import type { ManagedSession } from './types';

type SempFetch = (path: string, opts?: RequestInit) => Promise<Response>;

// `msgVpns` directly (then ?query / #frag / end) — the VPN list. NOT followed
// by `/`, so it never matches the queue-list path below.
const VPN_LIST_RE = /\/SEMP\/v2\/monitor\/msgVpns(?:[?#]|$)/;
// `msgVpns/{vpn}/queues` — the per-VPN queue list; capture group 1 is the VPN.
const QUEUE_LIST_RE = /\/SEMP\/v2\/monitor\/msgVpns\/([^/?#]+)\/queues(?:[/?#]|$)/;

/**
 * Whether a session may list `vpn` on its connected broker: one of the
 * PROVISIONED VPNs (`managed.vpns`, connections.yaml intersected with the
 * entitlement), or, before a connection has published that set, any VPN an
 * entitlement row reaches (`isVpnVisible`).
 */
export function isListedVpn(managed: ManagedSession, vpn: string): boolean {
    return managed.vpns.length
        ? managed.vpns.includes(vpn)
        : isVpnVisible(managed, managed.broker, vpn);
}

/**
 * The rows a session may see, from a listing that spans VPNs: the VPN is
 * listed (`isListedVpn`) and the queue visible (`isQueueVisible`). With no
 * managed session every row passes, so callers need not branch.
 */
export function visibleQueueRows<T extends { vpn: string; queue: string }>(
    managed: ManagedSession | null | undefined,
    rows: T[],
): T[] {
    if (!managed) return rows;
    return rows.filter(r => isListedVpn(managed, r.vpn) && isQueueVisible(managed, managed.broker, r.vpn, r.queue));
}

export function filterSempFetch(rawFetch: SempFetch, managed: ManagedSession): SempFetch {
    const broker = managed.broker;

    return async (path: string, opts?: RequestInit): Promise<Response> => {
        const res = await rawFetch(path, opts);

        const isVpnList = VPN_LIST_RE.test(path);
        const queueMatch = QUEUE_LIST_RE.exec(path);
        if ((!isVpnList && !queueMatch) || !res.ok) {
            return res; // not a discovery list, or an error — leave untouched
        }

        let json: { data?: unknown[] } & Record<string, unknown>;
        try {
            json = await res.clone().json();
        } catch {
            return res; // not JSON — leave untouched
        }
        if (!Array.isArray(json.data)) {
            return res;
        }

        // VPN list: bound to the PROVISIONED set when it's known -- that's what
        // the picker and the Connections dropdown show (`isListedVpn`).
        const filtered = queueMatch
            ? json.data.filter((q: any) => isQueueVisible(managed, broker, decodeURIComponent(queueMatch[1]), q?.queueName))
            : json.data.filter((v: any) => isListedVpn(managed, v?.msgVpnName));

        return new Response(JSON.stringify({ ...json, data: filtered }), {
            status: res.status,
            statusText: res.statusText,
            headers: { 'content-type': 'application/json' },
        });
    };
}
