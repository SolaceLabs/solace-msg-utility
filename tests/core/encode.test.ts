import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { importSeed, pack, unpack } from '../../src/core/encode';

// jsdom's `crypto` lacks `subtle`; point the global at Node's WebCrypto for the
// reversible pack/unpack path.
beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto);
});
afterAll(() => {
    vi.unstubAllGlobals();
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
