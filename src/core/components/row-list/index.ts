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
 * the rows' DOM and the remove-button wiring. The DOM is the source of truth —
 * there is no parallel array to keep in sync. Layout uses the shared utility
 * classes (`flex-row`, `gap-2`, `btn-icon`), so no module-scoped CSS is needed.
 */
import { required } from '../../dom';

export interface RowField {
    /** Identity of the field: the key in read rows AND the input's data-key. */
    key: string;
    /** Placeholder text for the empty input. */
    placeholder: string;
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

const ROW_CLASS = 'row-list-row';

export function createRowList(container: HTMLElement, fields: RowField[]): RowList {
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
        remove.textContent = '✕';
        remove.addEventListener('click', () => row.remove());
        row.appendChild(remove);

        container.appendChild(row);
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
        container.innerHTML = '';
    }

    function count(): number {
        return container.querySelectorAll(`.${ROW_CLASS}`).length;
    }

    return { addRow, readRows, clear, count };
}
