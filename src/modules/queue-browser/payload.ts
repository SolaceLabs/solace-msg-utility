/**
 * Payload helpers for the queue browser (payload flavor only).
 *
 * The SDK runs with the version10 factory profile, under which
 * getBinaryAttachment() returns a Latin-1 string: one character per byte.
 * attachmentBytes() turns that back into the original bytes once, at ingest;
 * classifyAttachment() then decides whether those bytes are text to show or a
 * true binary payload that the details pane shows as a placeholder naming its
 * kind and size.
 * Downloads always write the original bytes, under the name contentFileName()
 * suggests.
 */
import { detectKind } from './file-kind.js';

// Control characters other than tab, LF and CR: UTF-8 that carries them is data, not text.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// An HTTP Content-Type that declares text: a valid UTF-8 payload stays text even with control characters.
const TEXT_CONTENT_TYPE = /^\s*(?:text\/|application\/(?:json|xml)\s*(?:;|$))/i;

export interface AttachmentPayload {
    /** What the details pane shows: the decoded text, or `[Binary payload, looks like <kind>: N bytes]`. */
    content: string;
    /** The attachment's original bytes, for Download Content, the ZIP and Download Full. */
    bytes: Uint8Array;
    /** True when the bytes are not text: the body filter never matches the payload. */
    binary: boolean;
}

/** The attachment's original bytes: the SDK's Latin-1 string decoded one char per byte. */
export function attachmentBytes(attachment: string | Uint8Array): Uint8Array {
    if (typeof attachment !== 'string') return attachment;
    const bytes = new Uint8Array(attachment.length);
    for (let i = 0; i < attachment.length; i++) {
        const code = attachment.charCodeAt(i);
        // A code unit above 0xFF means this is not a byte string but text already
        // (the in-browser demo broker hands back plain strings): keep it as UTF-8.
        if (code > 0xFF) return new TextEncoder().encode(attachment);
        bytes[i] = code;
    }
    return bytes;
}

/**
 * Text when the bytes are valid UTF-8 with no control characters other than
 * tab, CR and LF (a text HTTP Content-Type lifts the control-character rule);
 * otherwise a true binary payload.
 */
export function classifyAttachment(bytes: Uint8Array, contentType?: string): AttachmentPayload {
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        // Not valid UTF-8.
        return binaryPayload(bytes);
    }
    if (CONTROL_CHARS.test(text) && !TEXT_CONTENT_TYPE.test(contentType ?? '')) return binaryPayload(bytes);
    return { content: text, bytes, binary: false };
}

/** The placeholder names the kind its first bytes say it is (file-kind.ts), when they say one. */
function binaryPayload(bytes: Uint8Array): AttachmentPayload {
    const n = bytes.length;
    const kind = detectKind(bytes);
    const looks = kind ? `, looks like ${kind.label}` : '';
    return {
        content: `[Binary payload${looks}: ${n.toLocaleString('en-US')} byte${n === 1 ? '' : 's'}]`,
        bytes,
        binary: true,
    };
}

/**
 * The extensions a text payload's download may take from the publisher's HTTP
 * Content-Type. A type outside the list (HTML and SVG among them: text a
 * browser would render) gets what the text looks like instead, at most JSON
 * or XML, else `.txt`.
 */
const TEXT_TYPE_EXT: Record<string, string> = {
    'application/json': 'json',
    'text/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'text/csv': 'csv',
    'application/yaml': 'yaml',
    'application/x-yaml': 'yaml',
    'text/yaml': 'yaml',
    'text/plain': 'txt',
};

/** The extension a text payload's download suggests: from its Content-Type when listed, else from its text. */
export function textExtension(text: string, contentType?: string): string {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (TEXT_TYPE_EXT[type]) return TEXT_TYPE_EXT[type];
    const t = text.trim();
    if (t.startsWith('<?xml')) return 'xml';
    if (t.startsWith('{') || t.startsWith('[')) {
        try {
            JSON.parse(t);
            return 'json';
        } catch {
            // Not JSON after all: plain text.
        }
    }
    return 'txt';
}

/** What `contentFileName` reads of a browsed message. */
export interface PayloadFileSource {
    id: string;
    content: string;
    bytes?: Uint8Array;
    binary: boolean;
    /** A map or stream body, decoded (sdt.ts): its download is the raw wire bytes. */
    sdt?: unknown;
    msgProperties: Record<string, unknown>;
}

/**
 * The name Download Content suggests and a content ZIP entry takes:
 * `solace-message-<id>.<ext>`. The extension is `bin` for a map or stream
 * (Solace's own encoding) and for a binary payload no signature names; a
 * recognised one takes its kind's (file-kind.ts); text takes `textExtension`.
 */
export function contentFileName(msg: PayloadFileSource): string {
    const ext = msg.sdt !== undefined ? 'bin'
        : msg.binary ? (detectKind(msg.bytes as Uint8Array)?.ext ?? 'bin')
        : textExtension(msg.content, msg.msgProperties['HTTP Type'] as string | undefined);
    return `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}.${ext}`;
}

/** Base64 of `bytes`, built in chunks so a large payload cannot overflow the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
    let latin1 = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        latin1 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(latin1);
}
