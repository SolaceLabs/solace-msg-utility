import { describe, it, expect } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { DEMO_ACCOUNTS, DEMO_TOPOLOGY, demoSeed } from '../../../src/mock-broker/gateway/seed';
import { connectionProblem, passwordOk, validUsername } from '../../../src/mock-broker/gateway/validate';

/**
 * The managed demo's fixed assets: valid by the gateway's own rules, in step
 * with the demo broker, and showing the role differences the control panel
 * and the user guide promise.
 */
const seed = demoSeed();
const gw = createGateway({ seed });
const me = (user: string) => gw.store.profile(user, seed.settings.modules);

describe('mock-broker/gateway/seed', () => {
    it('holds only what the gateway would accept', () => {
        for (const u of seed['msg-utility-users']) {
            expect({ user: u.username, ok: validUsername(u.username) && passwordOk(u.password) }).toEqual({ user: u.username, ok: true });
        }
        for (const c of seed['msg-utility-connections']) expect(connectionProblem(c)).toBeNull();
        // Hosts that can never resolve.
        expect(seed['msg-utility-connections'].every(c => c.hostname.endsWith('.demo.invalid'))).toBe(true);
    });

    it('gives every provisioned VPN queues in the demo broker, and no more', () => {
        const provisioned = Object.fromEntries(seed['msg-utility-connections'].map(c => [c.broker, c.client.msgVpns.map(v => v.name)]));
        const topology = Object.fromEntries(Object.entries(DEMO_TOPOLOGY).map(([b, vpns]) => [b, vpns.map(v => v.name)]));
        expect(provisioned).toEqual(topology);
    });

    it('lists every account with the password that signs it in', () => {
        expect(DEMO_ACCOUNTS.map(a => a.username)).toEqual(seed['msg-utility-users'].map(u => u.username));
        for (const a of DEMO_ACCOUNTS) expect(gw.signIn(a.username, a.password).ok).toBe(true);
    });

    it('shows the roles apart', () => {
        const brokers = (user: string) => me(user)!.brokers.map(b => `${b.broker}:${b.msgVpns.map(v => v.name).join(',')}`);

        expect(brokers('admin')).toEqual(['east-prod:orders,payments', 'west-dr:orders-dr', 'lab:sandbox']);
        expect(me('admin')!.admin).toBe(true);

        // west-dr is not the operator's at all.
        expect(brokers('operator')).toEqual(['east-prod:orders,payments', 'lab:sandbox']);
        expect(me('operator')!.modules).toEqual(['queue-browser', 'queue-copy']);

        expect(brokers('viewer')).toEqual(['east-prod:orders']);
        expect(me('viewer')!.modules).toEqual(['queue-browser']);
        expect(me('viewer')!.operate).toEqual([]);

        expect(gw.store.listUsers().find(u => u.username === 'newadmin')!.mustChangePassword).toBe(true);
    });
});
