import type { AppContext, ManagedSession } from '../../core/types';
import { unfilteredPrimarySempContext } from '../../core/services/sempContext';
import { isQueueVisible, canOperate } from '../../core/rbac';
import { verifySource } from './service-verify';
import { runCopyJob } from './service-copy';
import { logger } from '../../core/logger';
import * as ui from './ui';
import type { CopyUiElements, SourceSummary, DestSummary } from './ui';
import type { QueueCopyState, VerifyResult } from './state';

/**
 * Drives the Confirm Queue Copy modal. Phase 1: render summary + verify
 * source via SEMP v1 (or QueueBrowser accumulate fallback). Phase 2: run the
 * copy engine on Copy/Move click. Cancel's behavior depends on phase.
 *
 * Entitlement pipeline (every stage is allow-all when `session` is null, so
 * direct-mode behaviour is untouched):
 *
 *   source gate  →  verify  →  evaluateStartGate  →  destination gate  →  engine
 *
 * The source gate keeps verify from probing a queue the user cannot see (its
 * SEMP v1 RPC is not covered by the fetch-layer discovery filter);
 * `evaluateStartGate` intersects the broker's verdict with RBAC; the destination
 * gate is the last check before any message is published.
 */

/**
 * RBAC inputs for the source/destination gates. `session: null` means no managed
 * session governs this connection — every matcher then degrades to allow-all.
 * Passed explicitly rather than read from globals so the gates stay pure.
 */
export interface SourceAccess {
    session: ManagedSession | null;
    broker: string;
    vpn: string;
}
export function openCopyModal(
    ctx: AppContext,
    els: CopyUiElements,
    state: QueueCopyState,
    getPrimarySession: () => any | null,
): void {
    const sempCtx = unfilteredPrimarySempContext(ctx);
    const selectedVpn = ctx.appState.selectedVpn ?? '';
    // Client session username — used by the SEMP-path owner check in the
    // gate. Empty string when no Solace connection is recorded; the gate
    // treats empty as "no owner match possible".
    const clientUser = ctx.appState.solaceConnection?.user ?? '';

    logger.info(
        `[CopyModal] open — mode=${state.mode} source="${state.sourceQueue}" ` +
        `dest=${state.dest.type}:"${state.dest.name}" sempCtx=${sempCtx ? 'yes' : 'no'} ` +
        `clientUser="${clientUser}"`,
    );

    const access: SourceAccess = {
        session: ctx.appState.managed ?? null,
        broker: ctx.appState.managed?.broker ?? '',
        vpn: selectedVpn,
    };

    const source = buildSourceSummary(ctx, state.sourceQueue);
    const dest = buildDestSummary(ctx, state);
    ui.renderModalInitial(els, source, dest, state.mode);
    els.modal.showModal();

    // Wire the Start button once the modal opens so it reflects the current
    // state.mode and calls the right run path.
    els.btnModalStart.onclick = () => handleModalStart(els, state, getPrimarySession, access);

    // In-modal Refresh button — re-runs verifySource against the source
    // queue without closing the modal. Each click aborts any still-pending
    // verify (handles double-click) before firing a fresh probe.
    els.btnModalSourceRefresh.onclick = () => {
        state.verify?.abort?.abort();
        ui.resetVerifyDisplay(els);
        runVerify(els, state, sempCtx, getPrimarySession(), selectedVpn, clientUser, access);
    };

    runVerify(els, state, sempCtx, getPrimarySession(), selectedVpn, clientUser, access);
}

/**
 * Reset state.verify and fire a fresh verifySource. Shared by openCopyModal's
 * initial probe and the in-modal Refresh button. The result lands in
 * `state.verify.result` and the modal renders via `ui.renderVerifyResult`,
 * after which `evaluateStartGate` decides whether Start is enabled.
 */
function runVerify(
    els: CopyUiElements,
    state: QueueCopyState,
    sempCtx: import('../../core/connections/types').SempContext | null,
    primarySession: any | null,
    selectedVpn: string,
    clientUser: string,
    access: SourceAccess,
): void {
    state.verify = { inProgress: true, abort: new AbortController(), result: null };
    els.btnModalSourceRefresh.disabled = true;
    els.btnModalStart.disabled = true;

    // SOURCE GATE. Verify reaches the broker over SEMP v1, which the fetch-layer
    // discovery filter does not touch — so without this a managed user could
    // type any queue name and read back its depth, size and message IDs. Refuse
    // before the probe is ever spawned.
    if (!isQueueVisible(access.session, access.broker, access.vpn, state.sourceQueue)) {
        logger.warn(`[CopyModal] source gate refused "${state.sourceQueue}" — not entitled`);
        const result: VerifyResult = {
            sourceOk: false, via: 'queue-browser',
            errors: [`You are not entitled to queue "${state.sourceQueue}".`],
            messageVpn: null, messageCount: null, spoolUsageBytes: null, quotaBytes: null, maxMessageSize: null,
            oldestMsgId: null, newestMsgId: null, accessType: null, owner: null,
        };
        state.verify.result = result;
        state.verify.inProgress = false;
        ui.renderVerifyResult(els, result);
        evaluateStartGate(els, state, access);
        return;
    }
    logger.debug(
        `[CopyModal] runVerify — sempCtx=${sempCtx ? 'yes' : 'no'} ` +
        `session=${primarySession ? 'yes' : 'no'} clientUser="${clientUser}"`,
    );

    if (!primarySession) {
        logger.warn('[CopyModal] runVerify — no primary session, synthesizing failure result');
        const result: VerifyResult = {
            sourceOk: false, via: 'queue-browser', errors: ['No primary Solace session — reconnect and retry.'],
            messageVpn: null, messageCount: null, spoolUsageBytes: null, quotaBytes: null, maxMessageSize: null,
            oldestMsgId: null, newestMsgId: null, accessType: null, owner: null,
        };
        state.verify.result = result;
        state.verify.inProgress = false;
        ui.renderVerifyResult(els, result);
        evaluateStartGate(els, state, access);
        return;
    }

    void verifySource({
        sempCtx,
        primarySession,
        vpn: selectedVpn,
        queue: state.sourceQueue,
        signal: state.verify.abort!.signal,
        onProgress: (count, sizeBytes) => {
            if (!state.verify) return;
            ui.renderVerifyProgress(els, count, sizeBytes);
        },
    }).then((result) => {
        if (!state.verify) return;
        // SEMP-path owner override. The SEMP RPC reports queue metadata
        // (`<owner>` + `<others-permission>`) but doesn't evaluate it
        // against the client session. Solace's actual access-control rule
        // is "owners have full access regardless of others-permission" — so
        // when the client user matches the queue owner (case-sensitive
        // equals), lift `accessType` to 'read-write'. Failing this check
        // falls through to the others-permission gate downstream.
        //
        // `result.owner !== null` distinguishes "SEMP path extracted owner
        // (possibly empty string for a server-created queue)" from "owner
        // unavailable" (QB-fallback path, or SEMP `<owner>` element missing).
        // Empty owner + empty clientUser is a legitimate match if the user
        // explicitly authenticated as the empty username — strict equals.
        if (result.owner !== null && result.owner === clientUser) {
            const prior = result.accessType;
            result.accessType = 'read-write';
            logger.info(
                `[CopyModal] owner override — clientUser="${clientUser}" matches queue owner="${result.owner}"; ` +
                `lifting accessType from ${prior} to 'read-write'`,
            );
        }
        state.verify.inProgress = false;
        state.verify.result = result;
        ui.renderVerifyResult(els, result);
        evaluateStartGate(els, state, access);
    });
}

/**
 * Intersect the broker's reported access with the user's entitlement. RBAC may
 * only ever DOWNGRADE — it never grants what the broker withholds:
 *
 *   - no session            → identity (direct mode is completely unchanged,
 *                             including the permissive `null` case)
 *   - RBAC denies operate   → `read-only` (or `no-access`, preserved as-is)
 *   - RBAC allows operate   → whatever the broker said (broker still wins)
 *
 * `canOperate ⊆ isQueueVisible`, so checking visibility first is sound: a
 * revoked-while-the-modal-was-open source lands on `no-access` and blocks both
 * operations with the existing banner, instead of failing later at bind time.
 */
function effectiveSourceAccess(
    reported: VerifyResult['accessType'],
    state: QueueCopyState,
    access: SourceAccess,
): VerifyResult['accessType'] {
    const { session, broker, vpn } = access;
    if (!isQueueVisible(session, broker, vpn, state.sourceQueue)) return 'no-access';
    if (session && !canOperate(session, broker, vpn, state.sourceQueue)) {
        return reported === 'no-access' ? 'no-access' : 'read-only';
    }
    return reported;
}

/**
 * Single source of truth for whether the Start (Copy/Move) button is enabled,
 * and which verify-section banner (if any) is visible. Called after every
 * `renderVerifyResult` and any time the user toggles mode while the verify
 * result is still in view. Order matters — earlier conditions win:
 *
 *   1. Verify failed (`!sourceOk`) → disable; existing verify-error pane
 *      already explains the problem, no banner needed.
 *   2. Empty queue (`messageCount === 0`) → disable + empty-queue banner.
 *   3. Move on read-only (`mode === 'move' && effectiveAccess === 'read-only'`) →
 *      disable + read-only banner. Switching to Copy clears the banner.
 *   4. Otherwise → enable + clear both banners.
 *
 * `accessType === null` is treated as permissive (let the broker enforce).
 *
 * In a managed session the broker's verdict is intersected with RBAC — see
 * `effectiveSourceAccess`. Without that, move would be gated purely on the
 * broker's `<others-permission>`, which says nothing about entitlements.
 */
export function evaluateStartGate(els: CopyUiElements, state: QueueCopyState, access: SourceAccess): void {
    const result = state.verify?.result ?? null;
    const clearAllBanners = (): void => {
        ui.setEmptyQueueIndicator(els, false);
        ui.setReadOnlyIndicator(els, false);
        ui.setNoAccessIndicator(els, false);
    };

    if (!result || !result.sourceOk) {
        els.btnModalStart.disabled = true;
        clearAllBanners();
        logger.debug('[CopyModal] evaluateStartGate → disabled (verify failed or pending)');
        return;
    }
    if (result.messageCount === 0) {
        els.btnModalStart.disabled = true;
        clearAllBanners();
        ui.setEmptyQueueIndicator(els, true);
        logger.info('[CopyModal] evaluateStartGate → disabled (empty queue)');
        return;
    }
    // Computed here, below the verify/empty guards, so `result` is non-null and
    // the empty-queue banner keeps precedence.
    const effectiveAccess = effectiveSourceAccess(result.accessType, state, access);
    // No-access blocks BOTH copy and move — the user can't even read the
    // queue, so neither operation is possible.
    if (effectiveAccess === 'no-access') {
        els.btnModalStart.disabled = true;
        clearAllBanners();
        ui.setNoAccessIndicator(els, true);
        logger.info('[CopyModal] evaluateStartGate → disabled (no access to queue)');
        return;
    }
    // Read-only allows copy but blocks move (move needs consume permission
    // to delete from the source after publishing to the destination).
    if (state.mode === 'move' && effectiveAccess === 'read-only') {
        els.btnModalStart.disabled = true;
        clearAllBanners();
        ui.setReadOnlyIndicator(els, true);
        logger.info('[CopyModal] evaluateStartGate → disabled (move on read-only queue)');
        return;
    }
    els.btnModalStart.disabled = false;
    clearAllBanners();
    logger.debug(
        `[CopyModal] evaluateStartGate → enabled — mode=${state.mode} ` +
        `count=${result.messageCount} accessType=${effectiveAccess ?? 'null'} ` +
        `owner="${result.owner ?? '(none)'}"`,
    );
}

/**
 * Modal Start (Copy/Move) click handler. Reuses the primary session when the
 * destination is same-broker + same-VPN; any other case publishes via the
 * destination session captured in `state.destSession` (set by the Connect
 * Client button's hook).
 *
 * The engine reports a single `onComplete` whose `job.status` field carries
 * the final classification ('completed' / 'cancelled' / 'error'). The modal
 * renders the error pane only when status is 'error'; the title classifier
 * (`renderRunComplete`) handles the rest.
 */
/**
 * DESTINATION GATE — the last check before any message is published.
 *
 * Applies only when the publish path uses PROVISIONED credentials — either the
 * managed primary connection (same broker + same VPN) or a secondary dialled by
 * the core managed store. A typed-credential destination is the documented
 * bypass (reachable only where the deployment offers both connection modes).
 *
 * Returns a user-facing refusal, or `null` to proceed.
 */
export function destinationRefusal(state: QueueCopyState, access: SourceAccess): string | null {
    const { session } = access;
    if (!session) return null;
    const df = state.destForm;
    // Where the publish will actually land, when the credential reaching it came
    // from the deployment rather than the user's keyboard.
    const target = df.sameBroker && df.sameVpn
        ? { broker: access.broker, vpn: access.vpn }
        : df.credMode === 'provisioned' ? df.provisioned : null;
    if (!target) return null;
    const { broker, vpn } = target;
    if (state.dest.type === 'topic') {
        // Entitlements are expressed per queue; a topic fans out to every queue
        // subscribed to it, so it cannot be checked. Blocked rather than guessed.
        return 'Topic destinations are unavailable with managed credentials — entitlements are defined per queue.';
    }
    if (!canOperate(session, broker, vpn, state.dest.name)) {
        return `You are not entitled to write to queue "${state.dest.name}".`;
    }
    return null;
}

function handleModalStart(
    els: CopyUiElements,
    state: QueueCopyState,
    getPrimarySession: () => any | null,
    access: SourceAccess,
): void {
    const primarySession = getPrimarySession();
    if (!primarySession) {
        logger.warn('[CopyModal] handleModalStart aborted — no primary session');
        return;
    }
    const refusal = destinationRefusal(state, access);
    if (refusal) {
        logger.warn(`[CopyModal] destination gate refused the run — ${refusal}`);
        ui.renderRunPhase(els, 0, state.mode);
        ui.renderRunError(els, refusal);
        return;
    }
    ui.setFormDisabled(els, true);
    // handleModalStart only runs when btnModalStart is enabled, which
    // evaluateStartGate only does when sourceOk + messageCount > 0 + the
    // mode/permission combo is allowed. Both result and messageCount are
    // therefore non-null at this call site.
    const total = state.verify!.result!.messageCount!;
    logger.info(`[CopyModal] handleModalStart — kicking off ${state.mode} run for total=${total}`);
    ui.renderRunPhase(els, total, state.mode);

    // Coalesce-latest scheduler for progress paints. The engine fires
    // `onProgress` after every successful ACK; on a busy broker that can be
    // hundreds of synchronous callbacks in a single microtask burst, with
    // no opportunity for the browser to paint between them — the user
    // would see the progress bar jump straight to its final value at the
    // end of the run. Schedule the DOM write via `requestAnimationFrame`
    // instead: rapid back-to-back onProgress calls just update `latestJob`,
    // and a single rAF callback flushes the most recent state once per
    // paint frame (~60 fps). `onComplete` still renders synchronously to
    // guarantee the final state is on screen before the modal closes.
    let pendingPaint = false;
    let latestJob: import('./state').CopyJob | null = null;

    void runCopyJob(state, primarySession, {
        onProgress: (job) => {
            latestJob = job;
            if (pendingPaint) return;
            pendingPaint = true;
            requestAnimationFrame(() => {
                pendingPaint = false;
                /* v8 ignore start -- `latestJob` is set on the preceding
                 * statement before the rAF is scheduled, and the rAF callback
                 * is the only reader. The null branch exists purely for
                 * TypeScript's nullable-narrowing and is unreachable at
                 * runtime. */
                if (latestJob) ui.renderProgress(els, latestJob);
                /* v8 ignore stop */
            });
        },
        onComplete: (job) => {
            logger.info(
                `[CopyModal] onComplete — status=${job.status} copied=${job.copied}/${job.total}` +
                (job.lastError ? ` lastError="${job.lastError}"` : ''),
            );
            // Render the final state synchronously — a coalesced rAF paint
            // from a previous onProgress could still be pending at this
            // point, and we want the modal to reflect the run's true final
            // copied/total values immediately.
            ui.renderProgress(els, job);
            if (job.status === 'error' && job.lastError) {
                ui.renderRunError(els, job.lastError);
            }
            ui.renderRunComplete(els, job);
            ui.setFormDisabled(els, false);
        },
    });
}

/**
 * Cancel handler for the modal's Cancel/Close button. Behavior depends on
 * which phase is active:
 *   - verifying: abort the verification (AbortController cancels fetch /
 *     disconnects the temp browser), then close the modal.
 *   - running: set `cancelRequested`; the engine's drain loop sees it and
 *     finishes via Phase 2 with `status: 'cancelled'`. The modal stays open
 *     showing the final state; the button changes to "Close" when the run
 *     completes.
 *   - run complete (or neither — verify done, not started): just close.
 */
export function cancelCopyModal(els: CopyUiElements, state: QueueCopyState): void {
    if (state.verify?.inProgress) {
        logger.info('[CopyModal] cancel during verify — aborting verify, closing modal');
        state.verify.abort?.abort();
        state.verify = null;
        els.modal.close();
        return;
    }
    if (state.job && state.job.status === 'running' && !state.job.cancelRequested) {
        logger.info(`[CopyModal] cancel during run — flagging cancelRequested (copied=${state.job.copied}/${state.job.total})`);
        state.job.cancelRequested = true;
        return;
    }
    logger.debug('[CopyModal] cancel — closing modal');
    els.modal.close();
}

function buildSourceSummary(ctx: AppContext, queueName: string): SourceSummary {
    const sempCreds = ctx.appState.sempCredentials;
    // Use the structured host/port fields the connections module captured at
    // Connect time so the displayed broker matches what the user typed —
    // not the gateway-prefixed wire URL in hosted mode.
    const broker = sempCreds ? `${sempCreds.host}:${sempCreds.port}` : '';
    return {
        broker: broker || '(primary broker)',
        vpn: ctx.appState.selectedVpn ?? '(primary VPN)',
        queueName,
    };
}

function buildDestSummary(ctx: AppContext, state: QueueCopyState): DestSummary {
    const f = state.destForm;
    let broker: string;
    if (f.sameBroker) {
        const sempCreds = ctx.appState.sempCredentials;
        broker = sempCreds ? `${sempCreds.host}:${sempCreds.port}` : '(primary broker)';
    } else {
        broker = f.host || '(not set)';
    }
    const vpn = f.sameBroker && f.sameVpn
        ? (ctx.appState.selectedVpn ?? '(primary VPN)')
        : (f.solace.vpn || '(not set)');
    return {
        broker,
        vpn,
        type: state.dest.type,
        targetName: state.dest.name || '(not set)',
    };
}
