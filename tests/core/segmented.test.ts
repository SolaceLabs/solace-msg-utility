import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../helpers/loadModuleDOM';
import { createSegmented, type SegmentedOptions } from '../../src/core/segmented';

/**
 * A segmented control on real markup: the Basic / OAuth2 control of the Direct
 * form's Messaging card (src/modules/connections/index.html).
 */
type Mode = 'basic' | 'oauth';
let group: HTMLElement;
const button = (mode: Mode) => group.querySelector<HTMLButtonElement>(`button[data-auth-mode="${mode}"]`)!;
const pressed = () => (['basic', 'oauth'] as const).filter(m => button(m).getAttribute('aria-pressed') === 'true');

function create(onChange?: SegmentedOptions<Mode>['onChange']) {
    return createSegmented<Mode>(group, { attr: 'data-auth-mode', choices: ['basic', 'oauth'], onChange });
}

beforeEach(() => {
    group = loadModuleDOM('connections').querySelector<HTMLElement>('#solace-auth-mode')!;
});

describe('createSegmented', () => {
    it('starts on its first choice, and a click on another button makes that the choice', () => {
        const onChange = vi.fn();
        const control = create(onChange);
        expect([control.value(), pressed()]).toEqual(['basic', ['basic']]);

        button('oauth').click();
        expect([control.value(), pressed()]).toEqual(['oauth', ['oauth']]);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('oauth');
    });

    it('reports a click that changed the choice only: not one on the pressed button, nor a choice made in code', () => {
        const onChange = vi.fn();
        const control = create(onChange);

        button('basic').click();
        control.set('oauth');
        expect(onChange).not.toHaveBeenCalled();
        expect([control.value(), pressed()]).toEqual(['oauth', ['oauth']]);
    });

    // A host that builds its controls in one place and wires its events in
    // another (queue-copy's Copy to button) subscribes after creation.
    it('reports a changed choice to a handler added after creation, beside the one given at creation', () => {
        const given = vi.fn();
        const added = vi.fn();
        const control = create(given);
        control.onChange(added);

        button('oauth').click();
        button('oauth').click();
        control.set('basic');

        expect(given).toHaveBeenCalledExactlyOnceWith('oauth');
        expect(added).toHaveBeenCalledExactlyOnceWith('oauth');
    });

    it('keeps its choice when told to choose a value it does not offer', () => {
        const control = create();
        control.set('oauth');
        control.set('kerberos' as Mode);
        expect([control.value(), pressed()]).toEqual(['oauth', ['oauth']]);
    });

    it('cannot change its choice while disabled, and can again once enabled', () => {
        const control = create();
        control.setDisabled(true);
        button('oauth').click();
        expect([control.value(), button('basic').disabled, button('oauth').disabled]).toEqual(['basic', true, true]);

        control.setDisabled(false);
        button('oauth').click();
        expect(control.value()).toBe('oauth');
    });

    it('refuses a group that lacks the button of a choice', () => {
        button('oauth').remove();
        expect(() => create()).toThrow('Required element missing: button[data-auth-mode="oauth"]');
    });
});
