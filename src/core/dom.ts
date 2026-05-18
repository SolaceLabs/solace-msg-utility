/**
 * Query a required element from a root node. Throws if the element is missing,
 * giving modules a loud fail-fast signal at install time instead of silent
 * partial wiring. Callers can treat the return value as non-null.
 */
export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`Required element missing: ${selector}`);
    return el;
}

/**
 * Wires a `<dialog>` to close itself when the user clicks outside the dialog
 * box (on the backdrop). Clicks on the `::backdrop` bubble up with
 * `target === dialog`, but so do clicks on the dialog's own padding (any area
 * the user sees as "inside the modal" that no child element catches). To tell
 * them apart, hit-test the click coordinates against the dialog's bounding
 * rect: only close when the point is geometrically outside the box.
 */
export function attachBackdropClose(dialog: HTMLDialogElement): void {
    dialog.addEventListener('click', (e) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;
        if (!inside) dialog.close('backdrop');
    });
}
