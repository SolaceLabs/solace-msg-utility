import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createThrottle, type LoginLimits } from '../../../src/mock-broker/gateway/throttle';
import { CONTRACT_DIR } from './helpers';

/**
 * The sign-in throttle against go-web-proxy/throttle.go's rules, as the shared
 * vectors in go-web-proxy/testdata/contract/throttle.json state them (the Go
 * side runs the same file: go-web-proxy/throttle_test.go ›
 * "TestThrottle_SharedVectors"): a count per user and one for the client, the
 * larger block wins, a success clears only the signing-in user and the
 * client, and a quiet count starts again. tests/mock-broker/gateway/pages.test.ts
 * covers the message and the countdown on the sign-in page.
 */
interface VectorStep { fail?: string; times?: number; succeed?: string; advance?: number; wait?: string; want?: number }
const VECTORS: { limits: LoginLimits; cases: { name: string; steps: VectorStep[] }[] } =
    JSON.parse(readFileSync(path.join(CONTRACT_DIR, 'throttle.json'), 'utf-8'));
const LIMITS = VECTORS.limits;
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
                else expect({ step: i + 1, wait: th.wait(s.wait!) }).toEqual({ step: i + 1, wait: (s.want ?? 0) * 1000 });
            }
        });
    }
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
