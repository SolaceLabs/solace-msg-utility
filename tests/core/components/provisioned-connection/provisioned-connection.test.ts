import { describe, it, expect, vi } from 'vitest';
import {
    createProvisionedConnectionCard, type ProvisionedConnectionCardDeps,
} from '../../../../src/core/components/provisioned-connection';
import { createManagedProfile } from '../../../../src/core/services/managed-profile';
import type { ManagedProfile } from '../../../../src/core/services/managed-service';

/**
 * The provisioned connection card on its own: a real managed profile supplies
 * the names, the host's connect/disconnect are spies, and every assertion reads
 * the card's own DOM.
 */
const PROFILE: ManagedProfile = {
    username: 'alice', admin: false, modules: [], operate: [], readOnly: [],
    brokers: [
        { broker: 'b1', msgVpns: [{ name: 'v1' }, { name: 'v2' }] },
        { broker: 'b2', msgVpns: [] },
        { broker: 'b3', msgVpns: [{ name: 'v2' }] },
    ],
} as ManagedProfile;

function setup(over: Partial<ProvisionedConnectionCardDeps> = {}, profile: ManagedProfile = PROFILE) {
    const store = createManagedProfile();
    store.setProfile(profile);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const deps = { profile: store, onConnect: vi.fn(async () => { }), onDisconnect: vi.fn(), ...over };
    const card = createProvisionedConnectionCard(host, deps);
    const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
    const parts = {
        title: q<HTMLElement>('.prov-conn-title'),
        broker: q<HTMLSelectElement>('.prov-conn-broker'),
        vpn: q<HTMLSelectElement>('.prov-conn-vpn'),
        action: q<HTMLButtonElement>('.prov-conn-action'),
        status: q<HTMLElement>('.prov-conn-status'),
        error: q<HTMLElement>('.prov-conn-error'),
        empty: q<HTMLElement>('.prov-conn-empty'),
        controls: q<HTMLElement>('.prov-conn-controls'),
    };
    return { host, card, deps, store, ...parts };
}

const values = (select: HTMLSelectElement) => [...select.options].map(o => o.value);
const shown = (el: HTMLElement) => !el.classList.contains('hidden');

describe('core/components/provisioned-connection -- choices', () => {
    it('lists the provisioned brokers and the first broker\'s VPNs, ready to connect', () => {
        const { card, title, broker, vpn, action, empty, controls, status, error } = setup();
        card.setChoices();
        expect(title.textContent).toBe('Connect to a broker');
        expect(values(broker)).toEqual(['b1', 'b2', 'b3']);
        expect(values(vpn)).toEqual(['v1', 'v2']);
        expect([broker.disabled, vpn.disabled, action.disabled]).toEqual([false, false, false]);
        expect(action.textContent).toBe('Connect');
        expect([shown(empty), shown(controls), shown(status), shown(error)]).toEqual([false, true, false, false]);
    });

    it('a broker with no VPNs disables the VPN select and Connect; another broker brings them back', () => {
        const { card, broker, vpn, action } = setup();
        card.setChoices();
        broker.value = 'b2';
        broker.dispatchEvent(new Event('change'));
        expect([values(vpn), vpn.disabled, action.disabled]).toEqual([[], true, true]);
        broker.value = 'b3';
        broker.dispatchEvent(new Event('change'));
        expect([values(vpn), vpn.disabled, action.disabled]).toEqual([['v2'], false, false]);
    });

    it('a re-read keeps a selection that is still provisioned and falls back when it is gone', () => {
        const { card, store, broker, vpn } = setup();
        card.setChoices();
        broker.value = 'b3';
        broker.dispatchEvent(new Event('change'));
        card.setChoices();
        expect([broker.value, vpn.value]).toEqual(['b3', 'v2']);

        // b3 is gone: the first broker is chosen; its own v2 is kept.
        store.setProfile({ ...PROFILE, brokers: [PROFILE.brokers[0]] } as ManagedProfile);
        card.setChoices();
        expect([broker.value, vpn.value]).toEqual(['b1', 'v2']);
    });

    it('shows the empty state, not the controls, when the account has no connections', () => {
        const { card, empty, controls } = setup({}, { ...PROFILE, brokers: [] } as ManagedProfile);
        card.setChoices();
        expect([shown(empty), shown(controls)]).toEqual([true, false]);
    });

    it('a VPN change re-evaluates Connect', () => {
        const { card, vpn, action } = setup();
        card.setChoices();
        vpn.value = '';
        vpn.dispatchEvent(new Event('change'));
        expect(action.disabled).toBe(true);
        vpn.value = 'v2';
        vpn.dispatchEvent(new Event('change'));
        expect(action.disabled).toBe(false);
    });
});

describe('core/components/provisioned-connection -- connect and status', () => {
    it('Connect hands the selection to onConnect and goes connecting at once, so a second click cannot start another', () => {
        const { card, deps, vpn, broker, action, status } = setup();
        card.setChoices();
        vpn.value = 'v2';
        action.click();
        expect(deps.onConnect).toHaveBeenCalledWith({ broker: 'b1', vpn: 'v2' });
        expect(card.status()).toBe('connecting');
        expect([action.disabled, action.textContent, broker.disabled, vpn.disabled]).toEqual([true, 'Connecting...', true, true]);
        expect(status.textContent).toBe('Connecting to broker "b1", VPN "v2"...');
        action.click();
        expect(deps.onConnect).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the broker or VPN selection is empty', () => {
        const { card, deps, broker, vpn, action } = setup();
        card.setChoices();
        broker.value = '';
        action.click();
        broker.value = 'b1';
        vpn.value = '';
        action.click();
        expect(deps.onConnect).not.toHaveBeenCalled();
        expect(card.status()).toBe('disconnected');
    });

    it('shows a rejected onConnect as the error, with Connect available again', async () => {
        const { card, action, error, status } = setup({ onConnect: vi.fn(async () => { throw new Error('dial refused'); }) });
        card.setChoices();
        action.click();
        await vi.waitFor(() => expect(card.status()).toBe('error'));
        expect([error.textContent, shown(error), shown(status), action.disabled]).toEqual(['dial refused', true, false, false]);
    });

    it('connected: Disconnect calls onDisconnect, with the status line as given', () => {
        const { card, deps, action, broker, status } = setup();
        card.setChoices();
        card.setStatus('connected', 'Broker "b1", VPN "v1"');
        expect([action.textContent, action.disabled, broker.disabled, status.textContent]).toEqual(['Disconnect', false, true, 'Broker "b1", VPN "v1"']);
        expect(action.classList.contains('btn-danger')).toBe(true);
        action.click();
        expect(deps.onDisconnect).toHaveBeenCalledTimes(1);
        expect(deps.onConnect).not.toHaveBeenCalled();
    });

    it('an error without detail says so generically; a status without detail hides the line', () => {
        const { card, error, status, action } = setup();
        card.setChoices();
        card.setStatus('error');
        expect(error.textContent).toBe('Connection failed.');
        card.setStatus('disconnected');
        expect([shown(error), shown(status), action.textContent]).toEqual([false, false, 'Connect']);
        expect(action.classList.contains('btn-primary')).toBe(true);
    });

    it('lock freezes every control whatever the status, and unlock restores them', () => {
        const { card, broker, vpn, action } = setup();
        card.setChoices();
        card.lock(true);
        expect([broker.disabled, vpn.disabled, action.disabled]).toEqual([true, true, true]);
        card.setStatus('connected');
        expect(action.disabled).toBe(true);
        card.lock(false);
        expect([broker.disabled, action.disabled]).toEqual([true, false]);
    });
});

describe('core/components/provisioned-connection -- host options and lifecycle', () => {
    it('takes a title, header actions and ids for its parts', () => {
        const refresh = document.createElement('button');
        const { host, title } = setup({
            title: 'Destination', headerActions: refresh,
            ids: { broker: 'x-broker', vpn: 'x-vpn', action: 'x-action', error: 'x-error', empty: 'x-empty', controls: 'x-controls' },
        });
        expect(title.textContent).toBe('Destination');
        expect(host.querySelector('.prov-conn-header')!.contains(refresh)).toBe(true);
        for (const [id, cls] of [['x-broker', 'prov-conn-broker'], ['x-vpn', 'prov-conn-vpn'], ['x-action', 'prov-conn-action'],
            ['x-error', 'prov-conn-error'], ['x-empty', 'prov-conn-empty'], ['x-controls', 'prov-conn-controls']]) {
            expect(host.querySelector(`#${id}`)!.classList.contains(cls)).toBe(true);
        }
    });

    it('destroy removes the card from its host', () => {
        const { host, card } = setup();
        card.destroy();
        expect(host.children).toHaveLength(0);
    });
});
