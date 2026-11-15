import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    askReload, handleConflict, staleMessage, goneMessage, STALE_IMPORT_MESSAGE,
} from '../../src/core/admin-conflict';
import type { ManagedError } from '../../src/core/services/managed-api';
import { answerConfirm } from '../helpers/confirmDialog';

const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../src/core/toast', () => toastMock);

const err = (status: number, code: string): ManagedError => ({ ok: false, status, code });

beforeEach(() => toastMock.showToast.mockReset());

describe('core/admin-conflict', () => {
    it('words the three messages with the caller subject', () => {
        expect(staleMessage('This user')).toBe('This user was changed by someone else since you opened it.');
        expect(goneMessage('This connection')).toBe('This connection was deleted by someone else.');
        expect(STALE_IMPORT_MESSAGE).toBe("The gateway's data changed since the preview. Run the preview again.");
    });

    it('askReload shows the stale message with a Reload button: true on Reload, false on Cancel', async () => {
        const yes = askReload('This user');
        const question = await answerConfirm(true);
        expect(question).toBe('This user was changed by someone else since you opened it.');
        expect(await yes).toBe(true);

        const no = askReload('This user');
        await answerConfirm(false);
        expect(await no).toBe(false);
    });

    it('askReload labels its confirm button Reload', async () => {
        const pending = askReload('This schedule');
        const ok = await vi.waitFor(() => {
            const b = document.querySelector<HTMLButtonElement>('dialog.confirm-dialog .confirm-dialog-ok');
            if (!b) throw new Error('no dialog');
            return b;
        });
        expect(ok.textContent).toBe('Reload');
        ok.click();
        await pending;
    });

    it('stale: Reload calls reload once and the conflict is handled', async () => {
        const reload = vi.fn();
        const done = handleConflict(err(409, 'stale'), 'This user', reload);
        await answerConfirm(true);
        expect(await done).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('stale: Cancel leaves the form alone (no reload) but the conflict is still handled', async () => {
        const reload = vi.fn();
        const done = handleConflict(err(409, 'stale'), 'This user', reload);
        await answerConfirm(false);
        expect(await done).toBe(true);
        expect(reload).not.toHaveBeenCalled();
    });

    it('not_found: says it was deleted by someone else and reloads at once, without a dialog', async () => {
        const reload = vi.fn().mockResolvedValue(undefined);
        expect(await handleConflict(err(404, 'not_found'), 'This connection', reload)).toBe(true);
        expect(toastMock.showToast).toHaveBeenCalledWith('This connection was deleted by someone else.', 'error');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(document.querySelector('dialog.confirm-dialog')).toBeNull();
    });

    it('any other failure is not handled: no dialog, no toast, no reload', async () => {
        const reload = vi.fn();
        expect(await handleConflict(err(409, 'last_admin'), 'This user', reload)).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect(toastMock.showToast).not.toHaveBeenCalled();
    });
});
