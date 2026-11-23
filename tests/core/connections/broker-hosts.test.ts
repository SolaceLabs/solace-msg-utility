import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createBrokerHosts, BROKER_HOSTS_TEXT, type BrokerHostsOptions, type BrokerType } from '../../../src/core/connections/broker-hosts';

/**
 * The broker-type control and the two host boxes it governs, on the markup of
 * the Direct form (src/modules/connections/index.html): one host for a
 * software or cloud broker, a management and a messaging host for an appliance.
 */
let container: HTMLElement;
const el = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
const host = () => el<HTMLInputElement>('#conn-host');
const messagingHost = () => el<HTMLInputElement>('#solace-host');
const button = (type: BrokerType) => el<HTMLButtonElement>(`#conn-broker-type [data-broker-type="${type}"]`);
const pressed = () => (['software', 'appliance'] as const).filter(t => button(t).getAttribute('aria-pressed') === 'true');
/** Which of the control (either button), the host box and the messaging box cannot be changed. */
const locked = () => ({
    type: button('software').disabled && button('appliance').disabled,
    host: host().disabled,
    messaging: messagingHost().disabled,
});
const hintShown = () => !el('#solace-host-hint').classList.contains('hidden');

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

function create(opts?: BrokerHostsOptions) {
    return createBrokerHosts({
        typeGroup: el('#conn-broker-type'),
        typeHint: el('#conn-broker-type-hint'),
        host: host(),
        hostLabel: el('#lbl-conn-host'),
        messagingHost: messagingHost(),
        messagingHint: el('#solace-host-hint'),
    }, opts);
}

beforeEach(() => {
    container = loadModuleDOM('connections');
});

describe('createBrokerHosts', () => {
    it('starts as Software / Cloud: one host, which the locked messaging box shows as it is typed', () => {
        const hosts = create();
        expect(hosts.type()).toBe('software');
        expect(pressed()).toEqual(['software']);
        expect(el('#lbl-conn-host').textContent).toBe(BROKER_HOSTS_TEXT.hostLabel.software);
        expect(el('#conn-broker-type-hint').textContent).toBe(BROKER_HOSTS_TEXT.typeHint.software);

        type(host(), 'broker.test');
        expect(messagingHost().value).toBe('broker.test');
        expect(locked()).toEqual({ type: false, host: false, messaging: true });
        expect(hintShown()).toBe(true);
        expect(hosts.messagingHost()).toBe('broker.test');
        expect(hosts.values()).toEqual({ host: 'broker.test' });
    });

    it('Appliance frees the messaging box, which starts from the host already typed and then keeps its own', () => {
        const hosts = create();
        type(host(), 'mgmt.test');
        button('appliance').click();

        expect(hosts.type()).toBe('appliance');
        expect(pressed()).toEqual(['appliance']);
        expect(el('#lbl-conn-host').textContent).toBe(BROKER_HOSTS_TEXT.hostLabel.appliance);
        expect(el('#conn-broker-type-hint').textContent).toBe(BROKER_HOSTS_TEXT.typeHint.appliance);
        expect(messagingHost().value).toBe('mgmt.test');
        expect(locked()).toEqual({ type: false, host: false, messaging: false });
        expect(hintShown()).toBe(false);

        type(messagingHost(), 'msg.test');
        type(host(), 'mgmt2.test');
        expect(messagingHost().value).toBe('msg.test');
        expect(hosts.messagingHost()).toBe('msg.test');
        expect(hosts.values()).toEqual({ host: 'mgmt2.test', messagingHost: 'msg.test' });
    });

    it('back on Software / Cloud the messaging box follows the one host again', () => {
        const hosts = create();
        type(host(), 'mgmt.test');
        button('appliance').click();
        type(messagingHost(), 'msg.test');
        button('software').click();

        expect(messagingHost().value).toBe('mgmt.test');
        expect(locked().messaging).toBe(true);
        expect(hosts.messagingHost()).toBe('mgmt.test');
        expect(hosts.values()).toEqual({ host: 'mgmt.test' });
    });

    it('saves one host for an appliance whose messaging box holds the same host, or nothing', () => {
        const hosts = create();
        type(host(), 'one.test');
        button('appliance').click();
        expect(hosts.values()).toEqual({ host: 'one.test' });

        type(messagingHost(), '');
        expect(hosts.values()).toEqual({ host: 'one.test' });
    });

    it('tells the form of a type change made by a click, and of none for the button already pressed', () => {
        const onTypeChange = vi.fn();
        const hosts = create({ onTypeChange });

        button('software').click();
        expect(onTypeChange).not.toHaveBeenCalled();
        button('appliance').click();
        expect(onTypeChange).toHaveBeenCalledExactlyOnceWith('appliance');

        // A type set in code is the form's own doing.
        hosts.setType('software');
        expect(onTypeChange).toHaveBeenCalledTimes(1);
        expect(pressed()).toEqual(['software']);
    });

    it('shows saved hosts as an appliance when they hold a messaging host, else as Software / Cloud', () => {
        const hosts = create();
        hosts.write({ host: 'mgmt.test', messagingHost: 'msg.test' });
        expect(hosts.type()).toBe('appliance');
        expect([host().value, messagingHost().value]).toEqual(['mgmt.test', 'msg.test']);

        hosts.write({ host: 'one.test' });
        expect(hosts.type()).toBe('software');
        expect([host().value, messagingHost().value]).toEqual(['one.test', 'one.test']);
    });

    it('locks the one host and the control while either part is locked', () => {
        const hosts = create();
        hosts.lock({ management: false, messaging: true });
        expect(locked()).toEqual({ type: true, host: true, messaging: true });
        hosts.lock({ management: true, messaging: false });
        expect(locked()).toEqual({ type: true, host: true, messaging: true });
        hosts.lock({ management: false, messaging: false });
        expect(locked()).toEqual({ type: false, host: false, messaging: true });
    });

    it('locks each host of an appliance with its own part, and the control with either', () => {
        const hosts = create();
        hosts.setType('appliance');
        hosts.lock({ management: true, messaging: false });
        expect(locked()).toEqual({ type: true, host: true, messaging: false });
        hosts.lock({ management: false, messaging: true });
        expect(locked()).toEqual({ type: true, host: false, messaging: true });

        // A locked control cannot change the type.
        button('software').click();
        expect(hosts.type()).toBe('appliance');
    });

    it('shows a host written in code once the form is synced', () => {
        const hosts = create();
        host().value = 'code.test';
        expect(messagingHost().value).not.toBe('code.test');
        hosts.sync();
        expect(messagingHost().value).toBe('code.test');
    });

    it('uses a form\'s own words in place of the default ones', () => {
        const text = { hostLabel: { software: 'Hostname', appliance: 'Management hostname' }, typeHint: { software: 'one', appliance: 'two' } };
        const hosts = create({ text });
        expect([el('#lbl-conn-host').textContent, el('#conn-broker-type-hint').textContent]).toEqual(['Hostname', 'one']);
        hosts.setType('appliance');
        expect([el('#lbl-conn-host').textContent, el('#conn-broker-type-hint').textContent]).toEqual(['Management hostname', 'two']);
    });

    it('refuses a control that lacks the button of a type', () => {
        button('appliance').remove();
        expect(() => create()).toThrow('Required element missing: button[data-broker-type="appliance"]');
    });
});
