/**
 * Value transform for the managed variant, deliberately neutrally named (no
 * `encrypt`/`decrypt`/`password`/`cipher`/`crypto` in the public surface):
 *
 *   - `pack(value, seed)` / `unpack(blob, seed)`
 *                                   — reversible, over a NON-extractable
 *                                     WebCrypto key. Used for connection creds.
 *
 * Every output carries a neutral version tag (`V1:`) so the algorithm is
 * swappable later behind this stable interface; a version/seed change is
 * migrated by unpack-old -> pack-new. (Passwords are no longer transformed
 * here: the gateway checks them itself.)
 *
 * This module is imported ONLY by the managed modules, so it is absent from the
 * standard / min / mock bundles (manifest-driven registry).
 *
 * Honest posture: this is obfuscation, not confidentiality — the transform and
 * the seed reach the client by necessity. See the plan's threat model.
 * Algorithm steps are intentionally not documented elsewhere.
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
