/**
 * The payload samples queue: one message of each kind Queue Browser's details
 * pane tells apart, so a visitor can try Show preview, Show hex, the map and
 * stream YAML and Download Content's suggested names without a broker.
 *
 * The binary bytes were generated with python3 (struct, zlib, gzip, zipfile)
 * and embedded as base64; each note says what it is and how it was made. They
 * are a few KB in all. Nothing here runs or opens anything: the ELF is its
 * 64-byte header and no more.
 *
 * Mock-only.
 */
import type { MessageFields, SdtBody } from '../sdk/message';

export interface PayloadSample {
    /** What the message is, shown as its correlation id and `sample` user property. */
    name: string;
    /** The fields that differ from the common ones the store gives every message. */
    fields: Pick<MessageFields, 'payload' | 'payloadBytes' | 'sdt' | 'httpContentType'>;
}

/** A base64 text as a byte string (one char per byte), the shape `payloadBytes` holds. */
function bytes(base64: string): string {
    return atob(base64);
}

const str = (value: string): SdtBody => ({ type: 'string', value });
const map = (...entries: [string, SdtBody][]): SdtBody => ({ type: 'map', entries });

export const PAYLOAD_SAMPLES: PayloadSample[] = [
    // PNG, 16x16 RGB: a blue-to-orange diagonal gradient with a white ring (zlib-compressed scanlines, CRCs correct). 289 bytes.
    { name: 'png-16x16', fields: { httpContentType: 'image/png', payloadBytes: bytes(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAA6ElEQVR42mOQy7ujmn9Vt+C8SdFJm+JDziV7vMu2BZWvj6pYmVi1OLN6TkHNtIq6CfX1ne0NzX1NtQwkqZ7WXMZAkuq5LQUMaKr/YwBk1UvbshgwVSObDRGBq17TnsyARzXEbIg4RPWWjlgGuLuxqoaYDZSCqN7dFc4A9yVQFKtqoNlAKYjqw90BDPAwAYpiVQ00GygFUX2qx4sBHoJAUayqgWYDpSCqL/W5MMDdDfEcVtVAAFF9s9+WAdndEDk8qh9OMGdAczdmxCGrfjHJkAGXu+G+RFb9YbIWA0mqv09RYSBJ9f9pcgDSg8BzSxbcrgAAAABJRU5ErkJggg==') } },
    // JPEG, 16x16 grayscale baseline: four 8x8 blocks of flat grey, hand-assembled (quantisation all 16, custom Huffman tables, DC only). 151 bytes.
    { name: 'jpeg-16x16', fields: { httpContentType: 'image/jpeg', payloadBytes: bytes(
        '/9j/2wBDABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAALCAAQABABAREA/8QAGgAAAAcAAAAAAAAAAAAAAAAAAAECAwQFBv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AybWr5bv/2Q==') } },
    // GIF89a, 1x1 orange pixel (the classic 35-byte GIF).
    { name: 'gif-1x1', fields: { httpContentType: 'image/gif', payloadBytes: bytes('R0lGODlhAQABAIAAAP9mAAAAACwAAAAAAQABAAACAkQBADs=') } },
    // WebP, 16x16 solid orange: lossless (VP8L), every prefix code a single symbol, so no pixel data follows the header. Hand-assembled; 34 bytes.
    { name: 'webp-16x16', fields: { httpContentType: 'image/webp', payloadBytes: bytes('UklGRhoAAABXRUJQVlA4TA0AAAAvD8ADAChk4QvS/wIAAA==') } },
    // PNG whose IHDR declares 10000 x 10000 (100 megapixels): signature and IHDR only, cut short. Show preview refuses it. 33 bytes.
    { name: 'png-too-large', fields: { httpContentType: 'image/png', payloadBytes: bytes('iVBORw0KGgoAAAANSUhEUgAAJxAAACcQCAIAAAA1LPVw') } },
    // PDF 1.4, one 200x100 page with the text "Demo PDF": built by hand with a correct xref table and a binary comment line (so it reads as binary, as real PDFs do). 588 bytes.
    { name: 'pdf', fields: { httpContentType: 'application/pdf', payloadBytes: bytes(
        'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAzOCA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDIwIDUwIFRkIChEZW1vIFBERikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAowMDAwMDAwMjQ3IDAwMDAwIG4gCjAwMDAwMDAzMzUgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MDUKJSVFT0YK') } },
    // gzip of one line of text (mtime 0). 65 bytes.
    { name: 'gzip', fields: { httpContentType: 'application/gzip', payloadBytes: bytes('H4sIAAAAAAACA3NJzc1XSK/KLFAoSKzMyU9MsVJIVCjOyC8qUShJrSjRUUjOzy0oSi0uTk3R4wIAaeembS0AAAA=') } },
    // ZIP holding hello.txt (deflated, fixed timestamp). 143 bytes.
    { name: 'zip', fields: { httpContentType: 'application/zip', payloadBytes: bytes(
        'UEsDBBQAAAAIAAAAIVxQBXeRGwAAABkAAAAJAAAAaGVsbG8udHh080jNyclXSCvKz1UoyUhVSEnNzVeI8gzQ4wIAUEsBAhQDFAAAAAgAAAAhXFAFd5EbAAAAGQAAAAkAAAAAAAAAAAAAAIABAAAAAGhlbGxvLnR4dFBLBQYAAAAAAQABADcAAABCAAAAAAA=') } },
    // The 64-byte ELF64 header of an x86-64 executable: no program or section headers, nothing that runs. The pane names it and offers the hex view.
    { name: 'elf-header', fields: { httpContentType: 'application/octet-stream', payloadBytes: bytes('f0VMRgIBAQAAAAAAAAAAAAIAPgABAAAAABBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAOAAAAEAAAAAAAA==') } },
    // 48 pseudo-random bytes (python3 random, seed 20260801, first byte 0x9c): no known signature, not UTF-8.
    { name: 'unknown-bytes', fields: { httpContentType: 'application/octet-stream', payloadBytes: bytes('nI1PMnOKZLwOIlPhXZGzfHpFIqJxchHWzBRSJPqKB7Txwd2eMcH5FlKx+3UuEEEx') } },
    // Text with a JSON Content-Type: Download Content suggests .json.
    { name: 'json-text', fields: { httpContentType: 'application/json', payload: JSON.stringify({ sample: 'json-text', ok: true, items: [1, 2, 3] }, null, 2) } },
    // Text with no Content-Type that looks like XML: Download Content suggests .xml.
    { name: 'xml-text', fields: { payload: '<?xml version="1.0" encoding="UTF-8"?>\n<order id="A-1001"><line sku="KB-7" qty="2"/></order>\n' } },
    // SDT map: every scalar kind, nested maps and streams, a destination, a null and a 64-bit value beyond 2^53.
    { name: 'sdt-map', fields: { sdt: map(
        ['name', str('Demo order')],
        ['paid', { type: 'bool', value: true }],
        ['quantity', { type: 'int32', value: 12 }],
        ['small', { type: 'int8', value: -5 }],
        ['unsigned', { type: 'uint16', value: 65535 }],
        ['bigId', { type: 'int64', value: '9007199254740993' }],
        ['bigUnsigned', { type: 'uint64', value: '18446744073709551615' }],
        ['ratio', { type: 'float', value: 1.5 }],
        ['total', { type: 'double', value: 1234.56 }],
        ['whole', { type: 'double', value: 3 }],
        ['token', { type: 'bytes', value: 'DEMO\x00\x01\xFF' }],
        ['replyTo', { type: 'destination', kind: 'topic', name: 'orders/reply/uk' }],
        ['inbox', { type: 'destination', kind: 'queue', name: 'demo/payload-samples' }],
        ['note', { type: 'null' }],
        ['customer', map(['id', str('C-42')], ['address', map(['city', str('Zurich')], ['zip', str('8001')])])],
        ['tags', { type: 'stream', items: [str('rush'), str('gift')] }],
    ) } },
    // SDT stream: mixed kinds in order, with a nested map and stream.
    { name: 'sdt-stream', fields: { sdt: { type: 'stream', items: [
        str('first'),
        { type: 'int32', value: 2 },
        { type: 'bool', value: false },
        { type: 'double', value: 0.25 },
        { type: 'null' },
        map(['k', str('v')]),
        { type: 'stream', items: [{ type: 'int8', value: 1 }, { type: 'int8', value: 2 }] },
    ] } } },
];
