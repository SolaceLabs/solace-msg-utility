import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createNotificationCenter,
    mountNotificationBell,
    NOTIFICATION_CAP,
    NOTIFICATION_STORAGE_KEY,
    type NotificationStorage,
} from '../../../../src/core/components/notification-center';

/** A storage object over a plain map, standing in for one tab's sessionStorage. */
function memoryStorage(): NotificationStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { data.set(k, v); },
        removeItem: (k: string) => { data.delete(k); },
    };
}

const AT = new Date(2026, 10, 11, 9, 5, 7);
const now = () => AT;

beforeEach(() => {
    sessionStorage.clear();
});

describe('notification center store', () => {
    it('records entries oldest first with time, level, module and text', () => {
        const center = createNotificationCenter({ storage: memoryStorage(), now });
        center.add('ok', 'Queue Browser', 'Queue "orders" bound');
        center.add('error', 'Queue Copy', 'Broker rejected message');

        expect(center.entries()).toEqual([
            { time: AT.toISOString(), level: 'ok', module: 'Queue Browser', text: 'Queue "orders" bound' },
            { time: AT.toISOString(), level: 'error', module: 'Queue Copy', text: 'Broker rejected message' },
        ]);
    });

    it('counts unread until markAllRead; Clear all empties the list', () => {
        const center = createNotificationCenter({ storage: memoryStorage(), now });
        center.add('warn', 'App', 'a');
        center.add('warn', 'App', 'b');
        expect(center.unread()).toBe(2);
        center.markAllRead();
        expect(center.unread()).toBe(0);
        center.add('info', 'App', 'c');
        center.clear();
        expect(center.entries()).toEqual([]);
        expect(center.unread()).toBe(0);
    });

    it(`keeps the newest ${NOTIFICATION_CAP} when the cap is passed`, () => {
        const center = createNotificationCenter({ storage: memoryStorage(), now });
        for (let i = 0; i < NOTIFICATION_CAP + 5; i++) center.add('info', 'App', `n${i}`);
        expect(center.entries()).toHaveLength(NOTIFICATION_CAP);
        expect(center.entries()[0].text).toBe('n5');
        expect(center.entries().at(-1)!.text).toBe(`n${NOTIFICATION_CAP + 4}`);
        expect(center.unread()).toBe(NOTIFICATION_CAP);
    });

    it('notifies subscribers on every change until they unsubscribe', () => {
        const center = createNotificationCenter({ storage: memoryStorage(), now });
        const listener = vi.fn();
        const unsubscribe = center.subscribe(listener);
        center.add('ok', 'App', 'a');
        center.markAllRead();
        center.clear();
        center.noteConnected({ broker: 'b1', provisioned: false });
        expect(listener).toHaveBeenCalledTimes(4);
        unsubscribe();
        center.add('ok', 'App', 'b');
        expect(listener).toHaveBeenCalledTimes(4);
    });

    describe('persistence', () => {
        it('a reload (a new center on the same storage) restores the entries, the unread count and the last broker', () => {
            const storage = memoryStorage();
            const before = createNotificationCenter({ storage, now });
            before.noteConnected({ broker: 'b1', provisioned: false });
            before.add('error', 'Queue Copy', 'Copy failed');

            const after = createNotificationCenter({ storage, now });
            expect(after.entries()).toEqual(before.entries());
            expect(after.unread()).toBe(1);
            // The restored last broker still decides the Direct-mode clear.
            after.noteConnected({ broker: 'b1', provisioned: false });
            expect(after.entries()).toHaveLength(1);
        });

        it("uses the tab's sessionStorage when no storage is given", () => {
            createNotificationCenter({ now }).add('ok', 'App', 'saved');
            expect(JSON.parse(sessionStorage.getItem(NOTIFICATION_STORAGE_KEY)!).entries[0].text).toBe('saved');
            expect(createNotificationCenter().entries()).toHaveLength(1);
        });

        it.each([
            ['not JSON', '{oops'],
            ['null', 'null'],
            ['no last broker', JSON.stringify({ entries: [], unread: 0 })],
            ['no unread count', JSON.stringify({ entries: [], lastBroker: '' })],
            ['entries not a list', JSON.stringify({ entries: {}, unread: 0, lastBroker: '' })],
            ['an entry with an unknown level', JSON.stringify({
                entries: [{ time: 't', level: 'fatal', module: 'App', text: 'x' }], unread: 1, lastBroker: '',
            })],
            ['an entry that is not an object', JSON.stringify({ entries: [null], unread: 1, lastBroker: '' })],
        ])('a saved value that is %s starts empty, with a warn', (_label, raw) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const storage = memoryStorage();
            storage.data.set(NOTIFICATION_STORAGE_KEY, raw);

            const center = createNotificationCenter({ storage, now });

            expect(center.entries()).toEqual([]);
            expect(center.unread()).toBe(0);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('[notifications] the saved notifications'), expect.any(Error));
        });

        it('an unread count above the restored entries is held to their number', () => {
            const storage = memoryStorage();
            storage.data.set(NOTIFICATION_STORAGE_KEY, JSON.stringify({
                entries: [{ time: AT.toISOString(), level: 'ok', module: 'App', text: 'x' }], unread: 9, lastBroker: 'b1',
            }));
            expect(createNotificationCenter({ storage, now }).unread()).toBe(1);
        });

        it('a storage that refuses reads and writes keeps the list for the page, with warns', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const refuse = () => { throw new DOMException('denied', 'SecurityError'); };
            const center = createNotificationCenter({ storage: { getItem: refuse, setItem: refuse, removeItem: refuse }, now });

            center.add('warn', 'App', 'still recorded');

            expect(center.entries().map(e => e.text)).toEqual(['still recorded']);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot read the saved notifications'), expect.any(DOMException));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot save the notifications'), expect.any(DOMException));
        });

        it('with no storage at all (null) the list lives in memory', () => {
            const center = createNotificationCenter({ storage: null, now });
            center.add('ok', 'App', 'in memory');
            expect(center.entries()).toHaveLength(1);
            expect(sessionStorage.getItem(NOTIFICATION_STORAGE_KEY)).toBeNull();
        });

        it('when the browser refuses sessionStorage itself, the list lives in memory with a warn', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')!;
            Object.defineProperty(globalThis, 'sessionStorage', {
                configurable: true,
                get() { throw new DOMException('storage disabled', 'SecurityError'); },
            });
            try {
                const center = createNotificationCenter({ now });
                center.add('ok', 'App', 'in memory');
                expect(center.entries()).toHaveLength(1);
                expect(warn).toHaveBeenCalledWith(expect.stringContaining('sessionStorage is unavailable'), expect.any(DOMException));
            } finally {
                Object.defineProperty(globalThis, 'sessionStorage', original);
            }
        });
    });

    describe('noteConnected', () => {
        function withEntry(): ReturnType<typeof createNotificationCenter> {
            const center = createNotificationCenter({ storage: memoryStorage(), now });
            center.noteConnected({ broker: 'b1', provisioned: false });
            center.add('ok', 'Queue Browser', 'bound');
            return center;
        }

        it('Direct mode: a connect to a different broker starts a fresh list', () => {
            const center = withEntry();
            center.noteConnected({ broker: 'b2', provisioned: false });
            expect(center.entries()).toEqual([]);
            expect(center.unread()).toBe(0);
        });

        it('Direct mode: a reconnect to the same broker keeps the list, as does the first connect of the tab', () => {
            const center = withEntry();
            center.noteConnected({ broker: 'b1', provisioned: false });
            expect(center.entries()).toHaveLength(1);
        });

        it('Provisioned: a different broker never clears, and becomes the last broker', () => {
            const center = withEntry();
            center.noteConnected({ broker: 'b2', provisioned: true });
            expect(center.entries()).toHaveLength(1);
            center.noteConnected({ broker: 'b2', provisioned: false });
            expect(center.entries()).toHaveLength(1);
        });
    });
});

describe('notification bell', () => {
    function mount(center = createNotificationCenter({ storage: memoryStorage(), now })) {
        const slot = document.createElement('div');
        document.body.appendChild(slot);
        const handle = mountNotificationBell(slot, center);
        const bell = slot.querySelector<HTMLButtonElement>('button.notif-bell')!;
        const badge = bell.querySelector<HTMLElement>('.notif-badge')!;
        const drawer = document.querySelector<HTMLDialogElement>('dialog.notif-drawer')!;
        return { center, slot, handle, bell, badge, drawer };
    }

    const texts = (drawer: HTMLDialogElement) =>
        Array.from(drawer.querySelectorAll('.notif-item .notif-text'), n => n.textContent);

    it('shows the unread count in the badge: hidden at 0, the count, then 99+', () => {
        const { center, bell, badge } = mount();
        expect(badge.classList.contains('hidden')).toBe(true);
        expect(bell.getAttribute('aria-label')).toBe('Notifications');

        center.add('warn', 'App', 'one');
        expect(badge.classList.contains('hidden')).toBe(false);
        expect(badge.textContent).toBe('1');
        expect(bell.getAttribute('aria-label')).toBe('Notifications, 1 unread');

        for (let i = 0; i < 99; i++) center.add('info', 'App', `n${i}`);
        expect(badge.textContent).toBe('99+');
    });

    it('opening the drawer lists the entries oldest first and marks them read', () => {
        const { center, bell, badge, drawer } = mount();
        center.add('ok', 'Queue Browser', 'first');
        center.add('error', 'Queue Copy', 'second');

        bell.click();

        expect(drawer.open).toBe(true);
        expect(texts(drawer)).toEqual(['first', 'second']);
        const row = drawer.querySelector('.notif-item--error')!;
        expect(row.querySelector('.notif-time')!.textContent).toBe('09:05:07');
        expect(row.querySelector('.notif-level')!.textContent).toBe('error');
        expect(row.querySelector('.notif-module')!.textContent).toBe('Queue Copy');
        expect(center.unread()).toBe(0);
        expect(badge.classList.contains('hidden')).toBe(true);
        expect(drawer.querySelector('.notif-empty')!.classList.contains('hidden')).toBe(true);
    });

    it('an entry arriving while the drawer is open appears at once and is read', () => {
        const { center, bell, badge, drawer } = mount();
        bell.click();
        center.add('warn', 'Queue Browser', 'live');
        expect(texts(drawer)).toEqual(['live']);
        expect(center.unread()).toBe(0);
        expect(badge.classList.contains('hidden')).toBe(true);
    });

    it('renders entry text as text, never as markup', () => {
        const { center, bell, drawer } = mount();
        center.add('error', '<b>m</b>', '<img src=x onerror="alert(1)">');
        bell.click();
        expect(drawer.querySelector('img')).toBeNull();
        expect(drawer.querySelector('b')).toBeNull();
        expect(texts(drawer)).toEqual(['<img src=x onerror="alert(1)">']);
    });

    it('Clear all empties the list and shows the empty state', () => {
        const { center, bell, drawer } = mount();
        center.add('ok', 'App', 'gone soon');
        bell.click();
        drawer.querySelector<HTMLButtonElement>('.notif-clear')!.click();
        expect(center.entries()).toEqual([]);
        expect(texts(drawer)).toEqual([]);
        expect(drawer.querySelector('.notif-empty')!.classList.contains('hidden')).toBe(false);
    });

    it('Close and a backdrop click close the drawer; Esc (cancel) is left to the browser', () => {
        const { bell, drawer } = mount();
        bell.click();
        drawer.querySelector<HTMLButtonElement>('.notif-close')!.click();
        expect(drawer.open).toBe(false);

        bell.click();
        // jsdom lays nothing out (a zero rect), so any point is outside the box.
        drawer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 }));
        expect(drawer.open).toBe(false);

        bell.click();
        const cancel = new Event('cancel', { cancelable: true });
        drawer.dispatchEvent(cancel);
        expect(cancel.defaultPrevented).toBe(false);
    });

    it('destroy removes the bell and the drawer and stops listening', () => {
        const { center, slot, handle, badge } = mount();
        handle.destroy();
        expect(slot.querySelector('.notif-bell')).toBeNull();
        expect(document.querySelector('dialog.notif-drawer')).toBeNull();
        center.add('warn', 'App', 'after destroy');
        expect(badge.textContent).toBe('0');
    });
});
