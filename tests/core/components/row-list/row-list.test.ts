import { describe, it, expect } from 'vitest';
import { createRowList } from '../../../../src/core/components/row-list';

const FIELDS = [
    { key: 'a', placeholder: 'A' },
    { key: 'b', placeholder: 'B' },
];

function container(): HTMLElement {
    return document.createElement('div');
}

describe('core/components/row-list', () => {
    it('adds an empty row: one input per field + a remove button', () => {
        const c = container();
        const rl = createRowList(c, FIELDS);
        rl.addRow();
        expect(rl.count()).toBe(1);
        expect(c.querySelectorAll('input').length).toBe(2);
        expect(c.querySelector('.row-list-remove')).not.toBeNull();
    });

    it('prefills a row by field key; absent keys become empty', () => {
        const c = container();
        const rl = createRowList(c, FIELDS);
        rl.addRow({ a: 'x' });
        const inputs = c.querySelectorAll<HTMLInputElement>('input');
        expect(inputs[0].value).toBe('x');
        expect(inputs[1].value).toBe('');
    });

    it('readRows trims values and skips fully-blank rows', () => {
        const c = container();
        const rl = createRowList(c, FIELDS);
        rl.addRow({ a: '  x  ', b: 'y' });
        rl.addRow({ a: '', b: '' });   // all-blank → excluded
        rl.addRow({ a: '', b: ' z ' }); // partially filled → kept (trimmed)
        expect(rl.readRows()).toEqual([
            { a: 'x', b: 'y' },
            { a: '', b: 'z' },
        ]);
    });

    it('the per-row remove button drops only its own row', () => {
        const c = container();
        const rl = createRowList(c, FIELDS);
        rl.addRow({ a: '1' });
        rl.addRow({ a: '2' });
        expect(rl.count()).toBe(2);
        c.querySelector<HTMLButtonElement>('.row-list-remove')!.click();
        expect(rl.count()).toBe(1);
        expect(rl.readRows()).toEqual([{ a: '2', b: '' }]);
    });

    it('clear removes every row', () => {
        const c = container();
        const rl = createRowList(c, FIELDS);
        rl.addRow();
        rl.addRow();
        rl.clear();
        expect(rl.count()).toBe(0);
        expect(rl.readRows()).toEqual([]);
    });

    it('honours a password field type', () => {
        const c = container();
        const rl = createRowList(c, [{ key: 'p', placeholder: 'P', type: 'password' }]);
        rl.addRow();
        expect(c.querySelector<HTMLInputElement>('input')!.type).toBe('password');
    });
});
