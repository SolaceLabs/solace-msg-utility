/**
 * The gateway's own pages, `/login`, `/login/password` and the two-factor
 * pages `/login/code` and `/login/two-factor` (go-web-proxy/pages.go,
 * pages/login.html), as layers over the app: the same copy and the same flow.
 * A submit is answered by the fake gateway in this page, never
 * sent anywhere: the forms carry no action, and their handler stops the
 * browser's own submission before anything else.
 *
 * The app reaches them by plain links (`a[href="/login"]`, rewritten by the
 * Managed panel as the session changes), so one capture-phase listener on the
 * document catches every such click, plain or modified, before the browser
 * follows it. A successful submit hands the page the browser would land on to
 * `navigate`, which the boot answers with a reload, as the gateway's `303`
 * and the full load after it would. The steps between two pages of the
 * two-factor flow (the code page after the password, the recovery codes
 * after the enrolment) are shown in place: the state they depend on is the
 * gateway's ticket, which a reload carries.
 *
 * The enrol page draws a placeholder where the gateway draws the QR code,
 * and says where the demo's code is (Demo controls > Authenticator).
 *
 * Not simulated: `?next=` (sign-in always returns to the app).
 *
 * Mock-only.
 */
import './pages.css';
import { groupSecret } from './authenticator';
import { PASSWORD_MAX, PASSWORD_MIN } from './validate';
import type { Gateway } from './index';

/**
 * Where the browser is: the app, or one of the gateway's pages over it.
 * `code` is /login/code and `two-factor` is /login/two-factor (its enrol and
 * set-up-again pages); the recovery codes are shown once and a reload leaves
 * them, so they count as the app.
 */
export type Page = 'app' | 'login' | 'password' | 'code' | 'two-factor';

export interface PagesDeps {
    gateway: Gateway;
    /** A submit went through: the browser now loads `page`. */
    navigate: (page: Page) => void;
}

const LOGIN_PATHS = new Set(['/login', '/login/password', '/login/code', '/login/two-factor']);

const DEMO_CODE_HINT = 'In this demo, open Demo controls > Authenticator for the code.';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
}

export function createPages({ gateway, navigate }: PagesDeps) {
    let layer: HTMLElement | null = null;
    let current: Page = 'app';

    function hide(): void {
        layer?.remove();
        layer = null;
        current = 'app';
    }

    function frame(form: HTMLElement, title: string, page: Page): void {
        hide();
        layer = el('div', { class: 'mgw-page', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
        const main = el('main');
        const header = el('header', {}, 'Solace ');
        header.appendChild(el('span', {}, 'Message Utility'));
        main.append(header, form, el('p', { class: 'mgw-demo' },
            'Demo: the accounts and their passwords are listed in Demo controls, bottom right.'));
        layer.appendChild(main);
        document.body.appendChild(layer);
        current = page;
    }

    function field(form: HTMLFormElement, id: string, label: string, attrs: Record<string, string>): HTMLInputElement {
        form.appendChild(el('label', { for: id }, label));
        const input = el('input', { id, name: id.replace(/^mgw-/, ''), required: '', ...attrs });
        form.appendChild(input);
        return input;
    }

    function submitted(form: HTMLFormElement, fn: () => void): void {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            fn();
        });
    }

    function showLogin(error = ''): void {
        const form = el('form', { autocomplete: 'on' });
        form.appendChild(el('h1', {}, 'Sign in'));
        if (error) form.appendChild(el('p', { class: 'mgw-error', role: 'alert' }, error));
        const user = field(form, 'mgw-username', 'Username', { autocomplete: 'username', maxlength: '64' });
        const pass = field(form, 'mgw-password', 'Password', { type: 'password', autocomplete: 'current-password', maxlength: '128' });
        form.appendChild(el('button', { type: 'submit' }, 'Sign in'));
        submitted(form, () => {
            const r = gateway.signIn(user.value, pass.value);
            if (!r.ok) showLogin(r.error);
            else if ('step' in r) open(r.step === 'code' ? '/login/code' : '/login/two-factor');
            else navigate(r.mustChange ? 'password' : 'app');
        });
        frame(form, 'Sign in', 'login');
        user.focus();
    }

    /** A code field: a six-digit code or a recovery code, so no digit-only input mode. */
    function codeField(form: HTMLFormElement, label: string): HTMLInputElement {
        return field(form, 'mgw-code', label, { autocomplete: 'one-time-code', maxlength: '32' });
    }

    function hidden(form: HTMLFormElement, name: string, value: string): void {
        form.appendChild(el('input', { type: 'hidden', name, value }));
    }

    function showCode(error = ''): void {
        const form = el('form', { autocomplete: 'off' });
        form.appendChild(el('h1', {}, 'Two-factor sign-in'));
        form.appendChild(el('p', { class: 'mgw-note' }, 'Enter the 6-digit code from your authenticator app, or one of your recovery codes.'));
        if (error) form.appendChild(el('p', { class: 'mgw-error', role: 'alert' }, error));
        const code = codeField(form, 'Code');
        form.appendChild(el('button', { type: 'submit' }, 'Continue'));
        form.appendChild(el('p', { class: 'mgw-note' }, DEMO_CODE_HINT));
        submitted(form, () => {
            const r = gateway.submitCode(code.value);
            if (r.ok) navigate(r.mustChange ? 'password' : 'app');
            else if (r.signedOut) showLogin(r.error);
            else showCode(r.error);
        });
        frame(form, 'Two-factor sign-in', 'code');
        code.focus();
    }

    /** The enrol page, for a new secret (a sign-in's `enrol` ticket, or a set-up-again `setup` ticket). */
    function showEnrol(secret: string, error = ''): void {
        const form = el('form', { autocomplete: 'off' });
        form.appendChild(el('h1', {}, 'Set up two-factor sign-in'));
        form.appendChild(el('p', { class: 'mgw-note' }, 'Add this account to an authenticator app with the key below, then enter the 6-digit code it shows.'));
        form.appendChild(el('div', { class: 'mgw-qr', role: 'img', 'aria-label': 'Placeholder where the QR code would be' }, 'QR code'));
        form.appendChild(el('p', { class: 'mgw-note' }, 'Key:'));
        form.appendChild(el('code', { id: 'two-factor-secret', class: 'mgw-secret' }, groupSecret(secret)));
        form.appendChild(el('p', { class: 'mgw-note' }, DEMO_CODE_HINT));
        if (error) form.appendChild(el('p', { class: 'mgw-error', role: 'alert' }, error));
        hidden(form, 'step', 'confirm');
        const code = codeField(form, 'Code');
        form.appendChild(el('button', { type: 'submit' }, 'Turn on two-factor sign-in'));
        submitted(form, () => {
            const r = gateway.confirmTwoFactor(code.value);
            if (r.ok) showRecovery(r.recovery, r.mustChange);
            else if (r.signedOut) showLogin(r.error);
            else showEnrol(secret, r.error);
        });
        frame(form, 'Set up two-factor sign-in', 'two-factor');
        code.focus();
    }

    /** A signed-in user setting two-factor up again, or for the first time: the password, and a code when enrolled. */
    function showSetup(enrolled: boolean, error = ''): void {
        const form = el('form', { autocomplete: 'off' });
        form.appendChild(el('h1', {}, 'Two-factor sign-in'));
        form.appendChild(el('p', { class: 'mgw-note' }, 'Confirm it is you before a new authenticator is set up.'
            + (enrolled ? ' Setting it up again replaces the current one and its recovery codes, and signs you out everywhere else.' : '')));
        if (error) form.appendChild(el('p', { class: 'mgw-error', role: 'alert' }, error));
        hidden(form, 'step', 'verify');
        const pass = field(form, 'mgw-password', 'Password', { type: 'password', autocomplete: 'current-password', maxlength: '128' });
        const code = enrolled ? codeField(form, 'Current code or a recovery code') : null;
        form.appendChild(el('button', { type: 'submit' }, 'Continue'));
        const links = el('p', { class: 'mgw-links' });
        const cancel = el('a', { href: '/' }, 'Cancel');
        cancel.addEventListener('click', (e) => {
            e.preventDefault();
            hide();
        });
        links.appendChild(cancel);
        form.appendChild(links);
        submitted(form, () => {
            const r = gateway.verifyTwoFactor(pass.value, code?.value ?? '');
            if (r.ok) showEnrol(r.secret);
            else if (r.signedOut) showLogin(r.error);
            else showSetup(enrolled, r.error);
        });
        frame(form, 'Two-factor sign-in', 'two-factor');
        pass.focus();
    }

    /** The ten recovery codes, shown once, and the link on to where the sign-in was going. */
    function showRecovery(codes: string[], mustChange: boolean): void {
        const body = el('div', { class: 'mgw-body' });
        body.appendChild(el('h1', {}, 'Recovery codes'));
        body.appendChild(el('p', { class: 'mgw-note' }, 'Two-factor sign-in is on. Keep these recovery codes somewhere safe: each works once if you lose your authenticator. They are shown only now.'));
        const items = el('ol', { id: 'recovery-codes', class: 'mgw-recovery' });
        for (const c of codes) items.appendChild(el('li', {}, c));
        body.appendChild(items);
        const links = el('p', { class: 'mgw-links' });
        const next = el('a', { id: 'two-factor-continue', href: '/' }, 'Continue');
        next.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(mustChange ? 'password' : 'app');
        });
        links.appendChild(next);
        body.appendChild(links);
        frame(body, 'Recovery codes', 'app');
    }

    function showPassword(error = ''): void {
        const required = gateway.session()?.mustChange ?? false;
        const form = el('form');
        form.appendChild(el('h1', {}, 'Change password'));
        if (required) form.appendChild(el('p', { class: 'mgw-note' }, 'You must set a new password before you continue.'));
        if (error) form.appendChild(el('p', { class: 'mgw-error', role: 'alert' }, error));
        const len = { minlength: String(PASSWORD_MIN), maxlength: String(PASSWORD_MAX) };
        const cur = field(form, 'mgw-current', 'Current password', { type: 'password', autocomplete: 'current-password', maxlength: '128' });
        const next = field(form, 'mgw-new', 'New password', { type: 'password', autocomplete: 'new-password', ...len });
        const confirm = field(form, 'mgw-confirm', 'Confirm new password', { type: 'password', autocomplete: 'new-password', ...len });
        form.appendChild(el('p', { class: 'mgw-note' }, `${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`));
        form.appendChild(el('button', { type: 'submit' }, 'Change password'));
        if (!required) {
            const links = el('p', { class: 'mgw-links' });
            const cancel = el('a', { href: '/' }, 'Cancel');
            cancel.addEventListener('click', (e) => {
                e.preventDefault();
                hide();
            });
            links.appendChild(cancel);
            form.appendChild(links);
        }
        submitted(form, () => {
            const r = gateway.changePassword(cur.value, next.value, confirm.value);
            if (r.ok) navigate('app');
            else if (r.signedOut) showLogin();
            else showPassword(r.error);
        });
        frame(form, 'Change password', 'password');
        cur.focus();
    }

    /** What the gateway serves at `path` (showLogin / showPassword / showCode / showTwoFactor in pages.go). */
    function open(path: string): void {
        if (path === '/login/code') {
            if (gateway.codePending()) showCode();
            else open('/login');
            return;
        }
        if (path === '/login/two-factor') {
            const v = gateway.twoFactorPage();
            if (v.kind === 'enrol') showEnrol(v.secret);
            else if (v.kind === 'setup') showSetup(v.enrolled);
            else open('/login');
            return;
        }
        const s = gateway.session();
        if (path === '/login') {
            if (s?.mustChange) showPassword();
            else if (s) hide();               // signed in: straight back to the app
            else showLogin();
            return;
        }
        if (s) showPassword();
        else showLogin();
    }

    function onLinkClick(e: MouseEvent): void {
        if (e.type === 'auxclick' && e.button !== 1) return;   // only a middle click opens a link; a right click opens the menu
        const a = (e.target as Element | null)?.closest?.('a[href]');
        const path = (a?.getAttribute('href') ?? '').split(/[?#]/)[0];
        if (!LOGIN_PATHS.has(path)) return;
        e.preventDefault();
        e.stopPropagation();
        open(path);
    }

    return {
        open,
        hide,
        /** The page the browser shows, for the snapshot a reload carries. */
        current: (): Page => current,
        /** Show a page as the browser lands on it. */
        show(page: Page): void {
            if (page === 'login') open('/login');
            else if (page === 'password') open('/login/password');
            else if (page === 'code') open('/login/code');
            else if (page === 'two-factor') open('/login/two-factor');
            else hide();
        },
        /** Catch the app's sign-in links; returns the undo, for tests. */
        installNav(): () => void {
            document.addEventListener('click', onLinkClick, true);
            document.addEventListener('auxclick', onLinkClick, true);
            return () => {
                document.removeEventListener('click', onLinkClick, true);
                document.removeEventListener('auxclick', onLinkClick, true);
            };
        },
    };
}

export type GatewayPages = ReturnType<typeof createPages>;
