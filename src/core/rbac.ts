/**
 * RBAC matchers for the managed variant — pure, stateless functions over a
 * `ManagedSession`. No module-global state (the session lives in `AppState`).
 *
 * Every helper degrades to **allow-all** when the session is absent/null, so
 * shared modules (queue-browser, queue-discovery, kernel) can call them
 * unconditionally and non-managed variants behave exactly as before.
 *
 * Globs are **case-sensitive** (deliberately distinct from the app's
 * case-insensitive UI substring filters in `./utils`): an RBAC row
 * `queues: 'Order*'` must NOT entitle `order-secret`. The same algorithm is
 * mirrored in the Go proxy's `rbac.go`; a shared conformance vector
 * (tests/core/rbac.test.ts ↔ go-web-proxy/rbac_test.go) keeps them in lockstep.
 */
import type { ManagedSession, QGlob } from './types';

/**
 * What a module REQUIRES of a managed session before the kernel will show it.
 * A module absent from this map has no requirement and is always visible.
 *
 *   - `'admin'`           — only for `admin: true` sessions (the management UIs).
 *   - `'unfiltered-semp'` — the module reaches the broker by a route the
 *     entitlement filter cannot cover (SEMP v1 RPC), so it is only safe when no
 *     managed session is in force. Denied in EVERY managed session until it
 *     consumes an entitlement-filtered source.
 */
const MODULE_REQUIREMENTS: Record<string, 'admin' | 'unfiltered-semp'> = {
    'user-management': 'admin',
    'connection-management': 'admin',
    // Lists every (VPN, queue, subscription) triple over SEMP v1 RPC, which
    // `filterSempFetch` does not rewrite — it would expose the whole
    // subscription inventory regardless of entitlement.
    'queue-subscription-explorer': 'unfiltered-semp',
    // Vestigial, but it drives raw SEMP discovery the same way.
    'queue-discovery': 'unfiltered-semp',
};

/**
 * Case-sensitive glob match. `*` matches any run of characters (including
 * empty); all other characters are literal. Supports multiple/leading/middle/
 * trailing `*`. Anchored (full-string) match.
 */
export function matchGlob(pattern: string, value: string): boolean {
    // Split on '*', escape each literal segment, rejoin with '.*'. Splitting
    // first means '*' is never escaped; empty edge segments yield leading/
    // trailing '.*' naturally.
    const body = pattern.split('*').map(seg => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}$`).test(value);
}

function matchesAny(rows: QGlob[], broker: string, vpn: string, queue: string): boolean {
    return rows.some(r => matchGlob(r.brokers, broker) && matchGlob(r.msgVpns, vpn) && matchGlob(r.queues, queue));
}

function vpnMatchesAny(rows: QGlob[], broker: string, vpn: string): boolean {
    // Connection-level entitlement ignores the queue glob (a broker/vpn is
    // reachable if any row grants any queue on it).
    return rows.some(r => matchGlob(r.brokers, broker) && matchGlob(r.msgVpns, vpn));
}

/** Whether a module's sidebar entry + view should be shown for this session. */
export function isModuleVisible(s: ManagedSession | null | undefined, id: string): boolean {
    if (!s) return true;                       // no managed session — allow-all
    const requirement = MODULE_REQUIREMENTS[id];
    if (requirement === 'admin') return s.admin;
    if (requirement === 'unfiltered-semp') return false;
    return true;
}

/**
 * Whether the broker/vpn is reachable at all — any operate OR read-only row
 * matches broker+vpn, regardless of queue. Mirrors the Go proxy's `entitled`.
 * Used to filter the VPN list shown in the picker.
 */
export function isVpnVisible(
    s: ManagedSession | null | undefined,
    broker: string,
    vpn: string,
): boolean {
    if (!s) return true;
    return vpnMatchesAny(s.operate, broker, vpn) || vpnMatchesAny(s.readOnly, broker, vpn);
}

/**
 * Whether the queue may be seen/browsed — union of operate + read-only rows.
 * `operate ⊇ read-only`, so any matching row of either kind grants visibility.
 */
export function isQueueVisible(
    s: ManagedSession | null | undefined,
    broker: string,
    vpn: string,
    queue: string,
): boolean {
    if (!s) return true;
    return matchesAny(s.operate, broker, vpn, queue) || matchesAny(s.readOnly, broker, vpn, queue);
}

/** Whether the user may forward/delete on the queue — operate rows only. */
export function canOperate(
    s: ManagedSession | null | undefined,
    broker: string,
    vpn: string,
    queue: string,
): boolean {
    if (!s) return true;
    return matchesAny(s.operate, broker, vpn, queue);
}
