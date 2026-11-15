import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountControlPanel } from '../../../src/mock-broker/controls/panel';
import { managedSections, TLS_READ_ONLY_ID } from '../../../src/mock-broker/controls/managed';
import { createGateway } from '../../../src/mock-broker/gateway';
import { DEMO_TOPOLOGY, demoSeed } from '../../../src/mock-broker/gateway/seed';
import { seed } from '../../../src/mock-broker/broker/store';
import { resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { mockCode, stepOf } from '../../../src/mock-broker/gateway/authenticator';
import type { Page } from '../../../src/mock-broker/gateway/pages';

/**
 * The control panel as the managed demo mounts it: the demo accounts and the
 * gateway events in place of the Direct connection reference, and a Reset
 * that is the boot's.
 */
let gw: ReturnType<typeof createGateway>;
let landed: Page[];
let resets: number;

beforeEach(() => {
    document.body.innerHTML = '';
    resetScenario();
    setBrokers(DEMO_TOPOLOGY);
    seed();
    gw = createGateway({ seed: demoSeed() });
    landed = [];
    resets = 0;
    mountControlPanel({ sections: managedSections({ gateway: gw, navigate: p => landed.push(p) }), reset: () => { resets++; } });
});

afterEach(() => {
    setBrokers({});
});

const panel = () => document.getElementById('mock-controls')!;
const titles = () => Array.from(panel().querySelectorAll('.mockctl-title'), n => n.textContent);
const btn = (label: string) => Array.from(panel().querySelectorAll<HTMLButtonElement>('.mockctl-btn')).find(b => b.textContent === label)!;
const who = () => panel().querySelector('.mockctl-section .mockctl-hint')!.textContent;

describe('mock-broker/controls/managed -- accounts', () => {
    it('replaces the Direct connection reference with the demo\'s sections', () => {
        expect(titles()).toEqual(['Demo accounts', 'Authenticator', 'Gateway events', 'Queue state', 'Connection faults', 'Latency and volume']);
    });

    it('lists every account and its password, click to copy', () => {
        const codes = Array.from(panel().querySelectorAll('.mockctl-account .mockctl-copy'), n => n.textContent);
        expect(codes).toEqual([
            'admin', 'demo-admin-0001', 'operator', 'demo-operator-01',
            'viewer', 'demo-viewer-0001', 'newadmin', 'demo-change-me-01',
        ]);
    });

    it('signs in as an account and lands where the gateway would', () => {
        btn('Sign in as operator').click();
        expect(gw.session()).toEqual({ user: 'operator', mustChange: false });
        btn('Sign in as newadmin').click();
        expect(landed).toEqual(['app', 'password']);
    });

    it('shows the lockout instead of signing in', () => {
        for (let i = 0; i < 5; i++) gw.throttle.failed('admin');
        btn('Sign in as admin').click();
        expect(who()).toMatch(/^Too many attempts\. Try again in \d+ seconds\.$/);
        expect(landed).toEqual([]);
        btn('Clear the sign-in lockout').click();
        btn('Sign in as admin').click();
        expect(landed).toEqual(['app']);
    });

    it('lands on the code page, or the enrol page, when the setting asks for a second step', () => {
        const mode = (m: string) => expect(gw.settings.save({ login: { twoFactor: m } }, gw.settings.rev()).ok).toBe(true);
        mode('mandatory');
        btn('Sign in as admin').click();
        expect([landed, gw.session()]).toEqual([['two-factor'], null]);

        const secret = gw.ticket()!.secret;
        expect(gw.confirmTwoFactor(mockCode(secret, stepOf(Date.now()))).ok).toBe(true);
        btn('Sign out').click();
        btn('Sign in as admin').click();
        expect(landed).toEqual(['two-factor', 'app', 'code']);
    });

    it('signs out and reloads', () => {
        gw.signIn('viewer', 'demo-viewer-0001');
        btn('Sign out').click();
        expect([gw.cookie(), gw.session()]).toEqual([null, null]);
        expect(landed).toEqual(['app']);
    });

    it('says who is signed in when the pointer comes back', () => {
        expect(who()).toBe('Signed out.');
        gw.signIn('newadmin', 'demo-change-me-01');
        panel().querySelector('.mockctl-section')!.dispatchEvent(new Event('pointerenter'));
        expect(who()).toBe('Signed in as newadmin, who must change the password.');
    });
});

describe('mock-broker/controls/managed -- gateway events', () => {
    beforeEach(() => {
        gw.signIn('operator', 'demo-operator-01');
    });

    it('ends the session with the revocation hooks, or expires it without them', () => {
        const dropped: string[] = [];
        gw.sessions.onDrop((_id, s) => dropped.push(s.user));
        btn('Expire my session').click();
        expect([gw.session(), dropped]).toEqual([null, []]);

        gw.signIn('operator', 'demo-operator-01');
        btn('End my session').click();
        expect([gw.session(), dropped]).toEqual([null, ['operator']]);
        expect(who()).toBe('Signed out.');
    });

    it('revokes every entitlement of the signed-in user, keeping the rest of the account', () => {
        btn('Revoke my VPN access').click();
        const p = gw.store.profile('operator', gw.settings.current().modules)!;
        expect([p.brokers, p.operate, p.readOnly, p.modules]).toEqual([[], [], [], ['queue-browser', 'queue-copy', 'queue-subscription-explorer']]);
        expect(gw.session()).toEqual({ user: 'operator', mustChange: false });
    });

    it('arms the relay, dial and config.yaml faults, starting from the gateway\'s', () => {
        const events = Array.from(panel().querySelectorAll('.mockctl-section')).find(s => s.querySelector('.mockctl-title')!.textContent === 'Gateway events')!;
        const selects = Array.from(events.querySelectorAll<HTMLSelectElement>('select'));
        expect(selects.map(s => s.value)).toEqual(['ok', 'ok', 'ok', 'writable']);
        const set = (s: HTMLSelectElement, v: string) => { s.value = v; s.dispatchEvent(new Event('change')); };

        set(selects[0], 'down');
        set(selects[1], 'limited');
        set(selects[2], 'unreadable');
        expect(gw.faults).toEqual({ relayUnreachable: true, dialRateLimited: true, changedOnDisk: false, unreadable: true, tlsReadOnly: false });
        set(selects[2], 'changed');
        expect([gw.faults.changedOnDisk, gw.faults.unreadable]).toEqual([true, false]);
    });

    it('switches the TLS files to read-only and back, and shows a switch the gateway already holds', () => {
        const sw = () => document.getElementById(TLS_READ_ONLY_ID) as HTMLSelectElement;
        expect(sw().value).toBe('writable');
        sw().value = 'readonly';
        sw().dispatchEvent(new Event('change'));
        expect(gw.faults.tlsReadOnly).toBe(true);
        expect(gw.tls.view().certificateWritable).toBe(false);
        sw().value = 'writable';
        sw().dispatchEvent(new Event('change'));
        expect(gw.faults.tlsReadOnly).toBe(false);

        gw.faults.tlsReadOnly = true;
        document.body.innerHTML = '';
        mountControlPanel({ sections: managedSections({ gateway: gw, navigate: () => {} }), reset: () => {} });
        expect(sw().value).toBe('readonly');
    });

    it('lists every broker\'s queues in the queue-state lever', () => {
        const options = Array.from(panel().querySelectorAll('select')[4].querySelectorAll('option'), o => o.textContent);
        expect(options).toContain('default / test-queue-1');
        expect(options).toContain('east-prod / orders / audit.orders');
        expect(options).toContain('lab / sandbox / sandbox.bulk');
    });

    it('hands Reset demo data to the boot instead of reseeding in place', () => {
        scenario.latencyMs = 900;
        btn('Reset demo data').click();
        expect(resets).toBe(1);
        expect(scenario.latencyMs).toBe(900);
    });
});
