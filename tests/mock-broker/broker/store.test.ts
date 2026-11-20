// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    allQueues, dumpStore, findQueueAnyVpn, getQueue, listQueues, listVpns, loadStore, publish, publishRejection, removeMessage, seed, vpnOn,
} from '../../../src/mock-broker/broker/store';
import {
    BROKERS, DIRECT_BROKER, QUEUE_STATE, VPNS, queueStateOf, resetScenario, scenario, setBrokers,
} from '../../../src/mock-broker/fixtures';
import { createMessage, createTopicDestination } from '../../../src/mock-broker/sdk/message';
import { DestinationType } from '../../../src/mock-broker/sdk/enums';

/**
 * The store holds every broker the demo knows: Direct (demo.html's only one)
 * and the managed demo's. A broker argument scopes what a listing, a by-name
 * lookup or a publish sees, so a managed session on one broker never reaches
 * another broker's queues; a publish reaches the session's Message VPN only.
 */
const EAST = [
    {
        name: 'orders',
        queues: [
            { name: 'orders.new', seed: 3, subscriptions: ['orders/>'], state: QUEUE_STATE.NORMAL },
            { name: 'audit', seed: 1, subscriptions: [], state: QUEUE_STATE.READ_ONLY },
            { name: 'orders.eu', seed: 0, subscriptions: ['orders/*/eu'], state: QUEUE_STATE.NORMAL },
        ],
    },
];
const WEST = [
    { name: 'orders-dr', queues: [{ name: 'orders.new', seed: 2, subscriptions: ['orders/>'], state: QUEUE_STATE.NORMAL }] },
];

beforeEach(() => {
    resetScenario();
    setBrokers({ east: EAST, west: WEST });
    seed();
});

afterEach(() => {
    setBrokers({});
    seed();
});

describe('mock-broker/store -- brokers', () => {
    it('keeps Direct as the default broker, unchanged by the others', () => {
        expect(listVpns()).toEqual(VPNS.map(v => v.name));
        expect(listVpns(DIRECT_BROKER)).toEqual(VPNS.map(v => v.name));
        expect(allQueues().every(q => vpnOn(DIRECT_BROKER, q.vpn))).toBe(true);
    });

    it('lists, finds and seeds each broker on its own', () => {
        expect(listVpns('east')).toEqual(['orders']);
        expect(listQueues('orders', 'east')).toEqual(['orders.new', 'audit', 'orders.eu']);
        expect(listQueues('orders', 'west')).toEqual([]);
        expect(listVpns('nope')).toEqual([]);

        // The same queue name on two brokers resolves per broker.
        expect(findQueueAnyVpn('orders.new', 'east')?.vpn).toBe('orders');
        expect(findQueueAnyVpn('orders.new', 'west')?.vpn).toBe('orders-dr');
        expect(findQueueAnyVpn('orders.new')).toBeUndefined();
        expect(getQueue('orders', 'orders.new')?.messages).toHaveLength(3);
    });

    it('declares each added queue\'s behaviour', () => {
        expect(queueStateOf('orders', 'audit')).toBe(QUEUE_STATE.READ_ONLY);
        expect(scenario.queueState.get('orders-dr/orders.new')).toBe(QUEUE_STATE.NORMAL);
    });

    it('publishes to a topic only on the publishing broker', () => {
        const before = getQueue('orders-dr', 'orders.new')!.messages.length;
        const msg = createMessage({ payload: 'hello' });

        expect(publish('orders/created', DestinationType.TOPIC, msg, 'orders', 'east')).toBe(1);
        expect(getQueue('orders', 'orders.new')!.messages).toHaveLength(4);
        expect(getQueue('orders-dr', 'orders.new')!.messages).toHaveLength(before);
        // Direct's queues subscribe to orders/new/> only; this topic reaches none.
        expect(publish('orders/created', DestinationType.TOPIC, createMessage({ payload: 'x' }), 'default')).toBe(0);
        // A VPN of another broker is not the session's to publish into.
        expect(publish('orders/created', DestinationType.TOPIC, createMessage({ payload: 'x' }), 'orders')).toBe(0);
        expect(getQueue('orders', 'orders.new')!.messages).toHaveLength(4);
    });

    it('publishes only into the session\'s Message VPN', () => {
        // default/test-queue-1 and vpn-prod/Q/ORDER/NEW both subscribe to orders/new/>.
        const sizes = () => [getQueue('default', 'test-queue-1')!, getQueue('vpn-prod', 'Q/ORDER/NEW')!].map(q => q.messages.length);
        const before = sizes();

        expect(publish('orders/new/eu', DestinationType.TOPIC, createMessage({ payload: 'prod' }), 'vpn-prod')).toBe(1);
        expect(sizes()).toEqual([before[0], before[1] + 1]);
        // A queue name is looked up in the session's VPN too.
        expect(publish('test-queue-1', DestinationType.QUEUE, createMessage({ payload: 'q' }), 'vpn-prod')).toBe(0);
        expect(publish('test-queue-1', DestinationType.QUEUE, createMessage({ payload: 'q' }), 'default')).toBe(1);
        expect(sizes()).toEqual([before[0] + 1, before[1] + 1]);
    });

    it('spools its own copy, with its own id, in every queue a topic reaches', () => {
        // east's orders.new (orders/>) and orders.eu (orders/*/eu) both match.
        const msg = createMessage({ payload: 'fan-out' });
        expect(publish('orders/new/eu', DestinationType.TOPIC, msg, 'orders', 'east')).toBe(2);

        const spooled = ['orders.new', 'orders.eu'].map(name => ({ vpn: 'orders', name, entry: getQueue('orders', name)!.messages.at(-1)! }));
        expect(spooled[0].entry.msg).not.toBe(spooled[1].entry.msg);
        for (const { vpn, name, entry } of spooled) {
            // The SDK hands the id back as a Long; the app reads it with toString().
            const id = String(entry.msg.getGuaranteedMessageId());
            expect(id).toBe(String(entry.id));
            // A browse-and-delete reads the id off the message; it must name this queue's entry.
            expect(removeMessage(vpn, name, id)).toBe(true);
        }
    });

    it('refuses a VPN name another broker already uses', () => {
        expect(() => setBrokers({ east: EAST, again: [{ name: 'orders', queues: [] }] }))
            .toThrow('demo VPN "orders" (broker "again") is already defined; VPN names must be unique across the demo');
        expect(() => setBrokers({ east: [{ name: 'default', queues: [] }] }))
            .toThrow('demo VPN "default" (broker "east") is already defined');
        // A refusal changes nothing.
        expect(Array.from(BROKERS.keys())).toEqual([DIRECT_BROKER, 'east', 'west']);
    });

    it('reserves the Direct broker name', () => {
        expect(() => setBrokers({ [DIRECT_BROKER]: [] }))
            .toThrow(`demo broker name "${DIRECT_BROKER}" is reserved for Direct sessions`);
    });

    it('round-trips through a snapshot, destinations and ids included', () => {
        const msg = createMessage({ payload: 'kept' });
        msg.setDestination(createTopicDestination('orders/created'));
        publish('orders/created', DestinationType.TOPIC, msg, 'orders', 'east');
        const snap = JSON.parse(JSON.stringify(dumpStore()));

        seed();   // anything else in between
        loadStore(snap);

        const q = getQueue('orders', 'orders.new')!;
        const last = q.messages[q.messages.length - 1];
        expect(q.messages).toHaveLength(4);
        expect(last.msg._fields.payload).toBe('kept');
        expect(last.msg._fields.destination!.getName()).toBe('orders/created');
        expect(last.msg._fields.destination!.getType()).toBe(DestinationType.TOPIC);
        // The next id continues past the restored ones.
        publish('orders/created', DestinationType.TOPIC, createMessage({ payload: 'next' }), 'orders', 'east');
        expect(q.messages[q.messages.length - 1].id).toBe(last.id + 1);
    });

    it('drops the added brokers on setBrokers({})', () => {
        setBrokers({});
        expect(Array.from(BROKERS.keys())).toEqual([DIRECT_BROKER]);
        expect(listVpns('east')).toEqual([]);
        expect(scenario.queueState.has('orders/audit')).toBe(false);
    });
});

describe('mock-broker/broker/store -- payload bytes and refused publishes', () => {
    beforeEach(() => {
        resetScenario();
        scenario.latencyMs = 0;
        seed();
    });

    it('survives a JSON snapshot with a binary payload byte for byte, sized in bytes', () => {
        const before = getQueue('default', 'test-queue-1')!.messages[5];
        const bytes = before.msg.getBinaryAttachment();

        const snap = JSON.parse(JSON.stringify(dumpStore()));
        seed();
        loadStore(snap);

        const after = getQueue('default', 'test-queue-1')!.messages[5];
        expect(after.msg.getBinaryAttachment()).toBe(bytes);
        expect(after.sizeBytes).toBe(bytes.length + 120);
    });

    it('sizes a non-ASCII text payload by its UTF-8 bytes', () => {
        const m = getQueue('default', 'test-queue-1')!.messages[4];
        expect(m.sizeBytes).toBe(m.msg.getBinaryAttachment().length + 120);
        expect(m.msg.getBinaryAttachment().length).toBeGreaterThan(m.msg._fields.payload!.length);
    });

    it('names the refusing queue for a publish to a PUBLISH_REJECTED queue, and nothing otherwise', () => {
        expect(publishRejection('Q/ORDER/ARCHIVE', DestinationType.QUEUE, 'vpn-prod')).toBeNull();
        scenario.queueState.set('vpn-prod/Q/ORDER/ARCHIVE', QUEUE_STATE.PUBLISH_REJECTED);
        expect(publishRejection('Q/ORDER/ARCHIVE', DestinationType.QUEUE, 'vpn-prod')).toContain('Q/ORDER/ARCHIVE');
        // A session on another VPN does not reach that queue, so it is not asked.
        expect(publishRejection('Q/ORDER/ARCHIVE', DestinationType.QUEUE, 'default')).toBeNull();
        // A queue the destination does not reach is not asked.
        expect(publishRejection('Q/ORDER/PROCESS', DestinationType.QUEUE, 'vpn-prod')).toBeNull();
        expect(publishRejection('nowhere/>', DestinationType.TOPIC, 'vpn-prod')).toBeNull();
    });
});
