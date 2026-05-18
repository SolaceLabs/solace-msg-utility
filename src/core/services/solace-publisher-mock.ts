import type {
    SolacePublisher,
    PublisherOptions,
    SendOptions,
    SendResult,
    DestTarget,
} from './solace-publisher';

export {
    DEFAULT_PUBLISH_ACK_TIMEOUT_MS,
    type DestTarget,
    type SendOptions,
    type SendResult,
    type SolacePublisher,
    type PublisherOptions,
} from './solace-publisher';

/**
 * Mock publisher used in the demo bundle. The real solace-client-mock yields
 * a session shaped `{ _mock: true }` with no `.on()` / `.send()`, so calling
 * the production publisher against it would throw at construction. This mock
 * substitutes a no-op-style publisher that resolves every send after a tiny
 * delay (simulating a fast broker ACK) so the modal flow renders the green
 * check end-to-end.
 *
 * Behavior on `dest === 'untrust.com'` substring is unimplemented because the
 * demo never triggers it; reject paths are exercised through the production
 * unit tests instead.
 */
export function createSolacePublisher(_session: any, _opts?: PublisherOptions): SolacePublisher {
    const pending = new Set<string>();
    let disposed = false;

    function send(_originalMsg: any, _dest: DestTarget, sendOpts: SendOptions = {}): Promise<SendResult> {
        if (disposed) {
            const error = 'Publisher disposed';
            sendOpts.onReject?.(error);
            return Promise.resolve({ ok: false, error });
        }
        const key = sendOpts.correlationKey ?? `mock-${Math.random().toString(36).slice(2)}`;
        pending.add(key);
        return new Promise((resolve) => {
            setTimeout(() => {
                pending.delete(key);
                resolve({ ok: true });
                sendOpts.onAck?.();
            }, 50);
        });
    }

    function rejectAllPending(_reason: string): void {
        pending.clear();
    }

    function dispose(_reason?: string): void {
        disposed = true;
        pending.clear();
    }

    function isPending(correlationKey: string): boolean {
        return pending.has(correlationKey);
    }

    return { send, rejectAllPending, dispose, isPending };
}
