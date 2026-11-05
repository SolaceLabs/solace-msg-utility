/**
 * The managed session's account control: the signed-in user, Change password
 * and Sign out, as one more row of the sidebar footer above the Client and
 * SEMP status lights (`AppContext.mountSidebarAccount`). It stays on every
 * page and through a broker connection; signing out while connected
 * disconnects first, as the Managed panel's sign-out always has.
 *
 * Change password is a plain link to the gateway's own page, like the
 * panel's Sign in. In a collapsed sidebar the name hides with the other
 * status labels and the two actions stay as icons.
 *
 * Managed entry only: the Direct `module.ts` that every Release bundle
 * installs never imports it.
 */
import { required } from '../../core/dom';

export interface AccountUser { username: string; admin: boolean }

export interface AccountControl {
    /** The element to hand to `mountSidebarAccount`. */
    element: HTMLElement;
    /** Show the signed-in user, or hide the control (null: signed out). */
    show(user: AccountUser | null): void;
}

const ICON = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const TEMPLATE = `
<svg class="status-icon status-connected conn-account-icon" ${ICON}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
<span class="status-label conn-account-name"></span>
<span class="status-label conn-account-role hidden">admin</span>
<a class="btn-icon conn-account-password" href="/login/password" title="Change password" aria-label="Change password"><svg ${ICON}><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="M21 2l-9.6 9.6"></path><path d="M15.5 7.5l3 3L22 7l-3-3"></path></svg></a>
<button type="button" class="btn-icon conn-account-signout" title="Sign out" aria-label="Sign out"><svg ${ICON}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button>`;

export function createAccountControl(onSignOut: () => void): AccountControl {
    const element = document.createElement('div');
    element.className = 'status-item conn-account hidden';
    element.innerHTML = TEMPLATE;
    const name = required<HTMLElement>(element, '.conn-account-name');
    const role = required<HTMLElement>(element, '.conn-account-role');
    required<HTMLButtonElement>(element, '.conn-account-signout').addEventListener('click', onSignOut);

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
