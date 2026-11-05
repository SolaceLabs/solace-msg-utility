import { describe, it, expect, beforeEach } from 'vitest';
import { createOptionalField, type OptionalFieldElements } from '../../../src/modules/connections/optional-field';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

/**
 * The URL Path column of the Direct form's SEMP card, from the real template.
 * tests/modules/connections/module.test.ts > "URL Path on demand" covers both
 * cards through the module.
 */
let els: OptionalFieldElements;

beforeEach(() => {
    const container = loadModuleDOM('connections');
    document.body.replaceChildren(container);
    const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
    els = {
        wrap: q('#semp-url-path-field'),
        input: q<HTMLInputElement>('#semp-url-path'),
        add: q<HTMLButtonElement>('#btn-semp-url-path-add'),
        clear: q<HTMLButtonElement>('#btn-semp-url-path-clear'),
    };
});

const open = () => els.wrap.classList.contains('is-open');

describe('connections/optional-field', () => {
    it('starts closed over an empty input, and open over a value already there', () => {
        createOptionalField(els);
        expect(open()).toBe(false);

        els.input.value = '/api';
        createOptionalField(els);
        expect(open()).toBe(true);
    });

    it('opens on the add button and puts the caret in the input', () => {
        createOptionalField(els);
        els.add.click();
        expect([open(), document.activeElement]).toEqual([true, els.input]);
    });

    it('clears and closes on the clear button, handing focus back to the add button', () => {
        createOptionalField(els);
        els.add.click();
        els.input.value = '/api';
        els.clear.click();
        expect([els.input.value, open(), document.activeElement]).toEqual(['', false, els.add]);
    });

    it('sync() follows a value written in code: open for a path, closed for none', () => {
        const field = createOptionalField(els);
        els.input.value = '/api';
        field.sync();
        expect(open()).toBe(true);
        els.input.value = '';
        field.sync();
        expect(open()).toBe(false);
    });
});
