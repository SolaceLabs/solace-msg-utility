import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUEUE_STATE, setBrokers, type VpnFixture } from '../../../src/mock-broker/fixtures';
import { seed as seedBroker } from '../../../src/mock-broker/broker/store';
import type { GatewaySeed } from '../../../src/mock-broker/gateway/types';

/**
 * Shared fixtures for the fake-gateway suites: the contract seed (the one the
 * real gateway is tested against: admin, viewer, operator; brokers b1, b2, b3)
 * and a demo-broker topology for its brokers, so relayed SEMP has queues to
 * report.
 */
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../go-web-proxy/testdata/contract');

export const CONTRACT_DIR = DIR;

/** A fresh copy of go-web-proxy/testdata/contract/seed.json. */
export function contractSeed(): GatewaySeed {
    return JSON.parse(readFileSync(path.join(DIR, 'seed.json'), 'utf-8'));
}

const queue = (name: string, seed: number) =>
    ({ name, seed, subscriptions: [`${name}/>`], state: QUEUE_STATE.NORMAL });

/** b1's VPNs v1 (four queues, so SEMP pages) and v2, and b2's v9, in the demo broker. */
export const CONTRACT_TOPOLOGY: Record<string, VpnFixture[]> = {
    b1: [
        { name: 'v1', queues: [queue('q1', 2), queue('q2', 0), queue('q3', 1), queue('q4', 1)] },
        { name: 'v2', queues: [queue('orders.new', 3)] },
    ],
    b2: [{ name: 'v9', queues: [queue('q9', 1)] }],
};

/** Put the contract brokers in the demo broker; undo with `setBrokers({})`. */
export function seedContractBrokers(): void {
    setBrokers(CONTRACT_TOPOLOGY);
    seedBroker();
}
