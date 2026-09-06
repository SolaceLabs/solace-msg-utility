import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountControlPanel } from '../../src/mock-broker/controls/panel';
import { seed, getQueue } from '../../src/mock-broker/broker/store';
import {
    MOCK_HOST, QUEUE_STATE, ROLE, VPNS, resetScenario, scenario,
} from '../../src/mock-broker/fixtures';

/**
 * The panel is demo-only UI, but the connection reference it renders is the
 * only place a demo user learns which host and VPNs are accepted — so it has to
 * stay derived from the fixtures rather than hand-typed.
 */
beforeEach(() => {
    document.body.innerHTML = '';
    resetScenario();
    scenario.latencyMs = 0;
    seed();
    mountControlPanel();
});

const panel = () => document.getElementById('mock-controls')!;
const codes = () => Array.from(panel().querySelectorAll('.mockctl-copy')).map(n => n.textContent);

describe('mock-broker/panel — connection reference', () => {
    it('lists the accepted host and the cert-error host', () => {
        expect(codes()).toContain(MOCK_HOST.OK);
        expect(codes()).toContain(MOCK_HOST.UNTRUSTED);
    });

    it('lists every VPN the broker actually serves', () => {
        // Derived from VPNS, so adding a VPN to the fixtures surfaces it here
        // automatically — the reference cannot drift from the topology.
        VPNS.forEach(v => expect(codes()).toContain(v.name));
    });

    it('copies a value to the clipboard when clicked', () => {
        // tests/setup.ts already installs a non-configurable clipboard stub, so
        // assert against that rather than redefining the property.
        const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;

        const host = Array.from(panel().querySelectorAll<HTMLElement>('.mockctl-copy'))
            .find(n => n.textContent === MOCK_HOST.OK)!;
        host.click();

        expect(writeText).toHaveBeenCalledWith(MOCK_HOST.OK);
        expect(host.textContent).toBe('copied');
    });
});

describe('mock-broker/panel — levers', () => {
    function selects(): HTMLSelectElement[] {
        return Array.from(panel().querySelectorAll('select'));
    }

    it('starts collapsed and opens on the header', () => {
        expect(panel().classList.contains('mockctl-open')).toBe(false);
        panel().querySelector<HTMLButtonElement>('.mockctl-header')!.click();
        expect(panel().classList.contains('mockctl-open')).toBe(true);
    });

    it('switches a queue to read-only through the state lever', () => {
        // Queue picker is the first select, state the second.
        const [queuePick, statePick] = selects();
        queuePick.value = 'vpn-prod/Q/ORDER/NEW';
        queuePick.dispatchEvent(new Event('change'));
        statePick.value = QUEUE_STATE.READ_ONLY;
        statePick.dispatchEvent(new Event('change'));

        expect(scenario.queueState.get('vpn-prod/Q/ORDER/NEW')).toBe(QUEUE_STATE.READ_ONLY);
    });

    it('sets the managed identity, which is what the profile endpoint reads', () => {
        const rolePick = selects().find(s => s.querySelector('option[value="operator"]'))!;
        rolePick.value = ROLE.OPERATOR;
        rolePick.dispatchEvent(new Event('change'));

        expect(scenario.role).toBe(ROLE.OPERATOR);
    });

    it('reseeds the store when the volume changes', () => {
        const before = getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages.length;
        const volumePick = selects().find(s => s.querySelector('option[value="5"]'))!;
        volumePick.value = '5';
        volumePick.dispatchEvent(new Event('change'));

        expect(getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages.length).toBeGreaterThan(before);
    });

    it('Reset restores every lever and rebuilds the data', () => {
        scenario.latencyMs = 900;
        scenario.role = ROLE.ADMIN;
        scenario.queueState.set('default/test-queue-1', QUEUE_STATE.BIND_DENIED);

        const reset = Array.from(panel().querySelectorAll<HTMLButtonElement>('.mockctl-btn'))
            .find(b => b.textContent === 'Reset demo data')!;
        reset.click();

        expect(scenario.role).toBe(ROLE.SIGNED_OUT);
        expect(scenario.queueState.get('default/test-queue-1')).toBe(QUEUE_STATE.NORMAL);
        expect(scenario.latencyMs).toBe(120);
    });
});
