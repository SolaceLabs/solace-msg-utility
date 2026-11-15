/**
 * Two-factor sign-in in the demo (go-web-proxy/totp.go, the two-factor
 * pages): the setting's values and the one rule that turns them into a
 * requirement, the demo's mock codes, and the secrets and recovery codes.
 *
 * The codes are mock numbers, not TOTP: `mockCode(secret, step)` is the
 * FNV-1a 32-bit hash of the text `<secret>:<step>` modulo 1 000 000, with
 * the step turning every 30 seconds, and the Demo controls panel shows the
 * current one. A code is accepted for the step before, the step now and the
 * step after, and never for a step at or below the last one accepted for
 * the user (the gateway's replay rule). Everything else is the gateway's:
 * a secret is 20 random bytes in base32, a recovery code is 16 characters
 * from a 32-letter alphabet, stored as the SHA-256 of its normal form.
 *
 * Mock-only.
 */

/** login.twoFactor: off (the default), optional, admins, mandatory. */
export const TWO_FACTOR_MODES = ['off', 'optional', 'admins', 'mandatory'] as const;
export type TwoFactorMode = (typeof TWO_FACTOR_MODES)[number];

export const isTwoFactorMode = (s: string): s is TwoFactorMode => (TWO_FACTOR_MODES as readonly string[]).includes(s);

/** What a password sign-in must still pass: nothing, a code, or setting two-factor up first. */
export type TwoFactorNeed = 'none' | 'code' | 'enrol';

/** need(mode, isAdmin, enrolled): the one rule both gateways use. */
export function twoFactorNeed(mode: string, admin: boolean, enrolled: boolean): TwoFactorNeed {
    switch (mode) {
        case 'optional': return enrolled ? 'code' : 'none';
        case 'admins': return enrolled ? 'code' : admin ? 'enrol' : 'none';
        case 'mandatory': return enrolled ? 'code' : 'enrol';
        default: return 'none';
    }
}

// ----- mock codes ------------------------------------------------------------------------

export const STEP_MS = 30_000;

/** The step a time falls in. */
export const stepOf = (ms: number): number => Math.floor(ms / STEP_MS);

/** The demo's code for a secret and a step: six digits. */
export function mockCode(secret: string, step: number): string {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(`${secret}:${step}`)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return String(h % 1_000_000).padStart(6, '0');
}

/**
 * The step `code` is valid for at `nowMs` (the step before, now or after) and
 * above `last`, the last step accepted for this user; null when there is none.
 */
export function acceptedStep(secret: string, code: string, nowMs: number, last: number | undefined): number | null {
    const now = stepOf(nowMs);
    for (const step of [now - 1, now, now + 1]) {
        if (step > (last ?? 0) && mockCode(secret, step) === code) return step;
    }
    return null;
}

// ----- secrets and recovery codes --------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The shapes the store holds (store.go's load check): a secret of 32 base32 characters, a recovery hash of 64 lower-case hex. */
export const SECRET_RULE = /^[A-Z2-7]{32}$/;
export const HASH_RULE = /^[0-9a-f]{64}$/;

/** RFC 4648 base32, upper case, no padding; `bytes` is a whole number of 5-byte groups. */
export function base32(bytes: Uint8Array): string {
    let out = '';
    let acc = 0;
    let bits = 0;
    for (const b of bytes) {
        acc = (acc << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += BASE32[(acc >>> (bits - 5)) & 31];
            bits -= 5;
        }
        acc &= (1 << bits) - 1;
    }
    return out;
}

/** A new secret: 20 random bytes, 32 characters. */
export const newSecret = (): string => base32(crypto.getRandomValues(new Uint8Array(20)));

/** The secret as the enrol page shows it: groups of four characters, one space between. */
export const groupSecret = (secret: string): string => secret.replace(/(.{4})(?=.)/g, '$1 ');

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_COUNT = 10;

/** Ten recovery codes, each 16 characters of the alphabet shown as XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_COUNT }, () => {
        const chars = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => RECOVERY_ALPHABET[b & 31]).join('');
        return chars.replace(/(.{4})(?=.)/g, '$1-');
    });
}

/** The form a recovery code is hashed in: upper case, hyphens and spaces removed. */
export const normalizeRecovery = (code: string): string => code.toUpperCase().replace(/[-\s]/g, '');

// ----- SHA-256 ---------------------------------------------------------------------------

const PRIMES: number[] = [];
for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every(p => n % p !== 0)) PRIMES.push(n);
const frac32 = (x: number) => Math.floor((x - Math.floor(x)) * 2 ** 32);
const SHA_INIT = PRIMES.slice(0, 8).map(p => frac32(Math.sqrt(p)));
const SHA_K = PRIMES.map(p => frac32(Math.cbrt(p)));

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/**
 * SHA-256 of the UTF-8 text as lower-case hex, in step with `crypto.subtle`
 * but synchronous: the fake's sign-in is, and a recovery code is checked in it.
 */
export function sha256Hex(text: string): string {
    const bytes = new TextEncoder().encode(text);
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bytes.length / 2 ** 29));
    view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
    const h = [...SHA_INIT];
    const w = new Array<number>(64);
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, k] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            k = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, k].forEach((x, i) => { h[i] = (h[i] + x) | 0; });
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/** What the store keeps of a recovery code: the hash of its normal form. */
export const hashRecovery = (code: string): string => sha256Hex(normalizeRecovery(code));
