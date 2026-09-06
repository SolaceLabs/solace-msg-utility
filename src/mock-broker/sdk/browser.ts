/**
 * QueueBrowser emulation.
 *
 * Three behaviours here are load-bearing for the app, not decoration:
 *
 * 1. **`_messageConsumer._permissions` exists before `UP` fires.** The managed
 *    panel overwrites it from inside its own `UP` handler, and queue-browser's
 *    badge + verify both read it afterwards.
 * 2. **Messages arrive in spool-ID order, one at a time.** The copy engine's
 *    drift detection and max-consumed logic assume the broker delivers that way.
 * 3. **`stop()` / `start()` genuinely suspend and resume delivery.** They are
 *    the copy engine's backpressure control; no-ops here would let the publish
 *    queue grow without bound on the bulk queue.
 *
 * Mock-only.
 */
import { createEmitter } from '../emitter';
import { browserError, MOCK_SUBCODE } from './errors';
import { QueueBrowserEventName } from './enums';
import { getQueue, removeMessage, type SpooledMessage } from '../broker/store';
import { QUEUE_STATE, queueStateOf, scenario } from '../fixtures';

export interface MockQueueBrowser {
    [key: string]: any;
    _messageConsumer: { _permissions: string };
}

/**
 * @param vpn   VPN the owning session is bound to.
 * @param props The `QueueBrowserProperties` the caller built — we read
 *              `queueDescriptor.name` off it exactly as the SDK would.
 */
export function createQueueBrowser(vpn: string, props: any): MockQueueBrowser {
    const emitter = createEmitter();
    const queueName: string = props?.queueDescriptor?.name ?? '';

    let connected = false;
    let paused = false;
    let cursor = 0;
    let snapshot: SpooledMessage[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Present from construction so it is populated well before UP — the managed
    // panel's patch assumes it can write here inside its UP handler.
    const state = queueStateOf(vpn, queueName);
    const permissions = state === QUEUE_STATE.READ_ONLY ? 'READ_ONLY' : 'READ_WRITE';

    /** Per-message pacing; derived from the latency lever so bulk stays usable. */
    function interval(): number {
        return Math.max(0, Math.round(scenario.latencyMs / 40));
    }

    function pump(): void {
        timer = null;
        if (!connected || paused) return;
        if (cursor >= snapshot.length) return;
        const item = snapshot[cursor++];
        emitter.emit(QueueBrowserEventName.MESSAGE, item.msg);
        timer = setTimeout(pump, interval());
    }

    function clearTimer(): void {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    }

    const browser: MockQueueBrowser = {
        _messageConsumer: { _permissions: permissions },

        on: emitter.on,
        removeListener: emitter.removeListener,

        connect(): void {
            setTimeout(() => {
                if (queueStateOf(vpn, queueName) === QUEUE_STATE.BIND_DENIED) {
                    emitter.emit(QueueBrowserEventName.CONNECT_FAILED_ERROR, browserError(
                        `Permission Denied - the client is not authorized to bind to queue '${queueName}'`,
                        MOCK_SUBCODE.PERMISSION_DENIED,
                    ));
                    return;
                }
                const q = getQueue(vpn, queueName);
                if (!q) {
                    emitter.emit(QueueBrowserEventName.CONNECT_FAILED_ERROR, browserError(
                        `Unknown Queue - queue '${queueName}' does not exist on Message VPN '${vpn}'`,
                        MOCK_SUBCODE.UNKNOWN_QUEUE,
                    ));
                    return;
                }
                // Browse semantics: snapshot at bind time, delivered in spool order.
                snapshot = q.messages.slice();
                cursor = 0;
                connected = true;
                emitter.emit(QueueBrowserEventName.UP);
                timer = setTimeout(pump, interval());
            }, scenario.latencyMs);
        },

        disconnect(): void {
            connected = false;
            clearTimer();
        },

        stop(): void {
            paused = true;
            clearTimer();
        },

        start(): void {
            if (!paused) return;
            paused = false;
            if (connected && timer === null) timer = setTimeout(pump, interval());
        },

        /**
         * Called two ways by the app: with the original browsed message, or with
         * a bare message carrying only a guaranteed id. Both resolve through the
         * same getter.
         */
        removeMessageFromQueue(msg: any): void {
            const id = msg?.getGuaranteedMessageId?.()?.toString?.();
            if (id === undefined) return;
            removeMessage(vpn, queueName, id);
            // Keep the live snapshot honest so a later re-bind cannot re-deliver
            // something the user just deleted.
            snapshot = snapshot.filter(m => String(m.id) !== String(id));
        },

        dispose(): void {
            connected = false;
            clearTimer();
        },
    };

    return browser;
}
