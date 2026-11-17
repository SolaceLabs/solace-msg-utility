/**
 * What a binary payload is, read from its first bytes (its signature): the
 * label the details pane shows, the extension a download suggests, and for
 * the four image kinds the pane may preview, the MIME type and the size the
 * header declares. Pure; the payload flavor only.
 *
 * A signature is a guess about bytes the publisher chose, so nothing here
 * opens or runs the payload: an executable is named, and its download
 * suggests `.bin`. SVG and HTML are text, never detected here, and never
 * shown.
 */

/** The image kinds the details pane may preview, behind its Show preview button. */
export type PreviewImage = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export interface FileKind {
    /** What the details pane calls it, e.g. "PNG image". */
    label: string;
    /** The extension a download suggests, without the dot. */
    ext: string;
    /** For an image the pane may preview: its MIME type. */
    image?: PreviewImage;
}

/** The largest image the pane decodes: width times height, in pixels. */
export const MAX_PREVIEW_PIXELS = 40_000_000;

/** How many bytes the hex view shows. */
export const HEX_VIEW_BYTES = 512;

/** `sig` at `at`, byte for byte. */
function has(b: Uint8Array, sig: number[], at = 0): boolean {
    return at + sig.length <= b.length && sig.every((v, i) => b[at + i] === v);
}

/** The ASCII `text` at `at`. */
function text(b: Uint8Array, s: string, at = 0): boolean {
    return has(b, [...s].map(c => c.charCodeAt(0)), at);
}

const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);

const kind = (label: string, ext: string, image?: PreviewImage): FileKind => (image ? { label, ext, image } : { label, ext });

/** The ISO base media brands (bytes 8 to 11, after `ftyp`) that are not plain MPEG-4 video. */
const FTYP_BRANDS: Record<string, FileKind> = {
    'qt  ': kind('QuickTime video', 'mov'),
    'M4A ': kind('MPEG-4 audio', 'm4a'),
    'heic': kind('HEIF image', 'heic'),
    'heix': kind('HEIF image', 'heic'),
    'mif1': kind('HEIF image', 'heic'),
    'avif': kind('AVIF image', 'avif'),
};

/**
 * The kind of file `b` starts like, or null when no signature matches.
 * More specific signatures are tried before shorter ones that could collide
 * (`RIFF` before its subtypes' neighbours, MP3's two-byte frame sync last).
 */
export function detectKind(b: Uint8Array): FileKind | null {
    if (has(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return kind('PNG image', 'png', 'image/png');
    if (has(b, [0xFF, 0xD8, 0xFF])) return kind('JPEG image', 'jpg', 'image/jpeg');
    if (text(b, 'GIF87a') || text(b, 'GIF89a')) return kind('GIF image', 'gif', 'image/gif');
    if (text(b, 'RIFF')) {
        if (text(b, 'WEBP', 8)) return kind('WebP image', 'webp', 'image/webp');
        if (text(b, 'WAVE', 8)) return kind('WAV audio', 'wav');
        if (text(b, 'AVI ', 8)) return kind('AVI video', 'avi');
    }
    if (text(b, 'II*\0') || text(b, 'MM\0*')) return kind('TIFF image', 'tif');
    if (text(b, 'BM') && has(b, [0, 0, 0, 0], 6) && b.length >= 26) return kind('BMP image', 'bmp');
    if (text(b, '%PDF-')) return kind('PDF document', 'pdf');
    if (has(b, [0x50, 0x4B]) && (has(b, [3, 4], 2) || has(b, [5, 6], 2) || has(b, [7, 8], 2))) return kind('ZIP archive', 'zip');
    if (has(b, [0x1F, 0x8B])) return kind('gzip-compressed data (a .gz or .tgz file)', 'gz');
    if (text(b, 'BZh')) return kind('bzip2-compressed data', 'bz2');
    if (has(b, [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00])) return kind('xz-compressed data', 'xz');
    if (has(b, [0x28, 0xB5, 0x2F, 0xFD])) return kind('Zstandard-compressed data', 'zst');
    if (has(b, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) return kind('7-Zip archive', '7z');
    if (text(b, 'Rar!\x1A\x07')) return kind('RAR archive', 'rar');
    if (text(b, 'ustar', 257)) return kind('tar archive', 'tar');
    if (text(b, 'ftyp', 4) && b.length >= 12) {
        const brand = String.fromCharCode(...b.subarray(8, 12));
        return FTYP_BRANDS[brand] ?? kind('MPEG-4 video', 'mp4');
    }
    if (has(b, [0x1A, 0x45, 0xDF, 0xA3])) return kind('WebM or Matroska video', 'webm');
    if (text(b, 'OggS')) return kind('Ogg audio or video', 'ogg');
    if (text(b, 'fLaC')) return kind('FLAC audio', 'flac');
    if (text(b, 'SQLite format 3\0')) return kind('SQLite database', 'sqlite');
    if (text(b, 'PAR1')) return kind('Parquet file', 'parquet');
    if (text(b, 'Obj\x01')) return kind('Avro data file', 'avro');
    if (has(b, [0x00, 0x61, 0x73, 0x6D])) return kind('WebAssembly module', 'wasm');
    // Executables are named, never given their own extension.
    if (has(b, [0x7F, 0x45, 0x4C, 0x46])) return kind('ELF executable or library', 'bin');
    if ([[0xFE, 0xED, 0xFA, 0xCE], [0xFE, 0xED, 0xFA, 0xCF], [0xCE, 0xFA, 0xED, 0xFE], [0xCF, 0xFA, 0xED, 0xFE]].some(sig => has(b, sig))) {
        return kind('Mach-O executable or library', 'bin');
    }
    if (has(b, [0xCA, 0xFE, 0xBA, 0xBE]) && b.length >= 8) {
        // Shared by Java and Mach-O universal binaries: a Java class carries its
        // version here (major 45 and up), a universal binary its few architectures.
        return u32be(b, 4) < 45 ? kind('Mach-O universal binary', 'bin') : kind('Java class file', 'class');
    }
    if (text(b, 'MZ')) return kind('Windows executable or library', 'bin');
    if (text(b, 'ID3') || (b.length >= 2 && b[0] === 0xFF && (b[1] & 0xE0) === 0xE0 && (b[1] & 0x06) === 0x02)) return kind('MP3 audio', 'mp3');
    return null;
}

/** JPEG start-of-frame markers (C0 to CF, less C4, C8 and CC, which are not frames). */
const JPEG_SOF = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);

/** The width and height a JPEG's first frame header declares. */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
    let i = 2;
    while (i + 9 <= b.length) {
        if (b[i] !== 0xFF) return null;
        const marker = b[i + 1];
        if (marker === 0xFF) {
            i += 1;
        } else if (JPEG_SOF.has(marker)) {
            return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
        } else if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) {
            i += 2;
        } else {
            i += 2 + u16be(b, i + 2);
        }
    }
    return null;
}

/** The width and height a WebP declares, in whichever of its three headers it has. */
function webpSize(b: Uint8Array): { width: number; height: number } | null {
    if (text(b, 'VP8X', 12) && b.length >= 30) return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
    if (text(b, 'VP8L', 12) && b.length >= 25) {
        return {
            width: 1 + (((b[22] & 0x3F) << 8) | b[21]),
            height: 1 + (((b[24] & 0x0F) << 10) | (b[23] << 2) | ((b[22] & 0xC0) >> 6)),
        };
    }
    if (text(b, 'VP8 ', 12) && b.length >= 30) return { width: u16le(b, 26) & 0x3FFF, height: u16le(b, 28) & 0x3FFF };
    return null;
}

/**
 * The width and height an image's header declares, read before anything
 * decodes it, so the pane can refuse an image too large to decode safely.
 * Null when the header is cut short or unreadable, or declares no pixels.
 */
export function imageSize(b: Uint8Array, image: PreviewImage): { width: number; height: number } | null {
    let size: { width: number; height: number } | null = null;
    if (image === 'image/png') {
        size = text(b, 'IHDR', 12) && b.length >= 24 ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
    } else if (image === 'image/gif') {
        size = b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
    } else if (image === 'image/jpeg') {
        size = jpegSize(b);
    } else {
        size = webpSize(b);
    }
    return size && size.width > 0 && size.height > 0 ? size : null;
}

/**
 * The first `limit` bytes as a hex dump, sixteen to a line: the offset, the
 * bytes in two groups of eight, and the printable ASCII between bars
 * (`hexdump -C`'s layout). A longer payload ends with how many bytes are not
 * shown.
 */
export function hexDump(b: Uint8Array, limit = HEX_VIEW_BYTES): string {
    const shown = b.subarray(0, limit);
    const lines: string[] = [];
    for (let at = 0; at < shown.length; at += 16) {
        const row = [...shown.subarray(at, at + 16)];
        const hex = row.map(v => v.toString(16).padStart(2, '0'));
        const left = hex.slice(0, 8).join(' ').padEnd(23);
        const right = hex.slice(8).join(' ').padEnd(23);
        const ascii = row.map(v => (v >= 0x20 && v < 0x7F ? String.fromCharCode(v) : '.')).join('');
        lines.push(`${at.toString(16).padStart(8, '0')}  ${left}  ${right}  |${ascii}|`);
    }
    const rest = b.length - shown.length;
    if (rest > 0) lines.push(`... ${rest.toLocaleString('en-US')} more byte${rest === 1 ? '' : 's'}`);
    return lines.join('\n');
}
