// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SDT_WIRE_HEADER, createMessage, sdtField, type SdtBody } from '../../../src/mock-broker/sdk/message';
import { DestinationType, MessageType, SDTFieldType } from '../../../src/mock-broker/sdk/enums';
import { decodeSdt, toYaml } from '../../../src/modules/queue-browser/sdt';
import { attachmentBytes } from '../../../src/modules/queue-browser/payload';

/**
 * A map or stream message in the demo: the SDK's container stand-in read the
 * way Queue Browser reads it (decodeSdt), the labelled stand-in for its wire
 * bytes, and a container surviving the publisher's copy (setSdtContainer).
 */
const enums = { SDTFieldType, DestinationType };

const BODY: SdtBody = {
    type: 'map',
    entries: [
        ['name', { type: 'string', value: 'Demo' }],
        ['paid', { type: 'bool', value: true }],
        ['small', { type: 'int8', value: -5 }],
        ['count', { type: 'uint32', value: 7 }],
        ['bigId', { type: 'int64', value: '9007199254740993' }],
        ['safe64', { type: 'uint64', value: 42 }],
        ['ratio', { type: 'float', value: 1.5 }],
        ['total', { type: 'double', value: 3 }],
        ['token', { type: 'bytes', value: 'DE\x00\xFF' }],
        ['reply', { type: 'destination', kind: 'topic', name: 'a/b' }],
        ['inbox', { type: 'destination', kind: 'queue', name: 'q1' }],
        ['none', { type: 'null' }],
        ['inner', { type: 'map', entries: [['tags', { type: 'stream', items: [{ type: 'string', value: 'x' }, { type: 'int16', value: 2 }] }]] }],
    ],
};

describe('mock-broker/sdk/message -- SDT container stand-in', () => {
    it('is read by the real decodeSdt as the SDK container would be, every scalar kind and the nesting included', () => {
        const container = createMessage({ sdt: BODY }).getSdtContainer();

        const node = decodeSdt(container, enums);

        expect(node).toEqual({
            type: 'map',
            entries: [
                ['name', { type: 'string', value: 'Demo' }],
                ['paid', { type: 'boolean', value: true }],
                ['small', { type: 'integer', value: -5 }],
                ['count', { type: 'integer', value: 7 }],
                ['bigId', { type: 'integer', value: '9007199254740993' }],   // beyond 2^53: kept as its decimal text
                ['safe64', { type: 'integer', value: 42 }],                  // a 64-bit value within 2^53 reads as a number
                ['ratio', { type: 'float', value: 1.5 }],
                ['total', { type: 'float', value: 3 }],
                ['token', { type: 'bytes', value: Uint8Array.from([0x44, 0x45, 0x00, 0xFF]) }],
                ['reply', { type: 'destination', kind: 'topic', name: 'a/b' }],
                ['inbox', { type: 'destination', kind: 'queue', name: 'q1' }],
                ['none', { type: 'null' }],
                ['inner', { type: 'map', entries: [['tags', { type: 'stream', items: [{ type: 'string', value: 'x' }, { type: 'integer', value: 2 }] }]] }],
            ],
        });
        expect(toYaml(node)).toContain('bigId: 9007199254740993');
    });

    it('leaves a stream at its start after a read, so a forward of the message reads it whole', () => {
        const stream: SdtBody = { type: 'stream', items: [{ type: 'string', value: 'a' }, { type: 'string', value: 'b' }] };
        const field = sdtField(stream);

        const first = decodeSdt(field, enums);
        const second = decodeSdt(field, enums);

        expect(first).toEqual({ type: 'stream', items: [{ type: 'string', value: 'a' }, { type: 'string', value: 'b' }] });
        expect(second).toEqual(first);
    });

    it('answers a key the map does not hold with undefined, as the SDK does', () => {
        const map = sdtField(BODY).getValue();
        expect(map.getKeys()).toContain('name');
        expect(map.getField('missing')).toBeUndefined();
    });

    it('is null without a body, and the message type follows the body', () => {
        expect(createMessage({ payload: 'x' }).getSdtContainer()).toBeNull();
        expect(createMessage({ payload: 'x' }).getType()).toBe(MessageType.BINARY);
        expect(createMessage({ sdt: BODY }).getType()).toBe(MessageType.MAP);
        expect(createMessage({ sdt: { type: 'stream', items: [] } }).getType()).toBe(MessageType.STREAM);
    });
});

describe('mock-broker/sdk/message -- SDT wire bytes', () => {
    it('are a labelled stand-in, the header then the body as JSON, and win over an authored payload', () => {
        const msg = createMessage({ sdt: BODY, payload: 'ignored' });
        const wire = new TextDecoder().decode(attachmentBytes(msg.getBinaryAttachment()));

        expect(wire.startsWith(SDT_WIRE_HEADER)).toBe(true);
        expect(SDT_WIRE_HEADER).toContain('stand-in');
        expect(JSON.parse(wire.slice(SDT_WIRE_HEADER.length))).toEqual(BODY);
    });

    it('size the message: messageLength is the wire bytes plus the header allowance, UTF-8 counted in bytes', () => {
        const body: SdtBody = { type: 'map', entries: [['city', { type: 'string', value: 'Z\u00FCrich' }]] };
        const msg = createMessage({ sdt: body });

        const bytes = attachmentBytes(msg.getBinaryAttachment());

        expect(bytes.length).toBe(new TextEncoder().encode(SDT_WIRE_HEADER + JSON.stringify(body)).length);
        expect(msg.smfHeader.messageLength).toBe(bytes.length + 120);
    });

    it('survive a reload of the stored fields: the body is JSON-safe', () => {
        const stored = JSON.parse(JSON.stringify(createMessage({ sdt: BODY })._fields));
        const reloaded = createMessage(stored);

        expect(decodeSdt(reloaded.getSdtContainer(), enums)).toEqual(decodeSdt(createMessage({ sdt: BODY }).getSdtContainer(), enums));
        expect(reloaded.getBinaryAttachment()).toBe(createMessage({ sdt: BODY }).getBinaryAttachment());
    });
});

describe('mock-broker/sdk/message -- setSdtContainer', () => {
    it('stores a container taken from another message as the same map, and resizes the message', () => {
        const source = createMessage({ sdt: BODY });
        const copy = createMessage({ payload: 'old text' });

        copy.setSdtContainer(source.getSdtContainer());

        expect(copy._fields.sdt).toEqual(BODY);
        expect(copy._fields.payload).toBeUndefined();
        expect(copy.getType()).toBe(MessageType.MAP);
        expect(copy.getBinaryAttachment()).toBe(source.getBinaryAttachment());
        expect(copy.smfHeader.messageLength).toBe(source.smfHeader.messageLength);
    });

    it('takes a container built the way the SDK builds one: a Long for a 64-bit value, a Uint8Array for bytes', () => {
        const long = (text: string) => ({ toString: () => text });
        const field = (type: number, value: unknown) => ({ getType: () => type, getValue: () => value });
        const T = SDTFieldType;
        const fields: Record<string, ReturnType<typeof field>> = {
            s: field(T.STRING, 'v'), b: field(T.BOOL, 1), i: field(T.INT32, 9), w: field(T.INT64, long('9007199254740993')),
            e: field(T.UINT64, long('5')), f: field(T.DOUBLETYPE, 0.5), y: field(T.BYTEARRAY, Uint8Array.from([1, 255])),
            d: field(T.DESTINATION, { getType: () => DestinationType.QUEUE, getName: () => 'q' }), n: field(T.NULLTYPE, null),
        };
        const container = { getKeys: () => Object.keys(fields), getField: (k: string) => fields[k] };

        const msg = createMessage().setSdtContainer(field(T.MAP, container));

        expect(msg._fields.sdt).toEqual({
            type: 'map',
            entries: [
                ['s', { type: 'string', value: 'v' }], ['b', { type: 'bool', value: true }], ['i', { type: 'int32', value: 9 }],
                ['w', { type: 'int64', value: '9007199254740993' }], ['e', { type: 'uint64', value: 5 }],
                ['f', { type: 'double', value: 0.5 }], ['y', { type: 'bytes', value: '\x01\xFF' }],
                ['d', { type: 'destination', kind: 'queue', name: 'q' }], ['n', { type: 'null' }],
            ],
        });
    });

    it('refuses a field type the demo does not hold, naming it, and leaves the message as it was', () => {
        const msg = createMessage({ payload: 'keep' });

        expect(() => msg.setSdtContainer({ getType: () => SDTFieldType.UNKNOWN, getValue: () => null })).toThrow(/type 17 is not supported/);
        expect(msg._fields.sdt).toBeUndefined();
    });

    it('is dropped by a later setBinaryAttachment, which wins', () => {
        const msg = createMessage({ sdt: BODY });

        msg.setBinaryAttachment('plain');

        expect(msg.getSdtContainer()).toBeNull();
        expect(msg.getBinaryAttachment()).toBe('plain');
        expect(msg.smfHeader.messageLength).toBe(5 + 120);
    });
});
