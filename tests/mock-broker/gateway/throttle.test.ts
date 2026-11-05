import { describe, it, expect, beforeEach } from 'vitest';
import { createThrottle } from '../../../src/mock-broker/gateway/throttle';

/**
 * The sign-in throttle against go-web-proxy/throttle.go's rules: a count per
 * user and one for the client, the larger block wins, a success clears only
 * the signing-in user and the client, and a quiet count starts again.
 * tests/mock-broker/gateway/pages.test.ts covers the message and the
 * countdown on the sign-in page.
 */
const LIMITS = { maxFailures: 5, backoffSeconds: 30, maxBackoffSeconds: 900 };
let t: number;
let th: ReturnType<typeof createThrottle>;

beforeEach(() => {
    t = Date.parse('2026-11-05T10:00:00Z');
    th = createThrottle(() => LIMITS, () => t);
});

const fail = (user: string, n: number) => { for (let i = 0; i < n; i++) th.failed(user); };

describe('mock-broker/gateway/throttle', () => {
    it('keeps another user\'s failures across a success', () => {
        fail('viewer', 4);
        th.succeeded('admin');
        fail('viewer', 1);
        expect([th.wait('viewer'), th.wait('admin')]).toEqual([30_000, 0]);
    });

    it('blocks every name once the client reaches the limit', () => {
        ['a', 'b', 'c', 'd', 'e'].forEach(u => fail(u, 1));
        expect(th.wait('someone-else')).toBe(30_000);
    });

    it('doubles each failure past the limit, up to the longest back-off', () => {
        fail('admin', 6);
        expect(th.wait('admin')).toBe(60_000);
        fail('admin', 10);
        expect(th.wait('admin')).toBe(900_000);
    });

    it('starts a count again after a quiet spell longer than the longest back-off', () => {
        fail('viewer', 4);
        t += 901_000;
        fail('viewer', 1);
        expect(th.wait('viewer')).toBe(0);
    });

    it('counts the first 64 bytes of a name, as the gateway keys it', () => {
        const long = 'x'.repeat(64);
        fail(`${long}-one`, 5);
        th.succeeded('somebody');   // clears the client count, not the user's
        expect(th.wait(`${long}-two`)).toBe(30_000);
    });

    it('carries every count through dump and load, and clears them all on the panel\'s button', () => {
        fail('viewer', 5);
        const other = createThrottle(() => LIMITS, () => t);
        other.load(th.dump());
        expect(other.wait('viewer')).toBe(30_000);
        other.clear();
        expect(other.wait('viewer')).toBe(0);
    });
});
