// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { attachmentBytes, classifyAttachment, bytesToBase64, textExtension, contentFileName, type PayloadFileSource } from '../../../src/modules/queue-browser/payload';

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

        it('names the kind the first bytes say the payload is, when they say one', () => {
            const pdf = Uint8Array.from([...new TextEncoder().encode('%PDF-1.7'), 0x00]);
            expect(classifyAttachment(pdf).content).toBe('[Binary payload, looks like PDF document: 9 bytes]');
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

    describe('textExtension()', () => {
        it.each([
            ['application/json', 'json'],
            ['text/json', 'json'],
            ['application/xml', 'xml'],
            ['text/xml', 'xml'],
            ['text/csv', 'csv'],
            ['application/yaml', 'yaml'],
            ['application/x-yaml', 'yaml'],
            ['text/yaml', 'yaml'],
            ['text/plain', 'txt'],
        ])('takes the extension for the Content-Type %s from the list', (type, ext) => {
            expect(textExtension('anything', type)).toBe(ext);
        });

        it('ignores a parameter after the semicolon, the case of the type and spaces around it', () => {
            expect(textExtension('x', 'application/json; charset=utf-8')).toBe('json');
            expect(textExtension('x', 'TEXT/CSV')).toBe('csv');
            expect(textExtension('x', '  text/yaml ;charset=utf-8')).toBe('yaml');
        });

        it('trusts a listed Content-Type over what the text looks like', () => {
            expect(textExtension('{"a":1}', 'text/plain')).toBe('txt');
            expect(textExtension('<?xml version="1.0"?><a/>', 'text/csv')).toBe('csv');
        });

        it('never gives HTML or SVG an extension a browser would render: the text decides, at most JSON or XML', () => {
            expect(textExtension('<html><body>hi</body></html>', 'text/html')).toBe('txt');
            expect(textExtension('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')).toBe('txt');
            expect(textExtension('<script>alert(1)</script>', 'application/xhtml+xml')).toBe('txt');
            expect(textExtension('{"a":1}', 'text/html')).toBe('json');
        });

        it('names text that opens with an XML declaration xml, leading whitespace aside', () => {
            expect(textExtension('  \n<?xml version="1.0"?><a/>')).toBe('xml');
            expect(textExtension('<?xml version="1.0"?><svg/>', 'image/svg+xml')).toBe('xml');
        });

        it('names text that parses as a JSON object or array json', () => {
            expect(textExtension('{"a": [1, 2]}')).toBe('json');
            expect(textExtension(' [1, 2, 3] \n')).toBe('json');
            expect(textExtension('{"a":1}', 'application/octet-stream')).toBe('json');
        });

        it('names text that opens with a brace or bracket but does not parse txt', () => {
            expect(textExtension('{not json}')).toBe('txt');
            expect(textExtension('[1, 2')).toBe('txt');
            expect(textExtension('[WARN] disk almost full')).toBe('txt');
        });

        it('names plain text, empty text and a missing Content-Type txt', () => {
            expect(textExtension('hello')).toBe('txt');
            expect(textExtension('')).toBe('txt');
            expect(textExtension('hello', undefined)).toBe('txt');
        });
    });

    describe('contentFileName()', () => {
        const msg = (over: Partial<PayloadFileSource>): PayloadFileSource => ({
            id: '7', content: '', binary: false, msgProperties: {}, ...over,
        });
        const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        it('gives a map or a stream .bin, whatever its YAML text or HTTP Type says', () => {
            expect(contentFileName(msg({ sdt: { type: 'map' }, content: 'a: 1', bytes: new Uint8Array([1]) }))).toBe('solace-message-7.bin');
            expect(contentFileName(msg({ sdt: { type: 'stream' }, content: '- 1', msgProperties: { 'HTTP Type': 'application/json' } }))).toBe('solace-message-7.bin');
        });

        it('gives a recognised binary payload its kind\'s extension, whatever its HTTP Type says', () => {
            expect(contentFileName(msg({ binary: true, bytes: PNG }))).toBe('solace-message-7.png');
            expect(contentFileName(msg({ binary: true, bytes: PNG, msgProperties: { 'HTTP Type': 'text/plain' } }))).toBe('solace-message-7.png');
        });

        it('gives a binary payload no signature names .bin, and an executable too', () => {
            expect(contentFileName(msg({ binary: true, bytes: new Uint8Array([0x01, 0x02, 0x03]) }))).toBe('solace-message-7.bin');
            expect(contentFileName(msg({ binary: true, bytes: new Uint8Array([0x4D, 0x5A, 0x90, 0x00]) }))).toBe('solace-message-7.bin');
        });

        it('gives text the extension its HTTP Type lists, else what the text looks like', () => {
            expect(contentFileName(msg({ content: 'a,b', msgProperties: { 'HTTP Type': 'text/csv' } }))).toBe('solace-message-7.csv');
            expect(contentFileName(msg({ content: '{"a":1}' }))).toBe('solace-message-7.json');
            expect(contentFileName(msg({ content: 'hello' }))).toBe('solace-message-7.txt');
            expect(contentFileName(msg({ content: '' }))).toBe('solace-message-7.txt');
        });

        it('strips from the id everything but letters, digits, hyphen and underscore', () => {
            expect(contentFileName(msg({ id: 'msg/special:chars!', content: 'x' }))).toBe('solace-message-msgspecialchars.txt');
            expect(contentFileName(msg({ id: '../../etc/pa-ss_wd', content: 'x' }))).toBe('solace-message-etcpa-ss_wd.txt');
            expect(contentFileName(msg({ id: 'N/A', content: 'x' }))).toBe('solace-message-NA.txt');
        });
    });
});
