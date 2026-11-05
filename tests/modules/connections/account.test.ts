import { describe, it, expect, vi } from 'vitest';
import { createAccountControl } from '../../../src/modules/connections/account';

/**
 * The managed account control the Managed panel mounts in the sidebar
 * footer: who is signed in, the gateway's password page and sign-out.
 * tests/modules/connections/managed-panel.test.ts > "keeps the account control
 * in the sidebar through a connection, and signs out from there" covers it in
 * place.
 */
describe('connections/account', () => {
    it('starts hidden, as a page loads signed out', () => {
        const { element } = createAccountControl(vi.fn());
        expect(element.classList.contains('hidden')).toBe(true);
        expect(element.classList.contains('status-item')).toBe(true);
    });

    it('shows the user, tagging an administrator', () => {
        const c = createAccountControl(vi.fn());
        const name = c.element.querySelector<HTMLElement>('.conn-account-name')!;
        const role = c.element.querySelector('.conn-account-role')!;

        c.show({ username: 'operator', admin: false });
        expect([c.element.classList.contains('hidden'), name.textContent, name.title, role.classList.contains('hidden')])
            .toEqual([false, 'operator', 'Signed in as operator', true]);

        c.show({ username: 'admin', admin: true });
        expect([name.textContent, role.classList.contains('hidden')]).toEqual(['admin', false]);

        c.show(null);
        expect([c.element.classList.contains('hidden'), name.textContent, name.title]).toEqual([true, '', '']);
    });

    it('links Change password to the gateway\'s page and labels both actions', () => {
        const { element } = createAccountControl(vi.fn());
        const password = element.querySelector('a.conn-account-password')!;
        expect(password.getAttribute('href')).toBe('/login/password');
        expect(password.getAttribute('aria-label')).toBe('Change password');
        expect(element.querySelector('.conn-account-signout')!.getAttribute('aria-label')).toBe('Sign out');
    });

    it('signs out through the panel\'s own sign-out', () => {
        const onSignOut = vi.fn();
        const { element } = createAccountControl(onSignOut);
        element.querySelector<HTMLButtonElement>('.conn-account-signout')!.click();
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });
});
