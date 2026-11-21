/**
 * A Solace `Message` stand-in, backed by a plain record so values genuinely
 * round-trip: what the publisher copies onto a cloned message is what the
 * destination queue later hands back to the browser.
 *
 * Fidelity notes:
 * - `smfHeader.messageLength` is read as a raw property by `service-events.ts`
 *   and `service-verify.ts`, not through a getter. Without it every message
 *   sizes as 0 bytes.
 * - Setters return `this` so the publisher's chained `safeSet` calls behave.
 * - Payload bytes: real SDK under the `version10` profile hands back the binary
 *   attachment as a Latin-1 string, one char per byte, and takes either such a
 *   string or a Uint8Array on `setBinaryAttachment()`. Fixtures stay authored
 *   as plain text in `payload`; `getBinaryAttachment()` encodes it to its UTF-8
 *   bytes once, here at the edge. A published or binary-seeded payload lives as
 *   a byte string in `payloadBytes` (JSON-safe for the managed demo's reloads)
 *   and wins over `payload`. `getXmlContent()`/`setXmlContent()` stay a plain
 *   string stored as given: the real SDK's raw XML is a byte string too, so the
 *   demo does not model UTF-8 XML as mojibake.
 * - `getSdtContainer()` returns null unless the message holds an `sdt` body (a
 *   map or stream, written as plain JSON-able data, see `SdtBody`); then it
 *   returns a stand-in for the SDK's SDTField (`getType`, `getValue`; a map's
 *   `getKeys`/`getField`; a stream's `hasNext`/`getNext`/`rewind`). Without a
 *   body the publisher's first-match-wins content chain (`setSdtContainer ||
 *   setXmlContent || setBinaryAttachment`) falls through to the binary
 *   attachment, the path real browsed messages take. `setSdtContainer` converts
 *   whatever container it is handed (this stand-in or the SDK's own) back to an
 *   `SdtBody`, so a copy or forward keeps a map a map.
 * - The wire bytes of an SDT message are NOT Solace's SDT encoding, which the
 *   demo cannot produce: `getBinaryAttachment()` returns a labelled stand-in,
 *   `SDT_WIRE_HEADER` followed by the body's JSON (UTF-8, one char per byte), so
 *   Download Content and the size have something real to save and count. The
 *   body wins over `payload`/`payloadBytes`; setting an attachment drops it.
 *   Non-finite floats are not representable in the JSON-safe body.
 *
 * Mock-only.
 */
import { DestinationType, MessageDeliveryModeType, MessageType, SDTFieldType } from './enums';

/** A byte string (one char per byte, as the SDK's version10 profile returns) from bytes. */
export function bytesToLatin1(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

/** The byte string a payload's text encodes to: its UTF-8 bytes, one char each. */
function textToLatin1(text: string): string {
    return bytesToLatin1(new TextEncoder().encode(text));
}

/** First line of an SDT message's stand-in wire bytes; the body's JSON follows it. */
export const SDT_WIRE_HEADER = 'SDT demo stand-in (not the Solace SDT encoding)\n';

/**
 * A map or stream body (or a value inside one) as plain JSON-able data. The
 * integer kinds carry a number, or a decimal string when the value is beyond
 * 2^53 (the real SDK hands such a 64-bit value back as a Long); `bytes` is a
 * byte string (one char per byte).
 */
export type SdtBody =
    | { type: 'map'; entries: [string, SdtBody][] }
    | { type: 'stream'; items: SdtBody[] }
    | { type: 'string'; value: string }
    | { type: 'bool'; value: boolean }
    | { type: 'int8' | 'int16' | 'int32' | 'int64' | 'uint8' | 'uint16' | 'uint32' | 'uint64'; value: number | string }
    | { type: 'float' | 'double'; value: number }
    | { type: 'bytes'; value: string }
    | { type: 'destination'; kind: 'topic' | 'queue'; name: string }
    | { type: 'null' };

export interface MockDestination {
    getName(): string;
    getType(): number;
}

export function createDestination(name: string, type: number): MockDestination {
    return { getName: () => name, getType: () => type };
}

/** Field bag a message carries. Everything is optional — absent means unset. */
export interface MessageFields {
    /** Authored payload text; the SDK edge hands out its UTF-8 bytes. Ignored when `payloadBytes` is set. */
    payload?: string;
    /** Payload as a byte string (one char per byte, all <= 0xFF): a published or binary-seeded attachment. */
    payloadBytes?: string;
    /** A map or stream body; wins over `payload` and `payloadBytes`. Its wire bytes are a stand-in (see the file note). */
    sdt?: SdtBody;
    destination?: MockDestination;
    guaranteedMessageId?: string;
    deliveryMode?: number;
    applicationMessageId?: string;
    applicationMessageType?: string;
    correlationId?: string;
    correlationKey?: any;
    senderId?: string;
    senderTimestamp?: number;
    sequenceNumber?: number;
    priority?: number;
    timeToLive?: number;
    deliveryCount?: number;
    httpContentType?: string;
    httpContentEncoding?: string;
    replyTo?: MockDestination;
    userProperties?: Record<string, string>;
    redelivered?: boolean;
    dmqEligible?: boolean;
    elidingEligible?: boolean;
    replyMessage?: boolean;
    discardIndication?: boolean;
    deliverToOne?: boolean;
    acknowledgeImmediately?: boolean;
    xmlContent?: string;
    userData?: string;
    userCos?: number;
    xmlMetadata?: string;
    gmExpiration?: number;
    topicSequenceNumber?: number;
    cacheRequestId?: string;
}

export interface MockMessage {
    [key: string]: any;
    _fields: MessageFields;
    smfHeader: { messageLength: number };
}

/** SDT body type -> the SDK's field type, and back. */
const FIELD_TYPE: Record<SdtBody['type'], number> = {
    map: SDTFieldType.MAP, stream: SDTFieldType.STREAM, string: SDTFieldType.STRING, bool: SDTFieldType.BOOL,
    int8: SDTFieldType.INT8, int16: SDTFieldType.INT16, int32: SDTFieldType.INT32, int64: SDTFieldType.INT64,
    uint8: SDTFieldType.UINT8, uint16: SDTFieldType.UINT16, uint32: SDTFieldType.UINT32, uint64: SDTFieldType.UINT64,
    float: SDTFieldType.FLOATTYPE, double: SDTFieldType.DOUBLETYPE, bytes: SDTFieldType.BYTEARRAY,
    destination: SDTFieldType.DESTINATION, null: SDTFieldType.NULLTYPE,
};
const BODY_TYPE = new Map(Object.entries(FIELD_TYPE).map(([name, n]): [number, SdtBody['type']] => [n, name as SdtBody['type']]));

/** A 64-bit value as the SDK returns it: a number while exact, else a Long-like object whose text is the decimal. */
function wideValue(v: number | string): number | { toString(): string } {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : { toString: () => String(v) };
}

/** The SDK's SDTField for a body: `getType()`, `getValue()` (a map or stream container for those two). */
export function sdtField(body: SdtBody): { getType(): number; getValue(): any } {
    const getType = () => FIELD_TYPE[body.type];
    switch (body.type) {
        case 'map': {
            const fields = new Map(body.entries);
            const container = {
                getKeys: () => body.entries.map(([k]) => k),
                getField: (key: string) => (fields.has(key) ? sdtField(fields.get(key)!) : undefined),
            };
            return { getType, getValue: () => container };
        }
        case 'stream': {
            let at = 0;
            const container = {
                hasNext: () => at < body.items.length,
                getNext: () => sdtField(body.items[at++]),
                rewind: () => { at = 0; },
            };
            return { getType, getValue: () => container };
        }
        case 'int64': case 'uint64': return { getType, getValue: () => wideValue(body.value) };
        case 'destination': return { getType, getValue: () => createDestination(body.name, body.kind === 'topic' ? DestinationType.TOPIC : DestinationType.QUEUE) };
        case 'null': return { getType, getValue: () => null };
        default: return { getType, getValue: () => body.value };
    }
}

/** The body an SDK container (this file's stand-in or the SDK's own SDTField) holds, as plain data. Throws on a field type the demo does not hold. */
export function sdtBodyOf(field: any): SdtBody {
    const type = BODY_TYPE.get(field.getType());
    if (type === undefined) throw new Error(`SDT field type ${String(field.getType())} is not supported by the demo broker`);
    const value = field.getValue();
    switch (type) {
        case 'map': return { type, entries: value.getKeys().map((k: string): [string, SdtBody] => [k, sdtBodyOf(value.getField(k))]) };
        case 'stream': {
            // Reading a stream moves its cursor: leave it where a later reader expects it.
            const items: SdtBody[] = [];
            value.rewind();
            while (value.hasNext()) items.push(sdtBodyOf(value.getNext()));
            value.rewind();
            return { type, items };
        }
        case 'string': return { type, value: String(value) };
        case 'bool': return { type, value: Boolean(value) };
        case 'float': case 'double': return { type, value: Number(value) };
        case 'bytes': return { type, value: toByteString(value) ?? '' };
        case 'destination': return { type, kind: value.getType() === DestinationType.TOPIC ? 'topic' : 'queue', name: value.getName() };
        case 'null': return { type };
        default: {
            const n = Number(String(value));
            return { type, value: Number.isSafeInteger(n) ? n : String(value) };
        }
    }
}

/** The attachment as the SDK returns it: a byte string, or null when none is set. An SDT body's is the labelled stand-in. */
function attachmentOf(f: MessageFields): string | null {
    if (f.sdt !== undefined) return textToLatin1(SDT_WIRE_HEADER + JSON.stringify(f.sdt));
    if (f.payloadBytes !== undefined) return f.payloadBytes;
    return f.payload === undefined ? null : textToLatin1(f.payload);
}

/** One key of the SDK's message dump: `key:` padded to 40 columns, then the value. */
function dumpLine(key: string, value: string): string {
    return `${key}:`.padEnd(40) + value;
}

/**
 * Bytes as the SDK's message dump shows them (formatDumpBytes in solclientjs):
 * sixteen to a line, indented two spaces, two lower-case hex digits and a
 * space each with three more after the eighth, padded to 54 columns, then
 * the bytes 33 to 126 as characters and any other as `.`.
 */
function dumpBytes(latin1: string): string {
    let out = '';
    for (let at = 0; at < latin1.length; at += 16) {
        let hex = '';
        let text = '';
        for (let i = at; i < Math.min(at + 16, latin1.length); i++) {
            const c = latin1.charCodeAt(i);
            hex += `${c.toString(16).padStart(2, '0')} ${i - at === 7 ? '   ' : ''}`;
            text += c < 33 || c > 126 ? '.' : latin1[i];
        }
        out += `  ${hex.padEnd(54)}${text}\n`;
    }
    return out;
}

/** Attachment size in bytes, as the broker counts it. */
export function payloadByteLength(f: MessageFields): number {
    return (attachmentOf(f) ?? '').length;
}

/** What `setBinaryAttachment` accepts: a Uint8Array, or a Latin-1 byte string (text with a char above 0xFF is encoded as UTF-8). */
function toByteString(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    if (v instanceof Uint8Array) return bytesToLatin1(v);
    const text = String(v);
    return /[^\x00-\xFF]/.test(text) ? textToLatin1(text) : text;
}

function propertyMap(props: Record<string, string> | undefined) {
    if (!props) return null;
    const keys = Object.keys(props);
    if (keys.length === 0) return null;
    return {
        getKeys: () => keys,
        getField: (key: string) => (key in props ? { getValue: () => props[key] } : undefined),
    };
}

/**
 * Build a message. `fields` is copied, so seeding a queue twice yields
 * independent messages rather than shared references.
 */
export function createMessage(fields: MessageFields = {}): MockMessage {
    const f: MessageFields = { ...fields };

    const msg: MockMessage = {
        _fields: f,
        smfHeader: { messageLength: payloadByteLength(f) + 120 },

        // ---- content -------------------------------------------------
        getType: () => (f.sdt?.type === 'map' ? MessageType.MAP : f.sdt?.type === 'stream' ? MessageType.STREAM : MessageType.BINARY),
        getBinaryAttachment: () => attachmentOf(f),
        getSdtContainer: () => (f.sdt ? sdtField(f.sdt) : null),
        getXmlContent: () => f.xmlContent ?? null,

        // ---- identity ------------------------------------------------
        getGuaranteedMessageId: () => (f.guaranteedMessageId === undefined
            ? undefined
            : { toString: () => String(f.guaranteedMessageId) }),
        getDestination: () => f.destination ?? null,
        getReplicationGroupMessageId: () => ({ toString: () => `rmid1:demo-${f.guaranteedMessageId ?? '0'}` }),

        // ---- scalars the details panel reads -------------------------
        getApplicationMessageId: () => f.applicationMessageId ?? null,
        getApplicationMessageType: () => f.applicationMessageType ?? null,
        getCacheRequestId: () => f.cacheRequestId ?? null,
        getCorrelationId: () => f.correlationId ?? null,
        getDeliveryCount: () => f.deliveryCount ?? 1,
        getDeliveryMode: () => f.deliveryMode ?? MessageDeliveryModeType.PERSISTENT,
        getHttpContentEncoding: () => f.httpContentEncoding ?? null,
        getHttpContentType: () => f.httpContentType ?? null,
        getPriority: () => f.priority ?? null,
        getReplyTo: () => (f.replyTo ?? null),
        getSenderId: () => f.senderId ?? null,
        getSenderTimestamp: () => f.senderTimestamp ?? null,
        getSequenceNumber: () => f.sequenceNumber ?? null,
        getTimeToLive: () => f.timeToLive ?? null,
        getTopicSequenceNumber: () => f.topicSequenceNumber ?? null,
        getUserPropertyMap: () => propertyMap(f.userProperties),
        getUserData: () => f.userData ?? null,
        getUserCos: () => f.userCos ?? null,
        getXmlMetadata: () => f.xmlMetadata ?? null,

        // ---- flags ---------------------------------------------------
        isAcknowledgeImmediately: () => !!f.acknowledgeImmediately,
        isDeliverToOne: () => !!f.deliverToOne,
        isDiscardIndication: () => !!f.discardIndication,
        isDMQEligible: () => !!f.dmqEligible,
        isElidingEligible: () => !!f.elidingEligible,
        isRedelivered: () => !!f.redelivered,
        isReplyMessage: () => !!f.replyMessage,

        /** The Show Raw view, in the SDK's layout: each key padded to 40 columns, and the attachment's bytes in hex. */
        dump: () => {
            const lines = [
                dumpLine('Destination', f.destination ? f.destination.getName() : '(none)'),
                dumpLine('AppMessageID', f.applicationMessageId ?? '(null)'),
                dumpLine('SenderId', f.senderId ?? '(null)'),
                dumpLine('Class Of Service', String(f.userCos ?? 0)),
                dumpLine('DeliveryMode', f.deliveryMode === MessageDeliveryModeType.DIRECT ? 'DIRECT' : 'PERSISTENT'),
                dumpLine('Message Id', f.guaranteedMessageId ?? '(null)'),
            ];
            // The SDK leaves out an empty attachment.
            const attachment = attachmentOf(f) ?? '';
            if (attachment) lines.push(`${dumpLine('Binary Attachment', `len=${attachment.length}`)}\n${dumpBytes(attachment)}`);
            return lines.join('\n');
        },
    };

    // ---- setters -----------------------------------------------------
    // Each returns `this` so the publisher's chaining works, and each writes
    // through to `_fields` so a cloned message really carries the value.
    const setters: Record<string, (v: any) => void> = {
        setBinaryAttachment: v => {
            delete f.payload;
            delete f.sdt;
            f.payloadBytes = toByteString(v);
        },
        setXmlContent: v => { f.xmlContent = v; },
        setSdtContainer: v => {
            f.sdt = sdtBodyOf(v);
            delete f.payload;
            delete f.payloadBytes;
        },
        setDestination: v => { f.destination = v; },
        setDeliveryMode: v => { f.deliveryMode = v; },
        setCorrelationKey: v => { f.correlationKey = v; },
        setGuaranteedMessageId: v => { f.guaranteedMessageId = String(v); },
        setApplicationMessageId: v => { f.applicationMessageId = v; },
        setApplicationMessageType: v => { f.applicationMessageType = v; },
        setAsReplyMessage: v => { f.replyMessage = !!v; },
        setCorrelationId: v => { f.correlationId = v; },
        setDMQEligible: v => { f.dmqEligible = !!v; },
        setElidingEligible: v => { f.elidingEligible = !!v; },
        setGMExpiration: v => { f.gmExpiration = v; },
        setHttpContentEncoding: v => { f.httpContentEncoding = v; },
        setHttpContentType: v => { f.httpContentType = v; },
        setPriority: v => { f.priority = v; },
        setReplyTo: v => { f.replyTo = v; },
        setSenderId: v => { f.senderId = v; },
        setSenderTimestamp: v => { f.senderTimestamp = v; },
        setSequenceNumber: v => { f.sequenceNumber = v; },
        setTimeToLive: v => { f.timeToLive = v; },
        setUserCos: v => { f.userCos = v; },
        setUserData: v => { f.userData = v; },
        setXmlMetadata: v => { f.xmlMetadata = v; },
        setUserPropertyMap: v => {
            // The publisher copies the map object wholesale; re-read it through
            // the same accessor shape the getter exposes.
            if (!v || typeof v.getKeys !== 'function') return;
            const copied: Record<string, string> = {};
            for (const key of v.getKeys()) {
                const field = v.getField(key);
                if (field) copied[key] = String(field.getValue());
            }
            f.userProperties = copied;
        },
    };

    for (const [name, apply] of Object.entries(setters)) {
        msg[name] = function (v: any) {
            apply(v);
            if (name === 'setBinaryAttachment' || name === 'setSdtContainer') msg.smfHeader.messageLength = payloadByteLength(f) + 120;
            return this;
        };
    }

    return msg;
}

/** Destination helpers the publisher calls off `SolclientFactory`. */
export function createDurableQueueDestination(name: string): MockDestination {
    return createDestination(name, DestinationType.QUEUE);
}

export function createTopicDestination(name: string): MockDestination {
    return createDestination(name, DestinationType.TOPIC);
}
