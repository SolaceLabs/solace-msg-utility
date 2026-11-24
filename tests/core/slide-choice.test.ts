import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../helpers/loadModuleDOM';
import { createSlideChoice, type SlideChoiceOptions } from '../../src/core/slide-choice';

/**
 * A slide choice on real markup: the Copy / Move control of Queue Copy's
 * Destination card (src/modules/queue-copy/index.html).
 */
type Mode = 'copy' | 'move';
let group: HTMLElement;
const input = () => group.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const text = (mode: Mode) => group.querySelector<HTMLElement>(`[data-choice="${mode}"]`)!;
const highlighted = () => (['copy', 'move'] as const).filter(m => text(m).classList.contains('active'));

function create(onChange?: SlideChoiceOptions<Mode>['onChange']) {
    return createSlideChoice<Mode>(group, { choices: ['copy', 'move'], onChange });
}

/** Move the switch as a user does: the tick box changes, then reports it. */
function slide(on: boolean): void {
    input().checked = on;
    input().dispatchEvent(new Event('change'));
}

beforeEach(() => {
    group = loadModuleDOM('queue-copy').querySelector<HTMLElement>('#copy-mode-switch')!;
});

describe('createSlideChoice', () => {
    it('starts on its first answer with the switch off, and the switch on is the second answer', () => {
        const onChange = vi.fn();
        const control = create(onChange);
        expect([control.value(), highlighted()]).toEqual(['copy', ['copy']]);

        slide(true);
        expect([control.value(), highlighted()]).toEqual(['move', ['move']]);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('move');

        slide(false);
        expect([control.value(), highlighted()]).toEqual(['copy', ['copy']]);
        expect(onChange).toHaveBeenLastCalledWith('copy');
    });

    it('starts on the second answer when the template has the switch on', () => {
        input().checked = true;
        const control = create();
        expect([control.value(), highlighted()]).toEqual(['move', ['move']]);
    });

    it('moves the switch for a choice made in code, without reporting it', () => {
        const onChange = vi.fn();
        const control = create(onChange);
        control.set('move');
        expect([control.value(), input().checked, highlighted()]).toEqual(['move', true, ['move']]);
        control.set('copy');
        expect([control.value(), input().checked, highlighted()]).toEqual(['copy', false, ['copy']]);
        expect(onChange).not.toHaveBeenCalled();
    });

    // A host that builds its controls in one place and wires its events in
    // another (queue-copy's element cache) subscribes after creation.
    it('reports a moved switch to a handler added after creation, beside the one given at creation', () => {
        const given = vi.fn();
        const added = vi.fn();
        const control = create(given);
        control.onChange(added);

        slide(true);

        expect(given).toHaveBeenCalledExactlyOnceWith('move');
        expect(added).toHaveBeenCalledExactlyOnceWith('move');
    });

    it('keeps its choice when told to choose a value it does not offer', () => {
        const control = create();
        control.set('move');
        control.set('delete' as Mode);
        expect([control.value(), highlighted()]).toEqual(['move', ['move']]);
    });

    it('locks and frees its switch', () => {
        const control = create();
        control.setDisabled(true);
        expect(input().disabled).toBe(true);
        control.setDisabled(false);
        expect(input().disabled).toBe(false);
    });

    it.each([
        ['the switch', 'input', 'Required element missing: input[type="checkbox"]'],
        ['the text of an answer', '[data-choice="move"]', 'Required element missing: [data-choice="move"]'],
    ])('refuses a group that lacks %s', (_, selector, message) => {
        group.querySelector(selector)!.remove();
        expect(() => create()).toThrow(message);
    });
});
