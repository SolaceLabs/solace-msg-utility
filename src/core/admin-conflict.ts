/**
 * Admin conflicts -- what the admin modules tell the admin when the gateway
 * refuses a save or delete because the record moved on since it was loaded
 * (`stale`) or is gone (`not_found`). Shared by User Management, Connection
 * Management, Gateway Settings and Backup & Restore, so the wording lives once.
 *
 *     if (await handleConflict(res, 'This user', () => applyGate())) return;
 *
 * `subject` is the start of the sentence: "This user", "This connection",
 * "This schedule", "This settings page".
 */
import { confirmDialog } from './components/confirm-dialog';
import { showToast } from './toast';
import type { ManagedError } from './services/managed-api';

/** Shown when an import is refused because the gateway's data changed after the preview. */
export const STALE_IMPORT_MESSAGE = "The gateway's data changed since the preview. Run the preview again.";

export const staleMessage = (subject: string): string =>
    `${subject} was changed by someone else since you opened it.`;

export const goneMessage = (subject: string): string =>
    `${subject} was deleted by someone else.`;

/**
 * The stale-save dialog: what happened, and a Reload button. Resolves true
 * when the admin chose Reload, false on Cancel, Esc or a click on the backdrop
 * (the form, with the admin's edits, stays open).
 */
export function askReload(subject: string): Promise<boolean> {
    return confirmDialog(staleMessage(subject), { confirmLabel: 'Reload' });
}

/**
 * Handle the two conflicts of a save or delete on a record: `stale` asks the
 * admin to Reload (and calls `reload` when they do), `not_found` says the
 * record was deleted by someone else and calls `reload` at once. `reload` brings
 * back the current list and closes any open form. Resolves true when `err` was
 * one of the two (handled), false for any other failure, which the caller reports.
 */
export async function handleConflict(err: ManagedError, subject: string, reload: () => void | Promise<void>): Promise<boolean> {
    if (err.code === 'stale') {
        if (await askReload(subject)) await reload();
        return true;
    }
    if (err.code === 'not_found') {
        showToast(goneMessage(subject), 'error');
        await reload();
        return true;
    }
    return false;
}
