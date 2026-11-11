/**
 * Binary-attachment helpers for the queue browser (payload flavor only).
 *
 * The SDK runs with the version10 factory profile, under which
 * getBinaryAttachment() returns a Latin-1 string: one character per byte.
 * attachmentBytes() turns that back into the original bytes once, at ingest;
 * classifyAttachment() then decides whether those bytes are text to show or a
 * true binary payload that the details pane shows as a size-only placeholder.
 * Downloads always write the original bytes.
 */

// Control characters other than tab, LF and CR: UTF-8 that carries them is data, not text.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// An HTTP Content-Type that declares text: a valid UTF-8 payload stays text even with control characters.
const TEXT_CONTENT_TYPE = /^\s*(?:text\/|application\/(?:json|xml)\s*(?:;|$))/i;

export interface AttachmentPayload {
    /** What the details pane shows: the decoded text, or `[Binary payload: N bytes]`. */
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

function binaryPayload(bytes: Uint8Array): AttachmentPayload {
    const n = bytes.length;
    return {
        content: `[Binary payload: ${n.toLocaleString('en-US')} byte${n === 1 ? '' : 's'}]`,
        bytes,
        binary: true,
    };
}

/** Base64 of `bytes`, built in chunks so a large payload cannot overflow the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
    let latin1 = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        latin1 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(latin1);
}
