import type { EventBus } from './types';
import { logger } from './logger';

/**
 * Lightweight publish/subscribe event bus.
 *
 * Replaces direct window.dispatchEvent / window.addEventListener patterns
 * for inter-module communication. The Kernel creates a single instance
 * and injects it into every module via AppContext.
 *
 * Supports a hold/release gate so the kernel can buffer install-phase emits
 * until every module has subscribed. See EventBus.hold / EventBus.release.
 */
export function createEventBus(): EventBus {
    const listeners = new Map<string, Set<Function>>();
    let held = false;
    const pending: Array<[string, any[]]> = [];

    function deliver(event: string, args: any[]): void {
        const set = listeners.get(event);
        if (!set) return;
        // Snapshot before iterating. `Set.forEach` would otherwise visit handlers
        // added *during* the dispatch — if a handler calls `on(sameEvent, ...)` as
        // part of its side effects, the newcomer would fire in the same emit and
        // see an inconsistent half-handled state. Snapshot delivery matches Node
        // EventEmitter, DOM `dispatchEvent`, and RxJS: newcomers fire on the NEXT
        // emit. Unsubscribes during dispatch also don't prevent already-pending
        // handlers from running this round — standard pub/sub semantics.
        const snapshot = Array.from(set);
        for (const handler of snapshot) {
            try {
                (handler as Function)(...args);
            } catch (err) {
                logger.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        }
    }

    return {
        on(event, handler) {
            if (!listeners.has(event)) {
                listeners.set(event, new Set());
            }
            listeners.get(event)!.add(handler);
        },

        off(event, handler) {
            const set = listeners.get(event);
            if (set) {
                set.delete(handler);
                if (set.size === 0) listeners.delete(event);
            }
        },

        emit(event, ...args) {
            if (held) {
                pending.push([event, args]);
                return;
            }
            deliver(event, args);
        },

        hold() {
            held = true;
        },

        release() {
            held = false;
            // Drain FIFO. Nested emits from within a handler see held=false and
            // are delivered synchronously to current subscribers — matching normal
            // post-release behaviour, not re-buffered.
            while (pending.length > 0) {
                const [event, args] = pending.shift()!;
                deliver(event, args);
            }
        }
    } as EventBus;
}
