import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    managedRequest, managedErrorMessage, reportManagedFailure, SIGNED_OUT_TOAST_MS, type ManagedError,
} from '../../../src/core/services/managed-api';
import { createEventBus } from '../../../src/core/event-bus';

const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../src/core/toast', () => toastMock);

/**
 * The gateway transport: every answer resolves (never rejects), errors carry
 * the gateway's code, and a 401 on an admin call signs the session out.
 */

const fetchMock = () => globalThis.fetch as any;

function respond(status: number, body?: unknown, badJson = false) {
    fetchMock().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            if (badJson || body === undefined) throw new SyntaxError('Unexpected token');
            return body;
        },
    });
}

afterEach(() => toastMock.showToast.mockReset());

describe('core/services/managed-api — managedRequest', () => {
    it('sends JSON bodies with a content type, same-origin credentials', async () => {
        respond(204);
        expect(await managedRequest('PUT', '/managed/users/bob', { admin: true })).toEqual({ ok: true, data: undefined });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users/bob', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin: true }),
        });
    });

    it('returns the parsed body of a 200', async () => {
        respond(200, { users: [] });
        expect(await managedRequest('GET', '/managed/users')).toEqual({ ok: true, data: { users: [] } });
    });

    it('turns a 200 it cannot parse into bad_response', async () => {
        respond(200, undefined, true);
        expect(await managedRequest('GET', '/managed/me')).toEqual({ ok: false, status: 200, code: 'bad_response' });
    });

    it("carries the gateway's code, field and reason", async () => {
        respond(422, { error: 'invalid', field: 'password', reason: 'Password must be 12 to 128 characters.' });
        expect(await managedRequest('PUT', '/managed/users/bob', {})).toEqual({
            ok: false, status: 422, code: 'invalid', field: 'password', reason: 'Password must be 12 to 128 characters.',
        });
    });

    it('falls back to http_<status> when the error body is not the gateway JSON', async () => {
        respond(502, undefined, true);
        expect(await managedRequest('GET', '/managed/me')).toEqual(expect.objectContaining({ ok: false, status: 502, code: 'http_502' }));
    });

    it('resolves a network failure as code network, status 0', async () => {
        fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await managedRequest('GET', '/managed/me')).toEqual({ ok: false, status: 0, code: 'network' });
    });
});

describe('core/services/managed-api — managedErrorMessage', () => {
    const err = (code: string, extra: Partial<ManagedError> = {}): ManagedError => ({ ok: false, status: 400, code, ...extra });

    it.each([
        ['unauthenticated', 'Your session has ended. Sign in again.'],
        ['password_change_required', 'You must change your password before you continue.'],
        ['forbidden', 'This needs an administrator.'],
        ['not_found', 'Not found. It may already have been removed.'],
        ['bad_request', 'The gateway rejected the request as malformed.'],
        ['too_large', 'The request is too large.'],
        ['last_admin', 'At least one administrator must remain.'],
        ['cross_origin', 'The gateway refused a cross-site request.'],
        ['rate_limited', 'Too many requests. Wait a minute and try again.'],
        ['would_lock_out', 'This change would lock this browser out of the gateway.'],
        ['config_changed_on_disk', 'config.yaml was edited on the gateway host since the gateway loaded it. Restart the gateway to load that edit, then make your change here.'],
        ['config_unreadable', 'The gateway cannot read its config.yaml. Its log has the cause.'],
        ['server_error', 'The gateway could not complete the request. Its log has the cause.'],
        ['network', 'The gateway could not be reached.'],
        ['bad_response', 'The gateway sent a response this page cannot read.'],
    ])('maps %s', (code, text) => {
        expect(managedErrorMessage(err(code))).toBe(text);
    });

    it("shows the gateway's own reason when it sends one, and a generic line without one", () => {
        expect(managedErrorMessage(err('invalid', { reason: 'Username must be 1 to 64 characters.' }))).toBe('Username must be 1 to 64 characters.');
        expect(managedErrorMessage(err('would_lock_out', { reason: 'This allow list would deny your own address (192.0.2.1).' })))
            .toBe('This allow list would deny your own address (192.0.2.1).');
        expect(managedErrorMessage(err('invalid', { status: 422 }))).toBe('Unexpected answer from the gateway (HTTP 422).');
        expect(managedErrorMessage(err('http_502', { status: 502 }))).toBe('Unexpected answer from the gateway (HTTP 502).');
    });
});

describe('core/services/managed-api — reportManagedFailure', () => {
    it('a 401 toasts and asks the session owner to sign out, instead of showing inline', () => {
        const bus = createEventBus();
        const signOut = vi.fn();
        bus.on('rbac:sign-out-requested', signOut);
        const show = vi.fn();
        reportManagedFailure({ ok: false, status: 401, code: 'unauthenticated' }, bus, show);
        expect(toastMock.showToast).toHaveBeenCalledWith('Your session has ended. Sign in again.', 'error', SIGNED_OUT_TOAST_MS);
        expect(signOut).toHaveBeenCalledTimes(1);
        expect(show).not.toHaveBeenCalled();
    });

    it('anything else goes to the caller', () => {
        const bus = createEventBus();
        const signOut = vi.fn();
        bus.on('rbac:sign-out-requested', signOut);
        const show = vi.fn();
        reportManagedFailure({ ok: false, status: 409, code: 'last_admin' }, bus, show);
        expect(show).toHaveBeenCalledWith('At least one administrator must remain.');
        expect(signOut).not.toHaveBeenCalled();
    });
});
