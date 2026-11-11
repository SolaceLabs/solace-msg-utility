import { describe, it, expect, vi } from 'vitest';
import { createRowList, renderAdminRows, type AdminTableOptions } from '../../../../src/core/components/row-list';

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

describe('renderAdminRows()', () => {
    const opts = (over: Partial<AdminTableOptions<{ n: string }>> = {}): AdminTableOptions<{ n: string }> => ({
        plural: 'things',
        noun: 'thing',
        classPrefix: 'thing',
        cells: t => `<td>${t.n}</td><td>x</td>`,
        label: t => t.n,
        onEdit: () => {},
        onDelete: () => {},
        ...over,
    });

    it('says there are none when nothing was loaded', () => {
        const tbody = document.createElement('tbody');
        renderAdminRows(tbody, [], 0, '', opts());
        expect(tbody.textContent).toBe('No things.');
    });

    it('names the filter when the loaded items all miss it', () => {
        const tbody = document.createElement('tbody');
        renderAdminRows(tbody, [], 2, 'zz', opts());
        expect(tbody.textContent).toBe('No things match "zz".');
    });

    it('renders a row per item with labelled Edit and Delete buttons that call back', () => {
        const tbody = document.createElement('tbody');
        const onEdit = vi.fn();
        const onDelete = vi.fn();
        const items = [{ n: 'a' }, { n: 'b' }];
        renderAdminRows(tbody, items, 2, '', opts({ onEdit, onDelete }));
        expect(tbody.querySelectorAll('tr')).toHaveLength(2);
        expect(tbody.querySelector('td.thing-actions-col')).not.toBeNull();
        const edit = tbody.querySelectorAll<HTMLButtonElement>('.thing-edit')[1];
        const del = tbody.querySelectorAll<HTMLButtonElement>('.thing-delete')[0];
        expect(edit.title).toBe('Edit thing "b"');
        expect(del.title).toBe('Delete thing "a"');
        edit.click();
        del.click();
        expect(onEdit).toHaveBeenCalledWith(items[1]);
        expect(onDelete).toHaveBeenCalledWith(items[0]);
    });

    it('replaces earlier rows on a re-render', () => {
        const tbody = document.createElement('tbody');
        renderAdminRows(tbody, [{ n: 'a' }], 1, '', opts());
        renderAdminRows(tbody, [], 1, 'q', opts());
        expect(tbody.querySelectorAll('tr')).toHaveLength(1);
        expect(tbody.textContent).toBe('No things match "q".');
    });
});
