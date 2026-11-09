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
 * A module absent from this map is subject to module control instead (see
 * `isModuleVisible`).
 *
 *   - `'admin'`           — only for `admin: true` sessions (the management UIs).
 *   - `'unfiltered-semp'` — the module reaches the broker by a route the
 *     entitlement filter cannot cover (SEMP v1 RPC), so it is only safe when no
 *     managed session is in force. Denied in EVERY managed session until it
 *     consumes an entitlement-filtered source. The gateway's module catalog
 *     (`moduleCatalog` in go-web-proxy/configfile.go) leaves these out too, so
 *     an administrator cannot grant them.
 */
const MODULE_REQUIREMENTS: Record<string, 'admin' | 'unfiltered-semp'> = {
    'user-management': 'admin',
    'connection-management': 'admin',
    'gateway-settings': 'admin',
    // Vestigial: it drives raw SEMP v1 discovery, which nothing filters.
    // (queue-subscription-explorer also reads over SEMP v1, but filters its
    // rows itself with `visibleQueueRows`, so it is under module control.)
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

function findQueueRow(rows: QGlob[], broker: string, vpn: string, queue: string): QGlob | undefined {
    return rows.find(r => matchGlob(r.brokers, broker) && matchGlob(r.msgVpns, vpn) && matchGlob(r.queues, queue));
}

function findVpnRow(rows: QGlob[], broker: string, vpn: string): QGlob | undefined {
    // Connection-level entitlement ignores the queue glob (a broker/vpn is
    // reachable if any row grants any queue on it).
    return rows.find(r => matchGlob(r.brokers, broker) && matchGlob(r.msgVpns, vpn));
}

function matchesAny(rows: QGlob[], broker: string, vpn: string, queue: string): boolean {
    return findQueueRow(rows, broker, vpn, queue) !== undefined;
}

function vpnMatchesAny(rows: QGlob[], broker: string, vpn: string): boolean {
    return findVpnRow(rows, broker, vpn) !== undefined;
}

/** The sign-in surfaces: shown in every managed session, never granted. */
const ALWAYS_VISIBLE = new Set(['connections', 'admin-login']);

/**
 * Whether a module's sidebar entry + view should be shown for this session.
 * Past the requirements above, a managed user sees the sign-in surfaces and
 * the modules the gateway granted them (`session.modules`, from the user's
 * own list or the deployment default, within what the deployment offers).
 */
export function isModuleVisible(s: ManagedSession | null | undefined, id: string): boolean {
    if (!s) return true;                       // no managed session — allow-all
    const requirement = MODULE_REQUIREMENTS[id];
    if (requirement === 'admin') return s.admin;
    if (requirement === 'unfiltered-semp') return false;
    return ALWAYS_VISIBLE.has(id) || s.modules.includes(id);
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

/** What an entitlement-row set grants on one queue; see `explainAccess`. */
export type AccessLevel = 'operate' | 'read-only' | 'vpn-only' | 'none';

export interface AccessExplanation {
    level: AccessLevel;
    /** The first row that grants `level`; null for `'none'`. */
    row: QGlob | null;
}

/**
 * What a set of entitlement rows gives on one queue, and the row that gives it:
 *   - `'operate'`   -- an operate row matches broker, VPN and queue (`canOperate`).
 *   - `'read-only'` -- only a read-only row matches all three (`isQueueVisible`).
 *   - `'vpn-only'`  -- a row matches broker and VPN but none the queue: the VPN
 *     is reachable (`isVpnVisible`) and the queue hidden.
 *   - `'none'`      -- no row matches broker and VPN; `row` is null.
 * Built on the same predicates as the enforcing helpers above, so the admin
 * app's permission test cannot disagree with what a session gets.
 */
export function explainAccess(
    rows: Pick<ManagedSession, 'operate' | 'readOnly'>,
    broker: string,
    vpn: string,
    queue: string,
): AccessExplanation {
    const operate = findQueueRow(rows.operate, broker, vpn, queue);
    if (operate) return { level: 'operate', row: operate };
    const readOnly = findQueueRow(rows.readOnly, broker, vpn, queue);
    if (readOnly) return { level: 'read-only', row: readOnly };
    const vpnRow = findVpnRow(rows.operate, broker, vpn) ?? findVpnRow(rows.readOnly, broker, vpn);
    if (vpnRow) return { level: 'vpn-only', row: vpnRow };
    return { level: 'none', row: null };
}
