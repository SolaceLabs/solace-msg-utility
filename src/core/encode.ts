/**
 * Value transform for the managed variant. Two operations, deliberately
 * neutrally named (no `encrypt`/`decrypt`/`password`/`cipher`/`crypto` in the
 * public surface):
 *
 *   - `stamp(username, value)`      — one-way, deterministic, username-salted.
 *                                     Used for the login `token` (proxy only
 *                                     string-matches it; never computes it).
 *   - `pack(value, seed)` / `unpack(blob, seed)`
 *                                   — reversible, over a NON-extractable
 *                                     WebCrypto key. Used for connection creds.
 *
 * Every output carries a neutral version tag (`S1:` / `V1:`) so the algorithm
 * is swappable later behind this stable interface. `stamp` is one-way, so a
 * version change is migrated by having the client send all supported versions
 * on login (the proxy matches any and upgrades the stored value). `pack`/`unpack`
 * are reversible, so a version/seed change is migrated by unpack-old → pack-new.
 *
 * This module is imported ONLY by the managed modules, so it is absent from the
 * standard / min / mock bundles (manifest-driven registry).
 *
 * Honest posture: this is obfuscation, not confidentiality — the transform and
 * (for `pack`/`unpack`) the seed reach the client by necessity. See the plan's
 * threat model. Algorithm steps are intentionally not documented elsewhere.
 */

/* ---- shared helpers -------------------------------------------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

/* ---- stamp: one-way, deterministic, username-salted ------------------ */

// Fixed anchor folded into the mix. Neutral name; not a secret (it ships in
// the managed bundle). Its only job is to make the digest app-specific.
const ANCHOR = 'SolMsgUtil/managed/1';

// Crockford base32 (no I/L/O/U) — produces an unrecognizable text string.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function fin(x: number): number {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) | 0;
    return (x ^ (x >>> 16)) | 0;
}

function rotl(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) | 0;
}

function b32(words: number[]): string {
    // 4 words → 16 bytes (128 bits) → exactly 26 base32 chars (last char uses
    // the final 3 bits + 2 zero-pad bits). Fixed output length avoids a
    // data-dependent trailing branch.
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 4; i++) {
        const w = words[i] >>> 0;
        bytes[i * 4] = (w >>> 24) & 0xff;
        bytes[i * 4 + 1] = (w >>> 16) & 0xff;
        bytes[i * 4 + 2] = (w >>> 8) & 0xff;
        bytes[i * 4 + 3] = w & 0xff;
    }
    let acc = 0, accBits = 0, bi = 0, out = '';
    for (let c = 0; c < 26; c++) {
        while (accBits < 5) {
            acc = ((acc << 8) | (bi < bytes.length ? bytes[bi++] : 0)) >>> 0;
            accBits += 8;
        }
        out += B32[(acc >>> (accBits - 5)) & 31];
        accBits -= 5;
    }
    return out;
}

/**
 * Deterministic one-way digest of (username, value), version-tagged. Same
 * (username, value) always yields the same string; small input changes
 * avalanche. Used as the login `token`.
 *
 * The ONE function here that is not confined to the managed session store: it
 * needs no seed, and both callers run outside an active session — the managed
 * login stamps a password to obtain the token that fetches the profile, and the
 * admin module stamps *another* user's new password on save. Sanctioned callers:
 * the connections module's Managed panel, `user-management`, and the standalone
 * admin app. Everything seed-dependent (`pack`/`unpack`/`importSeed`/`fromB64`)
 * belongs to `src/core/services/managed-session-store.ts` alone — a new caller
 * of those, or of this, needs design sign-off.
 */
export function stamp(username: string, value: string): string {
    const data = enc.encode(`${ANCHOR}${username}${value}`);
    let h0 = 0x811c9dc5 | 0;
    let h1 = 0x9e3779b9 | 0;
    let h2 = 0x85ebca6b | 0;
    let h3 = 0xc2b2ae35 | 0;
    for (let i = 0; i < data.length; i++) {
        const b = data[i];
        h0 = fin(h0 ^ b);
        h1 = fin((h1 + b + i) | 0);
        h2 = rotl(h2 ^ Math.imul(b + 1, 0x9e3779b1), 7);
        h3 = fin(h3 ^ rotl(h2, 13));
        // cross-mix the lanes so order matters
        h0 = (h0 ^ h3) | 0;
        h1 = (h1 ^ h0) | 0;
        h2 = (h2 ^ h1) | 0;
        h3 = (h3 ^ h2) | 0;
    }
    return 'S1:' + b32([fin(h0), fin(h1), fin(h2), fin(h3)]);
}

/* ---- pack / unpack: reversible, over a non-extractable seed ----------- */

const PACK_TAG = 'V1:';
const IV_BYTES = 12;

/** Import raw seed bytes as a NON-extractable key usable by pack/unpack. */
export function importSeed(bytes: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Reversibly transform a value with the seed. Output is version-tagged text. */
export async function pack(value: string, seed: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, seed, enc.encode(value));
    const ct = new Uint8Array(ctBuf);
    const joined = new Uint8Array(iv.length + ct.length);
    joined.set(iv, 0);
    joined.set(ct, iv.length);
    return PACK_TAG + toB64(joined);
}

/** Recover a value previously produced by `pack` with the same seed. */
export async function unpack(blob: string, seed: CryptoKey): Promise<string> {
    if (!blob.startsWith(PACK_TAG)) {
        throw new Error(`unpack: unknown version tag in ${blob.slice(0, 4)}…`);
    }
    const joined = fromB64(blob.slice(PACK_TAG.length));
    const iv = joined.slice(0, IV_BYTES);
    const ct = joined.slice(IV_BYTES);
    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, seed, ct);
    return dec.decode(ptBuf);
}
