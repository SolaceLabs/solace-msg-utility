/**
 * The in-memory broker: VPNs, queues, and the messages they spool.
 *
 * This is what makes the demo compose. Deleting a message removes it and the
 * depth drops; a copy run publishes into the destination queue, so browsing it
 * afterwards shows the same messages with the same IDs. The SEMP layer reports
 * depth and spool usage by reading this store, so verify's numbers always agree
 * with what browsing shows — the thing the old canned mocks could never do.
 *
 * Messages are held in spool-ID order, because the copy engine's drift
 * detection and max-consumed logic assume the broker delivers them that way.
 *
 * Mock-only. Reseeded on every page load; nothing is persisted.
 */
import { createDestination, createMessage, type MockMessage } from '../sdk/message';
import { DestinationType } from '../sdk/enums';
import { VPNS, scenario, queueStateOf, QUEUE_STATE } from '../fixtures';

export interface SpooledMessage {
    /** Monotonic spool id; also the guaranteed message id. */
    id: number;
    msg: MockMessage;
    sizeBytes: number;
}

export interface MockQueue {
    vpn: string;
    name: string;
    messages: SpooledMessage[];
    /** Bytes the broker reports as spool usage. */
    quotaBytes: number;
    maxMessageSize: number;
    subscriptions: string[];
    owner: string;
}

const PAYLOAD_TEMPLATES = [
    (n: number) => JSON.stringify({ orderId: `ORD-${1000 + n}`, status: 'NEW', amount: 40 + n * 3, currency: 'GBP' }),
    (n: number) => JSON.stringify({ event: 'audit', actor: `user-${n % 7}`, action: 'LOGIN', ok: n % 5 !== 0 }),
    (n: number) => `plain-text payload #${n} — the quick brown fox jumps over the lazy dog`,
    (n: number) => JSON.stringify({ telemetry: { cpu: (n % 100) / 100, mem: (n % 64) * 16 }, host: `node-${n % 4}` }),
];

const CONTENT_TYPES = ['application/json', 'application/json', 'text/plain', 'application/json'];

let nextId = 1;
const queues = new Map<string, MockQueue>();

function key(vpn: string, queue: string): string {
    return `${vpn}/${queue}`;
}

function buildMessage(vpn: string, queueName: string, n: number): SpooledMessage {
    const id = nextId++;
    const variant = n % PAYLOAD_TEMPLATES.length;
    const payload = PAYLOAD_TEMPLATES[variant](n);
    const msg = createMessage({
        payload,
        guaranteedMessageId: String(id),
        destination: createDestination(queueName, DestinationType.QUEUE),
        applicationMessageId: `app-msg-${id}`,
        applicationMessageType: variant === 2 ? 'text' : 'json',
        correlationId: `corr-${id}`,
        senderId: `demo-publisher-${n % 3}`,
        senderTimestamp: Date.parse('2026-08-01T09:00:00Z') + n * 60_000,
        sequenceNumber: n + 1,
        priority: n % 10,
        deliveryCount: 1,
        httpContentType: CONTENT_TYPES[variant],
        redelivered: n % 11 === 0,
        dmqEligible: n % 3 === 0,
        userProperties: {
            source: `demo/${vpn}`,
            partition: String(n % 4),
            trace: `trace-${id}`,
        },
    });
    return { id, msg, sizeBytes: payload.length + 120 };
}

/**
 * Rebuild every queue from the fixtures at the current volume setting.
 * Called at boot and by the panel's Reset control.
 */
export function seed(): void {
    queues.clear();
    nextId = 1;
    for (const vpn of VPNS) {
        for (const q of vpn.queues) {
            const state = queueStateOf(vpn.name, q.name);
            const count = state === QUEUE_STATE.EMPTY ? 0 : Math.round(q.seed * scenario.volume);
            const messages: SpooledMessage[] = [];
            for (let n = 0; n < count; n++) messages.push(buildMessage(vpn.name, q.name, n));
            queues.set(key(vpn.name, q.name), {
                vpn: vpn.name,
                name: q.name,
                messages,
                quotaBytes: 5000 * 1024 * 1024,
                maxMessageSize: 10_000_000,
                subscriptions: q.subscriptions.slice(),
                owner: 'demo',
            });
        }
    }
}

export function listVpns(): string[] {
    return VPNS.map(v => v.name);
}

export function listQueues(vpn: string): string[] {
    return VPNS.find(v => v.name === vpn)?.queues.map(q => q.name) ?? [];
}

export function getQueue(vpn: string, queue: string): MockQueue | undefined {
    return queues.get(key(vpn, queue));
}

/**
 * Find a queue by name across every VPN — the SEMP v1 detail RPC is called with
 * `vpn-name` of `*` when the caller does not know which VPN owns the queue.
 */
export function findQueueAnyVpn(queue: string): MockQueue | undefined {
    for (const q of queues.values()) if (q.name === queue) return q;
    return undefined;
}

export function allQueues(): MockQueue[] {
    return Array.from(queues.values());
}

export function spoolUsage(q: MockQueue): number {
    return q.messages.reduce((sum, m) => sum + m.sizeBytes, 0);
}

/** Remove one message by guaranteed id. Returns true when something went. */
export function removeMessage(vpn: string, queue: string, id: string): boolean {
    const q = queues.get(key(vpn, queue));
    if (!q) return false;
    const i = q.messages.findIndex(m => String(m.id) === String(id));
    if (i < 0) return false;
    q.messages.splice(i, 1);
    return true;
}

/**
 * Publish into a queue (direct enqueue) or to a topic (fan out to every queue
 * whose subscriptions match). Returns the number of queues that accepted it,
 * so the publisher can report a topic with no subscribers honestly.
 */
export function publish(destName: string, destType: number, msg: MockMessage): number {
    const targets = destType === DestinationType.QUEUE
        ? allQueues().filter(q => q.name === destName)
        : allQueues().filter(q => q.subscriptions.some(sub => topicMatches(sub, destName)));

    for (const q of targets) {
        const id = nextId++;
        // Re-stamp identity: the broker owns spool ids, not the publisher.
        const stored = msg;
        stored.setGuaranteedMessageId(String(id));
        q.messages.push({ id, msg: stored, sizeBytes: (stored._fields.payload ?? '').length + 120 });
    }
    return targets.length;
}

/**
 * Solace topic matching: `*` covers one level, `>` covers the rest. Used to fan
 * a topic publish out to subscribed queues, so a forward-to-topic in the demo
 * genuinely lands somewhere browsable.
 */
export function topicMatches(subscription: string, topic: string): boolean {
    const subParts = subscription.split('/');
    const topicParts = topic.split('/');
    for (let i = 0; i < subParts.length; i++) {
        if (subParts[i] === '>') return true;
        if (i >= topicParts.length) return false;
        if (subParts[i] === '*') continue;
        if (subParts[i] !== topicParts[i]) return false;
    }
    return subParts.length === topicParts.length;
}
