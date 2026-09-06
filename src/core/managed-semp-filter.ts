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

        // VPN list: bound to the PROVISIONED set (connections.yaml ∩ entitled,
        // published as `managed.vpns`) when it's known — that's what the picker
        // and the Connections dropdown show. Fall back to the entitlement-glob
        // check only before a connection has published its set.
        const allowedVpns = managed.vpns;
        const filtered = queueMatch
            ? json.data.filter((q: any) => isQueueVisible(managed, broker, decodeURIComponent(queueMatch[1]), q?.queueName))
            : json.data.filter((v: any) => allowedVpns.length
                ? allowedVpns.includes(v?.msgVpnName)
                : isVpnVisible(managed, broker, v?.msgVpnName));

        return new Response(JSON.stringify({ ...json, data: filtered }), {
            status: res.status,
            statusText: res.statusText,
            headers: { 'content-type': 'application/json' },
        });
    };
}
