import { describe, it, expect } from 'vitest';
import { attachmentBytes, classifyAttachment, bytesToBase64 } from '../../../src/modules/queue-browser/payload';

// What the SDK's version10 profile hands getBinaryAttachment(): one char per byte.
function latin1(bytes: Uint8Array): string {
    return String.fromCharCode(...bytes);
}

describe('queue-browser/payload', () => {
    describe('attachmentBytes()', () => {
        it('turns the SDK Latin-1 string back into the original bytes', () => {
            const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x00, 0xFF]);
            expect(Array.from(attachmentBytes(latin1(bytes)))).toEqual(Array.from(bytes));
        });

        it('keeps a Uint8Array attachment as it is', () => {
            const bytes = new Uint8Array([1, 2, 3]);
            expect(attachmentBytes(bytes)).toBe(bytes);
        });

        it('encodes a string that is already text (code units above 0xFF, as the demo broker sends) as UTF-8', () => {
            const text = 'plain-text payload #2 \u2014 the quick brown fox';
            expect(Array.from(attachmentBytes(text))).toEqual(Array.from(new TextEncoder().encode(text)));
        });
    });

    describe('classifyAttachment()', () => {
        it('shows valid UTF-8 as text, multi-byte characters included', () => {
            const bytes = new TextEncoder().encode('Gr\u00fc\u00dfe\tline 1\r\nline 2 \u20ac');
            expect(classifyAttachment(bytes)).toEqual({ content: 'Gr\u00fc\u00dfe\tline 1\r\nline 2 \u20ac', bytes, binary: false });
        });

        it('shows bytes that are not valid UTF-8 as a size placeholder', () => {
            const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, ...new TextEncoder().encode('\u20ac')]);
            expect(classifyAttachment(bytes, 'text/plain')).toEqual({ content: '[Binary payload: 7 bytes]', bytes, binary: true });
        });

        it('treats UTF-8 with other control characters as binary when no text Content-Type says otherwise', () => {
            const nul = new Uint8Array([0x00]);
            expect(classifyAttachment(nul)).toEqual({ content: '[Binary payload: 1 byte]', bytes: nul, binary: true });
            const framed = new TextEncoder().encode('\x01id=7');
            expect(classifyAttachment(framed, 'application/octet-stream').binary).toBe(true);
        });

        it('keeps UTF-8 with control characters as text when the HTTP Content-Type declares text', () => {
            const bytes = new TextEncoder().encode('\x01id=7');
            expect(classifyAttachment(bytes, 'application/json; charset=utf-8').content).toBe('\x01id=7');
            expect(classifyAttachment(bytes, 'TEXT/csv').binary).toBe(false);
            expect(classifyAttachment(bytes, 'application/xml').binary).toBe(false);
        });

        it('formats a large size with thousands separators', () => {
            const bytes = new Uint8Array(1234).fill(0xFF);
            expect(classifyAttachment(bytes).content).toBe('[Binary payload: 1,234 bytes]');
        });
    });

    describe('bytesToBase64()', () => {
        it('encodes bytes as base64', () => {
            expect(bytesToBase64(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBe('iVBORw==');
        });

        it('encodes a payload larger than one chunk without losing bytes', () => {
            const bytes = new Uint8Array(0x8000 + 3).map((_, i) => i % 256);
            const decoded = atob(bytesToBase64(bytes));
            expect(decoded.length).toBe(bytes.length);
            expect([decoded.charCodeAt(0x7FFF), decoded.charCodeAt(0x8000), decoded.charCodeAt(0x8002)])
                .toEqual([0xFF, 0x00, 0x02]);
        });
    });
});
