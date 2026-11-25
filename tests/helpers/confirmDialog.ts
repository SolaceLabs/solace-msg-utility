import { vi } from 'vitest';

/**
 * Drive the core confirm dialog (src/core/components/confirm-dialog) the way a
 * user would. A module that asks through confirmDialog() has the dialog open as
 * soon as its handler runs; answerConfirm() clicks OK or Cancel and lets the
 * handler's `await` continue, returning the question that was shown so a test
 * can assert the exact wording.
 */
export async function answerConfirm(yes: boolean): Promise<string> {
    // A handler may await something before it asks: wait for the dialog.
    const dialog = await vi.waitFor(() => {
        const open = document.querySelector('dialog.confirm-dialog') as HTMLDialogElement | null;
        if (!open) throw new Error('answerConfirm: no confirm dialog is open');
        return open;
    });
    const question = dialog.querySelector('.confirm-dialog-message')!.textContent!;
    (dialog.querySelector(yes ? '.confirm-dialog-ok' : '.confirm-dialog-cancel') as HTMLButtonElement).click();
    // close -> the dialog's promise resolves -> the handler's await continues.
    await Promise.resolve();
    await Promise.resolve();
    return question;
}

/** True while a core confirm dialog is open (a handler that must not ask). */
export function confirmOpen(): boolean {
    return document.querySelector('dialog.confirm-dialog') !== null;
}
