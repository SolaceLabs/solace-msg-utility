import type { SempContext } from '../../core/types';
import { escapeXml } from '../../core/utils';
import { logger } from '../../core/logger';
import { BIND_PROBE_TIMEOUT_MS, ACCUMULATE_IDLE_MS } from './constants';
import type { VerifyResult } from './state';

declare const solace: any;

// Re-export from ./constants so test files importing ACCUMULATE_IDLE_MS from
// `./service-verify` continue to work. Value definition lives in
// [`./constants.ts`](./constants.ts).
export { ACCUMULATE_IDLE_MS };

/** Solace SEMP `quota` is reported in megabytes; this converts to bytes. */
const MB_TO_BYTES = 1024 * 1024;

/**
 * Live progress callback for the QueueBrowser-bind fallback. Fires once per
 * incoming MESSAGE so the modal can show count+size updating in real time.
 * Not invoked by the SEMP path (which returns count+size atomically).
 */
export type VerifyProgress = (count: number, sizeBytes: number) => void;

function emptyResult(via: 'semp' | 'queue-browser'): VerifyResult {
    return {
        sourceOk: false,
        via,
        errors: [],
        messageVpn: null,
        messageCount: null,
        spoolUsageBytes: null,
        quotaBytes: null,
        maxMessageSize: null,
        oldestMsgId: null,
        newestMsgId: null,
        accessType: null,
        owner: null,
    };
}

/**
 * Normalize a raw access-type string from either SEMP or the Solace SDK into
 * the canonical `'no-access' | 'read-only' | 'read-write' | null` set used by
 * `VerifyResult.accessType`.
 *
 * Inputs:
 *   - SEMP `info/others-permission` values are tagged by broker version with
 *     a trailing suffix in parentheses (e.g. `Read-Only (1000)`,
 *     `No-Access (1001)`, `Consume (1100)`, `Delete (1111)`,
 *     `Modify-Topic (...)`). Match by prefix, case-sensitive.
 *   - SDK `_messageConsumer._permissions` reports `'READ_ONLY'` or
 *     `'READ_WRITE'` (the SDK has already evaluated the client's effective
 *     access including owner privileges).
 *
 * Mapping:
 *   - `No-Access*`                                           → `'no-access'`
 *   - `Read-Only*` (SEMP) / `READ_ONLY` (SDK)                → `'read-only'`
 *   - `Consume*` / `Modify-Topic*` / `Delete*` (SEMP)        → `'read-write'`
 *   - `READ_WRITE` (SDK)                                     → `'read-write'`
 *   - Any other non-empty value                              → `'read-write'`
 *   - null / undefined / empty after trim                    → `null`
 *
 * Null is returned only when we genuinely don't know — the modal treats null
 * as permissive and lets the broker enforce. A deliberate `'no-access'` or
 * `'read-only'` may block Start depending on the selected mode.
 */
export function normalizeAccessType(raw: string | null | undefined): 'no-access' | 'read-only' | 'read-write' | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('No-Access')) return 'no-access';
    if (trimmed.startsWith('Read-Only')) return 'read-only';
    if (trimmed === 'READ_ONLY') return 'read-only';
    return 'read-write';
}

/**
 * Verify the source queue: existence (mandatory) + count + size + quota +
 * max-message-size (best-effort, SEMP-only) + VPN.
 *
 * - SEMP-first: POST `<rpc><show><queue><name>{queue}</name>…</rpc>` to the
 *   broker's SEMP v1 endpoint. Parses the XML response for `info/*` fields.
 *   `<execute-result code="ok"/>` with one `<queue>` entry → exists.
 *   No `<queue>` entry → not found.
 * - QueueBrowser fallback (no SEMP): bind a temporary browser, accumulate
 *   count+size from MESSAGE events until idle. Quota/max-size remain null.
 *
 * Honors `signal.aborted`: cancels in-flight fetch + disconnects any temp browser.
 */
export async function verifySource(input: {
    sempCtx: SempContext | null;
    primarySession: any;
    vpn: string;
    queue: string;
    signal: AbortSignal;
    onProgress?: VerifyProgress;
}): Promise<VerifyResult> {
    const path = input.sempCtx ? 'semp' : 'queue-browser';
    const result = emptyResult(path);
    logger.info(`[Verify] start — path=${path} queue="${input.queue}" vpn="${input.vpn || '*'}"`);

    if (input.signal.aborted) {
        result.errors.push('Verification cancelled.');
        logger.warn('[Verify] aborted before any work — signal already aborted');
        return result;
    }

    if (input.sempCtx) {
        const r = await verifyViaSempV1(input.sempCtx, input.vpn, input.queue, input.signal, result);
        logger.info(
            `[Verify] done (SEMP) — sourceOk=${r.sourceOk} count=${r.messageCount} ` +
            `oldest=${r.oldestMsgId ?? '(none)'} newest=${r.newestMsgId ?? '(none)'} ` +
            `accessType=${r.accessType ?? 'null'} errors=${r.errors.length}`,
        );
        return r;
    }
    const r = await verifyViaQueueBrowserAccumulate(
        input.primarySession, input.queue, input.signal, result, input.onProgress,
    );
    logger.info(
        `[Verify] done (QueueBrowser) — sourceOk=${r.sourceOk} count=${r.messageCount} ` +
        `oldest=${r.oldestMsgId ?? '(none)'} newest=${r.newestMsgId ?? '(none)'} ` +
        `accessType=${r.accessType ?? 'null'} errors=${r.errors.length}`,
    );
    return r;
}

/**
 * Two-call workaround for the SEMP v1 newest-msg-id bug.
 *
 * Call 1 — `show queue … detail`: pulls existence + count + size + quota +
 *   max-size + oldest-msg-id from the `<info>` block. `<info>/<newest-msg-id>`
 *   in this response is broken on the broker (soltr/10_25_0VMR returns 0)
 *   and is intentionally ignored — see the commented line in
 *   parseSempV1Response.
 * Call 2 — `show queue … messages newest count num-elements=1`: asks the
 *   broker for the single newest spooled message and parses its real ID from
 *   `spooled-messages/spooled-message/message-id`. Issued by
 *   fetchNewestMsgIdViaSempV1 below. Best-effort: a failure here leaves
 *   `newestMsgId` null but does NOT fail verification — the consumer
 *   (service-copy engine) handles null by treating the run as "no
 *   stop-at-newest boundary" and draining via the idle-timeout path instead.
 */
async function verifyViaSempV1(
    sempCtx: SempContext,
    vpn: string,
    queue: string,
    signal: AbortSignal,
    result: VerifyResult,
): Promise<VerifyResult> {
    // Use vpn-name="*" when the caller didn't pass one; the broker filters by
    // the requesting user's VPN scope. The detailed `<detail/>` flag pulls in
    // the `info/*` block we need for count/quota/max-size.
    const vpnFilter = vpn || '*';
    const body =
        `<rpc><show><queue><name>${escapeXml(queue)}</name>` +
        `<vpn-name>${escapeXml(vpnFilter)}</vpn-name>` +
        `<detail/></queue></show></rpc>`;

    logger.debug(`[Verify] SEMP detail RPC → /SEMP queue="${queue}" vpn="${vpnFilter}"`);
    try {
        const res = await sempCtx.fetch('/SEMP', {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body,
            signal,
        });
        if (signal.aborted) {
            result.errors.push('Verification cancelled.');
            return result;
        }
        if (!res.ok) {
            result.errors.push(`SEMP v1 returned ${res.status} ${res.statusText || ''}`.trim());
            return result;
        }
        const text = await res.text();
        parseSempV1Response(text, queue, vpn, result);
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            result.errors.push('Verification cancelled.');
        } else {
            result.errors.push(`SEMP error: ${err?.message ?? 'unknown'}`);
        }
        return result;
    }

    // Detail-call failure short-circuits the supplementary call. Not-found,
    // parse error, and non-ok execute-result all leave sourceOk=false; no
    // point asking the broker about a queue we couldn't confirm exists.
    if (!result.sourceOk) return result;

    // Respect cancellation between the two calls.
    if (signal.aborted) {
        result.errors.push('Verification cancelled.');
        result.sourceOk = false;
        return result;
    }

    // Supplementary call: workaround for the newest-msg-id=0 broker bug.
    // Best-effort — failures here log but don't fail verification.
    logger.debug('[Verify] SEMP supplementary newest-msg-id RPC');
    try {
        const newestId = await fetchNewestMsgIdViaSempV1(sempCtx, vpnFilter, queue, signal);
        result.newestMsgId = newestId;
        logger.debug(`[Verify] SEMP supplementary newest-msg-id → ${newestId ?? '(null)'}`);
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            result.errors.push('Verification cancelled.');
            result.sourceOk = false;
            return result;
        }
        logger.warn(`[Verify] SEMP supplementary newest-msg-id failed: ${err?.message ?? 'unknown'}`);
        result.errors.push(`SEMP newest-id lookup failed: ${err?.message ?? 'unknown'}`);
    }
    return result;
}

/**
 * Supplementary SEMP v1 RPC to recover the real newest-msg-id, since the
 * broker bug in `show queue … detail` returns 0 for `<info>/<newest-msg-id>`.
 *
 * Sends `<rpc><show><queue><name>…</name><vpn-name>…</vpn-name><messages/>
 * <newest/><count/><num-elements>1</num-elements></queue></show></rpc>` and
 * extracts the single spooled-message's `<message-id>` text. Returns null when:
 *   - the response isn't 200 OK,
 *   - the body is malformed XML,
 *   - the broker returned `execute-result code != "ok"`,
 *   - the queue is empty (no `<spooled-message>` in the response),
 *   - the message-id text is non-numeric (defensive).
 * Re-throws `AbortError` so the outer caller can classify cancellation.
 */
async function fetchNewestMsgIdViaSempV1(
    sempCtx: SempContext,
    vpnFilter: string,
    queue: string,
    signal: AbortSignal,
): Promise<string | null> {
    const body =
        `<rpc><show><queue><name>${escapeXml(queue)}</name>` +
        `<vpn-name>${escapeXml(vpnFilter)}</vpn-name>` +
        `<messages/><newest/><count/><num-elements>1</num-elements>` +
        `</queue></show></rpc>`;

    const res = await sempCtx.fetch('/SEMP', {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body,
        signal,
    });
    if (!res.ok) return null;

    const text = await res.text();
    let doc: XMLDocument;
    try {
        doc = new DOMParser().parseFromString(text, 'text/xml');
    } catch {
        return null;
    }
    if (doc.querySelector('parsererror')) return null;

    const execResult = doc.querySelector('rpc-reply > execute-result');
    if (execResult && execResult.getAttribute('code') !== 'ok') return null;

    const idText = doc.querySelector(
        'rpc-reply > rpc > show > queue > queues > queue > spooled-messages > spooled-message > message-id',
    )?.textContent?.trim();
    if (!idText) return null;
    // Defensive: the broker should only ever return a decimal; reject
    // non-numeric text rather than poison newestMsgId with garbage.
    if (!/^\d+$/.test(idText)) return null;
    return idText;
}

function readNumber(node: Element | null): number | null {
    if (!node) return null;
    const txt = node.textContent?.trim();
    if (!txt) return null;
    const n = Number(txt);
    return Number.isFinite(n) ? n : null;
}

/**
 * Parse a SEMP v1 `show queue` response XML into a VerifyResult. Public for
 * testability. Extracts:
 *   - info/message-vpn
 *   - info/num-messages-spooled
 *   - info/current-spool-usage-in-bytes
 *   - info/quota (MB → bytes)
 *   - info/max-message-size (bytes)
 *
 * If no `<queue>` entry sits under `<queues>`, returns sourceOk=false with a
 * "not found" error. Returns sourceOk=true otherwise (even if individual
 * fields are missing) so the modal can still render what it has.
 */
export function parseSempV1Response(
    xml: string,
    queueName: string,
    requestedVpn: string,
    result: VerifyResult,
): VerifyResult {
    let doc: XMLDocument;
    try {
        doc = new DOMParser().parseFromString(xml, 'text/xml');
    } catch (e: any) {
        result.errors.push(`SEMP v1 parse error: ${e?.message ?? 'unknown'}`);
        return result;
    }

    // DOMParser embeds parser errors as `<parsererror>` nodes rather than throwing.
    if (doc.querySelector('parsererror')) {
        result.errors.push('SEMP v1 parse error: malformed XML response.');
        return result;
    }

    const execResult = doc.querySelector('rpc-reply > execute-result');
    if (execResult && execResult.getAttribute('code') !== 'ok') {
        const reason = execResult.getAttribute('reason') ?? execResult.getAttribute('code') ?? 'error';
        result.errors.push(`SEMP v1 execute failed: ${reason}`);
        return result;
    }

    // Walk into rpc-reply > rpc > show > queue > queues > queue
    const queueNode = doc.querySelector('rpc-reply > rpc > show > queue > queues > queue');
    if (!queueNode) {
        const where = requestedVpn ? `VPN "${requestedVpn}"` : 'any VPN';
        result.errors.push(`Source queue "${queueName}" not found in ${where}.`);
        return result;
    }
    const info = queueNode.querySelector('info');
    if (!info) {
        // Defensive: queue is present but the broker omitted the info block.
        result.sourceOk = true;
        return result;
    }

    result.sourceOk = true;
    result.messageVpn = info.querySelector('message-vpn')?.textContent?.trim() ?? null;
    result.messageCount = readNumber(info.querySelector('num-messages-spooled'));
    result.spoolUsageBytes = readNumber(info.querySelector('current-spool-usage-in-bytes'));
    const quotaMb = readNumber(info.querySelector('quota'));
    result.quotaBytes = quotaMb !== null ? quotaMb * MB_TO_BYTES : null;
    result.maxMessageSize = readNumber(info.querySelector('max-message-size'));
    result.oldestMsgId = info.querySelector('oldest-msg-id')?.textContent?.trim() ?? null;
    result.accessType = normalizeAccessType(info.querySelector('others-permission')?.textContent ?? null);
    // `<owner>` is the client username that created/owns the queue. Empty
    // string is a valid value (server-created queues with no explicit owner).
    // The modal compares this against the live client session username to
    // grant full access when the user is the owner.
    result.owner = info.querySelector('owner')?.textContent?.trim() ?? null;
    // BROKER BUG (soltr/10_25_0VMR): <info>/<newest-msg-id> returns 0 in
    // `show queue … detail`. Same bug surfaces as `highestMsgId` in SEMP v2.
    // The real value is captured via a supplementary `show queue … messages
    // newest count num-elements=1` RPC issued from verifyViaSempV1 →
    // fetchNewestMsgIdViaSempV1. Leaving the original parse line commented
    // for traceability if the broker ever fixes it.
    // result.newestMsgId = info.querySelector('newest-msg-id')?.textContent?.trim() ?? null;
    return result;
}

/**
 * QueueBrowser fallback: bind, wait for UP, then accumulate count+size from
 * MESSAGE events until the queue goes idle. Used when no SEMP context is
 * available.
 */
function verifyViaQueueBrowserAccumulate(
    session: any,
    queue: string,
    signal: AbortSignal,
    result: VerifyResult,
    onProgress: VerifyProgress | undefined,
): Promise<VerifyResult> {
    if (!session) {
        result.errors.push('No primary Solace session available for verification.');
        return Promise.resolve(result);
    }

    return new Promise<VerifyResult>((resolve) => {
        let settled = false;
        let bound = false;
        let count = 0;
        let sizeBytes = 0;
        // BigInt-as-string min/max tracking. Each MESSAGE event contributes one
        // ID; we keep only the running min and max — never an array of all
        // messages — so memory stays O(1) regardless of queue depth.
        let oldestId: string | null = null;
        let newestId: string | null = null;
        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        const props = new solace.QueueBrowserProperties();
        props.queueDescriptor = new solace.QueueDescriptor({ name: queue, type: solace.QueueType.QUEUE });
        const browser = session.createQueueBrowser(props);

        const cleanup = () => {
            try { browser.disconnect(); } catch { /* swallow — best-effort */ }
            signal.removeEventListener('abort', onAbort);
            clearTimeout(bindTimer);
            if (idleTimer !== null) clearTimeout(idleTimer);
        };

        const settle = (ok: boolean, err?: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            result.sourceOk = ok;
            if (ok) {
                result.messageCount = count;
                result.spoolUsageBytes = sizeBytes;
                result.oldestMsgId = oldestId;
                result.newestMsgId = newestId;
            }
            if (err) result.errors.push(err);
            resolve(result);
        };

        const resetIdleTimer = () => {
            if (idleTimer !== null) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => settle(true), ACCUMULATE_IDLE_MS);
        };

        browser.on(solace.QueueBrowserEventName.UP, () => {
            bound = true;
            // Capture access type from the SDK's `_messageConsumer._permissions`
            // the same way queue-browser does (see src/modules/queue-browser/ui-table.ts).
            // The bind has just completed, so the consumer object is populated.
            result.accessType = normalizeAccessType(browser._messageConsumer?._permissions);
            logger.info(
                `[Verify] QB-fallback UP for "${queue}" — accessType=${result.accessType ?? 'null'}`,
            );
            resetIdleTimer();
        });

        browser.on(solace.QueueBrowserEventName.CONNECT_FAILED_ERROR, (e: any) => {
            logger.error(`[Verify] QB-fallback CONNECT_FAILED for "${queue}": ${e?.infoStr ?? '(no info)'}`);
            settle(false, e?.infoStr ?? `Source queue "${queue}" not found or no read permission.`);
        });

        browser.on(solace.QueueBrowserEventName.DOWN_ERROR, (e: any) => {
            if (bound) {
                logger.info(`[Verify] QB-fallback DOWN after UP — settling with accumulated count=${count}`);
                settle(true);
            } else {
                logger.error(`[Verify] QB-fallback DOWN before UP: ${e?.infoStr ?? '(no info)'}`);
                settle(false, e?.infoStr ?? 'Browser bind failed.');
            }
        });

        browser.on(solace.QueueBrowserEventName.GM_DISABLED, () => { /* not a verification result */ });

        browser.on(solace.QueueBrowserEventName.MESSAGE, (msg: any) => {
            count++;
            const len = msg?.smfHeader?.messageLength;
            if (typeof len === 'number') sizeBytes += len;
            // Capture min/max guaranteed message IDs as strings — broker IDs
            // are 64-bit so we compare via BigInt to avoid Number precision
            // loss. Solace IDs are monotonic per VPN, so min == oldest and
            // max == newest in practice.
            const idStr = msgIdToString(msg);
            if (idStr !== null) {
                if (oldestId === null || compareMsgIds(idStr, oldestId) < 0) oldestId = idStr;
                if (newestId === null || compareMsgIds(idStr, newestId) > 0) newestId = idStr;
            }
            if (onProgress) onProgress(count, sizeBytes);
            resetIdleTimer();
        });

        const onAbort = () => settle(false, 'Verification cancelled.');
        signal.addEventListener('abort', onAbort);

        const bindTimer = setTimeout(() => {
            /* v8 ignore start -- the bound=true branch (skip the timeout
             * settle) is defensively unreachable: any UP_NOTICE arms the
             * idle timer (2s), which always fires before the 10s bind
             * timer; settle() then runs cleanup() and clears bindTimer.
             * The bind timer can only ever fire when bound is still false. */
            if (!bound) settle(false, `Verification timed out after ${BIND_PROBE_TIMEOUT_MS / 1000}s.`);
            /* v8 ignore stop */
        }, BIND_PROBE_TIMEOUT_MS);

        try {
            browser.connect();
        } catch (e: any) {
            settle(false, e?.message ?? 'Failed to start verification probe.');
        }
    });
}

/**
 * Extract a Solace message's guaranteed message ID as a decimal string. Solace
 * IDs are 64-bit so we keep them as strings (Number can't safely represent
 * values above 2^53). Used by both the verification min/max tracker and the
 * run-phase first-message check. Returns null when the message lacks a
 * guaranteed-delivery ID (non-persistent), which shouldn't happen on a queue
 * but is handled defensively.
 */
export function msgIdToString(msg: any): string | null {
    try {
        const id = msg?.getGuaranteedMessageId?.();
        if (id === null || id === undefined) return null;
        // SDK returns a `Long` instance with toString(); BigInt and plain
        // number both also stringify cleanly.
        return String(id);
    } catch {
        return null;
    }
}

/**
 * Compare two Solace guaranteed-message-ID strings. Returns negative/zero/
 * positive like `Array.sort` comparator. Uses BigInt so we don't lose
 * precision on 64-bit IDs.
 */
export function compareMsgIds(a: string, b: string): number {
    try {
        const ba = BigInt(a);
        const bb = BigInt(b);
        if (ba < bb) return -1;
        if (ba > bb) return 1;
        return 0;
    } catch {
        // Fall back to lexicographic when the IDs aren't numeric (shouldn't
        // happen with Solace, but keeps the helper total).
        return a < b ? -1 : a > b ? 1 : 0;
    }
}
