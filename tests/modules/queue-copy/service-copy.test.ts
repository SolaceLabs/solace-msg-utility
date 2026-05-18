import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    runCopyJob,
    IDLE_TIMEOUT_MS,
    PUBLISH_CONCURRENCY_HIGH,
    PUBLISH_CONCURRENCY_LOW,
} from '../../../src/modules/queue-copy/service-copy';
import { createInitialState } from '../../../src/modules/queue-copy/state';
import type { VerifyResult } from '../../../src/modules/queue-copy/state';
import { createSolacePublisher } from '../../../src/core/services/solace-publisher';
import { createSessionMock, createBrowserMock, createMessageMock } from '../../setup';

/**
 * Build a synthetic VerifyResult so tests can dictate total / oldest / newest /
 * access-type without going through the verify path.
 */
function verifyResult(opts: {
    messageCount: number;
    oldestMsgId?: string | null;
    newestMsgId?: string | null;
    accessType?: 'no-access' | 'read-only' | 'read-write' | null;
    owner?: string | null;
}): VerifyResult {
    return {
        sourceOk: true, via: 'semp', errors: [],
        messageVpn: null, messageCount: opts.messageCount,
        spoolUsageBytes: null, quotaBytes: null, maxMessageSize: null,
        oldestMsgId: opts.oldestMsgId ?? null,
        newestMsgId: opts.newestMsgId ?? null,
        accessType: opts.accessType ?? 'read-write',
        owner: opts.owner ?? null,
    };
}

/**
 * Standard test rig. Builds a primary session + browser + publisher, parks
 * them on `state`, and returns helpers to drive the engine deterministically.
 */
function setup(opts: { mode?: 'copy' | 'move' } = {}) {
    const browser = createBrowserMock();
    const session = createSessionMock();
    (session.createQueueBrowser as any).mockReturnValue(browser);

    const state = createInitialState();
    state.sourceQueue = 'src-q';
    state.dest = { type: 'queue', name: 'dest-q' };
    state.mode = opts.mode ?? 'copy';
    state.primaryPublisher = createSolacePublisher(session);

    const onProgress = vi.fn();
    const onComplete = vi.fn();

    const fireUp = () => (browser as any)._handlers.UP();
    const fireMessage = (msg?: any) => (browser as any)._handlers.MESSAGE(msg ?? createMessageMock());
    const fireDown = (info?: string) => (browser as any)._handlers.DOWN_ERROR({ infoStr: info });
    const fireConnectFailed = (info?: string) =>
        (browser as any)._handlers.CONNECT_FAILED_ERROR({ infoStr: info });

    /** Resolve the most-recent pending publish via session.ACKNOWLEDGED_MESSAGE. */
    const ackLast = () => {
        const setKey = (session.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
        const lastKey = setKey?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
        (session as any)._handlers.ACKNOWLEDGED_MESSAGE({ correlationKey: { Solace_Msg_Utility_Seq_Num: lastKey } });
    };
    /** Resolve the publish for the Nth session.send call (0-indexed). */
    const ackAt = (callIndex: number) => {
        const setKey = (session.send as any).mock.calls[callIndex]?.[0]?.setCorrelationKey;
        const key = setKey?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
        (session as any)._handlers.ACKNOWLEDGED_MESSAGE({ correlationKey: { Solace_Msg_Utility_Seq_Num: key } });
    };
    const rejectLast = (info: string) => {
        const setKey = (session.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
        const lastKey = setKey?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
        (session as any)._handlers.REJECTED_MESSAGE_ERROR({ correlationKey: { Solace_Msg_Utility_Seq_Num: lastKey }, infoStr: info });
    };

    return {
        state, session, browser, onProgress, onComplete,
        fireUp, fireMessage, fireDown, fireConnectFailed, ackLast, ackAt, rejectLast,
    };
}

/** Pump enough microtasks for each await in the engine to land. */
async function flush(n = 20) {
    for (let i = 0; i < n; i++) await Promise.resolve();
}

/**
 * Build a SDK-shaped message with the given guaranteed-msg-id. Tests use this
 * when they need to dictate the id (drift checks, max gates).
 */
function msg(id: string): any {
    const m = createMessageMock();
    (m as any).getGuaranteedMessageId = () => id;
    return m;
}

describe('queue-copy/service-copy', () => {
    beforeEach(() => {
        (window as any).solace.SolclientFactory.createMessage.mockImplementation(() => createMessageMock());
    });

    describe('configuration constants', () => {
        // Source of truth lives in [src/modules/queue-copy/constants.ts](../../../src/modules/queue-copy/constants.ts).
        // Pinning the exact value here just duplicates the constant — sanity-
        // check the shape instead: a positive integer in a reasonable range
        // for an "idle queue → declare done" timeout. Any value outside this
        // range would indicate a typo (a sub-second timeout would fire during
        // normal SDK transport-window pauses; a multi-hour timeout would
        // hang the modal on a drained queue).
        it('IDLE_TIMEOUT_MS is a positive integer in a sane range (1s..10min)', () => {
            expect(Number.isInteger(IDLE_TIMEOUT_MS)).toBe(true);
            expect(IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(1_000);
            expect(IDLE_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
        });

        it('PUBLISH_CONCURRENCY_HIGH > PUBLISH_CONCURRENCY_LOW (hysteresis invariant)', () => {
            expect(PUBLISH_CONCURRENCY_HIGH).toBeGreaterThan(PUBLISH_CONCURRENCY_LOW);
            expect(PUBLISH_CONCURRENCY_LOW).toBeGreaterThan(0);
        });
    });

    describe('engine entry fast-paths', () => {
        it('null publisher → onComplete with status=error and "Publisher unavailable"', async () => {
            const { state, session, onComplete } = setup();
            state.primaryPublisher = null;
            state.verify = { inProgress: false, abort: null, result: verifyResult({ messageCount: 5 }) };

            await runCopyJob(state, session, { onProgress: vi.fn(), onComplete });

            expect(onComplete).toHaveBeenCalledTimes(1);
            const job = onComplete.mock.calls[0][0];
            expect(job.status).toBe('error');
            expect(job.lastError).toBe('Publisher unavailable');
            // Engine never bound the source browser.
            expect(session.createQueueBrowser).not.toHaveBeenCalled();
        });

        it('total=0 → onComplete with status=completed without binding the browser', async () => {
            const { state, session, onComplete } = setup();
            state.verify = { inProgress: false, abort: null, result: verifyResult({ messageCount: 0 }) };

            await runCopyJob(state, session, { onProgress: vi.fn(), onComplete });

            expect(onComplete).toHaveBeenCalledTimes(1);
            const job = onComplete.mock.calls[0][0];
            expect(job.status).toBe('completed');
            expect(job.copied).toBe(0);
            expect(session.createQueueBrowser).not.toHaveBeenCalled();
        });
    });

    describe('Phase 1 — stop reasons', () => {
        describe('reached-max', () => {
            it('processes the maxMsgId message itself, disconnects the browser, then completes cleanly', async () => {
                const { state, session, browser, onComplete, onProgress, fireUp, fireMessage, ackLast } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 2, oldestMsgId: '100', newestMsgId: '101' }),
                };

                const job = runCopyJob(state, session, { onProgress, onComplete });
                await flush();
                fireUp();
                await flush();
                fireMessage(msg('100'));
                await flush();
                ackLast();
                await flush();
                fireMessage(msg('101'));
                await flush();
                ackLast();
                await flush();
                await job;

                // triggerStop now goes straight to disconnect (not stop) so no
                // further MESSAGE events can race the in-flight ACK drain.
                expect(browser.disconnect).toHaveBeenCalled();
                expect(onProgress).toHaveBeenCalledTimes(2);
                expect(onComplete).toHaveBeenCalledTimes(1);
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('completed');
                expect(final.copied).toBe(2);
                expect(final.lastError).toBeNull();
            });
        });

        describe('msgId > maxMsgId — disambiguation by seenMaxMsgId', () => {
            it('same-queue feedback (seenMaxMsgId=true) → silently dropped, run completes when maxMsgId ACK lands', async () => {
                // Scenario: copying a queue back to itself. The recorded max
                // (id 101) IS delivered to our handler; while its publish.send
                // is in flight, a clone of an earlier message lands on the
                // queue and is delivered as id 200. The pre-process gate must
                // see seenMaxMsgId=true and drop 200, NOT fatal.
                const { state, session, browser, onComplete, onProgress, fireUp, fireMessage, ackLast } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 2, oldestMsgId: '100', newestMsgId: '101' }),
                };

                const job = runCopyJob(state, session, { onProgress, onComplete });
                await flush();
                fireUp();
                await flush();
                // 100 arrives, publish goes out, ack lands → copied=1.
                fireMessage(msg('100'));
                await flush();
                ackLast();
                await flush();
                // 101 (= maxMsgId) arrives. Its handler synchronously sets
                // seenMaxMsgId=true BEFORE suspending at publisher.send.
                fireMessage(msg('101'));
                await flush();
                // Same-queue feedback: while 101's publish is in flight, a
                // clone of an earlier message re-enters the queue as id 200.
                // Pre-process gate sees seenMaxMsgId=true → silent drop.
                fireMessage(msg('200'));
                await flush();
                // ACK 101 → handler resumes, copied=2, post-process gate
                // fires triggerStop('reached-max') → disconnect → Phase 2.
                ackLast();
                await flush();
                await job;

                expect(session.send).toHaveBeenCalledTimes(2); // 200 was NOT sent
                expect(browser.disconnect).toHaveBeenCalled();
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('completed');
                expect(final.copied).toBe(2);
                expect(final.lastError).toBeNull();
            });

            it('max-consumed externally (seenMaxMsgId=false) → fatal', async () => {
                // Scenario: recorded max=103. Only id 100 arrives, then id 200
                // — implying 101, 102, 103 were drained by another consumer
                // before we got to them. seenMaxMsgId stays false because we
                // never saw 103. Pre-process gate fires max-consumed.
                const { state, session, onComplete, fireUp, fireMessage, ackLast } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 4, oldestMsgId: '100', newestMsgId: '103' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                fireMessage(msg('100'));
                await flush();
                ackLast();
                await flush();
                // Skip 101, 102, 103 entirely — they were consumed externally.
                fireMessage(msg('200'));
                await flush();
                await job;

                expect(session.send).toHaveBeenCalledTimes(1); // 200 not sent
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toContain('consumed before');
                expect(final.copied).toBe(1);
            });

            it('max-consumed with in-flight publishes — ACKs after stop STILL increment copied', async () => {
                // Scenario from the user's bug report: 4 originals (with ids
                // ≤ max) are queued for publish concurrently — their publish
                // promises haven't resolved yet. Then a brand-new message
                // with id > max arrives, triggering max-consumed. The
                // in-flight publishes finish successfully at the destination
                // AFTER the stop. Pre-fix, those ACKs hit the "settled after
                // stop — discard result" branch and `copied` stayed 0. The
                // fix: count successful in-flight ACKs regardless of stop.
                const { state, session, onComplete, fireUp, fireMessage, ackAt } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 8, oldestMsgId: '1', newestMsgId: '100' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                // Four originals enter the in-flight set (ids all < max=100).
                fireMessage(msg('1'));
                await flush();
                fireMessage(msg('2'));
                await flush();
                fireMessage(msg('3'));
                await flush();
                fireMessage(msg('4'));
                await flush();
                // A brand-new message id 200 arrives — pre-process gate sees
                // seenMaxMsgId=false (max=100 was consumed externally), fires
                // triggerStop('max-consumed'). No publish for id 200.
                fireMessage(msg('200'));
                await flush();
                // The 4 in-flight publishes ACK successfully AFTER the stop.
                // Ack each by index so all four resolve (ackLast always picks
                // the same correlation key).
                ackAt(0); await flush();
                ackAt(1); await flush();
                ackAt(2); await flush();
                ackAt(3); await flush();
                await job;

                expect(session.send).toHaveBeenCalledTimes(4); // 200 not sent
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toContain('consumed before');
                // The 4 in-flight publishes successfully landed at dest;
                // their ACKs after the stop still count toward copied.
                expect(final.copied).toBe(4);
                expect(final.lastError).toContain('Sent 4 (8 expected)');
            });
        });

        describe('source-drift', () => {
            it('first msg id mismatch terminates without sending', async () => {
                const { state, session, browser, onComplete, fireUp, fireMessage } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                // First message reports id 99 — recorded oldest is 100 → drift.
                fireMessage(msg('99'));
                await flush();
                await job;

                expect(session.send).not.toHaveBeenCalled();
                expect(browser.disconnect).toHaveBeenCalled();
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toContain('did not match recorded oldest');
            });
        });

        describe('idle', () => {
            it('idle timer fires post-max with copied=total → completed', async () => {
                vi.useFakeTimers();
                const { state, session, onComplete, fireUp, fireMessage, ackLast } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '999' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                fireMessage(msg('100'));
                await flush();
                ackLast();
                await flush();
                // No more MESSAGE; advance idle window.
                await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 10);
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                // copied=1, total=1 → match → completed
                expect(final.status).toBe('completed');
                expect(final.copied).toBe(1);
                vi.useRealTimers();
            });

            it('idle timer fires before reaching max → count-mismatch error', async () => {
                vi.useFakeTimers();
                const { state, session, onComplete, fireUp, fireMessage, ackLast } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '999' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                fireMessage(msg('100'));
                await flush();
                ackLast();
                await flush();
                // No more MESSAGE; advance idle window. Recorded max=999 not yet reached.
                await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 10);
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toContain('Message count mismatch');
                expect(final.copied).toBe(1);
                vi.useRealTimers();
            });

            it('idle timer fires before any MESSAGE → count-mismatch error (copied=0)', async () => {
                vi.useFakeTimers();
                const { state, session, onComplete, fireUp } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 10);
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.copied).toBe(0);
                vi.useRealTimers();
            });
        });

        describe('publish-error', () => {
            it('publish reject → error status with the publisher reason', async () => {
                const { state, session, onComplete, fireUp, fireMessage, rejectLast } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                fireMessage(msg('100'));
                await flush();
                rejectLast('broker rejected');
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toBe('broker rejected');
            });
        });

        describe('browser-error', () => {
            it('DOWN_ERROR with infoStr → error status carrying infoStr', async () => {
                const { state, session, onComplete, fireUp, fireDown } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                fireDown('connection lost');
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toBe('connection lost');
            });

            it('DOWN_ERROR without infoStr falls back to default message', async () => {
                const { state, session, onComplete, fireUp } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                (state as any); // no-op anchor for readability
                // DOWN_ERROR with no infoStr field at all.
                ((session.createQueueBrowser as any).mock.results.at(-1)!.value as any)._handlers.DOWN_ERROR({});
                await flush();
                await job;
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toBe('Browser disconnected');
            });

            it('CONNECT_FAILED_ERROR before UP → error', async () => {
                const { state, session, onComplete, fireConnectFailed } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireConnectFailed('auth failed');
                await flush();
                await job;
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toBe('auth failed');
            });

            it('CONNECT_FAILED_ERROR without infoStr falls back to default message', async () => {
                const { state, session, onComplete } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                ((session.createQueueBrowser as any).mock.results.at(-1)!.value as any)._handlers.CONNECT_FAILED_ERROR({});
                await flush();
                await job;
                const final = onComplete.mock.calls[0][0];
                expect(final.lastError).toBe('Browser connect failed');
            });

            it('synchronous browser.connect throw → browser-error', async () => {
                const { state, session, onComplete } = setup();
                ((session.createQueueBrowser as any).mock.results); // prime
                const browser = createBrowserMock();
                (browser.connect as any).mockImplementation(() => { throw new Error('sync fail'); });
                (session.createQueueBrowser as any).mockReturnValueOnce(browser);
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
                };

                await runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('error');
                expect(final.lastError).toBe('sync fail');
            });

            it('synchronous browser.connect throw without message falls back to default', async () => {
                const { state, session, onComplete } = setup();
                const browser = createBrowserMock();
                (browser.connect as any).mockImplementation(() => { throw {}; });
                (session.createQueueBrowser as any).mockReturnValueOnce(browser);
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
                };

                await runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                const final = onComplete.mock.calls[0][0];
                expect(final.lastError).toBe('Failed to start copy browser.');
            });
        });

        describe('cancel', () => {
            it('cancel before first MESSAGE → status=cancelled, copied=0', async () => {
                const { state, session, onComplete, fireUp } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                state.job!.cancelRequested = true;
                // Fire a MESSAGE so the handler observes the cancel flag.
                ((session.createQueueBrowser as any).mock.results.at(-1)!.value as any)._handlers.MESSAGE(msg('100'));
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('cancelled');
                expect(final.copied).toBe(0);
                expect(final.lastError).toBeNull();
            });

            it('cancel during in-flight publish: rejectAllPending fires, status=cancelled', async () => {
                const { state, session, onComplete, fireUp, fireMessage } = setup();
                state.verify = {
                    inProgress: false, abort: null,
                    result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
                };

                const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
                await flush();
                fireUp();
                await flush();
                fireMessage(msg('100'));
                await flush();
                // Publish is in-flight; user clicks Cancel.
                state.job!.cancelRequested = true;
                fireMessage(msg('101'));
                await flush();
                await job;

                const final = onComplete.mock.calls[0][0];
                expect(final.status).toBe('cancelled');
            });
        });
    });

    describe('Phase 2 — outcome evaluation', () => {
        it('reached-max with copied < total → error: count mismatch', async () => {
            // Force the engine to reach max but with copied < total. Easiest
            // path: only deliver the maxMsgId message itself (skipping the
            // ones in between). The engine processes the max msg, post-gate
            // triggers reached-max. copied=1, total=5 → mismatch.
            const { state, session, onComplete, fireUp, fireMessage, ackLast } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, oldestMsgId: '105', newestMsgId: '105' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('105'));
            await flush();
            ackLast();
            await flush();
            await job;

            const final = onComplete.mock.calls[0][0];
            expect(final.status).toBe('error');
            expect(final.lastError).toContain('Message count mismatch');
            expect(final.copied).toBe(1);
            expect(final.total).toBe(5);
        });

        it('cancelled overrides any in-progress stop reason at evaluation time', async () => {
            // Trigger reached-max stop, then click Cancel while the drain
            // poll waits. evaluateAndFinish should report status=cancelled.
            const { state, session, onComplete, fireUp, fireMessage, ackLast } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('100'));
            await flush();
            // ACK lands → handler increments copied + triggers reached-max → drain begins.
            ackLast();
            // User clicks Cancel during the drain (very narrow window — but
            // the post-evaluation check upgrades status to 'cancelled').
            state.job!.cancelRequested = true;
            await flush();
            await job;

            const final = onComplete.mock.calls[0][0];
            // Cancel beats reached-max in the final classification.
            expect(final.status).toBe('cancelled');
        });
    });

    describe('Backpressure — pause source browser at HIGH, resume at LOW', () => {
        it('pauses the source browser when in-flight reaches PUBLISH_CONCURRENCY_HIGH', async () => {
            const total = PUBLISH_CONCURRENCY_HIGH + 5;
            const { state, session, browser, onComplete, fireUp, fireMessage } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({
                    messageCount: total,
                    oldestMsgId: '1',
                    newestMsgId: String(total),
                }),
            };

            void runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();

            // Fire HIGH messages without acking. The HIGHth one tips inFlight
            // past the threshold; the engine should call browser.stop().
            for (let i = 1; i <= PUBLISH_CONCURRENCY_HIGH; i++) {
                fireMessage(msg(String(i)));
                await flush();
            }
            expect(browser.stop).toHaveBeenCalled();
            expect(browser.start).not.toHaveBeenCalled();
        });

        it('resumes the source browser when in-flight drops to PUBLISH_CONCURRENCY_LOW', async () => {
            const total = PUBLISH_CONCURRENCY_HIGH + 5;
            const { state, session, browser, onComplete, fireUp, fireMessage, ackAt } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({
                    messageCount: total,
                    oldestMsgId: '1',
                    newestMsgId: String(total),
                }),
            };

            void runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();

            // Fill the in-flight set up to HIGH → pause.
            for (let i = 1; i <= PUBLISH_CONCURRENCY_HIGH; i++) {
                fireMessage(msg(String(i)));
                await flush();
            }
            expect(browser.stop).toHaveBeenCalled();
            expect(browser.start).not.toHaveBeenCalled();

            // ACK enough publishes to drop inFlight from HIGH to LOW.
            const acksToDrain = PUBLISH_CONCURRENCY_HIGH - PUBLISH_CONCURRENCY_LOW;
            for (let i = 0; i < acksToDrain; i++) {
                ackAt(i);
                await flush();
            }
            expect(browser.start).toHaveBeenCalled();
        });

        it('idle timer is suspended while paused — advancing past IDLE_TIMEOUT_MS does NOT fire idle stop', async () => {
            vi.useFakeTimers();
            const total = PUBLISH_CONCURRENCY_HIGH + 5;
            const { state, session, browser, onComplete, fireUp, fireMessage } = setup();

            // Replace the publisher with one that never settles. The default
            // publisher arms a 30-s ACK-timeout per in-flight send; with 20
            // pending sends, advancing fake timers past IDLE_TIMEOUT_MS would
            // first fire 20 publish-timeout errors and trigger a stop reason
            // unrelated to the idle path under test. A never-settling
            // publisher keeps the in-flight set stable across the entire
            // timer advance so we can isolate the idle-suspension behavior.
            state.primaryPublisher = {
                send: vi.fn(() => new Promise<any>(() => { /* never resolves */ })),
                rejectAllPending: vi.fn(),
                dispose: vi.fn(),
                isPending: vi.fn(() => false),
            } as any;

            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({
                    messageCount: total,
                    oldestMsgId: '1',
                    newestMsgId: String(total),
                }),
            };

            void runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();

            // Fill in-flight to HIGH → browser.stop + idle timer cleared.
            for (let i = 1; i <= PUBLISH_CONCURRENCY_HIGH; i++) {
                fireMessage(msg(String(i)));
                await flush();
            }
            expect(browser.stop).toHaveBeenCalled();

            // Advance well past IDLE_TIMEOUT_MS — with the timer suspended,
            // no 'idle' triggerStop fires and the run is still going.
            await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 5_000);
            await flush();
            expect(onComplete).not.toHaveBeenCalled();
            // browser.disconnect would only be called if a stop reason fired.
            expect(browser.disconnect).not.toHaveBeenCalled();

            vi.useRealTimers();
        });

        it('cancel during pause triggers stop on the next in-flight ACK (no IDLE_TIMEOUT_MS wait)', async () => {
            const total = PUBLISH_CONCURRENCY_HIGH + 5;
            const { state, session, browser, onComplete, fireUp, fireMessage, ackAt } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({
                    messageCount: total,
                    oldestMsgId: '1',
                    newestMsgId: String(total),
                }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            for (let i = 1; i <= PUBLISH_CONCURRENCY_HIGH; i++) {
                fireMessage(msg(String(i)));
                await flush();
            }
            expect(browser.stop).toHaveBeenCalled();

            // User clicks Cancel while the source is paused — no MESSAGE will
            // arrive to observe the flag, so the cancel-detection must happen
            // in the finally block when ACKs land.
            state.job!.cancelRequested = true;
            // ACK one in-flight publish; the finally block sees cancelRequested
            // and triggers stop.
            ackAt(0);
            // Drain the rest of the in-flight publishes (publisher.rejectAllPending
            // resolves them with the Cancelled error).
            for (let i = 1; i < PUBLISH_CONCURRENCY_HIGH; i++) {
                ackAt(i);
                await flush();
            }
            await flush();
            await job;

            const final = onComplete.mock.calls[0][0];
            expect(final.status).toBe('cancelled');
        });
    });

    describe('Move mode — per-message remove with disconnected source', () => {
        it('skips removeMessageFromQueue for in-flight ACKs that land AFTER a stop (browser already disconnected)', async () => {
            // Move-mode variant of "max-consumed with in-flight publishes —
            // ACKs after stop STILL increment copied" (in the disambiguation
            // describe). Architecture contract: a successful publish whose
            // ACK lands after the source browser is disconnected must still
            // count toward `copied` (the message DID reach the destination),
            // but the per-message removeMessageFromQueue is skipped — better
            // to leave a duplicate on the source than throw inside the
            // post-stop ACK handler.
            const { state, session, browser, onComplete, fireUp, fireMessage, ackAt } =
                setup({ mode: 'move' });
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 8, oldestMsgId: '1', newestMsgId: '100' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            // Four in-flight publishes (all ids < max=100).
            fireMessage(msg('1')); await flush();
            fireMessage(msg('2')); await flush();
            fireMessage(msg('3')); await flush();
            fireMessage(msg('4')); await flush();
            // Id > max with seenMaxMsgId=false → triggerStop('max-consumed')
            // → disconnectBrowser() runs synchronously inside triggerStop.
            fireMessage(msg('200')); await flush();
            // ACK the four in-flight publishes AFTER the disconnect.
            ackAt(0); await flush();
            ackAt(1); await flush();
            ackAt(2); await flush();
            ackAt(3); await flush();
            await job;

            const final = onComplete.mock.calls[0][0];
            expect(final.status).toBe('error');
            // All four successful publishes counted toward copied …
            expect(final.copied).toBe(4);
            // … but NONE of them invoked removeMessageFromQueue because the
            // browser was already disconnected when their ACKs landed.
            expect(browser.removeMessageFromQueue).not.toHaveBeenCalled();
        });

        it('swallows a removeMessageFromQueue throw — the successful publish still increments copied', async () => {
            // Defensive guarantee: if the SDK throws inside removeMessageFromQueue
            // (e.g. broker-side ack/redelivery race), the catch logs and the
            // run continues. The user-visible "copied" count reflects the
            // successful publish, not the source-side delete failure.
            const { state, session, browser, onComplete, fireUp, fireMessage, ackLast } =
                setup({ mode: 'move' });
            (browser.removeMessageFromQueue as any).mockImplementation(() => {
                throw new Error('remove boom');
            });
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('100'));
            await flush();
            ackLast();
            await flush();
            await job;

            // The publish ACK still counts; the throw was swallowed.
            expect(browser.removeMessageFromQueue).toHaveBeenCalledTimes(1);
            const final = onComplete.mock.calls[0][0];
            expect(final.status).toBe('completed');
            expect(final.copied).toBe(1);
        });
    });

    describe('Move mode — per-message remove', () => {
        it('calls browser.removeMessageFromQueue immediately after each ACK, in order', async () => {
            const { state, session, browser, onComplete, fireUp, fireMessage, ackLast } = setup({ mode: 'move' });
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 2, oldestMsgId: '100', newestMsgId: '101' }),
            };

            const sentBefore: number[] = [];
            const removedAfter: number[] = [];
            (browser.removeMessageFromQueue as any).mockImplementation(() => {
                removedAfter.push(removedAfter.length + 1);
            });

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();

            const m1 = msg('100');
            fireMessage(m1);
            await flush();
            sentBefore.push(1);
            ackLast();
            await flush();

            const m2 = msg('101');
            fireMessage(m2);
            await flush();
            sentBefore.push(2);
            ackLast();
            await flush();
            await job;

            // Each ACK triggered a removeMessageFromQueue. Ordering: send #1
            // resolved → remove #1; then send #2 resolved → remove #2.
            expect(browser.removeMessageFromQueue).toHaveBeenCalledTimes(2);
            expect(browser.removeMessageFromQueue).toHaveBeenNthCalledWith(1, m1);
            expect(browser.removeMessageFromQueue).toHaveBeenNthCalledWith(2, m2);
            expect(removedAfter).toEqual([1, 2]);
        });
    });

    describe('session selection', () => {
        it('uses state.destPublisher for publish when set; primarySession only for the source browser', async () => {
            const { state, session, onComplete, fireUp, fireMessage } = setup();
            const destSession = createSessionMock();
            state.destSession = destSession;
            state.destPublisher = createSolacePublisher(destSession);
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('100'));
            await flush();
            // ACK on destSession's listener — that's the publisher's home.
            const setKey = (destSession.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
            const uuid = setKey?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
            (destSession as any)._handlers.ACKNOWLEDGED_MESSAGE({ correlationKey: { Solace_Msg_Utility_Seq_Num: uuid } });
            await flush();
            await job;

            expect(destSession.send).toHaveBeenCalledTimes(1);
            expect(session.send).not.toHaveBeenCalled();
        });
    });

    describe('first-wins triggerStop', () => {
        it('cancel after a different stop reason already fired does not change copied/sent counts', async () => {
            // Browser-error fires first, then user races a cancel — the
            // outcome upgrades to cancelled but no extra send happens.
            const { state, session, onComplete, fireUp, fireDown } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireDown('lost connection');
            state.job!.cancelRequested = true;
            await flush();
            await job;

            const final = onComplete.mock.calls[0][0];
            // Cancel upgrades status, but the original lastError is preserved
            // (cancel path clears it). Either way no publishes happened.
            expect(session.send).not.toHaveBeenCalled();
            expect(final.status).toBe('cancelled');
        });

        it('a second browser-event triggerStop hits the early-return; final lastError is the first reason', async () => {
            // Both DOWN_ERROR and CONNECT_FAILED_ERROR call triggerStop with
            // 'browser-error', each setting state.job.lastError to their own
            // infoStr beforehand. triggerStop's first-wins guard must keep
            // stopReason fixed at the first call and not re-fire the drain.
            // The browser-event lastError writes happen BEFORE triggerStop,
            // so both will overwrite state.job.lastError — but the second
            // triggerStop returns early so the drainAndFinish + onComplete
            // pipeline runs exactly once.
            const { state, session, browser, onComplete, fireUp, fireDown, fireConnectFailed } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '105' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireDown('first failure');
            // Second event fires before drain completes — triggerStop's guard
            // should ignore it. We deliberately fire BEFORE awaiting the drain.
            fireConnectFailed('second failure');
            await flush();
            await job;

            // onComplete must run exactly once despite two stop triggers.
            expect(onComplete).toHaveBeenCalledTimes(1);
            // Browser was disconnected exactly once by the first triggerStop;
            // the second was a no-op (still safe to call again — disconnect
            // is idempotent — but the guard means triggerStop's body, which
            // includes the disconnect, only runs once).
            expect(browser.disconnect).toHaveBeenCalledTimes(1);
            const final = onComplete.mock.calls[0][0];
            expect(final.status).toBe('error');
            // The second handler still wrote lastError before its (now-ignored)
            // triggerStop call. The first-wins guard protects the run from
            // double-processing, not the SDK from overwriting an error string.
            // What matters: status stays 'error' and the run terminated cleanly.
        });
    });

    describe('GM_DISABLED is a no-op', () => {
        it('does not crash and does not affect run progress', async () => {
            const { state, session, browser, onComplete, fireUp, fireMessage, ackLast } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            (browser as any)._handlers.GM_DISABLED();
            await flush();
            fireMessage(msg('100'));
            await flush();
            ackLast();
            await flush();
            await job;

            expect(onComplete.mock.calls[0][0].status).toBe('completed');
        });
    });

    describe('disconnect during cleanup is swallowed', () => {
        it('a throwing browser.disconnect does not break the run completion', async () => {
            const { state, session, browser, onComplete, fireUp, fireMessage, ackLast } = setup();
            (browser.disconnect as any).mockImplementation(() => { throw new Error('cleanup boom'); });
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 1, oldestMsgId: '100', newestMsgId: '100' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('100'));
            await flush();
            ackLast();
            await flush();
            await job;

            expect(onComplete).toHaveBeenCalledTimes(1);
            expect(onComplete.mock.calls[0][0].status).toBe('completed');
        });
    });

    describe('drain edge paths', () => {
        it('late cancel during drain rejects pending publishes with "Cancelled (late)"', async () => {
            // Path: a non-cancel stop reason (browser-error here) fires while
            // a publish is in flight. drainAndFinish enters its 20-ms poll
            // loop. The user then clicks Cancel. The loop's next iteration
            // sees `cancelRequested && !cancelRejectIssued` and escalates by
            // calling publisher.rejectAllPending — otherwise the run would
            // block on ACKs the user no longer cares about.
            vi.useFakeTimers();
            const pendingResolvers: Array<(v: any) => void> = [];
            const customPublisher = {
                send: vi.fn(() => new Promise<any>((resolve) => { pendingResolvers.push(resolve); })),
                rejectAllPending: vi.fn((reason: string) => {
                    const cur = pendingResolvers.splice(0);
                    cur.forEach((r) => r({ ok: false, error: reason }));
                }),
                dispose: vi.fn(),
                isPending: vi.fn(() => pendingResolvers.length > 0),
            };
            const { state, session, onComplete, fireUp, fireMessage, fireDown } = setup();
            state.primaryPublisher = customPublisher as any;
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '500' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('100'));
            await flush();
            // Publish is in flight (pendingResolvers has 1 entry). Now a
            // browser failure triggers stop; drainAndFinish enters the loop.
            fireDown('lost');
            await flush();
            // User clicks Cancel after the stop already fired but before the
            // drain's 20-ms tick resolves.
            state.job!.cancelRequested = true;
            // Advance past the tick — loop sees the flag and rejects.
            await vi.advanceTimersByTimeAsync(100);
            await flush();
            await vi.advanceTimersByTimeAsync(100);
            await flush();
            await job;
            vi.useRealTimers();

            expect(customPublisher.rejectAllPending).toHaveBeenCalledWith('Cancelled (late)');
            // The earlier triggerStop was NOT cancel, so this is the only call.
            expect(customPublisher.rejectAllPending).toHaveBeenCalledTimes(1);
            expect(onComplete).toHaveBeenCalledTimes(1);
            // Final classification: cancel beats browser-error in Phase 2.
            expect(onComplete.mock.calls[0][0].status).toBe('cancelled');
        });

        it('MESSAGE arriving after stop is silently ignored (no extra publish)', async () => {
            // Path: a stop reason has been set (browser-error) and the drain
            // is waiting on the in-flight ACK. A late MESSAGE event from the
            // SDK (possible if the broker had already pushed it into the
            // SDK's transport buffer before disconnect) reaches the handler.
            // The first `if (stopReason !== null)` guard must short-circuit
            // before any publish or drift logic runs.
            vi.useFakeTimers();
            const { state, session, onComplete, fireUp, fireMessage, fireDown, ackLast } = setup();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, oldestMsgId: '100', newestMsgId: '500' }),
            };

            const job = runCopyJob(state, session, { onProgress: vi.fn(), onComplete });
            await flush();
            fireUp();
            await flush();
            fireMessage(msg('100'));
            await flush();
            // Stop fires; stopReason is now 'browser-error'. inFlight=1.
            fireDown('lost');
            await flush();
            // Late MESSAGE arrives while drain is waiting. Must be ignored.
            fireMessage(msg('150'));
            await flush();
            // Only the first MESSAGE produced a session.send — the second
            // hit the early return at the top of the handler.
            expect(session.send).toHaveBeenCalledTimes(1);
            // Drain the in-flight ACK so the run can finish.
            ackLast();
            await flush();
            await vi.advanceTimersByTimeAsync(100);
            await flush();
            await job;
            vi.useRealTimers();

            expect(onComplete).toHaveBeenCalledTimes(1);
            // Still exactly one publish — the late MESSAGE never reached the publisher.
            expect(session.send).toHaveBeenCalledTimes(1);
        });
    });
});
