// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    managedRequest, managedErrorMessage, MANAGED_ERROR_CODES, reportManagedFailure, SIGNED_OUT_TOAST_MS, type ManagedError,
} from '../../../src/core/services/managed-api';
import { createEventBus } from '../../../src/core/event-bus';
import { REQUEST_TIMEOUT_MS } from '../../../src/core/timing';

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

    it('carries the current rev of a stale save (a number, or text for the settings)', async () => {
        respond(409, { error: 'stale', rev: 7 });
        expect(await managedRequest('PUT', '/managed/users/bob', {})).toEqual({ ok: false, status: 409, code: 'stale', rev: 7 });
        respond(409, { error: 'stale', rev: 'abc_-9' });
        expect(await managedRequest('PUT', '/managed/settings', {})).toEqual({ ok: false, status: 409, code: 'stale', rev: 'abc_-9' });
    });

    it('carries the current basis of a stale import untouched', async () => {
        const basis = { users: 4, connections: 2, settings: 'xyz' };
        respond(409, { error: 'stale', basis });
        expect(await managedRequest('POST', '/managed/backup/import', {})).toEqual({ ok: false, status: 409, code: 'stale', basis });
    });

    it('falls back to http_<status> when the error body is not the gateway JSON', async () => {
        respond(502, undefined, true);
        expect(await managedRequest('GET', '/managed/me')).toEqual(expect.objectContaining({ ok: false, status: 502, code: 'http_502' }));
    });

    it('resolves a network failure as code network, status 0, and logs the call it lost', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const cause = new TypeError('Failed to fetch');
        fetchMock().mockRejectedValue(cause);
        expect(await managedRequest('GET', '/managed/me')).toEqual({ ok: false, status: 0, code: 'network' });
        expect(warn).toHaveBeenCalledWith('[managed-api] GET /managed/me could not reach the gateway:', cause);
    });

    it('resolves as code timeout, not network, when the gateway does not answer within REQUEST_TIMEOUT_MS: a write may still land', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.useFakeTimers();
        fetchMock().mockImplementation(() => new Promise(() => { }));
        const pending = managedRequest('PUT', '/managed/users/alice', { rev: 1 });
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
        expect(await pending).toEqual({ ok: false, status: 0, code: 'timeout' });
        expect(warn).toHaveBeenCalledWith(
            `[managed-api] PUT /managed/users/alice got no answer from the gateway within ${REQUEST_TIMEOUT_MS / 1000} s; a change may still be applied:`,
            expect.objectContaining({ name: 'TimeoutError' }));
    });
});

describe('core/services/managed-api -- managedRequest body deadline', () => {
    it('headers arrive, body never does -> resolves as code timeout after REQUEST_TIMEOUT_MS', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.useFakeTimers();
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => { }) });
        const pending = managedRequest('GET', '/managed/me');
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
        expect(await pending).toEqual({ ok: false, status: 0, code: 'timeout' });
    });

    it('an error answer whose body never arrives also resolves as code timeout', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.useFakeTimers();
        fetchMock().mockResolvedValue({ ok: false, status: 500, json: () => new Promise(() => { }) });
        const pending = managedRequest('GET', '/managed/me');
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
        expect(await pending).toEqual({ ok: false, status: 0, code: 'timeout' });
    });
});

describe('core/services/managed-api — managedErrorMessage', () => {
    const err = (code: string, extra: Partial<ManagedError> = {}): ManagedError => ({ ok: false, status: 400, code, ...extra });

    const FALLBACK = 'Unexpected answer from the gateway (HTTP 400).';

    it.each(MANAGED_ERROR_CODES)('maps %s to its own non-empty message', (code) => {
        const text = managedErrorMessage(err(code));
        expect(text).not.toBe('');
        expect(text).not.toBe(FALLBACK);
    });

    it('gives each code its own message', () => {
        const texts = MANAGED_ERROR_CODES.map((code) => managedErrorMessage(err(code)));
        expect(new Set(texts).size).toBe(texts.length);
    });

    it.each([
        ['unauthenticated', 'Your session has ended. Sign in again.'],
        ['forbidden', 'This needs an administrator.'],
        ['network', 'The gateway could not be reached.'],
    ])('words %s as a user would read it', (code, text) => {
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
