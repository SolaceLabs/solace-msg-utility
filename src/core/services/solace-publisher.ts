import { generateUuid } from '../utils';
import { logger } from '../logger';

declare const solace: any;

/** Default deadline per outgoing publish before resolving as a timeout. */
export const DEFAULT_PUBLISH_ACK_TIMEOUT_MS = 30_000;

/**
 * Destination target for a publish. Matches the existing discriminated union
 * used by queue-copy state so callers can pass `state.dest` directly.
 */
export interface DestTarget {
    type: 'queue' | 'topic';
    name: string;
}

/**
 * Per-publish options. All fields optional — the publisher generates a UUID
 * correlation key when none is supplied, leaves the original-id hint blank,
 * and uses the factory-wide default timeout.
 *
 * `beforeSend` is the last-mile hook for callers that need to tweak the
 * cloned message after destination + delivery mode + correlation key are
 * stamped but before it hits the wire (e.g. setting a custom property the
 * publisher doesn't know about).
 *
 * `onAck` / `onReject` / `onTimeout` are sugar over the returned Promise for
 * callers that prefer the fire-and-forget shape. They fire alongside the
 * Promise's resolution, so callers can mix-and-match: await the Promise for
 * sequential pipelines (queue-copy's drain loop), or pass callbacks for
 * concurrent fire-many UI patterns (queue-browser's forward modal).
 */
export interface SendOptions {
    correlationKey?: string;
    originalIdHint?: string;
    ackTimeoutMs?: number;
    beforeSend?: (clonedMsg: any) => void;
    onAck?: () => void;
    onReject?: (error: string) => void;
    onTimeout?: () => void;
}

/** Settled shape — never rejects. Single union keeps the loop branch trivial. */
export type SendResult = { ok: true } | { ok: false; error: string };

export interface SolacePublisher {
    /**
     * Clone an original SDK message, stamp destination + PERSISTENT delivery
     * mode + correlation key, send it, and await the broker's ACK/REJECT.
     * Settles with `{ ok: true }` on ACK, `{ ok: false, error }` on REJECT,
     * synchronous send failure, or timeout.
     */
    send(originalMsg: any, dest: DestTarget, opts?: SendOptions): Promise<SendResult>;

    /**
     * Resolve every still-pending publish with the given reason. Use on
     * destination disconnect (ACKs will never arrive) or to short-circuit a
     * cancelled run so awaits settle within the same tick instead of waiting
     * out the 30 s timeout.
     */
    rejectAllPending(reason: string): void;

    /**
     * Detach the session-level ACK/REJECT listeners and reject any outstanding
     * publishes with `reason`. Idempotent — safe to call from multiple
     * disconnect paths.
     */
    dispose(reason?: string): void;

    /**
     * True iff a publish with this correlation key is still in-flight. Used
     * by the queue-browser forward modal to detect cross-modal UUID collision
     * (one-in-2^122 odds, but kept as a safety net).
     */
    isPending(correlationKey: string): boolean;
}

export interface PublisherOptions {
    /** Override the per-publish ACK timeout for this publisher. Falls back to DEFAULT_PUBLISH_ACK_TIMEOUT_MS. */
    ackTimeoutMs?: number;
}

type Pending = {
    resolve: (r: SendResult) => void;
    timer: ReturnType<typeof setTimeout>;
    onAck?: () => void;
    onReject?: (error: string) => void;
    onTimeout?: () => void;
};

/**
 * Build a fresh SDK message addressed to `dest`, with PERSISTENT delivery
 * forced (broker only emits ACK/REJECT for persistent messages) and every
 * supported property copied via per-call try/catch. Content priority chain
 * SDT → XML → Binary short-circuits at the first successful write.
 *
 * Pure module-level helper — no closure state. Same shape as the historical
 * cloneForCopy / forwardMessage inline cloners; lifted to the publisher so
 * both queue-copy and queue-browser send identical messages off the wire.
 */
function cloneMessage(originalMsg: any, dest: DestTarget): any {
    const newMsg = solace.SolclientFactory.createMessage();

    const destination = dest.type === 'queue'
        ? solace.SolclientFactory.createDurableQueueDestination(dest.name)
        : solace.SolclientFactory.createTopicDestination(dest.name);
    newMsg.setDestination(destination);

    const safeSet = (setter: string, getter: string): boolean => {
        try {
            if (typeof originalMsg[getter] === 'function') {
                const val = originalMsg[getter]();
                if (val !== null && val !== undefined) {
                    newMsg[setter](val);
                    return true;
                }
            }
        /* v8 ignore start -- defensive catch around SDK setter/getter calls.
         * The test-suite mock's setters never throw; production SDK could fail
         * on a malformed value but the contract is silent on which getter
         * outputs trigger which setter rejections. Matches the historical
         * policy in queue-copy/message-clone.ts and queue-browser/service.ts. */
        } catch (e) {
            logger.warn(`Failed to set ${setter}`, e);
        }
        /* v8 ignore stop */
        return false;
    };

    safeSet('setApplicationMessageId', 'getApplicationMessageId');
    safeSet('setApplicationMessageType', 'getApplicationMessageType');
    safeSet('setAsReplyMessage', 'isReplyMessage');
    safeSet('setCorrelationId', 'getCorrelationId');

    newMsg.setDeliveryMode(solace.MessageDeliveryModeType.PERSISTENT);

    safeSet('setDMQEligible', 'isDMQEligible');
    safeSet('setElidingEligible', 'isElidingEligible');
    safeSet('setGMExpiration', 'getGMExpiration');
    safeSet('setHttpContentEncoding', 'getHttpContentEncoding');
    safeSet('setHttpContentType', 'getHttpContentType');
    safeSet('setPriority', 'getPriority');
    safeSet('setReplyTo', 'getReplyTo');
    safeSet('setSenderId', 'getSenderId');
    safeSet('setSenderTimestamp', 'getSenderTimestamp');
    safeSet('setSequenceNumber', 'getSequenceNumber');
    safeSet('setTimeToLive', 'getTimeToLive');
    safeSet('setUserCos', 'getUserCos');
    safeSet('setUserData', 'getUserData');
    safeSet('setUserPropertyMap', 'getUserPropertyMap');
    safeSet('setXmlMetadata', 'getXmlMetadata');

    safeSet('setSdtContainer', 'getSdtContainer') ||
        safeSet('setXmlContent', 'getXmlContent') ||
        safeSet('setBinaryAttachment', 'getBinaryAttachment');

    return newMsg;
}

/**
 * Build a session-scoped publisher.
 *
 * Attaches ACKNOWLEDGED_MESSAGE + REJECTED_MESSAGE_ERROR listeners on the
 * session ONCE at construction and demultiplexes them into per-publish
 * promises via the correlation-key map. The caller owns the session
 * lifecycle; the publisher must be `dispose()`-d when the session goes down
 * so the listeners detach and any in-flight awaits settle.
 *
 * Pure factory — no AppContext, no module-state coupling. Each caller
 * (queue-browser primary session, queue-copy destination session) creates
 * its own publisher; two publishers on the same session coexist cleanly
 * because each only resolves entries from its own pending map.
 */
export function createSolacePublisher(session: any, opts?: PublisherOptions): SolacePublisher {
    const defaultTimeoutMs = opts?.ackTimeoutMs ?? DEFAULT_PUBLISH_ACK_TIMEOUT_MS;
    const pending = new Map<string, Pending>();
    let disposed = false;

    function ackListener(event: any) {
        const key = event?.correlationKey?.Solace_Msg_Utility_Seq_Num;
        if (!key) return;
        const entry = pending.get(key);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(key);
        entry.resolve({ ok: true });
        entry.onAck?.();
    }

    function rejectListener(event: any) {
        const key = event?.correlationKey?.Solace_Msg_Utility_Seq_Num;
        if (!key) return;
        const entry = pending.get(key);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(key);
        const error = event?.infoStr ?? 'Broker rejected message';
        entry.resolve({ ok: false, error });
        entry.onReject?.(error);
    }

    session.on(solace.SessionEventCode.ACKNOWLEDGED_MESSAGE, ackListener);
    session.on(solace.SessionEventCode.REJECTED_MESSAGE_ERROR, rejectListener);

    function send(originalMsg: any, dest: DestTarget, sendOpts: SendOptions = {}): Promise<SendResult> {
        if (disposed) {
            const error = 'Publisher disposed';
            sendOpts.onReject?.(error);
            return Promise.resolve({ ok: false, error });
        }

        const newMsg = cloneMessage(originalMsg, dest);
        const correlationValue = sendOpts.correlationKey ?? generateUuid();
        const timeoutMs = sendOpts.ackTimeoutMs ?? defaultTimeoutMs;

        newMsg.setCorrelationKey({
            Solace_Msg_Utility_Seq_Num: correlationValue,
            Original_Msg_ID: sendOpts.originalIdHint ?? '',
        });

        sendOpts.beforeSend?.(newMsg);

        return new Promise<SendResult>((resolve) => {
            const timer = setTimeout(() => {
                const entry = pending.get(correlationValue);
                /* v8 ignore start -- defensive guard against a race where the entry is
                 * removed from `pending` without cancelling this timer. Every removal
                 * path (ack/reject listeners, rejectAllPending, dispose, sync-send
                 * catch) calls clearTimeout(entry.timer) before pending.delete(), so
                 * the timer cannot fire against a missing entry in normal flow. */
                if (!entry) return;
                /* v8 ignore stop */
                pending.delete(correlationValue);
                const result: SendResult = { ok: false, error: 'Timed out waiting for broker acknowledgement.' };
                entry.resolve(result);
                entry.onTimeout?.();
            }, timeoutMs);

            pending.set(correlationValue, {
                resolve,
                timer,
                onAck: sendOpts.onAck,
                onReject: sendOpts.onReject,
                onTimeout: sendOpts.onTimeout,
            });

            try {
                session.send(newMsg);
            } catch (e: any) {
                clearTimeout(timer);
                pending.delete(correlationValue);
                const error = e?.message ?? 'Send failed';
                resolve({ ok: false, error });
                sendOpts.onReject?.(error);
            }
        });
    }

    function rejectAllPending(reason: string): void {
        for (const entry of pending.values()) {
            clearTimeout(entry.timer);
            entry.resolve({ ok: false, error: reason });
            entry.onReject?.(reason);
        }
        pending.clear();
    }

    function dispose(reason: string = 'Publisher disposed'): void {
        if (disposed) return;
        disposed = true;
        rejectAllPending(reason);
        try {
            session.removeListener?.(solace.SessionEventCode.ACKNOWLEDGED_MESSAGE, ackListener);
            session.removeListener?.(solace.SessionEventCode.REJECTED_MESSAGE_ERROR, rejectListener);
        /* v8 ignore start -- defensive catch around SDK removeListener; the
         * session may already be torn down by the SDK when dispose() runs from
         * a disconnect handler. Mirrors the same defensive pattern used in
         * connections/queue-browser session-listener teardown. */
        } catch (e) {
            logger.warn('[solace-publisher] removeListener during dispose:', e);
        }
        /* v8 ignore stop */
    }

    function isPending(correlationKey: string): boolean {
        return pending.has(correlationKey);
    }

    return { send, rejectAllPending, dispose, isPending };
}
