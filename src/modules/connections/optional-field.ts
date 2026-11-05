/**
 * An optional form field that stays out of the way until someone needs it:
 * the Direct form's URL Path, in the SEMP and the Messaging cards.
 *
 * While the input is empty its column shows only an "add" button; clicking it
 * opens the field and focuses the input. The clear button empties the input
 * and closes the field again. The field is closed only while the input is
 * empty, so a closed field never changes the URL and a path in use is always
 * on screen: `sync()` opens it for any value written in code (a loaded config)
 * and closes it for an empty one (Reset Form).
 *
 * Open is the `is-open` class on the column; styles.css hides the input and
 * keeps the label's height while it is closed, so the row does not shift.
 * Disabling the buttons while connected is `ui.updateInputState`'s job, with
 * the input's.
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
