import { logger } from './logger';

/** How long an object URL outlives its click: long enough for the browser to start the download. */
export const BLOB_URL_REVOKE_DELAY_MS = 1000;

/**
 * Save `blob` as `filename`: a temporary object URL behind an `<a download>`
 * that is clicked and removed at once, the URL revoked a moment later. Used
 * by queue-browser (a message, a zip of messages) and the backup page (an
 * export).
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
