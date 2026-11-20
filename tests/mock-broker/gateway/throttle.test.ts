// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createConnectWindow, createRequestBudget, createThrottle, type LoginLimits } from '../../../src/mock-broker/gateway/throttle';
import { CONTRACT_DIR } from './helpers';

/**
 * The sign-in throttle against go-web-proxy/throttle.go's rules, as the shared
 * vectors in go-web-proxy/testdata/contract/throttle.json state them (the Go
 * side runs the same file: go-web-proxy/throttle_test.go >
 * "TestThrottle_SharedVectors"): a count per user and one for the client, the
 * larger block wins, a success clears only the signing-in user, and a quiet
 * count starts again (the account limit, the client limit and the reset time
 * each have their own). `login.perClient` is held below. tests/mock-broker/gateway/pages.test.ts
 * covers the message and the countdown on the sign-in page. Below them, the
 * request budget (allowUnauthenticated in throttle.go) and the connect window
 * (rateWindow in dial.go), whose 429s the gateway contract pins.
 */
interface VectorStep { fail?: string; times?: number; succeed?: string; advance?: number; wait?: string; want?: number }
const VECTORS: { limits: Omit<LoginLimits, 'perClient'>; cases: { name: string; steps: VectorStep[] }[] } =
    JSON.parse(readFileSync(path.join(CONTRACT_DIR, 'throttle.json'), 'utf-8'));
/** The vectors run with one client, counted: login.perClient is on, as it is in the gateway's default. */
const LIMITS: LoginLimits = { perClient: true, ...VECTORS.limits };
let t: number;
let th: ReturnType<typeof createThrottle>;

beforeEach(() => {
    t = Date.parse('2026-11-05T10:00:00Z');
    th = createThrottle(() => LIMITS, () => t);
});

const fail = (user: string, n: number) => { for (let i = 0; i < n; i++) th.failed(user); };

describe('mock-broker/gateway/throttle -- the shared vectors', () => {
    it('reads go-web-proxy/testdata/contract/throttle.json', () => {
        expect(VECTORS.cases.length).toBeGreaterThan(0);
    });

    for (const c of VECTORS.cases) {
        it(c.name, () => {
            for (const [i, s] of c.steps.entries()) {
                if (s.fail !== undefined) fail(s.fail, s.times ?? 1);
                else if (s.succeed !== undefined) th.succeeded(s.succeed);
                else if (s.advance !== undefined) t += s.advance * 1000;
                else if (s.wait !== undefined) expect({ step: i + 1, wait: th.wait(s.wait) }).toEqual({ step: i + 1, wait: (s.want ?? 0) * 1000 });
                else throw new Error(`${c.name}, step ${i + 1}: no step key it knows (${Object.keys(s).join(', ')})`);
            }
        });
    }
});

describe('mock-broker/gateway/throttle -- login.perClient', () => {
    let limits: LoginLimits;
    let own: ReturnType<typeof createThrottle>;
    const failAs = (names: string[]) => names.forEach(n => own.failed(n));
    beforeEach(() => {
        limits = { ...LIMITS };
        own = createThrottle(() => limits, () => t);
    });

    it('counts per account only when login.perClient is off, and leaves the client untouched', () => {
        limits.perClient = false;
        failAs(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
        expect(own.wait('someone-else')).toBe(0);
        failAs(['x', 'x', 'x', 'x', 'x']);
        expect(own.wait('x')).toBe(30_000);
        expect(own.wait('someone-else')).toBe(0);
        limits.perClient = true;
        expect(own.wait('someone-else')).toBe(0);
    });
});

describe('mock-broker/gateway/throttle', () => {
    it('carries every count through dump and load, and clears them all on the panel\'s button', () => {
        fail('viewer', 5);
        const other = createThrottle(() => LIMITS, () => t);
        other.load(th.dump());
        expect(other.wait('viewer')).toBe(30_000);
        other.clear();
        expect(other.wait('viewer')).toBe(0);
    });
});

describe('mock-broker/gateway/throttle -- the request budget', () => {
    let perMinute: number;
    let budget: ReturnType<typeof createRequestBudget>;
    beforeEach(() => {
        perMinute = 60;
        budget = createRequestBudget(() => perMinute, () => t);
    });

    it('starts full, waits for the next token once empty, and refills evenly up to the limit', () => {
        for (let i = 0; i < 60; i++) expect(budget.take()).toBe(0);
        expect(budget.take()).toBe(1000);
        t += 500;
        expect(budget.take()).toBe(500);
        t += 500;
        expect(budget.take()).toBe(0);
        t += 10 * 60_000;
        for (let i = 0; i < 60; i++) expect(budget.take()).toBe(0);
        expect(budget.take()).toBe(1000);
    });

    it('reads the limit at each request, so a lower one caps the bucket at once', () => {
        expect(budget.take()).toBe(0);
        perMinute = 1;
        expect(budget.take()).toBe(0);
        expect(budget.take()).toBe(60_000);
    });
});

describe('mock-broker/gateway/throttle -- the connect window', () => {
    let perMinute: number;
    let connects: ReturnType<typeof createConnectWindow>;
    beforeEach(() => {
        perMinute = 2;
        connects = createConnectWindow(() => perMinute, () => t);
    });

    it('counts each user on their own, and refuses past the limit until a minute after their first connect', () => {
        expect(connects.take('viewer')).toBe(0);
        t += 10_000;
        expect(connects.take('viewer')).toBe(0);
        expect(connects.take('viewer')).toBe(50_000);
        expect(connects.take('operator')).toBe(0);
        t += 50_000;
        expect(connects.take('viewer')).toBe(0);
        expect(connects.take('viewer')).toBe(0);
        expect(connects.take('viewer')).toBe(60_000);
    });

    it('reads the limit at each connect, so a raised one applies at once', () => {
        connects.take('viewer');
        connects.take('viewer');
        expect(connects.take('viewer')).toBe(60_000);
        perMinute = 3;
        expect(connects.take('viewer')).toBe(0);
        expect(connects.take('viewer')).toBe(60_000);
    });
});
