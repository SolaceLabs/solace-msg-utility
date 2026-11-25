import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { FAULT, resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { seed as seedBroker } from '../../../src/mock-broker/broker/store';
import { contractSeed, seedContractBrokers } from './helpers';

/**
 * The Message VPN lookup against the demo broker (go-web-proxy/vpns.go):
 * what the demo answers once a lookup is let through. The refusals, the
 * paging rules and a scripted broker's answers are pinned for both gateways
 * by the contract (tests/mock-broker/gateway/contract.test.ts, the cases
 * named "vpns: ...").
 */
describe('mock-broker/gateway/vpns -- through to the demo broker', () => {
    let gw: ReturnType<typeof createGateway>;
    let admin: string;

    beforeEach(() => {
        resetScenario();
        scenario.latencyMs = 0;
        seedContractBrokers();
        gw = createGateway({ seed: contractSeed() });
        admin = gw.openSession('admin', false);
    });

    afterEach(() => {
        setBrokers({});
    });

    /** A lookup of the broker at `hostname`, as the connection form sends it. */
    const lookup = (hostname: string, user: string, pass: string, broker = '') => gw.handle({
        method: 'POST', path: '/managed/connections/vpns', query: '',
        body: JSON.stringify({ broker, hostname, semp: { scheme: 'https', port: '1943', user, pass } }),
        session: admin,
    });

    it('answers the Message VPNs of the broker a saved connection names, to the typed or the stored account', async () => {
        expect(await lookup('host1', 'mon', 'semp-b1-pw')).toEqual({ status: 200, json: { vpns: ['v1', 'v2'] } });
        expect(await lookup('host1', 'mon', '', 'b1')).toEqual({ status: 200, json: { vpns: ['v1', 'v2'] } });
    });

    it('reads every page of a broker that holds more Message VPNs than one page', async () => {
        setBrokers({ b1: ['e', 'd', 'c', 'b', 'a'].map(name => ({ name, queues: [] })) });
        seedBroker();
        expect((await lookup('host1', 'mon', 'semp-b1-pw')).json).toEqual({ vpns: ['a', 'b', 'c', 'd', 'e'] });
    });

    it('refuses an account that is not the broker\'s, as a 502 and never a 401', async () => {
        const refused = { status: 502, json: { error: 'upstream_auth' } };
        expect(await lookup('host1', 'mon', 'wrong-password')).toEqual(refused);
        expect(await lookup('host1', 'other', 'semp-b1-pw')).toEqual(refused);
        scenario.fault = FAULT.SEMP_UNAUTHORIZED;
        expect(await lookup('host1', 'mon', 'semp-b1-pw')).toEqual(refused);
    });

    it('cannot reach an address no demo broker answers at, a failing broker, or any broker while the fault is armed', async () => {
        const unreachable = { status: 502, json: { error: 'upstream_unavailable' } };
        expect(await lookup('elsewhere.example', 'mon', 'semp-b1-pw')).toEqual(unreachable);
        scenario.fault = FAULT.SEMP_ERROR;
        expect(await lookup('host1', 'mon', 'semp-b1-pw')).toEqual(unreachable);
        scenario.fault = FAULT.NONE;
        gw.faults.relayUnreachable = true;
        expect(await lookup('host1', 'mon', 'semp-b1-pw')).toEqual(unreachable);
    });
});
