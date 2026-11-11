/**
 * Notification center -- the record of what the app told the user, behind a
 * bell in the header.
 *
 * Toasts vanish after a second; this keeps them. The kernel creates one
 * `NotificationCenter` per app and hands it to every module as
 * `AppContext.notifications`; it feeds it from two sources:
 *
 *   - every ok / warn / error toast (`showToast` dispatches `TOAST_EVENT` on
 *     `#toast-container`; info toasts are not recorded), tagged with the module
 *     the user is on;
 *   - the connection lifecycle on the bus (`client:*`, `semp:*`).
 *
 * A module records something without a toast with
 * `ctx.notifications.add(level, module, text)`.
 *
 * Persistence: `sessionStorage`, per tab -- the list survives a reload and is
 * dropped when the tab closes or on Clear all. In Direct mode a connect to a
 * different broker starts a fresh list (`noteConnected`); a disconnect and
 * reconnect to the same broker keeps it. A Provisioned session never clears
 * it that way, so a re-login in the same tab keeps the list. Every storage
 * access is guarded: without storage the list lives in memory for the page.
 *
 * API:
 *   createNotificationCenter(opts?) -> NotificationCenter   (the store)
 *   mountNotificationBell(slot, center) -> { destroy() }    (the bell + drawer)
 *
 * The bell owns its DOM: a button with an unread badge placed in `slot`, and a
 * native `<dialog>` drawer appended to `document.body` (Esc closes it natively,
 * a backdrop click closes it, Clear all empties the store).
 */
import { attachBackdropClose } from '../../dom';
import { logger } from '../../logger';

const log = logger.withTag('notifications');

export type NotificationLevel = 'info' | 'ok' | 'warn' | 'error';

export interface NotificationEntry {
    /** When it was recorded, ISO 8601. */
    time: string;
    level: NotificationLevel;
    /** The module it concerns, as the sidebar names it (or `App`). */
    module: string;
    text: string;
}

export interface NotificationCenter {
    /** Record one notification (newest last). */
    add(level: NotificationLevel, module: string, text: string): void;
    /** Every kept notification, oldest first. */
    entries(): readonly NotificationEntry[];
    /** How many were recorded since the user last opened the drawer. */
    unread(): number;
    markAllRead(): void;
    /** Drop every notification (Clear all). */
    clear(): void;
    /** Called after every change; returns the unsubscribe. */
    subscribe(listener: () => void): () => void;
    /**
     * A primary connection came up. Direct mode (`provisioned` false): a
     * different broker from the last one starts a fresh list. Provisioned:
     * never clears.
     */
    noteConnected(identity: { broker: string; provisioned: boolean }): void;
}

export type NotificationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** At most this many are kept; the oldest go first. */
export const NOTIFICATION_CAP = 200;

/** The `sessionStorage` key of the saved list. */
export const NOTIFICATION_STORAGE_KEY = 'smu.notifications.v1';

const LEVELS: readonly NotificationLevel[] = ['info', 'ok', 'warn', 'error'];

interface Saved { entries: NotificationEntry[]; unread: number; lastBroker: string }

function isEntry(v: unknown): v is NotificationEntry {
    const e = Object(v) as Record<string, unknown>;
    return typeof e.time === 'string' && typeof e.module === 'string'
        && typeof e.text === 'string' && LEVELS.includes(e.level as NotificationLevel);
}

/** The tab's sessionStorage, or null where the browser refuses it (storage disabled). */
function defaultStorage(): NotificationStorage | null {
    try {
        return globalThis.sessionStorage;
    } catch (e) {
        log.warn('sessionStorage is unavailable; notifications are kept for this page only:', e);
        return null;
    }
}

function restore(storage: NotificationStorage | null): Saved {
    const empty: Saved = { entries: [], unread: 0, lastBroker: '' };
    if (!storage) return empty;
    let raw: string | null;
    try {
        raw = storage.getItem(NOTIFICATION_STORAGE_KEY);
    } catch (e) {
        log.warn(`cannot read the saved notifications (${NOTIFICATION_STORAGE_KEY}); starting empty:`, e);
        return empty;
    }
    if (raw === null) return empty;
    try {
        const v = JSON.parse(raw) as Partial<Saved> | null;
        if (!v || !Array.isArray(v.entries) || !v.entries.every(isEntry)
            || typeof v.unread !== 'number' || typeof v.lastBroker !== 'string') {
            throw new Error('not a saved notification list');
        }
        const entries = v.entries.slice(-NOTIFICATION_CAP);
        return { entries, unread: Math.min(v.unread, entries.length), lastBroker: v.lastBroker };
    } catch (e) {
        log.warn(`the saved notifications (${NOTIFICATION_STORAGE_KEY}) are unreadable; starting empty:`, e);
        return empty;
    }
}

export function createNotificationCenter(
    opts: { storage?: NotificationStorage | null; now?: () => Date } = {},
): NotificationCenter {
    const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    const now = opts.now ?? (() => new Date());
    let { entries, unread, lastBroker } = restore(storage);
    const listeners = new Set<() => void>();

    function changed(): void {
        if (storage) {
            try {
                storage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify({ entries, unread, lastBroker }));
            } catch (e) {
                log.warn(`cannot save the notifications (${NOTIFICATION_STORAGE_KEY}); they are kept for this page only:`, e);
            }
        }
        for (const listener of [...listeners]) listener();
    }

    return {
        add(level, module, text) {
            entries = [...entries, { time: now().toISOString(), level, module, text }].slice(-NOTIFICATION_CAP);
            unread = Math.min(unread + 1, entries.length);
            changed();
        },
        entries: () => entries,
        unread: () => unread,
        markAllRead() {
            unread = 0;
            changed();
        },
        clear() {
            entries = [];
            unread = 0;
            changed();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        noteConnected({ broker, provisioned }) {
            if (!provisioned && lastBroker && broker !== lastBroker) {
                log.info(`Direct connect to broker "${broker}" (was "${lastBroker}"): notifications cleared`);
                entries = [];
                unread = 0;
            }
            lastBroker = broker;
            changed();
        },
    };
}

const BELL_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

/** Local wall-clock time of an ISO stamp, HH:MM:SS. */
function clock(iso: string): string {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * Place the bell (with its unread badge) in `slot` and its drawer in
 * `document.body`. Opening the drawer marks everything read; while it is open
 * new entries appear in it live and are read at once.
 */
export function mountNotificationBell(slot: HTMLElement, center: NotificationCenter): { destroy(): void } {
    const bell = el('button', 'notif-bell');
    bell.type = 'button';
    bell.title = 'Notifications';
    bell.innerHTML = BELL_SVG;
    const badge = el('span', 'notif-badge hidden');
    bell.appendChild(badge);
    slot.appendChild(bell);

    const drawer = el('dialog', 'notif-drawer');
    drawer.setAttribute('aria-label', 'Notifications');
    const header = el('div', 'notif-header');
    const btnClear = el('button', 'btn btn-secondary notif-clear', 'Clear all');
    btnClear.type = 'button';
    const btnClose = el('button', 'btn btn-secondary notif-close', 'Close');
    btnClose.type = 'button';
    const actions = el('div', 'notif-actions');
    actions.append(btnClear, btnClose);
    header.append(el('h3', 'notif-title', 'Notifications'), actions);
    const empty = el('p', 'notif-empty text-secondary', 'No notifications yet.');
    const list = el('ol', 'notif-list');
    drawer.append(header, empty, list);
    document.body.appendChild(drawer);
    attachBackdropClose(drawer);

    function row(e: NotificationEntry): HTMLLIElement {
        const li = el('li', `notif-item notif-item--${e.level}`);
        const time = el('time', 'notif-time', clock(e.time));
        time.dateTime = e.time;
        li.append(time, el('span', 'notif-level', e.level), el('span', 'notif-module', e.module), el('span', 'notif-text', e.text));
        return li;
    }

    function update(): void {
        // Visible entries are read entries; markAllRead re-enters update.
        if (drawer.open && center.unread() > 0) {
            center.markAllRead();
            return;
        }
        const n = center.unread();
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.classList.toggle('hidden', n === 0);
        bell.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
        if (drawer.open) {
            const items = center.entries();
            list.replaceChildren(...items.map(row));
            empty.classList.toggle('hidden', items.length > 0);
        }
    }

    bell.addEventListener('click', () => {
        drawer.showModal();
        center.markAllRead();
    });
    btnClear.addEventListener('click', () => center.clear());
    btnClose.addEventListener('click', () => drawer.close());
    const unsubscribe = center.subscribe(update);
    update();

    return {
        destroy() {
            unsubscribe();
            bell.remove();
            drawer.remove();
        },
    };
}
