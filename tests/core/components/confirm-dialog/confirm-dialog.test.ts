import { describe, it, expect } from 'vitest';
import { confirmDialog } from '../../../../src/core/components/confirm-dialog';

/** The open confirm dialog and its parts. */
function open() {
    const dialog = document.querySelector('dialog.confirm-dialog') as HTMLDialogElement;
    return {
        dialog,
        message: dialog.querySelector('.confirm-dialog-message') as HTMLElement,
        ok: dialog.querySelector('.confirm-dialog-ok') as HTMLButtonElement,
        cancel: dialog.querySelector('.confirm-dialog-cancel') as HTMLButtonElement,
    };
}

describe('core/components/confirm-dialog', () => {
    it('shows the question as text with OK and Cancel, and resolves true on OK', async () => {
        const answer = confirmDialog('Switch to "<b>v2</b>"?');
        const { dialog, message, ok, cancel } = open();
        expect(dialog.open).toBe(true);
        expect(message.textContent).toBe('Switch to "<b>v2</b>"?');
        expect(message.querySelector('b')).toBeNull();
        expect([ok.textContent, cancel.textContent]).toEqual(['OK', 'Cancel']);

        ok.click();
        await expect(answer).resolves.toBe(true);
        expect(document.querySelector('dialog.confirm-dialog')).toBeNull();
    });

    it('takes its own button labels, and resolves false on Cancel', async () => {
        const answer = confirmDialog('Delete?', { confirmLabel: 'Delete', cancelLabel: 'Keep' });
        const { ok, cancel } = open();
        expect([ok.textContent, cancel.textContent]).toEqual(['Delete', 'Keep']);
        cancel.click();
        await expect(answer).resolves.toBe(false);
    });

    it('resolves false on Esc (a close with no return value) and on a backdrop click', async () => {
        const esc = confirmDialog('First?');
        open().dialog.close();
        await expect(esc).resolves.toBe(false);

        const backdrop = confirmDialog('Second?');
        // Outside the box: jsdom lays the dialog out at 0x0, so any positive point is outside.
        open().dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 500, clientY: 500 }));
        await expect(backdrop).resolves.toBe(false);
        expect(document.querySelector('dialog.confirm-dialog')).toBeNull();
    });
});
