/**
 * An optional form field that stays out of the way until someone needs it:
 * the URL path of a broker address, in the Direct form's SEMP and Messaging
 * cards and in Conn. Mgmt's two address rows.
 *
 * While the input is empty its column shows only a small "add" button, on the
 * labels' line of the row; clicking it opens the field and focuses the input.
 * The clear button empties the input and closes the field again. The field is
 * closed only while the input is empty, so a closed field never changes the
 * URL and a path in use is always on screen: `sync()` opens it for any value
 * written in code (a loaded config, a saved connection) and closes it for an
 * empty one (Reset Form, a new connection).
 *
 * The markup is a `.optional-field` column holding a label, an
 * `.optional-field-input` (the input and its `.optional-field-clear` button)
 * and an `.optional-field-add` button. Open is the `is-open` class on the
 * column; components.css shows the label and the input for it, and the add
 * button alone without it. Disabling the buttons with the input is the
 * caller's job.
 */

export interface OptionalFieldElements {
    /** The column: label, input with its clear button, and the add button. */
    wrap: HTMLElement;
    input: HTMLInputElement;
    add: HTMLButtonElement;
    clear: HTMLButtonElement;
}

export interface OptionalField {
    /** Open the field if the input holds a value, close it if not. */
    sync(): void;
}

export function createOptionalField({ wrap, input, add, clear }: OptionalFieldElements): OptionalField {
    const setOpen = (open: boolean) => wrap.classList.toggle('is-open', open);

    add.addEventListener('click', () => {
        setOpen(true);
        input.focus();
    });
    clear.addEventListener('click', () => {
        input.value = '';
        setOpen(false);
        add.focus();
    });

    const field = { sync: () => setOpen(input.value !== '') };
    field.sync();
    return field;
}
