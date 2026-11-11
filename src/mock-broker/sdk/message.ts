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
 * - `getSdtContainer()` returns null for seeded messages, so the publisher's
 *   first-match-wins content chain (`setSdtContainer || setXmlContent ||
 *   setBinaryAttachment`) falls through to the binary attachment, which is the
 *   path real browsed messages take.
 *
 * Mock-only.
 */
import { DestinationType, MessageDeliveryModeType, MessageType } from './enums';

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

/** The attachment as the SDK returns it: a byte string, or null when none is set. */
function attachmentOf(f: MessageFields): string | null {
    if (f.payloadBytes !== undefined) return f.payloadBytes;
    return f.payload === undefined ? null : textToLatin1(f.payload);
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
        getType: () => MessageType.BINARY,
        getBinaryAttachment: () => attachmentOf(f),
        getSdtContainer: () => null,
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

        /** Raw dump for the Show-Raw modal. */
        dump: () => [
            `Destination:            ${f.destination ? f.destination.getName() : '(none)'}`,
            `AppMessageID:           ${f.applicationMessageId ?? '(null)'}`,
            `SenderId:               ${f.senderId ?? '(null)'}`,
            `Class Of Service:       ${f.userCos ?? 0}`,
            `DeliveryMode:           ${f.deliveryMode === MessageDeliveryModeType.DIRECT ? 'DIRECT' : 'PERSISTENT'}`,
            `Message Id:             ${f.guaranteedMessageId ?? '(null)'}`,
            `Binary Attachment:      len=${payloadByteLength(f)}`,
            attachmentOf(f) ?? '',
        ].join('\n'),
    };

    // ---- setters -----------------------------------------------------
    // Each returns `this` so the publisher's chaining works, and each writes
    // through to `_fields` so a cloned message really carries the value.
    const setters: Record<string, (v: any) => void> = {
        setBinaryAttachment: v => {
            delete f.payload;
            f.payloadBytes = toByteString(v);
        },
        setXmlContent: v => { f.xmlContent = v; },
        setSdtContainer: () => { throw new Error('SDT container not supported by the demo broker'); },
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
            if (name === 'setBinaryAttachment') msg.smfHeader.messageLength = payloadByteLength(f) + 120;
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
