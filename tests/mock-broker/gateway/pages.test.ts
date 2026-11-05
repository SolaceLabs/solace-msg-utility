import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { createPages, type Page } from '../../../src/mock-broker/gateway/pages';
import { demoSeed } from '../../../src/mock-broker/gateway/seed';

/**
 * The gateway's sign-in and password pages (go-web-proxy/pages.go), as the
 * managed demo shows them: the copy, every refusal, the throttle, where a
 * submit lands, and the capture of the app's sign-in links.
 */
let gw: ReturnType<typeof createGateway>;
let landed: Page[];
let pages: ReturnType<typeof createPages>;
let undoNav: () => void;

beforeEach(() => {
    document.body.innerHTML = '';
    gw = createGateway({ seed: demoSeed() });
    landed = [];
    pages = createPages({ gateway: gw, navigate: p => landed.push(p) });
    undoNav = pages.installNav();
});

afterEach(() => {
    undoNav();
    vi.useRealTimers();
});

const layer = () => document.querySelector<HTMLElement>('.mgw-page');
const error = () => layer()?.querySelector('[role="alert"]')?.textContent ?? null;
const input = (id: string) => document.querySelector<HTMLInputElement>(`#mgw-${id}`)!;

function submit(values: Record<string, string>): void {
    for (const [id, v] of Object.entries(values)) input(id).value = v;
    layer()!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

function link(href: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.href = href;
    a.setAttribute('href', href);
    document.body.appendChild(a);
    return a;
}

describe('mock-broker/gateway/pages -- sign-in', () => {
    it('shows the gateway\'s form, with no action and nothing to send it', () => {
        pages.open('/login');
        const form = layer()!.querySelector('form')!;
        expect(layer()!.querySelector('h1')!.textContent).toBe('Sign in');
        expect(form.hasAttribute('action')).toBe(false);
        expect(form.hasAttribute('method')).toBe(false);
        expect(input('username').getAttribute('autocomplete')).toBe('username');
        expect(input('password').type).toBe('password');
        expect(pages.current()).toBe('login');
        expect(document.activeElement).toBe(input('username'));
    });

    it('stops the browser\'s own submission', () => {
        pages.open('/login');
        input('username').value = 'admin';
        const e = new Event('submit', { cancelable: true });
        layer()!.querySelector('form')!.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
    });

    it('signs in and lands on the app', () => {
        pages.open('/login');
        submit({ username: 'operator', password: 'demo-operator-01' });
        expect(landed).toEqual(['app']);
        expect(gw.session()).toEqual({ user: 'operator', mustChange: false });
    });

    it('sends a forced change to the password page', () => {
        pages.open('/login');
        submit({ username: 'newadmin', password: 'demo-change-me-01' });
        expect(landed).toEqual(['password']);
        expect(gw.session()).toEqual({ user: 'newadmin', mustChange: true });
    });

    it('gives every failure the same message', () => {
        pages.open('/login');
        submit({ username: 'operator', password: 'wrong' });
        expect(error()).toBe('Sign-in failed. Check the username and password.');
        submit({ username: 'nobody', password: 'demo-operator-01' });
        expect(error()).toBe('Sign-in failed. Check the username and password.');
        expect(landed).toEqual([]);
    });

    it('locks sign-in after five failures, refuses the right password while locked, and counts down', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
        pages.open('/login');
        for (let i = 0; i < 5; i++) submit({ username: 'operator', password: `wrong-${i}` });
        submit({ username: 'operator', password: 'demo-operator-01' });
        expect(error()).toBe('Too many attempts. Try again in 30 seconds.');
        expect(landed).toEqual([]);

        vi.setSystemTime(new Date('2026-11-05T10:00:20Z'));
        submit({ username: 'operator', password: 'demo-operator-01' });
        expect(error()).toBe('Too many attempts. Try again in 10 seconds.');

        vi.setSystemTime(new Date('2026-11-05T10:00:31Z'));
        submit({ username: 'operator', password: 'demo-operator-01' });
        expect(landed).toEqual(['app']);
    });

    it('doubles the lockout with each failure past the limit', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
        for (let i = 0; i < 6; i++) gw.throttle.failed('admin');
        expect(gw.signIn('admin', 'demo-admin-0001')).toEqual({ ok: false, error: 'Too many attempts. Try again in 60 seconds.' });
        gw.throttle.clear();
        expect(gw.signIn('admin', 'demo-admin-0001').ok).toBe(true);
    });

    it('ends the browser\'s previous session on a new sign-in', () => {
        expect(gw.signIn('viewer', 'demo-viewer-0001').ok).toBe(true);
        const first = gw.cookie();
        gw.signIn('operator', 'demo-operator-01');
        expect(gw.sessions.get(first)).toBeNull();
    });
});

describe('mock-broker/gateway/pages -- password', () => {
    it('holds a forced change on the page, with no way out', () => {
        gw.signIn('newadmin', 'demo-change-me-01');
        pages.open('/login/password');
        expect(layer()!.querySelector('.mgw-note')!.textContent).toBe('You must set a new password before you continue.');
        expect(layer()!.querySelector('a')).toBeNull();
        // /login sends a forced change back here.
        pages.open('/login');
        expect(layer()!.querySelector('h1')!.textContent).toBe('Change password');
    });

    it.each([
        [{ current: 'wrong', new: 'a-new-password-1', confirm: 'a-new-password-1' }, 'The current password is not correct.'],
        [{ current: 'demo-change-me-01', new: 'a-new-password-1', confirm: 'a-new-password-2' }, 'The new passwords do not match.'],
        [{ current: 'demo-change-me-01', new: 'short', confirm: 'short' }, 'The new password must be 12 to 128 characters.'],
        [{ current: 'demo-change-me-01', new: 'demo-change-me-01', confirm: 'demo-change-me-01' }, 'The new password must differ from the current one.'],
    ])('refuses %o', (values, message) => {
        gw.signIn('newadmin', 'demo-change-me-01');
        pages.open('/login/password');
        submit(values);
        expect(error()).toBe(message);
        expect(landed).toEqual([]);
    });

    it('changes the password, ends every session of the user and opens a fresh one', () => {
        gw.signIn('newadmin', 'demo-change-me-01');
        const old = gw.cookie();
        const other = gw.openSession('newadmin', true);
        pages.open('/login/password');
        submit({ current: 'demo-change-me-01', new: 'a-new-password-1', confirm: 'a-new-password-1' });

        expect(landed).toEqual(['app']);
        expect([gw.sessions.get(old), gw.sessions.get(other)]).toEqual([null, null]);
        expect(gw.session()).toEqual({ user: 'newadmin', mustChange: false });
        expect(gw.signIn('newadmin', 'a-new-password-1').ok).toBe(true);
    });

    it('offers Cancel back to the app when the change is not forced', () => {
        gw.signIn('admin', 'demo-admin-0001');
        pages.open('/login/password');
        expect(layer()!.querySelector('.mgw-note')!.textContent).toBe('12 to 128 characters.');
        const cancel = layer()!.querySelector('a')!;
        expect(cancel.textContent).toBe('Cancel');
        cancel.click();
        expect(layer()).toBeNull();
        expect(pages.current()).toBe('app');
    });

    it('sends a signed-out browser to the sign-in instead', () => {
        pages.open('/login/password');
        expect(layer()!.querySelector('h1')!.textContent).toBe('Sign in');
        gw.signIn('admin', 'demo-admin-0001');
        pages.open('/login/password');
        gw.sessions.expire(gw.cookie()!);
        submit({ current: 'demo-admin-0001', new: 'a-new-password-1', confirm: 'a-new-password-1' });
        expect(layer()!.querySelector('h1')!.textContent).toBe('Sign in');
    });
});

describe('mock-broker/gateway/pages -- the app\'s sign-in links', () => {
    it('opens the sign-in page for a plain, modified or middle click, and stops the browser', () => {
        const a = link('/login');
        for (const ev of [
            new MouseEvent('click', { bubbles: true, cancelable: true }),
            new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
            new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
        ]) {
            pages.hide();
            a.dispatchEvent(ev);
            expect(ev.defaultPrevented).toBe(true);
            expect(pages.current()).toBe('login');
        }
    });

    it('leaves a right click to the browser\'s menu', () => {
        const ev = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 });
        link('/login').dispatchEvent(ev);
        expect([ev.defaultPrevented, pages.current()]).toEqual([false, 'app']);
    });

    it('follows the link the Managed panel rewrote, query and all', () => {
        gw.signIn('newadmin', 'demo-change-me-01');
        link('/login/password?next=%2F').click();
        expect(pages.current()).toBe('password');
    });

    it('sends a signed-in browser straight back to the app', () => {
        gw.signIn('viewer', 'demo-viewer-0001');
        link('/login').click();
        expect(layer()).toBeNull();
    });

    it('leaves every other link alone', () => {
        const a = link('/logins');
        let preventedBefore: boolean | null = null;
        // The capture listener has run by the time the link's own does; stop
        // jsdom's navigation only after looking.
        a.addEventListener('click', (e) => {
            preventedBefore = e.defaultPrevented;
            e.preventDefault();
        });
        a.click();
        expect(preventedBefore).toBe(false);
        expect(layer()).toBeNull();
    });

    it('shows the page the browser lands on', () => {
        pages.show('login');
        expect(pages.current()).toBe('login');
        pages.show('app');
        expect(layer()).toBeNull();
    });
});
