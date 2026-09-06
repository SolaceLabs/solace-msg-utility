import type { SempContext } from '../../core/types';
import type { SolacePublisher } from '../../core/services/solace-publisher';

/**
 * Module-scoped state for queue-copy. Lives in closure inside module.ts and is
 * passed to service helpers by reference so they can read + mutate it directly
 * (matches the queue-browser/state.js pattern). Never persisted; passwords
 * cleared on disconnect.
 */

export type CopyMode = 'copy' | 'move';
export type DestType = 'queue' | 'topic';

/**
 * Where the destination's credentials come from when a secondary connection is
 * needed. `'manual'` is the typed form (the only option outside a managed
 * session); `'provisioned'` selects a broker/VPN the managed session is entitled
 * to and lets the core store broker the credential, so nothing is typed.
 */
export type DestCredMode = 'manual' | 'provisioned';

export interface DestForm {
    /** When true, dest reuses primary host + SEMP creds. */
    sameBroker: boolean;
    /** When true, dest reuses primary VPN + Solace creds. Forced false when sameBroker is false. */
    sameVpn: boolean;
    /**
     * Credential source for the secondary connection. Which options the user is
     * offered is derived from the deployment's `CONN_MODES` — see
     * `destCredModesFor` in ui-events.
     */
    credMode: DestCredMode;
    /** Selection when `credMode === 'provisioned'` — names only, from the store. */
    provisioned: { broker: string; vpn: string };
    /** Visible only when !sameBroker. */
    host: string;
    /** Visible when !sameBroker || !sameVpn (Solace client side). */
    solace: { protocol: string; port: string; urlPath: string; vpn: string; user: string };
    /** Visible only when !sameBroker (SEMP REST side). */
    semp: { protocol: string; port: string; urlPath: string; user: string };
}

export interface DestTarget {
    type: DestType;
    /** Queue name (when type='queue') or topic string (when type='topic'). */
    name: string;
}

export interface VerifyResult {
    /** Source queue exists per SEMP v1 probe (or QueueBrowser-bind probe fallback). */
    sourceOk: boolean;
    /** Which path verified existence. */
    via: 'semp' | 'queue-browser';
    /** Human-readable error messages collected during verification. */
    errors: string[];
    /** VPN the source queue lives in (from SEMP `info/message-vpn`, else null). */
    messageVpn: string | null;
    /** Number of messages currently spooled (SEMP `num-messages-spooled`, else accumulated count). */
    messageCount: number | null;
    /** Current spool usage (SEMP `current-spool-usage-in-bytes`, else accumulated bytes). */
    spoolUsageBytes: number | null;
    /** Spool quota in bytes (SEMP `quota` is MB; converted to bytes here). Null in QueueBrowser fallback. */
    quotaBytes: number | null;
    /** Max message size from SEMP `max-message-size` (bytes). Null in QueueBrowser fallback. */
    maxMessageSize: number | null;
    /**
     * Oldest message ID currently spooled. From SEMP `info/oldest-msg-id` or
     * tracked as min(seenIds) during the QueueBrowser-accumulate fallback.
     * The run-phase uses this to detect drift: if the broker's first-browsed
     * message no longer matches, the queue state has changed and we abort.
     */
    oldestMsgId: string | null;
    /**
     * Newest message ID currently spooled. From SEMP `info/newest-msg-id` or
     * tracked as max(seenIds) during fallback. The run-phase treats this as a
     * hard stop boundary: copy oldest → newest in one pass, then stop.
     */
    newestMsgId: string | null;
    /**
     * Source queue access type as resolved against the client session. For
     * SEMP-path verify, this starts as the raw `<others-permission>` value
     * but is overridden to `'read-write'` by the modal's owner check when
     * the SEMP `<owner>` field matches the client session username (owners
     * have full access regardless of others-permission). For QB-fallback
     * verify, this is the SDK's `_messageConsumer._permissions` which the
     * SDK has already evaluated from the client's perspective (owner
     * status is baked in). Null when neither path could determine it.
     *
     * Values:
     * - `'no-access'`: SEMP others-permission was `No-Access*` AND the
     *   client user is not the owner. Both copy and move are blocked.
     * - `'read-only'`: SEMP `Read-Only*` (non-owner) or SDK `READ_ONLY`.
     *   Copy is allowed; move is blocked (move needs consume permission).
     * - `'read-write'`: SEMP `Consume*` / `Modify-Topic*` / `Delete*`
     *   (non-owner) OR the client user IS the owner OR SDK `READ_WRITE`.
     *   Both copy and move are allowed.
     * - `null`: the value couldn't be determined; the gate is permissive.
     */
    accessType: 'no-access' | 'read-only' | 'read-write' | null;
    /**
     * Source queue owner as reported by SEMP `<info>/<owner>`. Used by the
     * modal to grant full access when the client session username matches
     * (owners bypass the `others-permission` check). Empty string when
     * SEMP reports an empty owner; null when the field is missing or when
     * verify went through the QB-fallback path (which doesn't surface owner
     * — the SDK already factored it into `_permissions`).
     */
    owner: string | null;
}

export interface CopyJob {
    /** Recorded message count from verification. Used both as the run target and as the post-stop count-mismatch check. */
    total: number;
    /** Messages successfully published + (in move mode) removed. Phase-2 compares against `total`. */
    copied: number;
    /** Set by the modal's Cancel handler. Phase 1 turns this into stopReason='cancel'. */
    cancelRequested: boolean;
    /** Populated by triggerStop for publish-error / browser-error / and by Phase 2 for source-drift / max-consumed / count-mismatch outcomes. Drives the modal's error pane copy. */
    lastError: string | null;
    /** Phase-2 final classification. 'running' is the initial value; Phase 2 finalizes one of 'completed' / 'cancelled' / 'error' just before onComplete fires. The modal reads this directly to choose the title and pane. */
    status: 'running' | 'completed' | 'cancelled' | 'error';
}

export interface QueueCopyState {
    sourceQueue: string;
    dest: DestTarget;
    destForm: DestForm;
    /** Live form-input values for passwords. Never persisted. */
    destSolacePass: string;
    destSempPass: string;
    mode: CopyMode;

    /** Live secondary Solace session — null when same broker AND same VPN (primary is reused). */
    destSession: any | null;
    /** Live secondary SEMP context — null when same broker (primary SEMP reused). */
    destSempCtx: SempContext | null;

    /**
     * Publisher tied to the destination session. Created when destSolHooks.onConnected
     * fires; disposed on destSolHooks.onDisconnected. Null when the destination is
     * the primary session (sameVpn path) — the engine falls back to `primaryPublisher`.
     */
    destPublisher: SolacePublisher | null;
    /**
     * Publisher tied to the primary session. Created on `client:connected`; disposed
     * on `client:disconnected`. Used as the publish endpoint when destSession is
     * null (sameVpn path).
     */
    primaryPublisher: SolacePublisher | null;

    /** Active verification phase, or null when idle. */
    verify: { inProgress: boolean; abort: AbortController | null; result: VerifyResult | null } | null;
    /** Active copy run, or null when idle. */
    job: CopyJob | null;
}

export function createInitialState(): QueueCopyState {
    return {
        sourceQueue: '',
        dest: { type: 'queue', name: '' },
        destForm: {
            sameBroker: true,
            sameVpn: true,
            // Manual is the only universally-available source; a managed
            // deployment re-pins this when the destination panel initialises.
            credMode: 'manual',
            provisioned: { broker: '', vpn: '' },
            host: '',
            solace: { protocol: 'wss', port: '', urlPath: '', vpn: '', user: '' },
            semp: { protocol: 'https', port: '', urlPath: '', user: '' },
        },
        destSolacePass: '',
        destSempPass: '',
        mode: 'copy',
        destSession: null,
        destSempCtx: null,
        destPublisher: null,
        primaryPublisher: null,
        verify: null,
        job: null,
    };
}

/**
 * Reset state to its initial shape. Called on module install and on a fresh
 * "Start Copy" click after a previous run completed/aborted. Preserves the
 * form values the user last typed so they don't have to re-enter on retry.
 */
export function resetTransientState(s: QueueCopyState): void {
    s.verify = null;
    s.job = null;
    // Note: destSession / destSempCtx / publishers kept across runs; user explicitly
    // disconnects. Pending publishes are owned by the publishers and cleared via
    // their dispose() / rejectAllPending() on disconnect.
}

/**
 * Snapshot of the primary connection used by `syncDestFormFromSnapshot`. Mirrors
 * the shape `module.ts#getPrimarySnapshot` produces; declared here as a thin
 * structural type so state.ts has no import dependency on ui.ts.
 */
export interface DestPrefillSnapshot {
    host: string;
    solace: { protocol: string; port: string; urlPath: string; vpn: string; user: string };
    semp: { protocol: string; port: string; urlPath: string; user: string };
}

/**
 * Mirror primary-connection values into `state.destForm` whenever the toggles
 * say the destination is reusing the primary. Called from three places:
 *   1. ui-events install — initial sync on module load
 *   2. ui-events sameBroker / sameVpn change handlers
 *   3. module.ts refreshFromPrimary — primary connect / disconnect / SEMP up/down
 *
 * Without (3), the DOM stays in sync via `applyDestPrefill` but `state.destForm`
 * doesn't, so a later "uncheck Same broker → click Connect without retyping"
 * would send empty host/creds to the dest factories.
 */
export function syncDestFormFromSnapshot(state: QueueCopyState, snap: DestPrefillSnapshot | null): void {
    if (state.destForm.sameBroker && snap) {
        state.destForm.host = snap.host;
        state.destForm.semp = {
            protocol: snap.semp.protocol,
            port: snap.semp.port,
            urlPath: snap.semp.urlPath,
            user: snap.semp.user,
        };
        state.destForm.solace = {
            ...state.destForm.solace,
            protocol: snap.solace.protocol,
            port: snap.solace.port,
            urlPath: snap.solace.urlPath,
        };
    }
    if (state.destForm.sameBroker && state.destForm.sameVpn && snap) {
        state.destForm.solace = {
            ...state.destForm.solace,
            vpn: snap.solace.vpn,
            user: snap.solace.user,
        };
    }
}
