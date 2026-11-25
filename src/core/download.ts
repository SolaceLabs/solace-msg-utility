import { logger } from './logger';
import { errMessage } from './utils';

/** How long an object URL outlives its click: long enough for the browser to start the download. */
export const BLOB_URL_REVOKE_DELAY_MS = 1000;

/**
 * Save `blob` as `filename`: a temporary object URL behind an `<a download>`
 * that is clicked and removed at once, the URL revoked a moment later. Used
 * by queue-browser (a message's full JSON, a zip of messages), the backup page
 * (an export), and saveBlob where the browser has no save dialog.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    if (!url) {
        logger.warn('[download] createObjectURL returned null -- download aborted');
        return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS);
}

/** The File System Access API's save dialog, where the browser has it (Chrome, Edge). */
interface SaveFilePickerWindow {
    showSaveFilePicker?: (opts: { suggestedName: string }) => Promise<{
        createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
    }>;
}

/**
 * Save `blob` under a name the user chooses: the browser's save dialog,
 * opened on `suggestedName`, where the browser has one (Chrome, Edge); a
 * plain download under `suggestedName` otherwise (Firefox, Safari).
 * Cancelling the dialog saves nothing. A dialog the browser refuses (a page
 * that is not a secure context, say) falls back to the plain download. A
 * write that fails after the user chose a file rejects, for the caller to
 * report. Call it from the click itself, before any await: the dialog needs
 * the user's gesture.
 */
export async function saveBlob(blob: Blob, suggestedName: string): Promise<void> {
    const w = window as unknown as SaveFilePickerWindow;
    if (!w.showSaveFilePicker) {
        downloadBlob(blob, suggestedName);
        return;
    }
    let handle;
    try {
        handle = await w.showSaveFilePicker({ suggestedName });
    } catch (e) {
        if (Object(e).name === 'AbortError') return;
        logger.warn(`[download] the save dialog was refused (${errMessage(e)}); downloading "${suggestedName}" instead`);
        downloadBlob(blob, suggestedName);
        return;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
}
