/**
 * The gateway's own pages, `/login` and `/login/password` (go-web-proxy/
 * pages.go, pages/login.html), as layers over the app: the same copy and the
 * same flow. A submit is answered by the fake gateway in this page, never
 * sent anywhere: the forms carry no action, and their handler stops the
 * browser's own submission before anything else.
 *
 * The app reaches them by plain links (`a[href="/login"]`, rewritten by the
 * Managed panel as the session changes), so one capture-phase listener on the
 * document catches every such click, plain or modified, before the browser
 * follows it. A successful submit hands the page the browser would land on to
 * `navigate`, which the boot answers with a reload, as the gateway's `303`
 * and the full load after it would.
 *
 * Not simulated: `?next=` (sign-in always returns to the app).
 *
 * Mock-only.
 */
import './pages.css';
import { PASSWORD_MAX, PASSWORD_MIN } from './validate';
import type { Gateway } from './index';

/** Where the browser is: the app, or one of the gateway's pages over it. */
export type Page = 'app' | 'login' | 'password';

export interface PagesDeps {
    gateway: Gateway;
    /** A submit went through: the browser now loads `page`. */
    navigate: (page: Page) => void;
}

const LOGIN_PATHS = new Set(['/login', '/login/password']);

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

    function frame(form: HTMLFormElement, title: string, page: Page): void {
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
            if (r.ok) navigate(r.mustChange ? 'password' : 'app');
            else showLogin(r.error);
        });
        frame(form, 'Sign in', 'login');
        user.focus();
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

    /** What the gateway serves at `path` (showLogin / showPassword in pages.go). */
    function open(path: string): void {
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
