import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, fillDirectForm, firstVisit, mountControlPanel,
} from '../../src/mock-broker/controls/panel';
import { seed, getQueue } from '../../src/mock-broker/broker/store';
import {
    FAULT, MOCK_HOST, QUEUE_STATE, VPNS, resetScenario, scenario,
} from '../../src/mock-broker/fixtures';
import { loadModuleDOM } from '../helpers/loadModuleDOM';

/**
 * The panel is demo-only UI, but the connection reference it renders is the
 * only place a demo user learns which host and VPNs are accepted — so it has to
 * stay derived from the fixtures rather than hand-typed.
 */
beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();   // every test mounts on the tab's first load
    resetScenario();
    scenario.latencyMs = 0;
    seed();
    mountControlPanel();
});

const panel = () => document.getElementById('mock-controls')!;
const codes = () => Array.from(panel().querySelectorAll('.mockctl-copy')).map(n => n.textContent);
const selects = (): HTMLSelectElement[] => Array.from(panel().querySelectorAll('select'));
/** The select that offers `value`. */
const selectWith = (value: string) => selects().find(s => s.querySelector(`option[value="${value}"]`))!;
const button = (label: string) => Array.from(panel().querySelectorAll<HTMLButtonElement>('.mockctl-btn')).find(b => b.textContent === label)!;

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

describe('mock-broker/panel -- guidance', () => {
    it('says at its top that nothing leaves the page', () => {
        const first = panel().querySelector('.mockctl-body')!.firstElementChild!;
        expect([first.className, first.textContent]).toEqual(['mockctl-banner', DIRECT_BANNER]);
    });

    it('opens on the tab\'s first load only, and the header still toggles it', () => {
        expect(panel().classList.contains('mockctl-open')).toBe(true);
        expect(sessionStorage.getItem(DIRECT_PANEL_SEEN_KEY)).toBe('1');
        panel().querySelector<HTMLButtonElement>('.mockctl-header')!.click();
        expect(panel().classList.contains('mockctl-open')).toBe(false);

        document.body.innerHTML = '';
        mountControlPanel();   // a reload in the same tab
        expect(panel().classList.contains('mockctl-open')).toBe(false);
    });

    it('treats every load as the first when the storage refuses, so the guidance still shows', () => {
        const refused = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        try {
            expect([firstVisit('k'), firstVisit('k')]).toEqual([true, true]);
        } finally {
            refused.mockRestore();
        }
    });

    it('types the demo host, the chosen VPN and the demo credentials into the Direct form, as a visitor would', () => {
        const form = loadModuleDOM('connections');
        document.body.appendChild(form);
        const typed: string[] = [];
        const changed: string[] = [];
        form.addEventListener('input', e => typed.push((e.target as HTMLElement).id));
        form.addEventListener('change', e => changed.push((e.target as HTMLElement).id));
        const vpnPick = selectWith(VPNS[0].name);
        vpnPick.value = 'vpn-prod';
        vpnPick.dispatchEvent(new Event('change'));

        button('Fill the connection form').click();

        const ids = ['conn-host', 'semp-username', 'semp-password', 'solace-vpn', 'solace-username', 'solace-password'];
        const { username, password } = DEMO_CREDENTIALS;
        expect(ids.map(id => form.querySelector<HTMLInputElement>(`#${id}`)!.value))
            .toEqual([MOCK_HOST.OK, username, password, 'vpn-prod', username, password]);
        expect([typed, changed]).toEqual([ids, ids]);
    });

    it('fails loudly when the Direct form is not on the page', () => {
        expect(() => fillDirectForm('default')).toThrow('Required element missing: #conn-host');
    });
});

describe('mock-broker/panel — levers', () => {
    it('switches a queue to read-only through the state lever', () => {
        const queuePick = selectWith('vpn-prod/Q/ORDER/NEW');
        const statePick = selectWith(QUEUE_STATE.READ_ONLY);
        queuePick.value = 'vpn-prod/Q/ORDER/NEW';
        queuePick.dispatchEvent(new Event('change'));
        statePick.value = QUEUE_STATE.READ_ONLY;
        statePick.dispatchEvent(new Event('change'));

        expect(scenario.queueState.get('vpn-prod/Q/ORDER/NEW')).toBe(QUEUE_STATE.READ_ONLY);
    });

    it('reseeds the store when the volume changes', () => {
        const before = getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages.length;
        const volumePick = selects().find(s => s.querySelector('option[value="5"]'))!;
        volumePick.value = '5';
        volumePick.dispatchEvent(new Event('change'));

        expect(getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages.length).toBeGreaterThan(before);
    });

    it('shows the levers a restored scenario holds, so an armed fault can be cleared', () => {
        // The managed demo restores the scenario across its sign-in reload,
        // before the panel mounts (src/mock-broker/boot.managed.ts).
        document.body.innerHTML = '';
        scenario.fault = FAULT.SEMP_ERROR;
        scenario.volume = 5;
        mountControlPanel();
        const faultPick = selects().find(s => s.querySelector(`option[value="${FAULT.SEMP_ERROR}"]`))!;
        const volumePick = selects().find(s => s.querySelector('option[value="5"]'))!;
        expect([faultPick.value, volumePick.value]).toEqual([FAULT.SEMP_ERROR, '5']);

        faultPick.value = FAULT.NONE;
        faultPick.dispatchEvent(new Event('change'));
        expect(scenario.fault).toBe(FAULT.NONE);
    });

    it('Reset restores every lever and rebuilds the data', () => {
        scenario.latencyMs = 900;
        scenario.queueState.set('default/test-queue-1', QUEUE_STATE.BIND_DENIED);

        button('Reset demo data').click();

        expect(scenario.queueState.get('default/test-queue-1')).toBe(QUEUE_STATE.NORMAL);
        expect(scenario.latencyMs).toBe(120);
    });
});
