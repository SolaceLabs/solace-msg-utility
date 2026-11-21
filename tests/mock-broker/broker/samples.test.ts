// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PAYLOAD_SAMPLES } from '../../../src/mock-broker/broker/samples';
import { dumpStore, getQueue, listQueues, loadStore, seed } from '../../../src/mock-broker/broker/store';
import { QUEUE_STATE, resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { DEMO_TOPOLOGY } from '../../../src/mock-broker/gateway/seed';
import { DestinationType, MessageType, SDTFieldType } from '../../../src/mock-broker/sdk/enums';
import { MAX_PREVIEW_PIXELS, detectKind, imageSize } from '../../../src/modules/queue-browser/file-kind';
import { attachmentBytes, classifyAttachment, contentFileName, textExtension } from '../../../src/modules/queue-browser/payload';
import { decodeSdt, toYaml } from '../../../src/modules/queue-browser/sdt';

/**
 * The payload samples queue: one message of each kind Queue Browser's details
 * pane tells apart. Read here the way the module reads a browsed message, so a
 * sample that stopped being its kind (a signature lost, a header edited) fails.
 */
const enums = { SDTFieldType, DestinationType };
const sample = (name: string) => getQueue('default', 'demo/payload-samples')!.messages.find(m => m.msg.getCorrelationId() === name)!.msg;
const bytesOf = (name: string) => attachmentBytes(sample(name).getBinaryAttachment());

beforeEach(() => {
    resetScenario();
    seed();
});

afterEach(() => {
    setBrokers({});
    resetScenario();
    seed();
});

describe('mock-broker/broker/samples -- the queue', () => {
    it('is in the Direct demo, one message per sample in order, named by correlation id and user property', () => {
        expect(listQueues('default')).toContain('demo/payload-samples');
        const messages = getQueue('default', 'demo/payload-samples')!.messages;

        expect(messages.map(m => m.msg.getCorrelationId())).toEqual(PAYLOAD_SAMPLES.map(s => s.name));
        expect(messages.map(m => m.msg.getUserPropertyMap().getField('sample').getValue())).toEqual(PAYLOAD_SAMPLES.map(s => s.name));
        expect(messages.every(m => m.sizeBytes === m.msg.smfHeader.messageLength)).toBe(true);
        expect(new Set(messages.map(m => m.id)).size).toBe(messages.length);
    });

    it('is in the Provisioned demo too, on east-prod/orders where the operator and the viewer can browse it', () => {
        setBrokers(DEMO_TOPOLOGY);
        seed();

        expect(getQueue('orders', 'payload-samples')!.messages).toHaveLength(PAYLOAD_SAMPLES.length);
    });

    it('does not scale with the volume lever, and is empty when its state is empty', () => {
        scenario.volume = 0.25;
        seed();
        expect(getQueue('default', 'demo/payload-samples')!.messages).toHaveLength(PAYLOAD_SAMPLES.length);

        scenario.queueState.set('default/demo/payload-samples', QUEUE_STATE.EMPTY);
        seed();
        expect(getQueue('default', 'demo/payload-samples')!.messages).toHaveLength(0);
    });

    it('keeps its samples across the managed demo reload', () => {
        const before = getQueue('default', 'demo/payload-samples')!.messages.map(m => [m.msg.getBinaryAttachment(), m.msg._fields.sdt]);

        loadStore(JSON.parse(JSON.stringify(dumpStore())));

        expect(getQueue('default', 'demo/payload-samples')!.messages.map(m => [m.msg.getBinaryAttachment(), m.msg._fields.sdt])).toEqual(before);
    });
});

describe('mock-broker/broker/samples -- binary samples', () => {
    it.each([
        ['png-16x16', 'PNG image', 'image/png', 16, 16],
        ['jpeg-16x16', 'JPEG image', 'image/jpeg', 16, 16],
        ['gif-1x1', 'GIF image', 'image/gif', 1, 1],
        ['webp-16x16', 'WebP image', 'image/webp', 16, 16],
    ])('%s is a %s whose header declares %ix%i, within what the pane previews', (name, label, image, width, height) => {
        const kind = detectKind(bytesOf(name))!;

        expect(kind).toMatchObject({ label, image });
        expect(imageSize(bytesOf(name), kind.image!)).toEqual({ width, height });
        expect(classifyAttachment(bytesOf(name), sample(name).getHttpContentType()!).binary).toBe(true);
    });

    it('png-too-large declares more than the pane decodes, so the pane offers no Show content for it', () => {
        const size = imageSize(bytesOf('png-too-large'), 'image/png')!;

        expect(detectKind(bytesOf('png-too-large'))!.image).toBe('image/png');
        expect(size).toEqual({ width: 10000, height: 10000 });
        expect(size.width * size.height).toBeGreaterThan(MAX_PREVIEW_PIXELS);
    });

    it.each([
        ['pdf', 'PDF document', 'pdf'],
        ['gzip', 'gzip-compressed data (a .gz or .tgz file)', 'gz'],
        ['zip', 'ZIP archive', 'zip'],
        ['elf-header', 'ELF executable or library', 'bin'],
    ])('%s is named %s and offers hex, not a preview, and downloads as .%s', (name, label, ext) => {
        const kind = detectKind(bytesOf(name))!;
        const payload = classifyAttachment(bytesOf(name), sample(name).getHttpContentType()!);

        expect(kind.label).toBe(label);
        expect(kind.image).toBeUndefined();
        expect(payload.binary).toBe(true);
        expect(contentFileName({ id: '1', content: payload.content, bytes: payload.bytes, binary: true, msgProperties: {} })).toBe(`solace-message-1.${ext}`);
    });

    it('elf-header is exactly the 64-byte header', () => {
        expect(bytesOf('elf-header')).toHaveLength(64);
    });

    it('unknown-bytes matches no signature and is not text, so the pane offers hex and the download is .bin', () => {
        const bytes = bytesOf('unknown-bytes');

        expect(detectKind(bytes)).toBeNull();
        expect(classifyAttachment(bytes).binary).toBe(true);
    });
});

describe('mock-broker/broker/samples -- text samples', () => {
    it.each([['json-text', 'json'], ['xml-text', 'xml']])('%s is text, and a download suggests .%s', (name, ext) => {
        const msg = sample(name);
        const payload = classifyAttachment(attachmentBytes(msg.getBinaryAttachment()), msg.getHttpContentType() ?? undefined);

        expect(payload.binary).toBe(false);
        expect(textExtension(payload.content, msg.getHttpContentType() ?? undefined)).toBe(ext);
    });

    it('json-text carries the Content-Type that names it, xml-text has none so the text decides', () => {
        expect(sample('json-text').getHttpContentType()).toBe('application/json');
        expect(sample('xml-text').getHttpContentType()).toBeNull();
    });
});

describe('mock-broker/broker/samples -- SDT samples', () => {
    it('sdt-map decodes to every scalar kind, nested maps and streams, and a 64-bit value beyond 2^53', () => {
        const node = decodeSdt(sample('sdt-map').getSdtContainer(), enums);
        const yaml = toYaml(node);

        expect(sample('sdt-map').getType()).toBe(MessageType.MAP);
        expect(yaml).toContain('bigId: 9007199254740993');
        expect(yaml).toContain('bigUnsigned: 18446744073709551615');
        expect(yaml).toContain('ratio: 1.5');
        expect(yaml).toContain('whole: 3.0');
        expect(yaml).toContain('token: !!binary');
        expect(yaml).toContain('replyTo: { topic: orders/reply/uk }');
        expect(yaml).toContain('inbox: { queue: demo/payload-samples }');
        expect(yaml).toContain('note: null');
        expect(yaml).toMatch(/customer:\n {2}id: C-42\n {2}address:\n {4}city: Zurich/);
        expect(yaml).toMatch(/tags:\n {2}- rush\n {2}- gift/);
    });

    it('sdt-stream decodes to its items in order', () => {
        const node = decodeSdt(sample('sdt-stream').getSdtContainer(), enums);

        expect(sample('sdt-stream').getType()).toBe(MessageType.STREAM);
        expect(node).toEqual({
            type: 'stream',
            items: [
                { type: 'string', value: 'first' },
                { type: 'integer', value: 2 },
                { type: 'boolean', value: false },
                { type: 'float', value: 0.25 },
                { type: 'null' },
                { type: 'map', entries: [['k', { type: 'string', value: 'v' }]] },
                { type: 'stream', items: [{ type: 'integer', value: 1 }, { type: 'integer', value: 2 }] },
            ],
        });
    });

    it('both hold wire bytes for Download Content: the labelled stand-in, a .bin download', () => {
        for (const name of ['sdt-map', 'sdt-stream']) {
            const wire = new TextDecoder().decode(attachmentBytes(sample(name).getBinaryAttachment()));
            expect(wire).toContain('stand-in');
            expect(contentFileName({ id: '1', content: '', bytes: attachmentBytes(sample(name).getBinaryAttachment()), binary: false, sdt: {}, msgProperties: {} })).toBe('solace-message-1.bin');
        }
    });
});
