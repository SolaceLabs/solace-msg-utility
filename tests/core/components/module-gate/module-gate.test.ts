import { describe, it, expect } from 'vitest';
import { createGate } from '../../../../src/core/components/module-gate';

function container(): HTMLElement {
    return document.createElement('div');
}

describe('core/components/module-gate', () => {
    it('builds a hidden gate card from the shared classes, prepended to the container', () => {
        const c = container();
        c.appendChild(document.createElement('section')); // pre-existing module view
        createGate(c, { id: 'x-gate', title: 'Access Required', message: 'Please do the thing.' });

        const gate = c.querySelector('#x-gate') as HTMLElement;
        expect(gate).not.toBeNull();
        expect(c.firstElementChild).toBe(gate); // prepended ahead of existing content
        expect(gate.classList.contains('card')).toBe(true);
        expect(gate.classList.contains('text-center')).toBe(true);
        expect(gate.classList.contains('p-6')).toBe(true);
        expect(gate.classList.contains('hidden')).toBe(true); // hidden by default
        expect(gate.querySelector('h2')!.textContent).toBe('Access Required');
        expect(gate.querySelector('p')!.textContent).toBe('Please do the thing.');
    });

    it('show() reveals and hide() conceals the gate', () => {
        const c = container();
        const gate = createGate(c, { id: 'x-gate', title: 'T', message: 'M' });
        const el = c.querySelector('#x-gate') as HTMLElement;

        gate.show();
        expect(el.classList.contains('hidden')).toBe(false);
        gate.hide();
        expect(el.classList.contains('hidden')).toBe(true);
    });
});
