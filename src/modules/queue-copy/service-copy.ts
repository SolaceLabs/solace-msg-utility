import { getOriginalIdHint } from './service';
import { msgIdToString, compareMsgIds } from './service-verify';
import { logger } from '../../core/logger';
import { solaceErrorText } from '../../core/utils';
import {
    IDLE_TIMEOUT_MS,
    PUBLISH_CONCURRENCY_HIGH,
    PUBLISH_CONCURRENCY_LOW,
} from './constants';
import type { CopyJob, QueueCopyState } from './state';

declare const solace: any;

/**
 * Re-export from ./constants so test files importing these names from
 * `./service-copy` continue to work. The value definitions live in
 * [`./constants.ts`](./constants.ts) — single source of truth, kept in sync
 * with the mock build. Full semantic docstrings (idle behavior, backpressure
 * hysteresis rationale, SDK publish-window context) stay below at the use
 * sites where they're most relevant.
 */
export { IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW };

/**
 * Phase-1 stop reasons. First-wins: once `stopReason` is set, subsequent
 * triggers are ignored. Phase 2 reads this value to classify the final outcome.
 */
type StopReason =
    | 'cancel'         // user clicked Cancel
    | 'source-drift'   // first browsed msg id != recorded oldest
    | 'max-consumed'   // a msg id > recorded newest arrived AND we never saw the recorded max (it was consumed externally)
    | 'reached-max'    // processed the recorded newest message; one-pass copy done
    | 'idle'           // no MESSAGE for IDLE_TIMEOUT_MS
    | 'publish-error'  // publisher.send returned !ok or publisher unavailable
    | 'browser-error'; // QueueBrowser DOWN_ERROR / CONNECT_FAILED_ERROR

/**
 * Hooks the modal injects so the copy engine stays free of DOM concerns. The
 * modal owns the verification result + UI updates; the engine reports through
 * these callbacks.
 *
 * Surface is intentionally small: progress updates during the run, plus a
 * single completion callback that carries the final classification. The
 * completion payload's `status` field distinguishes success, cancellation,
 * and error — no separate `onError` is needed.
 */
export interface CopyHooks {
    /** Per-message progress: fires after each successful publish + (optional) remove. */
    onProgress: (job: CopyJob) => void;
    /**
     * Fires exactly once when the run ends. `job.status` is one of
     * `'completed' | 'cancelled' | 'error'` and `job.lastError` carries the
     * display error string for the 'error' case.
     */
    onComplete: (job: CopyJob) => void;
}

/**
 * Run a copy/move job from the primary broker's source queue to the configured
 * destination.
 *
 * The engine is organized in two clean phases:
 *
 *   **Phase 1 — Detect-and-halt.** The MESSAGE handler, idle timer, browser
 *   event handlers, and the cancel-check together set a single `stopReason`
 *   (first-wins) and call `browser.stop()` so no further deliveries arrive.
 *   In-flight publishes continue to settle naturally so their ACKs count
 *   toward the final `copied` total — except when the reason is `'cancel'`,
 *   in which case `publisher.rejectAllPending` short-circuits the waits.
 *
 *   **Phase 2 — Evaluate-and-finish.** After `inFlight` drains to zero, a
 *   single `evaluateAndFinish` decides the run's final `status`, sets the
 *   display error string, disconnects the browser, and fires `onComplete`
 *   exactly once.
 *
 * **Memory model:** the MESSAGE handler does NOT preemptively stop the
 * browser per message. Solace's `QueueBrowser` has an internal transport
 * window (~256 messages) that already bounds concurrent in-flight messages
 * at the SDK layer. Each handler clones + publishes + awaits ACK and lets
 * the msg reference fall out of scope. Memory is O(window-size), not O(N).
 *
 * **Per-message remove (move mode):** `browser.removeMessageFromQueue(msg)`
 * is called inside the MESSAGE handler immediately after the publish ACK
 * lands — not batched at end-of-run. This matches the original behavior and
 * is preserved by the refactor.
 */
export function runCopyJob(
    state: QueueCopyState,
    primarySession: any,
    hooks: CopyHooks,
): Promise<void> {
    const publisher = state.destPublisher ?? state.primaryPublisher;
    // The modal gates `runCopyJob` invocation on a populated verify result
    // with `sourceOk && messageCount > 0` (see `ui-modal.ts handleModalStart`),
    // so `state.verify.result` and `messageCount` are provably non-null here.
    const verifyResult = state.verify!.result!;
    const total = verifyResult.messageCount!;
    const recordedOldestId = verifyResult.oldestMsgId;
    const maxMsgId = verifyResult.newestMsgId;

    state.job = {
        total,
        copied: 0,
        cancelRequested: false,
        lastError: null,
        status: 'running',
    };

    logger.info(
        `[Copy] runCopyJob start — mode=${state.mode} queue="${state.sourceQueue}" ` +
        `dest=${state.dest.type}:"${state.dest.name}" total=${total} ` +
        `oldestMsgId=${recordedOldestId ?? '(none)'} maxMsgId=${maxMsgId ?? '(none)'} ` +
        `publisher=${publisher ? (state.destPublisher ? 'dest' : 'primary') : 'NULL'}`,
    );

    return new Promise<void>((resolve) => {
        // Phase-1 state — drive the stop sequence.
        let stopReason: StopReason | null = null;
        // `drainStarted` declaration commented for parity with the re-entry
        // guard inside triggerStop (search for "Re-entry guard kept commented").
        // let drainStarted = false;
        // `finished` declaration commented for parity with the idempotency
        // guard inside evaluateAndFinish (search for "Idempotency guard kept commented").
        // let finished = false;
        let firstMessageSeen = false;
        // True once the MESSAGE event for `maxMsgId` has been observed
        // (synchronously, before its publish.send await). Used by the
        // pre-process gate to distinguish same-queue feedback (our own
        // clones re-entering) from a genuine externally-consumed max.
        // Solace delivers QB messages in spool-ID order, so the recorded
        // max — if it still exists on the queue — MUST be delivered before
        // any clone we publish back to the same queue (clone IDs are
        // strictly larger than the pre-existing max).
        let seenMaxMsgId = false;
        let inFlight = 0;
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        let cancelRejectIssued = false;
        let browserDisconnected = false;
        // Backpressure: true between browser.stop() and browser.start() while
        // in-flight publishes drain. Separate from browserDisconnected because
        // pause is reversible (browser.start resumes delivery); disconnect is
        // permanent (only happens in triggerStop or evaluateAndFinish).
        let browserPaused = false;
        // The browser is bound only when both publisher and total>0 checks
        // pass. Kept as a let so the early-return paths can share disconnect/
        // evaluate logic without TDZ on a const.
        let browser: any = null;

        const disconnectBrowser = (): void => {
            if (browserDisconnected) return;
            browserDisconnected = true;
            if (browser !== null) {
                try { browser.disconnect(); } catch { /* swallow — best-effort */ }
            }
        };

        /**
         * Phase 2. Consumes the captured `stopReason` plus the cancelRequested
         * flag (which can upgrade any reason to 'cancelled' if the user
         * cancelled at any point during the drain) and produces the final
         * `status` + `lastError`. Disconnects the browser, fires onComplete,
         * resolves the outer Promise. Exactly one firing.
         */
        const evaluateAndFinish = (): void => {
            // Idempotency guard kept commented in case a future call-site adds
            // a direct invocation. Currently unreachable: every triggerStop
            // path funnels through `drainAndFinish` which only fires once
            // because `drainStarted` gates it. See the `let finished`
            // declaration above (also commented for parity).
            // if (finished) return;
            // finished = true;

            // Cancel always upgrades the final classification — if the user
            // cancelled at any point, the run is reported as cancelled even
            // when a different reason originally triggered the stop. This
            // matches user expectation: "I clicked Cancel, so the run was
            // cancelled" regardless of whatever else was happening.
            // `evaluateAndFinish` is only called via the fast-paths
            // (`queueMicrotask(...)` after `stopReason = ...`) or via
            // `drainAndFinish` (called from `triggerStop` which sets stopReason
            // first), so `stopReason` is always set by the time we get here.
            const effective: StopReason = state.job!.cancelRequested ? 'cancel' : stopReason!;
            const job = state.job!;
            switch (effective) {
                case 'cancel':
                    job.status = 'cancelled';
                    job.lastError = null;
                    break;
                case 'source-drift':
                    job.status = 'error';
                    job.lastError = 'First message ID did not match recorded oldest. The source queue contents have changed since verification.';
                    break;
                case 'max-consumed':
                    job.status = 'error';
                    job.lastError = `Recorded newest message was consumed before our run reached it. Sent ${job.copied} (${job.total} expected).`;
                    break;
                case 'reached-max':
                case 'idle':
                    if (job.copied === job.total) {
                        job.status = 'completed';
                        job.lastError = null;
                    } else {
                        job.status = 'error';
                        job.lastError = `Message count mismatch: sent ${job.copied}, expected ${job.total}. Messages were drained from the source mid-run.`;
                    }
                    break;
                case 'publish-error':
                case 'browser-error':
                    job.status = 'error';
                    // job.lastError already populated by the triggering site.
                    break;
            }
            disconnectBrowser();
            logger.info(
                `[Copy] runCopyJob finish — status=${job.status} copied=${job.copied}/${job.total} ` +
                `effectiveReason=${effective}` + (job.lastError ? ` lastError="${job.lastError}"` : ''),
            );
            hooks.onComplete(job);
            resolve();
        };

        // Fast-path: no publisher (sameVpn + primary never connected). The
        // engine can't do useful work; surface as publish-error before binding
        // the source browser. Defer to a microtask so handleModalStart's
        // renderRunPhase paints "Copying…" before onComplete flips to "Failed".
        if (!publisher) {
            state.job!.lastError = 'Publisher unavailable';
            stopReason = 'publish-error';
            logger.warn('[Copy] Fast-path: no publisher available — skipping browser bind');
            queueMicrotask(() => evaluateAndFinish());
            return;
        }

        // Fast-path: defensive empty-queue handling. The modal gates Start on
        // messageCount > 0, but if a 0-count job reaches the engine, complete
        // immediately rather than waiting IDLE_TIMEOUT_MS for the idle path
        // to confirm what we already know.
        if (total === 0) {
            stopReason = 'idle';
            logger.info('[Copy] Fast-path: total=0, completing without binding browser');
            queueMicrotask(() => evaluateAndFinish());
            return;
        }

        const props = new solace.QueueBrowserProperties();
        props.queueDescriptor = new solace.QueueDescriptor({
            name: state.sourceQueue,
            type: solace.QueueType.QUEUE,
        });
        browser = primarySession.createQueueBrowser(props);
        logger.debug(`[Copy] Source QueueBrowser created for "${state.sourceQueue}"`);

        /**
         * Phase 1 entry point. First-wins. Halts the QB so no more MESSAGE
         * events arrive, escalates cancel (rejects pending publishes for fast
         * UX), and kicks off the drain → evaluate tail. Idempotent: callable
         * from MESSAGE / idle-timer / browser-event paths without coordinating.
         */
        const triggerStop = (reason: StopReason): void => {
            if (stopReason !== null) {
                logger.debug(`[Copy] triggerStop(${reason}) ignored — already stopping (${stopReason})`);
                return;
            }
            stopReason = reason;
            logger.info(
                `[Copy] triggerStop reason=${reason} copied=${state.job!.copied}/${state.job!.total} ` +
                `inFlight=${inFlight} seenMaxMsgId=${seenMaxMsgId}`,
            );
            if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
            // Disconnect (not just stop) so no further MESSAGE events can be
            // delivered while we wait for in-flight publishes to settle.
            // Same-broker copy creates a feedback loop where our own
            // published clones could otherwise re-enter the MESSAGE stream
            // while ACKs are still pending; disconnect cuts that off
            // permanently.
            disconnectBrowser();
            if (reason === 'cancel' && !cancelRejectIssued) {
                cancelRejectIssued = true;
                logger.debug('[Copy] rejectAllPending — cancel');
                publisher.rejectAllPending('Cancelled');
            }
            // Re-entry guard kept commented in case future code reordering
            // allows triggerStop re-entry. Currently unreachable: the
            // `stopReason !== null` early-return at the top of triggerStop
            // short-circuits any re-entry, so `drainStarted` would always be
            // false at this point. See the `let drainStarted` declaration
            // above (also commented for parity).
            // if (!drainStarted) {
            //     drainStarted = true;
            // Defer to a microtask so a synchronous cancelRequested-set
            // immediately after the triggering event (e.g. test code
            // setting it on the next line after fireDown) is visible to
            // evaluateAndFinish when the drain reaches it.
            queueMicrotask(() => void drainAndFinish());
            // }
        };

        /**
         * Wait for in-flight publishes to settle, then enter Phase 2. Late
         * cancel (user clicks Cancel after a different reason already
         * triggered) escalates the drain by rejecting pending publishes so
         * the run doesn't block on ACKs the user no longer cares about.
         */
        const drainAndFinish = async (): Promise<void> => {
            if (inFlight > 0) {
                logger.debug(`[Copy] drainAndFinish — waiting for ${inFlight} in-flight publish(es) to settle`);
            }
            while (inFlight > 0) {
                await new Promise((r) => setTimeout(r, 20));
                if (state.job!.cancelRequested && !cancelRejectIssued) {
                    cancelRejectIssued = true;
                    logger.debug('[Copy] rejectAllPending — late cancel during drain');
                    publisher.rejectAllPending('Cancelled (late)');
                }
            }
            evaluateAndFinish();
        };

        const resetIdleTimer = (): void => {
            if (idleTimer !== null) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                // Race guards kept commented in case future timer-management
                // changes allow the timer to fire after a stop or with
                // in-flight publishes. Currently unreachable: the
                // pause-suspension fix clears the timer when entering pause,
                // and triggerStop clears it on any stop reason, so by the
                // time this callback fires `stopReason === null` and
                // `inFlight === 0` is the only reachable state.
                // if (stopReason !== null) return;
                // if (inFlight > 0) { resetIdleTimer(); return; }
                triggerStop('idle');
            }, IDLE_TIMEOUT_MS);
        };

        browser.on(solace.QueueBrowserEventName.UP, () => {
            logger.info(`[Copy] Source QueueBrowser UP for "${state.sourceQueue}"`);
            resetIdleTimer();
        });
        browser.on(solace.QueueBrowserEventName.CONNECT_FAILED_ERROR, (e: any) => {
            // OperationError carries the reason on `.message`, not `infoStr`.
            state.job!.lastError = solaceErrorText(e, 'Browser connect failed');
            logger.error(`[Copy] Source QueueBrowser CONNECT_FAILED_ERROR: ${state.job!.lastError}`);
            triggerStop('browser-error');
        });
        browser.on(solace.QueueBrowserEventName.DOWN_ERROR, (e: any) => {
            state.job!.lastError = solaceErrorText(e, 'Browser disconnected');
            logger.error(`[Copy] Source QueueBrowser DOWN_ERROR: ${state.job!.lastError}`);
            triggerStop('browser-error');
        });
        // GM_DISABLED registered for SDK-event-code-validation parity
        // (createBrowserMock in tests/setup.ts throws on unknown event codes).
        // No-op — any actual failure surfaces via DOWN_ERROR or the next
        // publish failure. Covered by the `GM_DISABLED is a no-op` test.
        browser.on(solace.QueueBrowserEventName.GM_DISABLED, () => { /* no-op */ });

        browser.on(solace.QueueBrowserEventName.MESSAGE, async (msg: any) => {
            if (stopReason !== null) {
                logger.debug(`[Copy] MESSAGE arrived after stop (${stopReason}) — ignored`);
                return;
            }
            if (state.job!.cancelRequested) {
                logger.debug('[Copy] MESSAGE handler sees cancelRequested — triggering stop');
                triggerStop('cancel');
                return;
            }

            const msgId = msgIdToString(msg);
            // Template-literal coercion renders a null msgId as 'null' — fine
            // for a debug log; the `?? '(no-id)'` fallback was cosmetic.
            logger.debug(`[Copy] MESSAGE received id=${msgId} inFlight=${inFlight}`);

            // First-message drift check — strictly synchronous (before any
            // await) so we rely on SDK delivery order for the "was this the
            // actual first message" determination.
            if (!firstMessageSeen) {
                firstMessageSeen = true;
                if (recordedOldestId !== null && msgId !== null && msgId !== recordedOldestId) {
                    logger.warn(
                        `[Copy] Source drift detected — first msgId=${msgId} != recordedOldestId=${recordedOldestId}`,
                    );
                    triggerStop('source-drift');
                    return;
                }
                logger.debug(`[Copy] First message verified — id=${msgId} matches recordedOldestId`);
            }

            // Pre-process gate: msgId > maxMsgId. Two cases — disambiguate
            // by whether we've already seen `maxMsgId` itself in the stream.
            //   (a) seenMaxMsgId === true: our own published clone has
            //       re-entered the source queue (same-broker copy/move
            //       feedback loop). Drop silently. The post-process gate
            //       fired by maxMsgId's MESSAGE handler will end the run
            //       once its ACK lands.
            //   (b) seenMaxMsgId === false: the recorded max was consumed
            //       externally before our QB reached it. Solace delivers
            //       in spool-ID order, so seeing a strictly-greater id
            //       without ever seeing the max means the max is gone.
            //       Fatal — abort the run.
            if (maxMsgId !== null && msgId !== null && compareMsgIds(msgId, maxMsgId) > 0) {
                if (seenMaxMsgId) {
                    logger.debug(
                        `[Copy] msgId=${msgId} > maxMsgId=${maxMsgId} — same-queue feedback ` +
                        `(seenMaxMsgId=true); dropping silently`,
                    );
                    return;
                }
                logger.warn(
                    `[Copy] msgId=${msgId} > maxMsgId=${maxMsgId} and seenMaxMsgId=false — ` +
                    `recorded max was consumed externally; triggering max-consumed`,
                );
                triggerStop('max-consumed');
                return;
            }

            // Synchronously record that we've observed the recorded max.
            // Must happen BEFORE inFlight++ / await publisher.send so
            // subsequent MESSAGE handlers (which fire while this one is
            // suspended at the await) see the updated value.
            if (maxMsgId !== null && msgId !== null && compareMsgIds(msgId, maxMsgId) === 0) {
                seenMaxMsgId = true;
                logger.debug(`[Copy] seenMaxMsgId set true (msgId=${msgId} === maxMsgId)`);
            }

            inFlight++;
            resetIdleTimer();

            // Backpressure: pause the source browser when too many publishes
            // are unACK'd. The Solace session's publish window (default ~50)
            // closes if exceeded — see PUBLISH_CONCURRENCY_HIGH docstring.
            // browser.stop() halts further MESSAGE delivery; the SDK's
            // transport buffer keeps the unread messages and re-delivers
            // them after browser.start(). We resume in the finally block
            // once inFlight drops below the low-water mark.
            //
            // Suspend the idle timer for the duration of the pause: no
            // MESSAGE will arrive while paused, so the "no MESSAGE in
            // IDLE_TIMEOUT_MS" semantic is meaningless and would otherwise
            // need to be defended against by the inFlight>0 rearm. Cleaner
            // to just clear it now and resetIdleTimer when we resume.
            if (!browserPaused && inFlight >= PUBLISH_CONCURRENCY_HIGH) {
                browserPaused = true;
                try { browser.stop(); } catch { /* swallow — best-effort */ }
                // clearTimeout silently ignores null/undefined; the guard
                // (idleTimer !== null) was purely cosmetic — every pause path
                // is reached via a MESSAGE that already called resetIdleTimer.
                clearTimeout(idleTimer!);
                idleTimer = null;
                logger.debug(`[Copy] backpressure: pausing source browser at inFlight=${inFlight} (idle timer suspended)`);
            }

            try {
                logger.debug(`[Copy] publisher.send id=${msgId} → ${state.dest.type}:"${state.dest.name}"`);
                const result = await publisher.send(msg, state.dest, {
                    originalIdHint: getOriginalIdHint(msg),
                });

                if (!result.ok) {
                    // Publish failed. First failure escalates to publish-error;
                    // subsequent failures (e.g. publisher.rejectAllPending
                    // resolving all pending on cancel) land with stopReason
                    // already set — log and move on without re-triggering.
                    if (stopReason === null) {
                        state.job!.lastError = result.error;
                        logger.error(`[Copy] publisher.send failed for id=${msgId}: ${result.error}`);
                        triggerStop('publish-error');
                    } else {
                        logger.debug(`[Copy] publisher.send for id=${msgId} settled with !ok after stop (${stopReason}) — not counted`);
                    }
                    return;
                }

                // Publish succeeded. Count it toward `copied` regardless of
                // whether a stop has been triggered — the message DID make it
                // to the destination, so the user-facing count must reflect
                // that. Phase 2's count check uses this updated value for
                // both the "completed vs error" decision and the error text.
                if (state.mode === 'move') {
                    // The source browser may already be disconnected (e.g.
                    // max-consumed or browser-error). Skip the source-side
                    // delete in that case — the publish still counts, but
                    // the message will remain on the source queue and be
                    // re-delivered to the next consumer.
                    if (!browserDisconnected) {
                        try {
                            browser.removeMessageFromQueue(msg);
                            logger.debug(`[Copy] removeMessageFromQueue id=${msgId} (move mode)`);
                        } catch (e: any) {
                            // Template-literal coercion renders an absent
                            // .message as 'undefined' — adequate for a warn log.
                            logger.warn(`[Copy] removeMessageFromQueue for id=${msgId} threw: ${e?.message}`);
                        }
                    } else {
                        logger.debug(`[Copy] skipping removeMessageFromQueue id=${msgId} — browser already disconnected`);
                    }
                }
                state.job!.copied++;
                logger.debug(
                    `[Copy] ACK id=${msgId} copied=${state.job!.copied}/${state.job!.total}` +
                    (stopReason !== null ? ` (in-flight settled after stop=${stopReason})` : ''),
                );
                hooks.onProgress(state.job!);

                // Post-process gate: msgId === maxMsgId means we just
                // processed the recorded newest. Only fire if no other stop
                // reason already won — first-wins is enforced by triggerStop
                // itself, but the extra guard avoids the misleading log line.
                if (stopReason === null
                    && maxMsgId !== null && msgId !== null
                    && compareMsgIds(msgId, maxMsgId) === 0) {
                    logger.info(`[Copy] Post-process gate — msgId=${msgId} === maxMsgId; signalling reached-max`);
                    triggerStop('reached-max');
                }
            } finally {
                inFlight--;
                // Don't touch timers/backpressure when stopping — the drain
                // loop in drainAndFinish watches inFlight and proceeds to
                // Phase 2 when it hits zero, regardless of the timer.
                if (stopReason === null) {
                    if (state.job!.cancelRequested) {
                        // Cancel may have been clicked while the browser was
                        // paused. With no incoming MESSAGEs to observe the
                        // flag, the next ACK landing is the next chance to
                        // detect it. Trigger stop here so the run terminates
                        // promptly instead of waiting out IDLE_TIMEOUT_MS.
                        triggerStop('cancel');
                    } else {
                        // Backpressure resume: enough ACKs have settled, drop
                        // back below the low-water mark — restart the browser
                        // so the SDK's transport buffer can flush more
                        // messages into our handler.
                        if (browserPaused && inFlight <= PUBLISH_CONCURRENCY_LOW && !browserDisconnected) {
                            browserPaused = false;
                            try { browser.start(); } catch { /* swallow — best-effort */ }
                            logger.debug(`[Copy] backpressure: resuming source browser at inFlight=${inFlight}`);
                        }
                        // Reset the idle timer ONLY when the browser is
                        // actively delivering. While paused the timer stays
                        // suspended (cleared in the pause block) — restarting
                        // it now would falsely fire 'idle' just because no
                        // MESSAGE arrived during the pause, which is exactly
                        // the situation we're forcing by stopping the browser.
                        if (!browserPaused) {
                            resetIdleTimer();
                        }
                    }
                }
            }
        });

        try {
            logger.debug(`[Copy] Connecting source QueueBrowser to "${state.sourceQueue}"`);
            browser.connect();
            resetIdleTimer();
        } catch (e: any) {
            state.job!.lastError = e?.message ?? 'Failed to start copy browser.';
            logger.error(`[Copy] browser.connect() threw: ${state.job!.lastError}`);
            triggerStop('browser-error');
        }
    });
}
