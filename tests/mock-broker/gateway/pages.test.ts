import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { createPages, type Page } from '../../../src/mock-broker/gateway/pages';
import { demoSeed } from '../../../src/mock-broker/gateway/seed';
import { mockCode, stepOf } from '../../../src/mock-broker/gateway/authenticator';

/**
 * The gateway's sign-in and password pages (go-web-proxy/pages.go), as the
 * managed demo shows them: the copy, every refusal, the throttle, where a
 * submit lands, and the capture of the app's sign-in links. The two-factor
 * pages (the code page, the enrol page, setting it up again, the recovery
 * codes) are the last section; the rules behind them are in two-factor.test.ts.
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

    it('follows login.passwordMinLength: the note, the fields\' minlength and the rule', () => {
        expect(gw.settings.save({ login: { passwordMinLength: 16 } }, gw.settings.rev()).ok).toBe(true);
        gw.signIn('admin', 'demo-admin-0001');
        pages.open('/login/password');
        expect(layer()!.querySelector('.mgw-note')!.textContent).toBe('16 to 128 characters.');
        expect([input('new').minLength, input('confirm').minLength, input('new').maxLength]).toEqual([16, 16, 128]);

        submit({ current: 'demo-admin-0001', new: 'a-new-password1', confirm: 'a-new-password1' });
        expect(error()).toBe('The new password must be 16 to 128 characters.');
        expect(landed).toEqual([]);
        submit({ current: 'demo-admin-0001', new: 'a-new-password-1', confirm: 'a-new-password-1' });
        expect(landed).toEqual(['app']);
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

    it('follows the link the Provisioned panel rewrote, query and all', () => {
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

describe('mock-broker/gateway/pages -- two-factor', () => {
    const codeNow = (secret: string, step = 0) => mockCode(secret, stepOf(Date.now()) + step);
    const setMode = (mode: string) => {
        expect(gw.settings.save({ login: { twoFactor: mode } }, gw.settings.rev()).ok).toBe(true);
    };
    const secretShown = () => layer()!.querySelector('#two-factor-secret')!.textContent!;
    const title = () => layer()?.querySelector('h1')?.textContent ?? null;
    const signOut = () => {
        gw.sessions.drop(gw.cookie()!);
        gw.setCookie(null);
    };
    /** `user` has two-factor under `optional`, with the browser signed out; its secret and recovery codes. */
    function enrolled(user: string, password: string) {
        setMode('mandatory');
        gw.signIn(user, password);
        const secret = gw.ticket()!.secret;
        const r = gw.confirmTwoFactor(codeNow(secret));
        if (!r.ok) throw new Error(r.error);
        signOut();
        setMode('optional');
        return { secret, recovery: r.recovery };
    }

    describe('the enrol page', () => {
        beforeEach(() => {
            setMode('mandatory');
            pages.open('/login');
            submit({ username: 'viewer', password: 'demo-viewer-0001' });
        });

        it('follows a password that passes, with no session: the secret in groups of four, a placeholder for the QR code, and where the demo\'s code is', () => {
            expect(landed).toEqual([]);
            expect(gw.session()).toBeNull();
            expect(title()).toBe('Set up two-factor sign-in');
            expect(secretShown()).toBe(gw.ticket()!.secret.replace(/(.{4})(?=.)/g, '$1 '));
            expect(secretShown().split(' ')).toHaveLength(8);
            const qr = layer()!.querySelector('.mgw-qr')!;
            expect([qr.getAttribute('role'), qr.querySelector('img, svg')]).toEqual(['img', null]);
            expect(layer()!.textContent).toContain('In this demo, open Demo controls > Authenticator for the code.');
            expect(layer()!.querySelector<HTMLInputElement>('input[name="step"]')!.value).toBe('confirm');
            expect(input('code').name).toBe('code');
            expect(pages.current()).toBe('two-factor');
        });

        it('refuses a wrong code with the same secret shown again, and stores nothing', () => {
            const secret = gw.ticket()!.secret;
            submit({ code: ['000000', '111111'].find(c => ![-1, 0, 1].map(d => codeNow(secret, d)).includes(c))! });
            expect(error()).toBe('The code is not correct.');
            expect(secretShown().replace(/ /g, '')).toBe(secret);
            expect(gw.store.totpOf('viewer')).toBeUndefined();
            expect(gw.session()).toBeNull();
        });

        it('shows the ten recovery codes once, as a list, and Continue lands on the app', () => {
            submit({ code: codeNow(gw.ticket()!.secret) });
            expect(title()).toBe('Recovery codes');
            const codes = Array.from(layer()!.querySelectorAll('ol#recovery-codes > li'), li => li.textContent!);
            expect(codes).toHaveLength(10);
            for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
            expect(layer()!.textContent).toContain('They are shown only now.');
            expect(gw.session()).toEqual({ user: 'viewer', mustChange: false });
            expect(pages.current()).toBe('app');   // a reload leaves this page

            const next = layer()!.querySelector<HTMLAnchorElement>('a#two-factor-continue')!;
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            next.dispatchEvent(click);
            expect([click.defaultPrevented, landed]).toEqual([true, ['app']]);
        });

        it('sends Continue to the password page when the password must change', () => {
            pages.open('/login');
            submit({ username: 'newadmin', password: 'demo-change-me-01' });
            submit({ code: codeNow(gw.ticket()!.secret) });
            layer()!.querySelector<HTMLAnchorElement>('#two-factor-continue')!.click();
            expect(landed).toEqual(['password']);
        });

        it('sends the browser back to the sign-in when the ticket is gone', () => {
            gw.tickets.dropUser('viewer');
            submit({ code: '123456' });
            expect(title()).toBe('Sign in');
            expect(error()).toBeNull();
        });
    });

    describe('the code page', () => {
        let secret: string;
        let recovery: string[];
        beforeEach(() => {
            ({ secret, recovery } = enrolled('viewer', 'demo-viewer-0001'));
            pages.open('/login');
            submit({ username: 'viewer', password: 'demo-viewer-0001' });
        });

        it('follows a password that passes, with no session and no way to submit anywhere', () => {
            expect(title()).toBe('Two-factor sign-in');
            expect(layer()!.querySelector('form')!.hasAttribute('action')).toBe(false);
            expect(layer()!.textContent).toContain('Enter the 6-digit code from your authenticator app, or one of your recovery codes.');
            expect(layer()!.textContent).toContain('In this demo, open Demo controls > Authenticator for the code.');
            expect(input('code').getAttribute('autocomplete')).toBe('one-time-code');
            expect([gw.session(), landed, pages.current()]).toEqual([null, [], 'code']);
            expect(document.activeElement).toBe(input('code'));
        });

        it('signs in with the code and lands on the app', () => {
            submit({ code: codeNow(secret) });
            expect(landed).toEqual(['app']);
            expect(gw.session()).toEqual({ user: 'viewer', mustChange: false });
        });

        it('signs in with a recovery code', () => {
            submit({ code: recovery[0] });
            expect(landed).toEqual(['app']);
        });

        it('refuses a wrong code, with the form again and no session', () => {
            submit({ code: '000000' });
            expect(error()).toBe('The code is not correct.');
            expect(title()).toBe('Two-factor sign-in');
            expect([gw.session(), landed]).toEqual([null, []]);
        });

        it('sends a forced change on to the password page', () => {
            const other = enrolled('newadmin', 'demo-change-me-01');
            pages.open('/login');
            submit({ username: 'newadmin', password: 'demo-change-me-01' });
            submit({ code: codeNow(other.secret) });
            expect(landed).toEqual(['password']);
        });

        it('says how long to wait when the throttle holds, and refuses the right code', () => {
            for (let i = 0; i < 5; i++) submit({ code: '000000' });
            submit({ code: codeNow(secret) });
            expect(error()).toMatch(/^Too many attempts\. Try again in \d+ seconds\.$/);
            expect(landed).toEqual([]);
        });

        it('goes back to the sign-in with the message when the account changed meanwhile', () => {
            gw.store.setPassword('viewer', 'another-password-1');
            submit({ code: codeNow(secret) });
            expect(title()).toBe('Sign in');
            expect(error()).toBe('Sign-in failed. Check the username and password.');
        });

        it('is only for a ticket that waits for a code: no ticket is the sign-in, and a session the app', () => {
            gw.tickets.dropUser('viewer');
            pages.open('/login/code');
            expect(title()).toBe('Sign in');
            gw.signIn('admin', 'demo-admin-0001');   // optional and not enrolled: a session
            pages.open('/login/code');
            expect(layer()).toBeNull();
        });
    });

    describe('setting it up again', () => {
        it('offers a signed-in user with none the password alone, then the enrol page and the codes', () => {
            setMode('optional');
            gw.signIn('viewer', 'demo-viewer-0001');
            pages.open('/login/two-factor');
            expect(title()).toBe('Two-factor sign-in');
            expect(layer()!.textContent).not.toContain('Setting it up again replaces');
            expect(layer()!.querySelector<HTMLInputElement>('input[name="step"]')!.value).toBe('verify');
            expect(layer()!.querySelector('#mgw-code')).toBeNull();
            expect(pages.current()).toBe('two-factor');

            submit({ password: 'wrong-password' });
            expect(error()).toBe('The password or the code is not correct.');
            submit({ password: 'demo-viewer-0001' });
            expect(layer()!.querySelector('#two-factor-secret')).not.toBeNull();
            submit({ code: codeNow(gw.ticket()!.secret) });
            expect(title()).toBe('Recovery codes');
            expect(gw.store.totpOf('viewer')).toBeDefined();
        });

        it('asks an enrolled user for a code or a recovery code as well', () => {
            const { secret } = enrolled('viewer', 'demo-viewer-0001');
            pages.open('/login');
            submit({ username: 'viewer', password: 'demo-viewer-0001' });
            submit({ code: codeNow(secret) });   // the code page, to be signed in
            pages.open('/login/two-factor');
            expect(title()).toBe('Two-factor sign-in');
            expect(layer()!.textContent).toContain('Setting it up again replaces the current one and its recovery codes');
            expect(layer()!.querySelector('label[for="mgw-code"]')!.textContent).toBe('Current code or a recovery code');

            submit({ password: 'demo-viewer-0001', code: '000000' });
            expect(error()).toBe('The password or the code is not correct.');
            expect(title()).toBe('Two-factor sign-in');
        });

        it('has Cancel back to the app', () => {
            setMode('optional');
            gw.signIn('viewer', 'demo-viewer-0001');
            pages.open('/login/two-factor');
            layer()!.querySelector<HTMLAnchorElement>('.mgw-links a')!.click();
            expect([layer(), pages.current()]).toEqual([null, 'app']);
        });

        it('goes to the sign-in when the session ended before the password was sent', () => {
            setMode('optional');
            gw.signIn('viewer', 'demo-viewer-0001');
            pages.open('/login/two-factor');
            gw.sessions.expire(gw.cookie()!);
            submit({ password: 'demo-viewer-0001' });
            expect(title()).toBe('Sign in');
        });

        it('sends a signed-out browser, or a forced change, to where /login goes', () => {
            pages.open('/login/two-factor');
            expect(title()).toBe('Sign in');
            setMode('optional');
            gw.signIn('newadmin', 'demo-change-me-01');
            pages.open('/login/two-factor');
            expect(title()).toBe('Change password');
        });
    });

    describe('the app\'s links and a reload', () => {
        it('catches the Two-factor sign-in link and the code link', () => {
            setMode('optional');
            gw.signIn('viewer', 'demo-viewer-0001');
            link('/login/two-factor').click();
            expect(pages.current()).toBe('two-factor');
            pages.hide();
            link('/login/code').click();
            expect(layer()).toBeNull();   // a session and no ticket: the app
        });

        it('shows the page the browser lands on, from the ticket the reload carried', () => {
            const { secret } = enrolled('viewer', 'demo-viewer-0001');
            gw.signIn('viewer', 'demo-viewer-0001');
            pages.show('code');
            expect(title()).toBe('Two-factor sign-in');
            gw.submitCode(codeNow(secret));
            pages.show('two-factor');
            expect(title()).toBe('Two-factor sign-in');
            pages.show('app');
            expect(layer()).toBeNull();
        });
    });
});
