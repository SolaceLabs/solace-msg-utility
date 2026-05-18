/**
 * Toast notification helper — creates a transient message inside `#toast-container`
 * (declared once in `src/index.html`) and auto-removes after a timeout. Safe to call
 * from any module; no state lives here, no event bus involvement.
 *
 * Typical use:
 *   showToast('Queue "orders" bound', 'ok');
 *   showToast('Forward queue is at capacity', 'warn');
 *   showToast('Broker rejected message', 'error');
 *   showToast('Loading saved config', 'info');
 *
 * `type` drives the coloured left border:
 *   - ok    → green  (status-connected)     — successful action complete
 *   - warn  → orange (status-warning)       — degraded but proceeding
 *   - error → red    (status-disconnected)  — failure / user action needed
 *   - info  → teal   (accent-secondary)     — neutral status (default)
 *
 * `durationMs` is the time the toast remains fully visible; after it expires we
 * run a short fade-out transition and then remove the node. The container is
 * positioned top-right; additional toasts append below the existing stack.
 */

export type ToastType = 'ok' | 'warn' | 'error' | 'info';

const DEFAULT_DURATION_MS = 1000;
const FADE_OUT_MS = 200;

export function showToast(
    message: string,
    type: ToastType = 'info',
    durationMs: number = DEFAULT_DURATION_MS
): void {
    const container = document.getElementById('toast-container');
    // In non-DOM environments (unit tests, SSR) there's nothing to attach to; skip.
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;

    container.appendChild(toast);

    // Next frame: flip to visible so the CSS transition (opacity + translate) runs.
    requestAnimationFrame(() => {
        toast.classList.add('toast--visible');
    });

    setTimeout(() => {
        toast.classList.remove('toast--visible');
        toast.classList.add('toast--leaving');
        setTimeout(() => {
            if (toast.parentElement === container) {
                container.removeChild(toast);
            }
        }, FADE_OUT_MS);
    }, durationMs);
}
