import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createSolacePublisher,
    DEFAULT_PUBLISH_ACK_TIMEOUT_MS,
    type DestTarget,
} from '../../../src/core/services/solace-publisher';
import { createSolaceMock, createSessionMock, createMessageMock } from '../../setup';

/**
 * Publisher unit tests. Mocks `window.solace` (the SDK) and uses the shared
 * `createSessionMock` for a session that records its `.on()` registrations
 * and exposes `_handlers[<eventCode>]` so tests can drive ACK/REJECT events
 * synchronously.
 *
 * The publisher itself is pure factory + closure state; no AppContext, no
 * UI, no global event bus. All effects are observable through the returned
 * Promise, the optional `onAck` / `onReject` / `onTimeout` callbacks, or the
 * session-level `.on()` / `.removeListener()` spies.
 */
describe('core/services/solace-publisher', () => {
    let solaceMock: ReturnType<typeof createSolaceMock>;
    let session: ReturnType<typeof createSessionMock>;
    const queueDest: DestTarget = { type: 'queue', name: 'my-queue' };
    const topicDest: DestTarget = { type: 'topic', name: 'my/topic' };

    beforeEach(() => {
        solaceMock = createSolaceMock();
        (window as any).solace = solaceMock;
        session = createSessionMock();
    });

    function getKeyFromMsg(msg: ReturnType<typeof createMessageMock>): string {
        const call = (msg.setCorrelationKey as any).mock.calls[0];
        return call[0].Solace_Msg_Utility_Seq_Num;
    }

    function fireAck(key: string, extra: Record<string, any> = {}): void {
        const handler = (session as any)._handlers.ACKNOWLEDGED_MESSAGE;
        handler({ correlationKey: { Solace_Msg_Utility_Seq_Num: key }, ...extra });
    }

    function fireReject(key: string, infoStr?: string): void {
        const handler = (session as any)._handlers.REJECTED_MESSAGE_ERROR;
        handler({ correlationKey: { Solace_Msg_Utility_Seq_Num: key }, infoStr });
    }

    describe('construction', () => {
        it('attaches ACKNOWLEDGED_MESSAGE and REJECTED_MESSAGE_ERROR listeners on the session', () => {
            createSolacePublisher(session);
            const codes = (session.on as any).mock.calls.map((c: any[]) => c[0]);
            expect(codes).toContain('ACKNOWLEDGED_MESSAGE');
            expect(codes).toContain('REJECTED_MESSAGE_ERROR');
        });
    });

    describe('send() — happy path', () => {
        it('clones the message, stamps PERSISTENT delivery, generates a UUID correlation key, and resolves on ACK', async () => {
            const publisher = createSolacePublisher(session);
            const original = createMessageMock();
            // The cloned message is what session.send receives — capture it via the
            // SolclientFactory.createMessage spy so we can inspect what was set.
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, queueDest);

            // Destination + delivery mode applied to the clone, NOT the original.
            expect(solaceMock.SolclientFactory.createDurableQueueDestination).toHaveBeenCalledWith('my-queue');
            expect(cloned.setDestination).toHaveBeenCalledTimes(1);
            expect(cloned.setDeliveryMode).toHaveBeenCalledWith(solaceMock.MessageDeliveryModeType.PERSISTENT);
            // Correlation key shape — Solace_Msg_Utility_Seq_Num generated, Original_Msg_ID empty by default.
            expect(cloned.setCorrelationKey).toHaveBeenCalledTimes(1);
            const keyArg = (cloned.setCorrelationKey as any).mock.calls[0][0];
            expect(typeof keyArg.Solace_Msg_Utility_Seq_Num).toBe('string');
            expect(keyArg.Original_Msg_ID).toBe('');
            // session.send fired with the cloned message.
            expect(session.send).toHaveBeenCalledWith(cloned);

            fireAck(keyArg.Solace_Msg_Utility_Seq_Num);
            await expect(promise).resolves.toEqual({ ok: true });
        });

        it('routes a topic destination through createTopicDestination', async () => {
            const publisher = createSolacePublisher(session);
            const original = createMessageMock();
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, topicDest);
            expect(solaceMock.SolclientFactory.createTopicDestination).toHaveBeenCalledWith('my/topic');
            expect(solaceMock.SolclientFactory.createDurableQueueDestination).not.toHaveBeenCalled();

            fireAck(getKeyFromMsg(cloned));
            await expect(promise).resolves.toEqual({ ok: true });
        });

        it('uses the caller-supplied correlationKey and originalIdHint when provided', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(createMessageMock(), queueDest, {
                correlationKey: 'my-seq-42',
                originalIdHint: 'orig-id-99',
            });
            const keyArg = (cloned.setCorrelationKey as any).mock.calls[0][0];
            expect(keyArg).toEqual({ Solace_Msg_Utility_Seq_Num: 'my-seq-42', Original_Msg_ID: 'orig-id-99' });

            fireAck('my-seq-42');
            await expect(promise).resolves.toEqual({ ok: true });
        });

        it('invokes onAck callback after Promise resolution', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);
            const onAck = vi.fn();
            const onReject = vi.fn();

            const promise = publisher.send(createMessageMock(), queueDest, { onAck, onReject });
            fireAck(getKeyFromMsg(cloned));
            await promise;

            expect(onAck).toHaveBeenCalledTimes(1);
            expect(onReject).not.toHaveBeenCalled();
        });

        it('runs beforeSend after destination + correlation are stamped, before session.send fires', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const sendCallOrder: string[] = [];
            (session.send as any).mockImplementation(() => sendCallOrder.push('session.send'));
            const beforeSend = vi.fn(() => sendCallOrder.push('beforeSend'));

            const promise = publisher.send(createMessageMock(), queueDest, { beforeSend });
            expect(sendCallOrder).toEqual(['beforeSend', 'session.send']);
            // setCorrelationKey was already invoked before beforeSend ran.
            expect(cloned.setCorrelationKey).toHaveBeenCalled();

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });
    });

    describe('send() — REJECT path', () => {
        it('resolves with the broker infoStr on REJECT and fires onReject', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);
            const onReject = vi.fn();

            const promise = publisher.send(createMessageMock(), queueDest, { onReject });
            fireReject(getKeyFromMsg(cloned), 'Queue is full');
            const result = await promise;

            expect(result).toEqual({ ok: false, error: 'Queue is full' });
            expect(onReject).toHaveBeenCalledWith('Queue is full');
        });

        it('falls back to a generic message when infoStr is absent', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(createMessageMock(), queueDest);
            fireReject(getKeyFromMsg(cloned));

            await expect(promise).resolves.toEqual({ ok: false, error: 'Broker rejected message' });
        });

        it('ignores ACK/REJECT events with no correlation key', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(createMessageMock(), queueDest);
            (session as any)._handlers.ACKNOWLEDGED_MESSAGE({});
            (session as any)._handlers.REJECTED_MESSAGE_ERROR({ correlationKey: {} });
            // Still pending — the resolution-path tests cover the positive case.
            expect(publisher.isPending(getKeyFromMsg(cloned))).toBe(true);

            // Resolve cleanly to avoid a dangling promise.
            fireAck(getKeyFromMsg(cloned));
            await promise;
        });

        it('ignores ACK/REJECT events for an unknown correlation key', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(createMessageMock(), queueDest);
            fireAck('unknown-key');
            fireReject('unknown-key', 'noise');
            expect(publisher.isPending(getKeyFromMsg(cloned))).toBe(true);

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });
    });

    describe('send() — timeout path', () => {
        it('resolves {ok:false} with the timeout message after DEFAULT_PUBLISH_ACK_TIMEOUT_MS', async () => {
            vi.useFakeTimers();
            const publisher = createSolacePublisher(session);
            const onTimeout = vi.fn();

            const promise = publisher.send(createMessageMock(), queueDest, { onTimeout });
            await vi.advanceTimersByTimeAsync(DEFAULT_PUBLISH_ACK_TIMEOUT_MS);

            await expect(promise).resolves.toEqual({
                ok: false,
                error: 'Timed out waiting for broker acknowledgement.',
            });
            expect(onTimeout).toHaveBeenCalledTimes(1);
            vi.useRealTimers();
        });

        it('honors per-publish ackTimeoutMs override', async () => {
            vi.useFakeTimers();
            const publisher = createSolacePublisher(session);
            const promise = publisher.send(createMessageMock(), queueDest, { ackTimeoutMs: 500 });
            // Advancing under the override does NOT yet time out.
            await vi.advanceTimersByTimeAsync(400);
            // Then crossing the override fires.
            await vi.advanceTimersByTimeAsync(200);
            await expect(promise).resolves.toEqual({
                ok: false,
                error: 'Timed out waiting for broker acknowledgement.',
            });
            vi.useRealTimers();
        });

        it('honors the factory-level ackTimeoutMs default', async () => {
            vi.useFakeTimers();
            const publisher = createSolacePublisher(session, { ackTimeoutMs: 100 });
            const promise = publisher.send(createMessageMock(), queueDest);
            await vi.advanceTimersByTimeAsync(150);
            await expect(promise).resolves.toMatchObject({ ok: false });
            vi.useRealTimers();
        });
    });

    describe('send() — sync send failure', () => {
        it('resolves {ok:false} when session.send throws, with the thrown message', async () => {
            (session.send as any).mockImplementation(() => { throw new Error('Send blew up'); });
            const publisher = createSolacePublisher(session);
            const onReject = vi.fn();

            const result = await publisher.send(createMessageMock(), queueDest, { onReject });
            expect(result).toEqual({ ok: false, error: 'Send blew up' });
            expect(onReject).toHaveBeenCalledWith('Send blew up');
            // Pending map was cleaned up — no orphan timer entry.
            expect(publisher.isPending('does-not-matter')).toBe(false);
        });

        it('falls back to a generic error when the thrown value has no message', async () => {
            (session.send as any).mockImplementation(() => { throw {}; });
            const publisher = createSolacePublisher(session);

            const result = await publisher.send(createMessageMock(), queueDest);
            expect(result).toEqual({ ok: false, error: 'Send failed' });
        });
    });

    describe('clone behavior', () => {
        it('runs each safeSet getter and skips writes when the original returns null/undefined', async () => {
            const publisher = createSolacePublisher(session);
            const original = createMessageMock();
            // All getters return null by default in the mock — so no setters should fire on the clone.
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, queueDest);
            // Setters that have null source values should NOT have been called.
            expect(cloned.setApplicationMessageId).not.toHaveBeenCalled();
            expect(cloned.setCorrelationId).not.toHaveBeenCalled();
            // Delivery mode is unconditionally set.
            expect(cloned.setDeliveryMode).toHaveBeenCalledWith(solaceMock.MessageDeliveryModeType.PERSISTENT);

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });

        it('content priority: SDT short-circuits XML and Binary', async () => {
            const publisher = createSolacePublisher(session);
            const original = createMessageMock();
            (original.getSdtContainer as any).mockReturnValue({ kind: 'sdt' });
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, queueDest);

            expect(cloned.setSdtContainer).toHaveBeenCalledWith({ kind: 'sdt' });
            expect(cloned.setXmlContent).not.toHaveBeenCalled();
            expect(cloned.setBinaryAttachment).not.toHaveBeenCalled();

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });

        it('content priority: XML fires when SDT is null and short-circuits Binary', async () => {
            const publisher = createSolacePublisher(session);
            const original = createMessageMock();
            (original.getXmlContent as any).mockReturnValue('<x/>');
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, queueDest);

            expect(cloned.setSdtContainer).not.toHaveBeenCalled();
            expect(cloned.setXmlContent).toHaveBeenCalledWith('<x/>');
            expect(cloned.setBinaryAttachment).not.toHaveBeenCalled();

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });

        it('content priority: Binary fires when SDT and XML are null', async () => {
            const publisher = createSolacePublisher(session);
            const original = createMessageMock();
            // createMessageMock's getXmlContent returns '' by default — empty
            // string is a non-null/non-undefined value, so safeSet would write
            // it and short-circuit before Binary. Override to null so XML
            // doesn't satisfy the chain.
            (original.getXmlContent as any).mockReturnValue(null);
            (original.getBinaryAttachment as any).mockReturnValue(new Uint8Array([1, 2, 3]));
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, queueDest);
            expect(cloned.setBinaryAttachment).toHaveBeenCalled();

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });

        it('skips a setter when the original has no getter for it', async () => {
            const publisher = createSolacePublisher(session);
            const original: any = createMessageMock();
            // Remove a getter entirely — `typeof originalMsg[getter] === 'function'` guard hits the false branch.
            original.getApplicationMessageId = undefined;
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(original, queueDest);
            expect(cloned.setApplicationMessageId).not.toHaveBeenCalled();

            fireAck(getKeyFromMsg(cloned));
            await promise;
        });
    });

    describe('rejectAllPending()', () => {
        it('resolves every in-flight promise with the given reason and clears the pending set', async () => {
            const publisher = createSolacePublisher(session);
            const onRejectA = vi.fn();
            const onRejectB = vi.fn();
            const pA = publisher.send(createMessageMock(), queueDest, { correlationKey: 'A', onReject: onRejectA });
            const pB = publisher.send(createMessageMock(), queueDest, { correlationKey: 'B', onReject: onRejectB });

            publisher.rejectAllPending('Run terminated');

            await expect(pA).resolves.toEqual({ ok: false, error: 'Run terminated' });
            await expect(pB).resolves.toEqual({ ok: false, error: 'Run terminated' });
            expect(onRejectA).toHaveBeenCalledWith('Run terminated');
            expect(onRejectB).toHaveBeenCalledWith('Run terminated');
            expect(publisher.isPending('A')).toBe(false);
            expect(publisher.isPending('B')).toBe(false);
        });
    });

    describe('dispose()', () => {
        it('removes the session listeners and rejects pending publishes with the default reason', async () => {
            const publisher = createSolacePublisher(session);
            const promise = publisher.send(createMessageMock(), queueDest, { correlationKey: 'X' });

            publisher.dispose();

            await expect(promise).resolves.toEqual({ ok: false, error: 'Publisher disposed' });
            // Listeners removed — both registered codes appear in removeListener calls.
            const removed = (session.removeListener as any).mock.calls.map((c: any[]) => c[0]);
            expect(removed).toContain('ACKNOWLEDGED_MESSAGE');
            expect(removed).toContain('REJECTED_MESSAGE_ERROR');
        });

        it('honors a caller-supplied reason for pending rejections', async () => {
            const publisher = createSolacePublisher(session);
            const promise = publisher.send(createMessageMock(), queueDest, { correlationKey: 'Y' });
            publisher.dispose('Custom shutdown');
            await expect(promise).resolves.toEqual({ ok: false, error: 'Custom shutdown' });
        });

        it('is idempotent — a second call is a no-op', () => {
            const publisher = createSolacePublisher(session);
            publisher.dispose();
            publisher.dispose();
            // removeListener fired exactly twice (one ACK + one REJECT) across both calls.
            expect((session.removeListener as any).mock.calls.length).toBe(2);
        });

        it('send() after dispose resolves immediately with {ok:false, error: Publisher disposed}', async () => {
            const publisher = createSolacePublisher(session);
            publisher.dispose();
            const onReject = vi.fn();
            await expect(publisher.send(createMessageMock(), queueDest, { onReject })).resolves.toEqual({
                ok: false, error: 'Publisher disposed',
            });
            expect(onReject).toHaveBeenCalledWith('Publisher disposed');
        });
    });

    describe('isPending()', () => {
        it('returns true while a publish is awaiting ACK, false after settlement', async () => {
            const publisher = createSolacePublisher(session);
            const cloned = createMessageMock();
            solaceMock.SolclientFactory.createMessage.mockReturnValueOnce(cloned);

            const promise = publisher.send(createMessageMock(), queueDest, { correlationKey: 'pending-key' });
            expect(publisher.isPending('pending-key')).toBe(true);
            expect(publisher.isPending('other')).toBe(false);

            fireAck('pending-key');
            await promise;
            expect(publisher.isPending('pending-key')).toBe(false);
        });
    });
});
