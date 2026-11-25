// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decodeSdt, toYaml, toJsonValue, type SdtNode, type SdtEnums } from '../../../src/modules/queue-browser/sdt';

// The SDK's enums, in the shape decodeSdt reads. Values are arbitrary but distinct.
const enums: SdtEnums = {
    SDTFieldType: {
        STRING: 0, MAP: 1, STREAM: 2, BOOL: 3,
        INT8: 4, INT16: 5, INT32: 6, INT64: 7,
        UINT8: 8, UINT16: 9, UINT32: 10, UINT64: 11,
        FLOATTYPE: 12, DOUBLETYPE: 13, BYTEARRAY: 14, DESTINATION: 15,
        NULLTYPE: 16, WCHAR: 17, UNKNOWN: 18,
    },
    DestinationType: { TOPIC: 0, QUEUE: 1 },
};
const T = enums.SDTFieldType;

/** A fake SDK field: what decodeSdt calls on a field. */
const field = (type: number, value: unknown) => ({ getType: () => type, getValue: () => value });

const map = (entries: [string, ReturnType<typeof field>][]) => {
    const fields = new Map(entries);
    return field(T.MAP, { getKeys: () => [...fields.keys()], getField: (k: string) => fields.get(k) });
};

/** A fake SDK stream with a cursor; `start` puts the cursor mid-stream, as a reader before us would leave it. */
const stream = (items: ReturnType<typeof field>[], start = 0) => {
    const s = { at: start, rewinds: 0 };
    const value = {
        rewind: () => { s.at = 0; s.rewinds++; },
        hasNext: () => s.at < items.length,
        getNext: () => items[s.at++],
    };
    return { field: field(T.STREAM, value), cursor: s, value };
};

describe('queue-browser/sdt', () => {
    describe('decodeSdt()', () => {
        it('decodes strings, wide characters and booleans', () => {
            expect(decodeSdt(field(T.STRING, 'abc'), enums)).toEqual({ type: 'string', value: 'abc' });
            expect(decodeSdt(field(T.WCHAR, 'x'), enums)).toEqual({ type: 'string', value: 'x' });
            expect(decodeSdt(field(T.BOOL, true), enums)).toEqual({ type: 'boolean', value: true });
            expect(decodeSdt(field(T.BOOL, false), enums)).toEqual({ type: 'boolean', value: false });
        });

        it.each(['INT8', 'INT16', 'INT32', 'INT64', 'UINT8', 'UINT16', 'UINT32', 'UINT64'])('decodes %s as an integer', name => {
            expect(decodeSdt(field(T[name], 42), enums)).toEqual({ type: 'integer', value: 42 });
        });

        it('keeps a 64-bit value beyond 2^53 as its decimal text, and a safe one as a number, whether it arrives as a number or as an object', () => {
            const long = (text: string) => ({ toString: () => text });
            expect(decodeSdt(field(T.INT64, long('9223372036854775807')), enums)).toEqual({ type: 'integer', value: '9223372036854775807' });
            expect(decodeSdt(field(T.UINT64, long('18446744073709551615')), enums)).toEqual({ type: 'integer', value: '18446744073709551615' });
            expect(decodeSdt(field(T.INT64, long('-9007199254740993')), enums)).toEqual({ type: 'integer', value: '-9007199254740993' });
            expect(decodeSdt(field(T.INT64, long('9007199254740992')), enums)).toEqual({ type: 'integer', value: '9007199254740992' });
            expect(decodeSdt(field(T.INT64, long('9007199254740991')), enums)).toEqual({ type: 'integer', value: 9007199254740991 });
            expect(decodeSdt(field(T.INT64, long('12345678901')), enums)).toEqual({ type: 'integer', value: 12345678901 });
            expect(decodeSdt(field(T.INT64, long('-7')), enums)).toEqual({ type: 'integer', value: -7 });
            expect(decodeSdt(field(T.INT64, 2 ** 60), enums)).toEqual({ type: 'integer', value: String(2 ** 60) });
        });

        it('decodes floats and doubles as numbers', () => {
            expect(decodeSdt(field(T.FLOATTYPE, 1.5), enums)).toEqual({ type: 'float', value: 1.5 });
            expect(decodeSdt(field(T.DOUBLETYPE, 2.25), enums)).toEqual({ type: 'float', value: 2.25 });
            expect(decodeSdt(field(T.DOUBLETYPE, NaN), enums)).toEqual({ type: 'float', value: NaN });
        });

        it('decodes a byte array given as a Latin-1 string into the original bytes', () => {
            const node = decodeSdt(field(T.BYTEARRAY, '\x00\x7f\x80\xff'), enums);
            expect(node.type).toBe('bytes');
            expect(Array.from((node as { value: Uint8Array }).value)).toEqual([0x00, 0x7F, 0x80, 0xFF]);
        });

        it('keeps a byte array given as a Uint8Array', () => {
            const raw = new Uint8Array([1, 2, 3]);
            expect(decodeSdt(field(T.BYTEARRAY, raw), enums)).toEqual({ type: 'bytes', value: raw });
        });

        it('decodes a null field', () => {
            expect(decodeSdt(field(T.NULLTYPE, null), enums)).toEqual({ type: 'null' });
        });

        it('decodes a topic and a queue destination', () => {
            const dest = (type: number, name: string) => field(T.DESTINATION, { getType: () => type, getName: () => name });
            expect(decodeSdt(dest(enums.DestinationType.TOPIC, 'orders/new'), enums)).toEqual({ type: 'destination', kind: 'topic', name: 'orders/new' });
            expect(decodeSdt(dest(enums.DestinationType.QUEUE, 'q.orders'), enums)).toEqual({ type: 'destination', kind: 'queue', name: 'q.orders' });
        });

        it('keeps a field type it does not know as unsupported, named by the SDK enum', () => {
            expect(decodeSdt(field(T.UNKNOWN, undefined), enums)).toEqual({ type: 'unsupported', name: 'UNKNOWN' });
        });

        it('names a type the enum does not list by its number', () => {
            expect(decodeSdt(field(77, undefined), enums)).toEqual({ type: 'unsupported', name: '77' });
        });

        it('decodes a map in key order, nested maps and streams included, and an empty map', () => {
            const node = decodeSdt(map([
                ['b', field(T.INT32, 2)],
                ['a', map([['inner', field(T.STRING, 'x')]])],
                ['list', stream([field(T.BOOL, true), map([])]).field],
                ['empty', map([])],
            ]), enums);
            expect(node).toEqual({
                type: 'map',
                entries: [
                    ['b', { type: 'integer', value: 2 }],
                    ['a', { type: 'map', entries: [['inner', { type: 'string', value: 'x' }]] }],
                    ['list', { type: 'stream', items: [{ type: 'boolean', value: true }, { type: 'map', entries: [] }] }],
                    ['empty', { type: 'map', entries: [] }],
                ],
            });
        });

        it('decodes a stream in order, an empty one included', () => {
            expect(decodeSdt(stream([field(T.STRING, 'a'), field(T.INT8, 1)]).field, enums))
                .toEqual({ type: 'stream', items: [{ type: 'string', value: 'a' }, { type: 'integer', value: 1 }] });
            expect(decodeSdt(stream([]).field, enums)).toEqual({ type: 'stream', items: [] });
        });

        it('rewinds a stream before reading it, so a stream a reader left half-read still decodes whole', () => {
            const s = stream([field(T.INT8, 1), field(T.INT8, 2), field(T.INT8, 3)], 2);
            expect(decodeSdt(s.field, enums)).toEqual({
                type: 'stream',
                items: [{ type: 'integer', value: 1 }, { type: 'integer', value: 2 }, { type: 'integer', value: 3 }],
            });
        });

        it('rewinds a stream after reading it, so a later reader (a forward) starts at the first item', () => {
            const s = stream([field(T.INT8, 1), field(T.INT8, 2)]);
            decodeSdt(s.field, enums);
            expect(s.cursor.rewinds).toBe(2);
            expect(s.cursor.at).toBe(0);
            expect(s.value.getNext().getValue()).toBe(1);
        });
    });

    describe('toYaml()', () => {
        const bytes = (...b: number[]): SdtNode => ({ type: 'bytes', value: Uint8Array.from(b) });
        const str = (value: string): SdtNode => ({ type: 'string', value });
        const int = (value: number | string): SdtNode => ({ type: 'integer', value });
        const flt = (value: number): SdtNode => ({ type: 'float', value });
        const bool = (value: boolean): SdtNode => ({ type: 'boolean', value });
        const mapOf = (...entries: [string, SdtNode][]): SdtNode => ({ type: 'map', entries });
        const streamOf = (...items: SdtNode[]): SdtNode => ({ type: 'stream', items });

        it('writes a nested map, stream and every scalar kind as indented YAML', () => {
            const node = mapOf(
                ['name', str('hello world')],
                ['count', int(3)],
                ['big', int('9223372036854775807')],
                ['ratio', flt(0.5)],
                ['whole', flt(3)],
                ['ok', bool(true)],
                ['blob', bytes(1, 2, 3)],
                ['none', bytes()],
                ['to', { type: 'destination', kind: 'topic', name: 'orders/new' }],
                ['reply', { type: 'destination', kind: 'queue', name: 'q1' }],
                ['nothing', { type: 'null' }],
                ['odd', { type: 'unsupported', name: 'UNKNOWN' }],
                ['emptyMap', mapOf()],
                ['emptyList', streamOf()],
                ['rows', streamOf(
                    str('a'),
                    mapOf(['id', int(1)], ['tags', streamOf(mapOf(['deep', bool(false)]))]),
                    streamOf(int(1), int(2)),
                )],
            );
            expect(toYaml(node)).toBe([
                'name: hello world',
                'count: 3',
                'big: 9223372036854775807',
                'ratio: 0.5',
                'whole: 3.0',
                'ok: true',
                'blob: !!binary AQID',
                'none: !!binary ""',
                'to: { topic: orders/new }',
                'reply: { queue: q1 }',
                'nothing: null',
                'odd: null # a field of type UNKNOWN, not shown',
                'emptyMap: {}',
                'emptyList: []',
                'rows:',
                '  - a',
                '  -',
                '    id: 1',
                '    tags:',
                '      -',
                '        deep: false',
                '  -',
                '    - 1',
                '    - 2',
            ].join('\n'));
        });

        it('writes a top-level stream of scalars as a list', () => {
            expect(toYaml(streamOf(int(1), str('two'), flt(3.5)))).toBe('- 1\n- two\n- 3.5');
        });

        it.each([
            ['hello', 'hello'],
            ['hello world', 'hello world'],
            ['a.b/c-d_e', 'a.b/c-d_e'],
            ['_x', '_x'],
            ['nullable', 'nullable'],
            ['a - b', 'a - b'],
            ['true', '"true"'],
            ['False', '"False"'],
            ['NULL', '"NULL"'],
            ['Yes', '"Yes"'],
            ['off', '"off"'],
            ['n', '"n"'],
            ['~', '"~"'],
            ['123', '"123"'],
            ['1abc', '"1abc"'],
            ['-dash', '"-dash"'],
            ['a: b', '"a: b"'],
            ['a#b', '"a#b"'],
            ['trailing ', '"trailing "'],
            ['', '""'],
            ['line\nbreak', '"line\\nbreak"'],
            ['say "hi"', '"say \\"hi\\""'],
            ['caf\u00e9', '"caf\u00e9"'],
        ])('writes the string %j as %s', (value, yaml) => {
            expect(toYaml(str(value))).toBe(yaml);
        });

        it('quotes a key by the same rule', () => {
            expect(toYaml(mapOf(['on', int(1)], ['a b', int(2)], ['x:y', int(3)], ['9', int(4)])))
                .toBe('"on": 1\na b: 2\n"x:y": 3\n"9": 4');
        });

        it('quotes a destination name by the same rule', () => {
            expect(toYaml({ type: 'destination', kind: 'topic', name: 'a: b' })).toBe('{ topic: "a: b" }');
        });

        it.each([
            [NaN, '.nan'],
            [Infinity, '.inf'],
            [-Infinity, '-.inf'],
            [3, '3.0'],
            [-2, '-2.0'],
            [0, '0.0'],
            [1.5, '1.5'],
            [1e21, '1e+21'],
            [1.5e-7, '1.5e-7'],
        ])('writes the float %s as %s', (value, yaml) => {
            expect(toYaml(flt(value))).toBe(yaml);
        });

        it('writes a top-level scalar, empty container and empty bytes on one line', () => {
            expect(toYaml(int(7))).toBe('7');
            expect(toYaml(mapOf())).toBe('{}');
            expect(toYaml(streamOf())).toBe('[]');
            expect(toYaml(bytes())).toBe('!!binary ""');
            expect(toYaml({ type: 'null' })).toBe('null');
        });
    });

    describe('toJsonValue()', () => {
        it('turns a map into an object and a stream into an array, nested', () => {
            const node: SdtNode = {
                type: 'map',
                entries: [
                    ['a', { type: 'integer', value: 1 }],
                    ['list', { type: 'stream', items: [{ type: 'string', value: 'x' }, { type: 'map', entries: [['k', { type: 'boolean', value: true }]] }] }],
                    ['empty', { type: 'map', entries: [] }],
                ],
            };
            expect(toJsonValue(node)).toEqual({ a: 1, list: ['x', { k: true }], empty: {} });
        });

        it('keeps strings, numbers (an exact 64-bit integer as its text), booleans and null as they are', () => {
            expect(toJsonValue({ type: 'string', value: 'x' })).toBe('x');
            expect(toJsonValue({ type: 'integer', value: 5 })).toBe(5);
            expect(toJsonValue({ type: 'integer', value: '9223372036854775807' })).toBe('9223372036854775807');
            expect(toJsonValue({ type: 'float', value: 1.5 })).toBe(1.5);
            expect(toJsonValue({ type: 'boolean', value: false })).toBe(false);
            expect(toJsonValue({ type: 'null' })).toBeNull();
        });

        it('writes NaN and the infinities as their text, which JSON cannot hold', () => {
            expect(toJsonValue({ type: 'float', value: NaN })).toBe('NaN');
            expect(toJsonValue({ type: 'float', value: Infinity })).toBe('Infinity');
            expect(toJsonValue({ type: 'float', value: -Infinity })).toBe('-Infinity');
        });

        it('writes bytes as base64, a destination by its kind, and an unsupported field by its name', () => {
            expect(toJsonValue({ type: 'bytes', value: Uint8Array.from([1, 2, 3]) })).toEqual({ base64: 'AQID' });
            expect(toJsonValue({ type: 'bytes', value: new Uint8Array(0) })).toEqual({ base64: '' });
            expect(toJsonValue({ type: 'destination', kind: 'topic', name: 'a/b' })).toEqual({ topic: 'a/b' });
            expect(toJsonValue({ type: 'destination', kind: 'queue', name: 'q' })).toEqual({ queue: 'q' });
            expect(toJsonValue({ type: 'unsupported', name: 'UNKNOWN' })).toEqual({ unsupported: 'UNKNOWN' });
        });
    });
});
