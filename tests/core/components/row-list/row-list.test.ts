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

    it('adds nothing but rows when no field is labelled and no empty note is given', () => {
        const c = container();
        createRowList(c, FIELDS).addRow();
        expect(c.children.length).toBe(1);
        expect(c.querySelector('.row-list-head, .row-list-empty')).toBeNull();
    });

    describe('column labels', () => {
        const LABELLED = [{ key: 'a', placeholder: 'a (e.g. *)', label: 'Alpha' }, { key: 'b', placeholder: 'B' }];
        const labels = (c: HTMLElement) => Array.from(c.querySelectorAll('.row-list-label'), n => n.textContent);
        const headShown = (c: HTMLElement) => !c.querySelector('.row-list-head')!.classList.contains('hidden');

        it('names each column, an unlabelled one blank, with a spacer where the remove button sits', () => {
            const c = container();
            createRowList(c, LABELLED);
            expect(labels(c)).toEqual(['Alpha', '']);
            const spacer = c.querySelector('.row-list-head .row-list-spacer')!;
            expect(spacer.getAttribute('aria-hidden')).toBe('true');
            // The remove button's glyph, so it takes the same width.
            expect(spacer.textContent).toBe('\u2715');
        });

        it('shows the labels only while there are rows: they stay put once a row is filled', () => {
            const c = container();
            const rl = createRowList(c, LABELLED);
            expect(headShown(c)).toBe(false);
            rl.addRow({ a: 'x', b: 'y' });
            expect(headShown(c)).toBe(true);
            c.querySelector<HTMLButtonElement>('.row-list-remove')!.click();
            expect(headShown(c)).toBe(false);
            rl.addRow();
            rl.clear();
            expect(headShown(c)).toBe(false);
            // clear takes the rows only; the header stays for the next row.
            rl.addRow();
            expect(headShown(c)).toBe(true);
        });
    });

    describe('empty note', () => {
        const shown = (c: HTMLElement) => !c.querySelector('.row-list-empty')!.classList.contains('hidden');

        it('says what an empty list means while there are no rows, and only then', () => {
            const c = container();
            const rl = createRowList(c, FIELDS, { empty: 'None: nothing is granted.' });
            expect(c.querySelector('.row-list-empty')!.textContent).toBe('None: nothing is granted.');
            expect(shown(c)).toBe(true);
            rl.addRow();
            expect(shown(c)).toBe(false);
            c.querySelector<HTMLButtonElement>('.row-list-remove')!.click();
            expect(shown(c)).toBe(true);
            rl.addRow();
            rl.clear();
            expect(shown(c)).toBe(true);
            expect(rl.readRows()).toEqual([]);
        });
    });

    it('honours a password field type', () => {
        const c = container();
        const rl = createRowList(c, [{ key: 'p', placeholder: 'P', type: 'password' }]);
        rl.addRow();
        expect(c.querySelector<HTMLInputElement>('input')!.type).toBe('password');
    });
});
