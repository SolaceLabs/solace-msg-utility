/**
 * The signed-in account control: Change password, Two-factor sign-in and Sign
 * out as three icons in one row, followed on the same row by who is signed in
 * (the username, and an admin tag for an administrator) as a small caption. A
 * module mounts it at the top of the sidebar, above the page items and ahead
 * of a thin divider (`AppContext.mountSidebarAccount`); the control draws the
 * divider itself, so a hidden control leaves neither icons nor bar. It stays
 * on every page. The connections module's Provisioned panel and the admin
 * console's Administration page both use it; signing out while connected
 * disconnects first, as the Provisioned panel's sign-out always has.
 *
 * Change password and Two-factor sign-in are plain links to the gateway's own
 * pages, like the panel's Sign in. Those pages return to the app afterwards:
 * `next` names the path they return to (the admin console passes `/solAdmin`);
 * without it the links carry no return path and the gateway uses its default.
 * In a collapsed sidebar the caption hides and the icons stack.
 *
 * The Direct `module.ts` that every Release bundle installs never imports it.
 */
import { required } from '../../dom';

export interface AccountUser { username: string; admin: boolean }

export interface AccountControl {
    /** The element to hand to `mountSidebarAccount`. */
    element: HTMLElement;
    /** Show the signed-in user, or hide the control (null: signed out). */
    show(user: AccountUser | null): void;
}

export interface AccountControlOptions {
    /** Where the gateway's password and two-factor pages return to, e.g. `/solAdmin`. */
    next?: string;
}

const ICON = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const TEMPLATE = `
<div class="account-control-actions">
<a class="btn-icon account-control-password" href="/login/password" title="Change password" aria-label="Change password"><svg ${ICON}><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="M21 2l-9.6 9.6"></path><path d="M15.5 7.5l3 3L22 7l-3-3"></path></svg></a>
<a class="btn-icon account-control-twofactor" href="/login/two-factor" title="Two-factor sign-in" aria-label="Two-factor sign-in"><svg ${ICON}><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg></a>
<button type="button" class="btn-icon account-control-signout" title="Sign out" aria-label="Sign out"><svg ${ICON}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button>
</div>
<div class="account-control-caption">
<span class="account-control-name"></span>
<span class="account-control-role hidden">admin</span>
</div>`;

export function createAccountControl(onSignOut: () => void, options: AccountControlOptions = {}): AccountControl {
    const element = document.createElement('div');
    element.className = 'account-control hidden';
    element.innerHTML = TEMPLATE;
    const name = required<HTMLElement>(element, '.account-control-name');
    const role = required<HTMLElement>(element, '.account-control-role');
    required<HTMLButtonElement>(element, '.account-control-signout').addEventListener('click', onSignOut);
    if (options.next) {
        // A path of this app, put into the links as it is: refuse anything else.
        if (!/^\/[A-Za-z0-9_/-]*$/.test(options.next)) {
            throw new Error(`createAccountControl: next must be a path such as /solAdmin, got "${options.next}"`);
        }
        for (const sel of ['.account-control-password', '.account-control-twofactor']) {
            const link = required<HTMLAnchorElement>(element, sel);
            link.setAttribute('href', `${link.getAttribute('href')}?next=${options.next}`);
        }
    }

    return {
        element,
        show(user) {
            element.classList.toggle('hidden', !user);
            name.textContent = user?.username ?? '';
            name.title = user ? `Signed in as ${user.username}` : '';
            role.classList.toggle('hidden', !user?.admin);
        },
    };
}
