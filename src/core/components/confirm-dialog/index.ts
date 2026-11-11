/**
 * Confirm dialog -- the app's yes/no question, in place of the browser's
 * blocking `confirm()`: a native modal `<dialog>` the component creates, shows
 * and removes again.
 *
 *     if (await confirmDialog('Switch to "v2"?', { confirmLabel: 'Switch' })) { ... }
 *
 * Resolves true on the confirm button; false on Cancel, Esc (the dialog's
 * native cancel) or a click on the backdrop. The message is set as text, never
 * as markup. Styles: ./styles.css (`.confirm-dialog-*`), imported by
 * src/css/main.css.
 */
import { attachBackdropClose } from '../../dom';

export interface ConfirmOptions {
    /** The confirm button's label; default 'OK'. */
    confirmLabel?: string;
    /** The cancel button's label; default 'Cancel'. */
    cancelLabel?: string;
}

/** The dialog's `returnValue` when the user confirmed. */
const CONFIRMED = 'confirm';

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    const text = document.createElement('p');
    text.className = 'confirm-dialog-message';
    text.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary confirm-dialog-cancel';
    cancel.textContent = opts.cancelLabel ?? 'Cancel';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary confirm-dialog-ok';
    ok.textContent = opts.confirmLabel ?? 'OK';
    actions.append(cancel, ok);
    dialog.append(text, actions);

    cancel.addEventListener('click', () => dialog.close('cancel'));
    ok.addEventListener('click', () => dialog.close(CONFIRMED));
    attachBackdropClose(dialog);

    return new Promise<boolean>((resolve) => {
        // Every way out (a button, Esc, the backdrop) closes the dialog.
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve(dialog.returnValue === CONFIRMED);
        }, { once: true });
        document.body.appendChild(dialog);
        dialog.showModal();
        ok.focus();
    });
}
