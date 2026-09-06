/**
 * A deliberately dumb event emitter: **synchronous, strictly FIFO**.
 *
 * Both properties are load-bearing, not stylistic. The connections module's
 * managed panel monkey-patches `session.createQueueBrowser` and registers its
 * own `UP` listener on the returned browser *before* queue-browser's service
 * registers one, then overwrites `_messageConsumer._permissions` from inside
 * that handler. If this emitter reordered listeners, or deferred them to a
 * microtask, queue-browser would read the permission before RBAC had written
 * it — and entitlement enforcement would silently stop working, with no error
 * anywhere. So: an array, in insertion order, called inline.
 *
 * Mock-only.
 */
export interface MockEmitter {
    on(event: string, handler: (...args: any[]) => void): void;
    removeListener(event: string, handler: (...args: any[]) => void): void;
    /** Deliver to every listener registered for `event`, in registration order. */
    emit(event: string, ...args: any[]): void;
    /** True when at least one listener is registered — lets callers skip work. */
    has(event: string): boolean;
}

export function createEmitter(): MockEmitter {
    const listeners = new Map<string, ((...args: any[]) => void)[]>();

    function on(event: string, handler: (...args: any[]) => void): void {
        const existing = listeners.get(event);
        if (existing) existing.push(handler);
        else listeners.set(event, [handler]);
    }

    function removeListener(event: string, handler: (...args: any[]) => void): void {
        const existing = listeners.get(event);
        if (!existing) return;
        const i = existing.indexOf(handler);
        if (i >= 0) existing.splice(i, 1);
    }

    function emit(event: string, ...args: any[]): void {
        const existing = listeners.get(event);
        if (!existing) return;
        // Copy before iterating: a handler that unsubscribes itself (the
        // publisher's dispose path does exactly this) must not shift the array
        // out from under the loop and skip its neighbour.
        for (const handler of existing.slice()) handler(...args);
    }

    function has(event: string): boolean {
        const existing = listeners.get(event);
        return !!existing && existing.length > 0;
    }

    return { on, removeListener, emit, has };
}
