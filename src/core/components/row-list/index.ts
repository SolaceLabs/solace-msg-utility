/**
 * Row-list editor — a reusable "list of rows of labelled text inputs + a
 * per-row remove button + an add button (wired by the caller)" widget.
 *
 * Used by the admin modules: user-management edits two glob lists
 * (operate / read-only, each row = brokers/msgVpns/queues) and
 * connection-management edits a VPN list (each row = name/user/pass). The row
 * shape is parameterised by `fields`, so the same factory serves all three.
 *
 * Function API (anchor #9): the caller passes the container it owns; this owns
 * its content: the rows, their remove-button wiring, a header naming the
 * columns (from each field's `label`; the placeholders vanish once a row is
 * filled, so they cannot label it) and, with `RowListOptions.empty`, a note
 * saying what an empty list means. The header shows while there are rows, the
 * note while there are none. The DOM is the source of truth -- there is no
 * parallel array to keep in sync. Layout uses the shared utility classes
 * (`flex-row`, `gap-2`, `btn-icon`) plus this component's `styles.css`.
 */
import { required } from '../../dom';
import { ICONS, iconButton } from '../../icons';

export interface RowField {
    /** Identity of the field: the key in read rows AND the input's data-key. */
    key: string;
    /** Placeholder text for the empty input. */
    placeholder: string;
    /** The column's name in the header. */
    label?: string;
    /** Input type — `password` masks the value (e.g. broker credentials). */
    type?: 'text' | 'password';
}

export interface RowList {
    /** Append a row, optionally pre-filled by field key. */
    addRow(values?: Record<string, string>): void;
    /** Read every row that has at least one non-blank field (values trimmed). */
    readRows(): Record<string, string>[];
    /** Remove all rows. */
    clear(): void;
    /** Number of rows currently rendered. */
    count(): number;
}

export interface RowListOptions {
    /** Shown in place of the rows while there are none: what an empty list means. */
    empty?: string;
}

const ROW_CLASS = 'row-list-row';
const REMOVE_GLYPH = '\u2715';

export function createRowList(container: HTMLElement, fields: RowField[], opts: RowListOptions = {}): RowList {
    let head: HTMLElement | null = null;
    if (fields.some(f => f.label)) {
        head = document.createElement('div');
        head.className = 'flex-row gap-2 row-list-head';
        fields.forEach(f => {
            const label = document.createElement('span');
            label.className = 'row-list-label';
            label.textContent = f.label ?? '';
            head!.appendChild(label);
        });
        // Holds the remove button's width, so the labels line up with the inputs.
        const spacer = document.createElement('span');
        spacer.className = 'btn-icon row-list-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.textContent = REMOVE_GLYPH;
        head.appendChild(spacer);
        container.appendChild(head);
    }
    let empty: HTMLElement | null = null;
    if (opts.empty) {
        empty = document.createElement('p');
        empty.className = 'row-list-empty';
        empty.textContent = opts.empty;
        container.appendChild(empty);
    }

    function count(): number {
        return container.querySelectorAll(`.${ROW_CLASS}`).length;
    }

    function sync(): void {
        const n = count();
        head?.classList.toggle('hidden', n === 0);
        empty?.classList.toggle('hidden', n > 0);
    }

    function addRow(values: Record<string, string> = {}): void {
        const row = document.createElement('div');
        row.className = `flex-row gap-2 mb-2 ${ROW_CLASS}`;

        fields.forEach(f => {
            const input = document.createElement('input');
            input.type = f.type ?? 'text';
            input.className = 'form-control';
            input.placeholder = f.placeholder;
            input.dataset.key = f.key;
            input.value = values[f.key] ?? '';
            row.appendChild(input);
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-icon row-list-remove';
        remove.title = 'Remove row';
        remove.textContent = REMOVE_GLYPH;
        remove.addEventListener('click', () => {
            row.remove();
            sync();
        });
        row.appendChild(remove);

        container.appendChild(row);
        sync();
    }

    function readRows(): Record<string, string>[] {
        const out: Record<string, string>[] = [];
        container.querySelectorAll(`.${ROW_CLASS}`).forEach(row => {
            const obj: Record<string, string> = {};
            let hasValue = false;
            fields.forEach(f => {
                // The input always exists — addRow created one per field.
                const input = required<HTMLInputElement>(row as HTMLElement, `input[data-key="${f.key}"]`);
                const v = input.value.trim();
                obj[f.key] = v;
                if (v) hasValue = true;
            });
            if (hasValue) out.push(obj);
        });
        return out;
    }

    function clear(): void {
        container.querySelectorAll(`.${ROW_CLASS}`).forEach(row => row.remove());
        sync();
    }

    sync();
    return { addRow, readRows, clear, count };
}

export interface AdminTableOptions<T> {
    /** Plural noun for the empty rows: "No <plural>." / "No <plural> match "<q>"." */
    plural: string;
    /** Prefix of the action classes: `<prefix>-edit`, `<prefix>-delete`, `<prefix>-actions-col`. */
    classPrefix: string;
    /** Inner HTML of the row's data cells; the caller escapes every value. */
    cells: (item: T) => string;
    /** The row's identity, for the Edit / Delete button labels. */
    label: (item: T) => string;
    /** The noun in those labels ("user", "connection"). */
    noun: string;
    onEdit: (item: T) => void;
    onDelete: (item: T) => void;
}

/**
 * Fills an admin table body: one row per item (data cells, then an Edit and a
 * Delete icon button), or a single row saying why there are none -- the list
 * is empty, or the filter `query` matched nothing. The caller filters; `items`
 * is what to show, `total` how many were loaded.
 */
export function renderAdminRows<T>(tbody: HTMLElement, items: T[], total: number, query: string, opts: AdminTableOptions<T>): void {
    tbody.innerHTML = '';
    if (items.length === 0) {
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'text-secondary';
        td.textContent = total === 0 ? `No ${opts.plural}.` : `No ${opts.plural} match "${query}".`;
        tbody.appendChild(document.createElement('tr')).appendChild(td);
        return;
    }
    items.forEach(item => {
        const name = opts.label(item);
        const tr = document.createElement('tr');
        tr.innerHTML = opts.cells(item);
        const actions = document.createElement('div');
        actions.className = 'flex-row gap-2';
        actions.append(
            iconButton(ICONS.edit, `Edit ${opts.noun} "${name}"`, `${opts.classPrefix}-edit`, () => opts.onEdit(item)),
            iconButton(ICONS.delete, `Delete ${opts.noun} "${name}"`, `btn-icon-danger ${opts.classPrefix}-delete`,
                () => opts.onDelete(item)),
        );
        const cell = document.createElement('td');
        cell.className = `${opts.classPrefix}-actions-col`;
        cell.appendChild(actions);
        tr.appendChild(cell);
        tbody.appendChild(tr);
    });
}
