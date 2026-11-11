/**
 * Error text for SEMP answers, one way at every call site (the SEMP client's
 * connect probe, discovery, the subscription explorer, queue-copy's verify).
 * The relay's refusals carry the gateway's error code in a JSON body, which
 * is turned into the gateway's own sentence (`managedErrorMessage`); a
 * broker's answer is described by its HTTP status. Over HTTP/2 a response has
 * no status text, so every text reads well with the status alone.
 *
 * Kept apart from `semp-client.ts` (which re-exports the two public helpers)
 * so a caller of these texts does not load the SEMP client factory.
 */
import { managedErrorMessage } from './managed-api';
import { isTimeoutError, REQUEST_TIMEOUT_MS } from '../timing';

/**
 * The gateway's error code in a refused response's body (`{ "error": "read_only" }`),
 * or `null` when the body is not the gateway's JSON (a broker's own answer, a
 * reverse proxy's error page). Reads the body.
 */
async function gatewayCode(res: Response): Promise<string | null> {
    try {
        const code: unknown = (await res.json()).error;
        return typeof code === 'string' ? code : null;
    } catch {
        return null;
    }
}

/** `500 Internal Server Error`, or `500` alone over HTTP/2, which carries no status text. */
export function statusLine(res: Response): string {
    return res.statusText ? `${res.status} ${res.statusText}` : `${res.status}`;
}

/**
 * The text for a refused relay request: the gateway's code (`read_only`,
 * `upstream_auth`, `upstream_unavailable`, ...) as a sentence, or the bare
 * status when the body is not the gateway's JSON.
 */
export async function relayErrorText(res: Response): Promise<string> {
    const code = await gatewayCode(res);
    return code ? managedErrorMessage({ ok: false, status: res.status, code }) : statusLine(res);
}

/**
 * The text to show for a non-OK SEMP response, the same way at every call site
 * (discovery, the subscription explorer, queue-copy's verify): the gateway's
 * error code as a sentence when the relay refused the request, otherwise
 * `fallback` with the HTTP status (`Error fetching VPNs (HTTP 403 Forbidden)`,
 * or `(HTTP 403)` over HTTP/2). Async because the code is in the body, which
 * it reads.
 */
export async function sempErrorText(res: Response, fallback: string): Promise<string> {
    const code = await gatewayCode(res);
    return code
        ? managedErrorMessage({ ok: false, status: res.status, code })
        : `${fallback} (HTTP ${statusLine(res)})`;
}

/**
 * The text to show for a SEMP request that threw instead of answering, beside
 * `sempErrorText`: a timed-out request names the deadline, anything else its
 * own message, and `fallback` when it carries none.
 */
export function sempFailureText(e: unknown, fallback: string): string {
    if (isTimeoutError(e)) return `${fallback}: no answer within ${REQUEST_TIMEOUT_MS / 1000} s.`;
    const message: unknown = Object(e).message;
    return typeof message === 'string' && message ? message : fallback;
}
