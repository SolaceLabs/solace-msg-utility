/**
 * A map or stream message's body (an SDT container: Solace's typed binary
 * encoding), decoded for reading. The message's own bytes stay as they came,
 * for Download Content and the ZIP; this is what the details pane shows (as
 * YAML) and what Download Full adds beside the raw bytes (as JSON). Pure: it
 * takes the SDK's container and the SDK's enums, and keeps no reference to
 * either. The payload flavor only.
 */
import { attachmentBytes, bytesToBase64 } from './payload.js';

/** One decoded SDT value. An integer beyond 2^53 is kept as its decimal text. */
export type SdtNode =
    | { type: 'map'; entries: [string, SdtNode][] }
    | { type: 'stream'; items: SdtNode[] }
    | { type: 'string'; value: string }
    | { type: 'integer'; value: number | string }
    | { type: 'float'; value: number }
    | { type: 'boolean'; value: boolean }
    | { type: 'bytes'; value: Uint8Array }
    | { type: 'destination'; kind: 'topic' | 'queue'; name: string }
    | { type: 'null' }
    | { type: 'unsupported'; name: string };

/** The parts of the SDK's namespace the decoder reads. */
export interface SdtEnums {
    SDTFieldType: Record<string, number>;
    DestinationType: Record<string, number>;
}

const INTEGER_TYPES = ['INT8', 'INT16', 'INT32', 'INT64', 'UINT8', 'UINT16', 'UINT32', 'UINT64'];

/** A 64-bit value arrives as a number or as the SDK's Long; either way, a number while it is exact. */
function integer(value: unknown): number | string {
    const n = typeof value === 'number' ? value : Number(String(value));
    return Number.isSafeInteger(n) ? n : String(value);
}

/**
 * Decode an SDT field (the message's container, or a field inside it) into
 * an SdtNode. A field type the decoder does not know is kept as `unsupported`
 * with the SDK's name for it, so the rest of the container still shows.
 */
export function decodeSdt(field: any, enums: SdtEnums): SdtNode {
    const T = enums.SDTFieldType;
    const type: number = field.getType();
    const name = Object.keys(T).find(k => T[k] === type) ?? String(type);
    const value = field.getValue();
    if (type === T.MAP) {
        return { type: 'map', entries: value.getKeys().map((key: string): [string, SdtNode] => [key, decodeSdt(value.getField(key), enums)]) };
    }
    if (type === T.STREAM) {
        // Reading a stream moves its cursor: rewind it before and after, so a
        // later reader (a forward of this message) starts at the beginning.
        const items: SdtNode[] = [];
        value.rewind();
        while (value.hasNext()) items.push(decodeSdt(value.getNext(), enums));
        value.rewind();
        return { type: 'stream', items };
    }
    if (name === 'STRING' || name === 'WCHAR') return { type: 'string', value: String(value) };
    if (name === 'BOOL') return { type: 'boolean', value: Boolean(value) };
    if (INTEGER_TYPES.includes(name)) return { type: 'integer', value: integer(value) };
    if (name === 'FLOATTYPE' || name === 'DOUBLETYPE') return { type: 'float', value: Number(value) };
    if (name === 'BYTEARRAY') return { type: 'bytes', value: attachmentBytes(value) };
    if (name === 'NULLTYPE') return { type: 'null' };
    if (name === 'DESTINATION') {
        return { type: 'destination', kind: value.getType() === enums.DestinationType.TOPIC ? 'topic' : 'queue', name: value.getName() };
    }
    return { type: 'unsupported', name };
}

/** YAML 1.2 words a plain scalar must not be, or it would read as another type. */
const RESERVED = /^(?:~|null|true|false|yes|no|on|off|y|n)$/i;

/**
 * A string as a YAML scalar: plain when it is a simple word or phrase that
 * cannot read as anything else, otherwise double-quoted. A JSON string is a
 * valid YAML double-quoted scalar, escapes included.
 */
function yamlString(s: string): string {
    return /^[A-Za-z_][A-Za-z0-9 _./-]*$/.test(s) && !s.endsWith(' ') && !RESERVED.test(s) ? s : JSON.stringify(s);
}

/** A value that fits on its key's line: a scalar, or an empty map or stream. */
function inline(node: SdtNode): string {
    switch (node.type) {
        case 'map': return '{}';
        case 'stream': return '[]';
        case 'string': return yamlString(node.value);
        case 'integer': return String(node.value);
        case 'float': {
            const v = node.value;
            if (Number.isNaN(v)) return '.nan';
            if (!Number.isFinite(v)) return v > 0 ? '.inf' : '-.inf';
            // A whole float keeps a decimal point, so it does not read as an integer.
            return Number.isInteger(v) && Math.abs(v) < 1e21 ? `${v}.0` : String(v);
        }
        case 'boolean': return String(node.value);
        case 'bytes': return `!!binary ${node.value.length ? bytesToBase64(node.value) : '""'}`;
        case 'destination': return `{ ${node.kind}: ${yamlString(node.name)} }`;
        case 'null': return 'null';
        case 'unsupported': return `null # a field of type ${node.name}, not shown`;
    }
}

const hasChildren = (node: SdtNode) => (node.type === 'map' && node.entries.length > 0) || (node.type === 'stream' && node.items.length > 0);

function block(node: SdtNode, pad: string): string[] {
    const entry = (head: string, v: SdtNode) => (hasChildren(v) ? [head, ...block(v, `${pad}  `)] : [`${head} ${inline(v)}`]);
    if (node.type === 'map' && node.entries.length) return node.entries.flatMap(([k, v]) => entry(`${pad}${yamlString(k)}:`, v));
    if (node.type === 'stream' && node.items.length) return node.items.flatMap(v => entry(`${pad}-`, v));
    return [`${pad}${inline(node)}`];
}

/**
 * The value as YAML, for the details pane and Copy Content: a map as
 * `key: value` lines, a stream as `- value` lines, nested ones indented by
 * two spaces; bytes as `!!binary` base64, a destination as `{ topic: name }`.
 */
export function toYaml(node: SdtNode): string {
    return block(node, '').join('\n');
}

/**
 * The value as plain JSON, for Download Full beside the raw bytes: a map as
 * an object, a stream as an array, bytes as `{ "base64": ... }`, a
 * destination as `{ "topic": name }`, and a number JSON cannot hold (an exact
 * 64-bit integer, NaN, an infinity) as its text.
 */
export function toJsonValue(node: SdtNode): unknown {
    switch (node.type) {
        case 'map': return Object.fromEntries(node.entries.map(([k, v]) => [k, toJsonValue(v)]));
        case 'stream': return node.items.map(toJsonValue);
        case 'float': return Number.isFinite(node.value) ? node.value : String(node.value);
        case 'bytes': return { base64: bytesToBase64(node.value) };
        case 'destination': return { [node.kind]: node.name };
        case 'null': return null;
        case 'unsupported': return { unsupported: node.name };
        default: return node.value;
    }
}
