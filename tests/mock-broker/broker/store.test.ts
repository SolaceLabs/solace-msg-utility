import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    allQueues, dumpStore, findQueueAnyVpn, getQueue, listQueues, listVpns, loadStore, publish, seed, vpnOn,
} from '../../../src/mock-broker/broker/store';
import {
    BROKERS, DIRECT_BROKER, QUEUE_STATE, VPNS, queueStateOf, resetScenario, scenario, setBrokers,
} from '../../../src/mock-broker/fixtures';
import { createMessage, createTopicDestination } from '../../../src/mock-broker/sdk/message';
import { DestinationType } from '../../../src/mock-broker/sdk/enums';

/**
 * The store holds every broker the demo knows: Direct (mock.html's only one)
 * and the managed demo's. A broker argument scopes what a listing, a by-name
 * lookup or a publish sees, so a managed session on one broker never reaches
 * another broker's queues.
 */
const EAST = [
    {
        name: 'orders',
        queues: [
            { name: 'orders.new', seed: 3, subscriptions: ['orders/>'], state: QUEUE_STATE.NORMAL },
            { name: 'audit', seed: 1, subscriptions: [], state: QUEUE_STATE.READ_ONLY },
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
        expect(listQueues('orders', 'east')).toEqual(['orders.new', 'audit']);
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

        expect(publish('orders/created', DestinationType.TOPIC, msg, 'east')).toBe(1);
        expect(getQueue('orders', 'orders.new')!.messages).toHaveLength(4);
        expect(getQueue('orders-dr', 'orders.new')!.messages).toHaveLength(before);
        // Direct's queues subscribe to orders/new/> only; this topic reaches none.
        expect(publish('orders/created', DestinationType.TOPIC, createMessage({ payload: 'x' }))).toBe(0);
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
        publish('orders/created', DestinationType.TOPIC, msg, 'east');
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
        publish('orders/created', DestinationType.TOPIC, createMessage({ payload: 'next' }), 'east');
        expect(q.messages[q.messages.length - 1].id).toBe(last.id + 1);
    });

    it('drops the added brokers on setBrokers({})', () => {
        setBrokers({});
        expect(Array.from(BROKERS.keys())).toEqual([DIRECT_BROKER]);
        expect(listVpns('east')).toEqual([]);
        expect(scenario.queueState.has('orders/audit')).toBe(false);
    });
});
