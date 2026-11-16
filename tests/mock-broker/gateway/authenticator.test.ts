// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    acceptedStep, base32, groupSecret, hashRecovery, isTwoFactorMode, mockCode, newRecoveryCodes, newSecret, normalizeRecovery,
    HASH_RULE, RECOVERY_COUNT, SECRET_RULE, sha256Hex, STEP_MS, stepOf, TWO_FACTOR_MODES, twoFactorNeed,
} from '../../../src/mock-broker/gateway/authenticator';
import { CONTRACT_DIR } from './helpers';

/**
 * The demo's two-factor primitives (src/mock-broker/gateway/authenticator.ts):
 * the one requirement rule both gateways share, the mock codes and the replay
 * window, and the secret and recovery-code formats the store holds.
 */
describe('mock-broker/gateway/authenticator -- the requirement rule', () => {
    // mode, admin, enrolled -> need (go-web-proxy/totp.go need).
    const TABLE: [string, boolean, boolean, string][] = [
        ['optional', true, true, 'code'], ['optional', true, false, 'none'], ['optional', false, true, 'code'], ['optional', false, false, 'none'],
        ['admins', true, true, 'code'], ['admins', true, false, 'enrol'], ['admins', false, true, 'code'], ['admins', false, false, 'none'],
        ['mandatory', true, true, 'code'], ['mandatory', true, false, 'enrol'], ['mandatory', false, true, 'code'], ['mandatory', false, false, 'enrol'],
    ];

    it.each(TABLE)('%s, administrator %s, enrolled %s: %s', (mode, admin, enrolled, need) => {
        expect(twoFactorNeed(mode, admin, enrolled)).toBe(need);
    });

    it('reads a value that is not a mode as nobody being asked, and knows exactly the three modes', () => {
        expect(twoFactorNeed('', true, true)).toBe('none');
        expect(TWO_FACTOR_MODES).toEqual(['optional', 'admins', 'mandatory']);
        expect(TWO_FACTOR_MODES.every(isTwoFactorMode)).toBe(true);
        expect(['', 'off', 'Optional', 'on', 'both'].some(isTwoFactorMode)).toBe(false);
    });
});

describe('mock-broker/gateway/authenticator -- the mock codes', () => {
    it('hashes "<secret>:<step>" with FNV-1a 32 modulo a million, zero-padded to six digits', () => {
        expect(mockCode('JBSWY3DPEHPK3PXP', 5)).toBe('521709');
        expect(mockCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 0)).toBe('883203');
        expect(mockCode('SECRETSECRETSECRETSECRETSECRET22', 50)).toBe('006132');
    });

    it('gives each secret and each step its own code', () => {
        const codes = new Set([0, 1, 2, 3].map(step => mockCode('JBSWY3DPEHPK3PXP', step)));
        expect(codes.size).toBe(4);
        expect(mockCode('JBSWY3DPEHPK3PXP', 5)).not.toBe(mockCode('JBSWY3DPEHPK3PXQ', 5));
    });

    it('turns the step every 30 seconds', () => {
        expect([stepOf(0), stepOf(STEP_MS - 1), stepOf(STEP_MS), stepOf(61_000)]).toEqual([0, 0, 1, 2]);
    });
});

describe('mock-broker/gateway/authenticator -- accepting a code', () => {
    const SECRET = 'JBSWY3DPEHPK3PXP';
    const at = (step: number) => step * STEP_MS + 1000;

    it('accepts the step before, the step now and the step after, and no other', () => {
        for (const d of [-1, 0, 1]) expect(acceptedStep(SECRET, mockCode(SECRET, 100 + d), at(100), undefined)).toBe(100 + d);
        for (const d of [-2, 2]) expect(acceptedStep(SECRET, mockCode(SECRET, 100 + d), at(100), undefined)).toBeNull();
    });

    it('refuses a code that is not the secret\'s', () => {
        expect(acceptedStep(SECRET, mockCode('JBSWY3DPEHPK3PXQ', 100), at(100), undefined)).toBeNull();
        expect(acceptedStep(SECRET, 'abcdef', at(100), undefined)).toBeNull();
    });

    it('refuses a step at or below the last one accepted, and takes a later one', () => {
        expect(acceptedStep(SECRET, mockCode(SECRET, 100), at(100), 100)).toBeNull();
        expect(acceptedStep(SECRET, mockCode(SECRET, 99), at(100), 100)).toBeNull();
        expect(acceptedStep(SECRET, mockCode(SECRET, 101), at(100), 100)).toBe(101);
    });
});

describe('mock-broker/gateway/authenticator -- secrets and recovery codes', () => {
    it('encodes base32 as RFC 4648 does, upper case with no padding (the shared vectors\' secret)', () => {
        const vectors = JSON.parse(readFileSync(path.join(CONTRACT_DIR, 'totp.json'), 'utf-8'));
        expect(base32(new TextEncoder().encode('12345678901234567890'))).toBe(vectors.secret);
        expect(base32(new Uint8Array(0))).toBe('');
    });

    it('makes a secret of 20 random bytes: 32 characters of the alphabet, never the same twice', () => {
        const a = newSecret();
        expect(a).toMatch(SECRET_RULE);
        expect(newSecret()).not.toBe(a);
    });

    it('shows a secret in groups of four, one space between, none at the end', () => {
        expect(groupSecret('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
        expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
        expect(groupSecret('ABCD')).toBe('ABCD');
    });

    it('makes ten distinct recovery codes of sixteen characters shown as XXXX-XXXX-XXXX-XXXX', () => {
        const codes = newRecoveryCodes();
        expect(codes).toHaveLength(RECOVERY_COUNT);
        expect(new Set(codes).size).toBe(RECOVERY_COUNT);
        for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/);
    });

    it('hashes a recovery code in its normal form: upper case, no hyphens or spaces', () => {
        expect(normalizeRecovery('abcd-2345 efgh-6789')).toBe('ABCD2345EFGH6789');
        const hash = hashRecovery('ABCD-2345-EFGH-6789');
        expect(hash).toBe('314d0391c297e5142ab14c76bf799f3c04a1e1a01deb862d0a3ba2b7def8f538');
        expect(hash).toMatch(HASH_RULE);
        expect(hashRecovery('abcd 2345 efgh 6789')).toBe(hash);
    });
});

describe('mock-broker/gateway/authenticator -- SHA-256', () => {
    // From the standard (empty, "abc") and a reference implementation, across the padding's block edges.
    it.each([
        ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
        ['x'.repeat(55), 'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072'],
        ['x'.repeat(56), '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e'],
        ['a'.repeat(100), '2816597888e4a0d3a36b82b83316ab32680eb8f00f8cd3b904d681246d285a0e'],
    ])('hashes %j', (text, hex) => {
        expect(sha256Hex(text)).toBe(hex);
    });
});
