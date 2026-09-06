import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { stamp, importSeed, pack, unpack } from '../../src/core/encode';

// jsdom's `crypto` lacks `subtle`; point the global at Node's WebCrypto for the
// reversible pack/unpack path. stamp() is pure JS and needs no crypto.
beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto);
});
afterAll(() => {
    vi.unstubAllGlobals();
});

describe('core/encode — stamp (one-way login token)', () => {
    it('is version-tagged and deterministic', () => {
        const a = stamp('admin', 'msgutility');
        const b = stamp('admin', 'msgutility');
        expect(a).toBe(b);
        expect(a.startsWith('S1:')).toBe(true);
        expect(a.length).toBeGreaterThan('S1:'.length);
    });

    it('pins the bootstrap admin token (go-web-proxy hardcodes this exact value)', () => {
        // The Go proxy bootstraps a default admin (username "admin", password
        // "msgutility") with this literal as the stored token. If this value ever
        // changes, the hardcoded literal in go-web-proxy/store.go MUST be updated
        // in lockstep or admin login (string-match) breaks.
        expect(stamp('admin', 'msgutility')).toBe('S1:K160PHJHFKEGE8N50K9CRQZRF0');
    });

    it('avalanches on username and value changes', () => {
        const base = stamp('admin', 'msgutility');
        expect(stamp('admin2', 'msgutility')).not.toBe(base); // username matters
        expect(stamp('admin', 'msgutility2')).not.toBe(base); // value matters
        // username/value boundary is respected (no trivial concatenation collision)
        expect(stamp('ab', 'c')).not.toBe(stamp('a', 'bc'));
    });
});

function freshSeed(): Promise<CryptoKey> {
    return importSeed(webcrypto.getRandomValues(new Uint8Array(32)));
}

describe('core/encode — pack / unpack (reversible)', () => {
    it('round-trips a value', async () => {
        const seed = await freshSeed();
        const blob = await pack('s3cr3t-päss', seed);
        expect(blob.startsWith('V1:')).toBe(true);
        expect(await unpack(blob, seed)).toBe('s3cr3t-päss');
    });

    it('produces different blobs for the same input (random IV) that both recover', async () => {
        const seed = await freshSeed();
        const b1 = await pack('same', seed);
        const b2 = await pack('same', seed);
        expect(b1).not.toBe(b2);
        expect(await unpack(b1, seed)).toBe('same');
        expect(await unpack(b2, seed)).toBe('same');
    });

    it('throws on an unknown version tag', async () => {
        const seed = await freshSeed();
        await expect(unpack('Z9:deadbeef', seed)).rejects.toThrow(/unknown version/);
    });

    it('rejects a tampered blob (authenticated)', async () => {
        const seed = await freshSeed();
        const blob = await pack('payload', seed);
        // Flip the last base64 char to corrupt the ciphertext/tag.
        const last = blob.at(-1) === 'A' ? 'B' : 'A';
        const tampered = blob.slice(0, -1) + last;
        await expect(unpack(tampered, seed)).rejects.toThrow();
    });
});
