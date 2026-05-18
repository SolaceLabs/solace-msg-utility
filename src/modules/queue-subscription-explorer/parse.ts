/**
 * Pure SEMP v1 response parser for `<show><queue><subscriptions/>` RPCs.
 * Split from `service.ts` so the XML logic can be unit-tested without mocking
 * fetch — same pattern as `parseSempV1Response` in queue-copy/service-verify.
 */

export type SubscriptionRow = { vpn: string; queue: string; topic: string };

export interface ParsedSubPage {
    rows: SubscriptionRow[];
    /**
     * The next-page request body to POST, or null when the broker has no more
     * pages. The body is the **inner** content of `<more-cookie>` — i.e. the
     * `<rpc>…</rpc>` element that the broker echoed back as a continuation
     * cursor. Callers POST it verbatim as the next page request.
     */
    nextPageBody: string | null;
}

/**
 * Result envelope. `ok: false` carries the error message that should surface
 * in the UI; `ok: true` carries the parsed page including its next-page body.
 */
export type ParseResult =
    | { ok: true; page: ParsedSubPage }
    | { ok: false; error: string };

/**
 * Parse a SEMP v1 response that lists queues with their topic subscriptions.
 * Yields one row per (queue, topic) pair. Queues with no `<subscription>`
 * children are intentionally omitted — the user opted to drop them at plan
 * time so they don't pollute the subscription view.
 *
 * Defensive about broker quirks:
 *  - `<execute-result>` with a non-`ok` code → returns the broker's reason.
 *  - DOMParser embeds errors as `<parsererror>` rather than throwing.
 *  - Queues missing `<info>` or `<message-vpn>` are skipped (vpn would be
 *    blank — pointless to surface).
 */
export function parseSubscriptionsResponse(xml: string): ParseResult {
    /* v8 ignore start -- DOMParser does not throw in browsers or jsdom; it
     * embeds parser errors as `<parsererror>` nodes which we check below.
     * This try/catch is defensive against engine quirks and is exercised
     * only in the (unreachable) failure path. */
    let doc: XMLDocument;
    try {
        doc = new DOMParser().parseFromString(xml, 'text/xml');
    } catch (e: any) {
        return { ok: false, error: `SEMP v1 parse error: ${e?.message ?? 'unknown'}` };
    }
    /* v8 ignore stop */
    if (doc.querySelector('parsererror')) {
        return { ok: false, error: 'SEMP v1 parse error: malformed XML response.' };
    }

    const execResult = doc.querySelector('rpc-reply > execute-result');
    if (execResult && execResult.getAttribute('code') !== 'ok') {
        const reason = execResult.getAttribute('reason') ?? execResult.getAttribute('code') ?? 'error';
        return { ok: false, error: `SEMP v1 execute failed: ${reason}` };
    }

    const rows: SubscriptionRow[] = [];
    const queues = doc.querySelectorAll('rpc-reply > rpc > show > queue > queues > queue');
    queues.forEach(qNode => {
        const vpn = qNode.querySelector(':scope > info > message-vpn')?.textContent?.trim();
        const name = qNode.querySelector(':scope > name')?.textContent?.trim();
        if (!vpn || !name) return;
        const subs = qNode.querySelectorAll(':scope > subscriptions > subscription > topic');
        subs.forEach(t => {
            const topic = t.textContent?.trim();
            if (topic) rows.push({ vpn, queue: name, topic });
        });
    });

    return { ok: true, page: { rows, nextPageBody: extractMoreCookieBody(doc) } };
}

/**
 * Extract the next-page request body from a `<more-cookie>` block. The broker
 * echoes back the exact `<rpc>…</rpc>` element callers should POST for the
 * follow-up page. Returns null when there's no more-cookie (last page).
 *
 * Uses XMLSerializer rather than `.innerHTML` because innerHTML on XML nodes
 * is not portable across browser engines (jsdom included).
 */
function extractMoreCookieBody(doc: XMLDocument): string | null {
    const cookieRpc = doc.querySelector('rpc-reply > more-cookie > rpc');
    if (!cookieRpc) return null;
    return new XMLSerializer().serializeToString(cookieRpc);
}
