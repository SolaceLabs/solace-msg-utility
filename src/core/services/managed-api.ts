/**
 * Managed API transport — same-origin JSON calls to the gateway's `/managed/*`
 * endpoints (go-web-proxy/managed.go).
 *
 * Authentication is the gateway's session cookie: `HttpOnly`, so script never
 * sees it, and sent by the browser on every same-origin request. Sign-in and
 * password changes happen on the gateway's own pages (`/login`,
 * `/login/password`), which the UI reaches by plain links.
 *
 * Every call resolves — it never rejects. A non-2xx answer carries the
 * gateway's `{ error, field?, reason? }` code; `managedErrorMessage` turns it
 * into text for the user. Lives in core because the Managed panel and the
 * three admin modules all talk to the gateway through it.
 */
import { showToast } from '../toast';
import type { EventBus } from '../types';

/** A failed call: the HTTP status (0 when the gateway was unreachable) and its code. */
export interface ManagedError {
    ok: false;
    status: number;
    /** The gateway's code, or `network` / `bad_response` from this client. */
    code: string;
    /** For `invalid`: which field, and a reason fit to show the admin. */
    field?: string;
    reason?: string;
}

export type ManagedResult<T> = { ok: true; data: T } | ManagedError;

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE';

export async function managedRequest<T = void>(method: Method, path: string, body?: unknown): Promise<ManagedResult<T>> {
    let res: Response;
    try {
        res = await fetch(path, {
            method,
            credentials: 'same-origin',
            ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
    } catch {
        return { ok: false, status: 0, code: 'network' };
    }
    if (res.ok) {
        if (res.status === 204) return { ok: true, data: undefined as T };
        try {
            return { ok: true, data: (await res.json()) as T };
        } catch {
            return { ok: false, status: res.status, code: 'bad_response' };
        }
    }
    let err: { error?: string; field?: string; reason?: string } = {};
    try {
        err = await res.json();
    } catch {
        // Not the gateway's JSON (e.g. a reverse proxy's error page): the
        // status alone decides the message.
    }
    return { ok: false, status: res.status, code: err.error ?? `http_${res.status}`, field: err.field, reason: err.reason };
}

const MESSAGES: Record<string, string> = {
    unauthenticated: 'Your session has ended. Sign in again.',
    password_change_required: 'You must change your password before you continue.',
    forbidden: 'This needs an administrator.',
    not_found: 'Not found. It may already have been removed.',
    bad_request: 'The gateway rejected the request as malformed.',
    too_large: 'The request is too large.',
    last_admin: 'At least one administrator must remain.',
    cross_origin: 'The gateway refused a cross-site request.',
    rate_limited: 'Too many requests. Wait a minute and try again.',
    would_lock_out: 'This change would lock this browser out of the gateway.',
    config_changed_on_disk: 'config.yaml was edited on the gateway host since the gateway loaded it. Restart the gateway to load that edit, then make your change here.',
    config_unreadable: 'The gateway cannot read its config.yaml. Its log has the cause.',
    backup_unavailable: 'The gateway could not write the backup. Its log has the cause.',
    server_error: 'The gateway could not complete the request. Its log has the cause.',
    read_only: 'The gateway relays SEMP reads only; this request would change the broker.',
    upstream_auth: 'The broker refused the credential the gateway holds for it. Ask an administrator to check the connection.',
    upstream_unavailable: 'The gateway could not reach the broker, or the broker gave an answer it cannot pass on. Its log has the cause.',
    network: 'The gateway could not be reached.',
    bad_response: 'The gateway sent a response this page cannot read.',
};

/**
 * Every code with a stock message: the gateway's error codes plus `network`
 * and `bad_response`, which managedRequest makes itself.
 * tests/mock-broker/gateway/error-codes.test.ts holds the managed demo to
 * this list: each code is sent by the fake gateway or named as one it does
 * not simulate.
 */
export const MANAGED_ERROR_CODES: readonly string[] = Object.keys(MESSAGES);

/**
 * Text for a failed call. A reason from the gateway (sent with `invalid` and
 * `would_lock_out`, always fit to show an admin) wins over the stock line.
 */
export function managedErrorMessage(err: ManagedError): string {
    if (err.reason) return err.reason;
    return MESSAGES[err.code] ?? `Unexpected answer from the gateway (HTTP ${err.status}).`;
}

/** Sign-out toasts carry an instruction and the view changes underneath them,
 *  so they stay up longer than the default. */
export const SIGNED_OUT_TOAST_MS = 5000;

/**
 * Report a failed admin call. A 401 means the gateway ended the session: the
 * message goes to a toast (the view is about to change) and the session owner
 * is asked to sign out. Any other failure goes to `show`.
 */
export function reportManagedFailure(err: ManagedError, eventBus: EventBus, show: (message: string) => void): void {
    if (err.code === 'unauthenticated') {
        showToast(managedErrorMessage(err), 'error', SIGNED_OUT_TOAST_MS);
        eventBus.emit('rbac:sign-out-requested');
        return;
    }
    show(managedErrorMessage(err));
}
