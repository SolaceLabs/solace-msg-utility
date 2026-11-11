import { describe, it, expect } from 'vitest';
import { sempErrorText, sempFailureText } from '../../../src/core/services/semp-errors';
import { managedErrorMessage } from '../../../src/core/services/managed-api';
import { REQUEST_TIMEOUT_MS } from '../../../src/core/timing';

/**
 * One text for a SEMP answer at every call site (the connect probe, discovery,
 * the subscription explorer, queue-copy's verify). The probe's relay texts are
 * covered through the client in tests/core/services/semp-client.test.ts >
 * "a %i %s refusal reports the gateway code as text".
 */
const res = (init: { status: number; statusText: string; json: () => Promise<unknown> }) => ({ ok: false, ...init }) as unknown as Response;

describe('core/services/semp-errors -- sempErrorText', () => {
    it.each([
        [403, 'read_only'],
        [502, 'upstream_unavailable'],
    ])("a relay %i %s reads as the gateway code's sentence", async (status, code) => {
        const answer = res({ status, statusText: '', json: async () => ({ error: code }) });
        expect(await sempErrorText(answer, 'Error fetching VPNs')).toBe(managedErrorMessage({ ok: false, status, code }));
    });

    it("a broker's answer reads as the fallback with the status line", async () => {
        const answer = res({ status: 403, statusText: 'Forbidden', json: async () => ({ meta: { error: {} } }) });
        expect(await sempErrorText(answer, 'Error fetching VPNs')).toBe('Error fetching VPNs (HTTP 403 Forbidden)');
    });

    it('reads well over HTTP/2 (no status text) and with a body that is not JSON', async () => {
        const answer = res({ status: 500, statusText: '', json: async () => { throw new SyntaxError('html'); } });
        expect(await sempErrorText(answer, 'Error fetching Queues')).toBe('Error fetching Queues (HTTP 500)');
    });
});

describe('core/services/semp-errors -- sempFailureText', () => {
    it('names the deadline for a timed-out request', () => {
        expect(sempFailureText(new DOMException('The operation timed out.', 'TimeoutError'), 'Error fetching VPNs'))
            .toBe(`Error fetching VPNs: no answer within ${REQUEST_TIMEOUT_MS / 1000} s.`);
    });

    it("uses the thrown error's message, or the fallback when it carries none", () => {
        expect(sempFailureText(new TypeError('Failed to fetch'), 'fallback')).toBe('Failed to fetch');
        expect(sempFailureText(new Error(''), 'fallback')).toBe('fallback');
        expect(sempFailureText({ message: 42 }, 'fallback')).toBe('fallback');
        expect(sempFailureText(undefined, 'fallback')).toBe('fallback');
    });
});
