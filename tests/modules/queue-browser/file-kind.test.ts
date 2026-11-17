// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { detectKind, imageSize, hexDump, HEX_VIEW_BYTES } from '../../../src/modules/queue-browser/file-kind';

type Part = number | string | number[];

/** Bytes from numbers, ASCII text and number arrays, in order. */
function bytes(...parts: Part[]): Uint8Array {
    return Uint8Array.from(parts.flatMap(p => (typeof p === 'number' ? [p] : typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p)));
}

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const u32be = (n: number): number[] => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];

/** A PNG's signature and IHDR chunk header, declaring `w` x `h`. */
const png = (w: number, h: number): Uint8Array => bytes(PNG_SIG, u32be(13), 'IHDR', u32be(w), u32be(h));

/** A JPEG start-of-frame segment (marker `marker`) declaring `w` x `h`. */
const sof = (marker: number, w: number, h: number): number[] => [0xFF, marker, 0x00, 0x11, 0x08, h >> 8, h & 0xFF, w >> 8, w & 0xFF, 0x03];

/** A JPEG APP0 segment: marker, a length of 16 (counting its own two bytes), 14 bytes of data. */
const app0 = (): number[] => [0xFF, 0xE0, 0x00, 0x10, ...zeros(14)];

describe('queue-browser/file-kind', () => {
    describe('detectKind()', () => {
        const cases: [string, Uint8Array, string, string, string?][] = [
            ['PNG', bytes(PNG_SIG, zeros(4)), 'PNG image', 'png', 'image/png'],
            ['JPEG', bytes([0xFF, 0xD8, 0xFF, 0xE0]), 'JPEG image', 'jpg', 'image/jpeg'],
            ['GIF87a', bytes('GIF87a', zeros(4)), 'GIF image', 'gif', 'image/gif'],
            ['GIF89a', bytes('GIF89a', zeros(4)), 'GIF image', 'gif', 'image/gif'],
            ['RIFF WEBP', bytes('RIFF', zeros(4), 'WEBP'), 'WebP image', 'webp', 'image/webp'],
            ['RIFF WAVE', bytes('RIFF', zeros(4), 'WAVE'), 'WAV audio', 'wav'],
            ['RIFF AVI', bytes('RIFF', zeros(4), 'AVI '), 'AVI video', 'avi'],
            ['little-endian TIFF', bytes('II*\0', zeros(4)), 'TIFF image', 'tif'],
            ['big-endian TIFF', bytes('MM\0*', zeros(4)), 'TIFF image', 'tif'],
            ['BMP', bytes('BM', zeros(24)), 'BMP image', 'bmp'],
            ['PDF', bytes('%PDF-1.7'), 'PDF document', 'pdf'],
            ['ZIP with a local file header', bytes('PK', [3, 4], zeros(4)), 'ZIP archive', 'zip'],
            ['empty ZIP', bytes('PK', [5, 6], zeros(4)), 'ZIP archive', 'zip'],
            ['spanned ZIP', bytes('PK', [7, 8], zeros(4)), 'ZIP archive', 'zip'],
            ['gzip', bytes([0x1F, 0x8B, 0x08]), 'gzip-compressed data (a .gz or .tgz file)', 'gz'],
            ['bzip2', bytes('BZh9'), 'bzip2-compressed data', 'bz2'],
            ['xz', bytes([0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00]), 'xz-compressed data', 'xz'],
            ['Zstandard', bytes([0x28, 0xB5, 0x2F, 0xFD]), 'Zstandard-compressed data', 'zst'],
            ['7-Zip', bytes([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]), '7-Zip archive', '7z'],
            ['RAR', bytes('Rar!\x1A\x07', [0]), 'RAR archive', 'rar'],
            ['tar', bytes(zeros(257), 'ustar'), 'tar archive', 'tar'],
            ['MPEG-4 video, plain brand', bytes(u32be(24), 'ftyp', 'isom'), 'MPEG-4 video', 'mp4'],
            ['QuickTime brand', bytes(u32be(20), 'ftyp', 'qt  '), 'QuickTime video', 'mov'],
            ['MPEG-4 audio brand', bytes(u32be(20), 'ftyp', 'M4A '), 'MPEG-4 audio', 'm4a'],
            ['HEIF brand heic', bytes(u32be(24), 'ftyp', 'heic'), 'HEIF image', 'heic'],
            ['HEIF brand heix', bytes(u32be(24), 'ftyp', 'heix'), 'HEIF image', 'heic'],
            ['HEIF brand mif1', bytes(u32be(24), 'ftyp', 'mif1'), 'HEIF image', 'heic'],
            ['AVIF brand', bytes(u32be(24), 'ftyp', 'avif'), 'AVIF image', 'avif'],
            ['WebM or Matroska', bytes([0x1A, 0x45, 0xDF, 0xA3]), 'WebM or Matroska video', 'webm'],
            ['Ogg', bytes('OggS', [0]), 'Ogg audio or video', 'ogg'],
            ['FLAC', bytes('fLaC'), 'FLAC audio', 'flac'],
            ['SQLite', bytes('SQLite format 3\0'), 'SQLite database', 'sqlite'],
            ['Parquet', bytes('PAR1'), 'Parquet file', 'parquet'],
            ['Avro', bytes('Obj\x01'), 'Avro data file', 'avro'],
            ['WebAssembly', bytes([0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00]), 'WebAssembly module', 'wasm'],
            ['ELF', bytes([0x7F, 0x45, 0x4C, 0x46, 2, 1, 1]), 'ELF executable or library', 'bin'],
            ['Mach-O 32-bit', bytes([0xFE, 0xED, 0xFA, 0xCE]), 'Mach-O executable or library', 'bin'],
            ['Mach-O 64-bit', bytes([0xFE, 0xED, 0xFA, 0xCF]), 'Mach-O executable or library', 'bin'],
            ['Mach-O 32-bit, little-endian', bytes([0xCE, 0xFA, 0xED, 0xFE]), 'Mach-O executable or library', 'bin'],
            ['Mach-O 64-bit, little-endian', bytes([0xCF, 0xFA, 0xED, 0xFE]), 'Mach-O executable or library', 'bin'],
            ['Windows executable', bytes('MZ', [0x90, 0x00, 0x03]), 'Windows executable or library', 'bin'],
            ['MP3 with an ID3 tag', bytes('ID3', [3, 0]), 'MP3 audio', 'mp3'],
            ['MP3 by frame sync', bytes([0xFF, 0xFB, 0x90, 0x00]), 'MP3 audio', 'mp3'],
        ];

        it.each(cases)('recognises %s', (_name, input, label, ext, image) => {
            const kind = detectKind(input);
            expect(kind).toEqual(image ? { label, ext, image } : { label, ext });
        });

        it('gives only the four preview images an image type, and no executable an extension of its own', () => {
            const images = cases.filter(c => c[4] !== undefined).map(c => c[4]);
            expect(new Set(images)).toEqual(new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']));
            for (const c of cases.filter(c => /executable/.test(c[2]))) expect(c[3]).toBe('bin');
        });

        it('tells a Mach-O universal binary (a few architectures) from a Java class (a version of 45 or more) by the word after CAFEBABE', () => {
            const magic = [0xCA, 0xFE, 0xBA, 0xBE];
            expect(detectKind(bytes(magic, u32be(2)))).toEqual({ label: 'Mach-O universal binary', ext: 'bin' });
            expect(detectKind(bytes(magic, u32be(44)))).toEqual({ label: 'Mach-O universal binary', ext: 'bin' });
            expect(detectKind(bytes(magic, u32be(45)))).toEqual({ label: 'Java class file', ext: 'class' });
            expect(detectKind(bytes(magic, u32be(65)))).toEqual({ label: 'Java class file', ext: 'class' });
        });

        it('does not guess at CAFEBABE with no word after it', () => {
            expect(detectKind(bytes([0xCA, 0xFE, 0xBA, 0xBE]))).toBeNull();
        });

        it('names no kind for a RIFF file that is not WebP, WAV or AVI', () => {
            expect(detectKind(bytes('RIFF', zeros(4), 'ACON'))).toBeNull();
            expect(detectKind(bytes('RIFF'))).toBeNull();
        });

        it('needs the whole BMP header: a BM that is short or has reserved bytes set is not one', () => {
            expect(detectKind(bytes('BM', zeros(10)))).toBeNull();
            expect(detectKind(bytes('BM', zeros(4), [1, 0, 0, 0], zeros(16)))).toBeNull();
        });

        it('needs the whole ftyp box: eight bytes with no brand is not recognised', () => {
            expect(detectKind(bytes(u32be(8), 'ftyp'))).toBeNull();
        });

        it('does not take a PK that starts no ZIP record, or a truncated signature, for a known kind', () => {
            expect(detectKind(bytes('PK', [1, 2]))).toBeNull();
            expect(detectKind(bytes([0x89, 0x50, 0x4E, 0x47]))).toBeNull();
        });

        it('does not take an AAC frame (frame sync without the MPEG audio layer bits) or a lone 0xFF for MP3', () => {
            expect(detectKind(bytes([0xFF, 0xF1, 0x50, 0x80]))).toBeNull();
            expect(detectKind(bytes([0xFF]))).toBeNull();
        });

        it('returns null for bytes no signature matches, and for no bytes at all', () => {
            expect(detectKind(bytes([0x01, 0x02, 0x03, 0x04]))).toBeNull();
            expect(detectKind(new Uint8Array(0))).toBeNull();
        });
    });

    describe('imageSize()', () => {
        it('reads a PNG size from its IHDR chunk, a width above 2^31 included', () => {
            expect(imageSize(png(640, 480), 'image/png')).toEqual({ width: 640, height: 480 });
            expect(imageSize(png(0x80000000, 2), 'image/png')).toEqual({ width: 2147483648, height: 2 });
        });

        it('gives no PNG size when the IHDR chunk is missing or cut short', () => {
            expect(imageSize(bytes(PNG_SIG, u32be(13), 'IDAT', u32be(1), u32be(1)), 'image/png')).toBeNull();
            expect(imageSize(png(640, 480).subarray(0, 23), 'image/png')).toBeNull();
        });

        it('reads a GIF size from its logical screen descriptor, little-endian', () => {
            expect(imageSize(bytes('GIF89a', [0x40, 0x01], [0xC8, 0x00]), 'image/gif')).toEqual({ width: 320, height: 200 });
        });

        it('gives no GIF size when the header is cut short', () => {
            expect(imageSize(bytes('GIF89a', [0x40, 0x01], [0xC8]), 'image/gif')).toBeNull();
        });

        it('reads a JPEG size from its first frame header, past an APP0 segment', () => {
            const jpeg = bytes([0xFF, 0xD8], app0(), sof(0xC0, 800, 600));
            expect(imageSize(jpeg, 'image/jpeg')).toEqual({ width: 800, height: 600 });
        });

        it('skips fill bytes, standalone markers and non-frame segments before the frame header', () => {
            const dht = [0xFF, 0xC4, 0x00, 0x04, 0x00, 0x00];
            const jpeg = bytes([0xFF, 0xD8], app0(), [0xFF, 0xD0], [0xFF, 0x01], dht, [0xFF], sof(0xC2, 1024, 768));
            expect(imageSize(jpeg, 'image/jpeg')).toEqual({ width: 1024, height: 768 });
        });

        it('does not take a DHT, a JPG extension or an arithmetic-conditioning marker for a frame header', () => {
            for (const marker of [0xC4, 0xC8, 0xCC]) {
                expect(imageSize(bytes([0xFF, 0xD8], sof(marker, 800, 600)), 'image/jpeg')).toBeNull();
            }
        });

        it('gives no JPEG size when a segment does not start with 0xFF', () => {
            expect(imageSize(bytes([0xFF, 0xD8], zeros(12)), 'image/jpeg')).toBeNull();
        });

        it('gives no JPEG size when the data ends before any frame header', () => {
            expect(imageSize(bytes([0xFF, 0xD8], app0()), 'image/jpeg')).toBeNull();
            expect(imageSize(bytes([0xFF, 0xD8, 0xFF]), 'image/jpeg')).toBeNull();
        });

        it('reads a WebP size from a VP8X (extended) header', () => {
            const webp = bytes('RIFF', zeros(4), 'WEBP', 'VP8X', u32be(10), [0, 0, 0, 0], [0xFF, 0x03, 0x00], [0xFF, 0x02, 0x00]);
            expect(imageSize(webp, 'image/webp')).toEqual({ width: 1024, height: 768 });
        });

        it('reads a WebP size from a VP8L (lossless) header', () => {
            const webp = bytes('RIFF', zeros(4), 'WEBP', 'VP8L', u32be(5), [0x2F], [0x2B, 0xC1, 0x31, 0x00]);
            expect(imageSize(webp, 'image/webp')).toEqual({ width: 300, height: 200 });
        });

        it('reads a WebP size from a VP8 (lossy) header, ignoring the scaling bits', () => {
            const webp = bytes('RIFF', zeros(4), 'WEBP', 'VP8 ', u32be(10), [0, 0, 0], [0x9D, 0x01, 0x2A], [0x80, 0x42], [0xE0, 0x01]);
            expect(imageSize(webp, 'image/webp')).toEqual({ width: 640, height: 480 });
        });

        it('gives no WebP size for a header cut short, or a chunk it does not know', () => {
            const head = (): Part[] => ['RIFF', zeros(4), 'WEBP'];
            expect(imageSize(bytes(...head(), 'VP8X', zeros(13)), 'image/webp')).toBeNull();
            expect(imageSize(bytes(...head(), 'VP8L', zeros(8)), 'image/webp')).toBeNull();
            expect(imageSize(bytes(...head(), 'VP8 ', zeros(13)), 'image/webp')).toBeNull();
            expect(imageSize(bytes(...head(), 'ALPH', zeros(20)), 'image/webp')).toBeNull();
        });

        it('gives no size for an image that declares no pixels', () => {
            expect(imageSize(png(0, 480), 'image/png')).toBeNull();
            expect(imageSize(png(640, 0), 'image/png')).toBeNull();
            expect(imageSize(bytes([0xFF, 0xD8], sof(0xC0, 0, 600)), 'image/jpeg')).toBeNull();
            const lossy = bytes('RIFF', zeros(4), 'WEBP', 'VP8 ', u32be(10), [0, 0, 0], [0x9D, 0x01, 0x2A], [0x00, 0x00], [0xE0, 0x01]);
            expect(imageSize(lossy, 'image/webp')).toBeNull();
        });
    });

    describe('hexDump()', () => {
        it('lays out a full line as offset, two groups of eight bytes, and the printable ASCII between bars', () => {
            expect(hexDump(bytes('ABCDEFGHIJKLMNOP')))
                .toBe('00000000  41 42 43 44 45 46 47 48  49 4a 4b 4c 4d 4e 4f 50  |ABCDEFGHIJKLMNOP|');
        });

        it('pads a short last line so the ASCII column lines up, and shows unprintable bytes as dots', () => {
            const dump = hexDump(bytes('ABCDEFGHIJKLMNOP', [0x00, 0x7F, 0x20, 0x7E]));
            expect(dump.split('\n')).toEqual([
                '00000000  41 42 43 44 45 46 47 48  49 4a 4b 4c 4d 4e 4f 50  |ABCDEFGHIJKLMNOP|',
                '00000010  00 7f 20 7e                                       |.. ~|',
            ]);
        });

        it('pads a line that ends inside the first group', () => {
            expect(hexDump(bytes('Hello')))
                .toBe('00000000  48 65 6c 6c 6f                                    |Hello|');
        });

        it('pads a line that ends inside the second group', () => {
            const dump = hexDump(bytes([0xDE, 0xAD, 0xBE, 0xEF, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
            expect(dump.split('\n')[1]).toBe('00000010  0c                                                |.|');
        });

        it('gives no lines for no bytes', () => {
            expect(hexDump(new Uint8Array(0))).toBe('');
        });

        it('stops at the default limit and says how many bytes it left out, grouped as en-US', () => {
            const lines = hexDump(new Uint8Array(HEX_VIEW_BYTES + 1234)).split('\n');
            expect(lines).toHaveLength(HEX_VIEW_BYTES / 16 + 1);
            expect(lines[HEX_VIEW_BYTES / 16 - 1].slice(0, 8)).toBe('000001f0');
            expect(lines[HEX_VIEW_BYTES / 16]).toBe('... 1,234 more bytes');
        });

        it('says "1 more byte" in the singular, and adds nothing at exactly the limit', () => {
            const one = hexDump(new Uint8Array(HEX_VIEW_BYTES + 1)).split('\n');
            expect(one[one.length - 1]).toBe('... 1 more byte');
            expect(hexDump(new Uint8Array(HEX_VIEW_BYTES)).split('\n')).toHaveLength(HEX_VIEW_BYTES / 16);
        });

        it('honours a limit given by the caller', () => {
            expect(hexDump(bytes('ABCDEFGHIJKLMNOPQ'), 16).split('\n')).toEqual([
                '00000000  41 42 43 44 45 46 47 48  49 4a 4b 4c 4d 4e 4f 50  |ABCDEFGHIJKLMNOP|',
                '... 1 more byte',
            ]);
        });
    });
});
