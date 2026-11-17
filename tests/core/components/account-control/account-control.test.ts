import { describe, it, expect, vi } from 'vitest';
import { createAccountControl } from '../../../../src/core/components/account-control';

/**
 * The account control at the top of the sidebar: Change password,
 * Two-factor sign-in and Sign out as icons, and who is signed in beside them.
 * tests/modules/connections/managed-panel.test.ts > "keeps the account control
 * in the sidebar through a connection, and signs out from there" covers it in
 * place.
 */
describe('account-control', () => {
    it('starts hidden, as a page loads signed out', () => {
        const { element } = createAccountControl(vi.fn());
        expect(element.classList.contains('hidden')).toBe(true);
    });

    it('shows the user, tagging an administrator', () => {
        const c = createAccountControl(vi.fn());
        const name = c.element.querySelector<HTMLElement>('.account-control-name')!;
        const role = c.element.querySelector('.account-control-role')!;

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
        const password = element.querySelector('a.account-control-password')!;
        expect(password.getAttribute('href')).toBe('/login/password');
        expect(password.getAttribute('aria-label')).toBe('Change password');
        expect(element.querySelector('.account-control-signout')!.getAttribute('aria-label')).toBe('Sign out');
    });

    it('links Two-factor sign-in to the gateway\'s page, for every signed-in user', () => {
        const c = createAccountControl(vi.fn());
        const link = c.element.querySelector<HTMLAnchorElement>('a.account-control-twofactor')!;
        expect(link.getAttribute('href')).toBe('/login/two-factor');
        expect(link.getAttribute('aria-label')).toBe('Two-factor sign-in');
        c.show({ username: 'operator', admin: false });
        expect([c.element.classList.contains('hidden'), link.classList.contains('hidden')]).toEqual([false, false]);
    });

    it('returns the gateway\'s password and two-factor pages to the path it is given', () => {
        const { element } = createAccountControl(vi.fn(), { next: '/solAdmin' });
        expect(element.querySelector('.account-control-password')!.getAttribute('href')).toBe('/login/password?next=/solAdmin');
        expect(element.querySelector('.account-control-twofactor')!.getAttribute('href')).toBe('/login/two-factor?next=/solAdmin');
    });

    it.each(['https://evil.example', '/a?b', 'solAdmin', '//x.y'])('refuses a return path that is not a plain path: %s', (next) => {
        expect(() => createAccountControl(vi.fn(), { next })).toThrow(/next must be a path/);
    });

    it('titles every action, so the icons read without text', () => {
        const { element } = createAccountControl(vi.fn());
        const titles = [...element.querySelectorAll('.account-control-actions > *')].map(a => a.getAttribute('title'));
        expect(titles).toEqual(['Change password', 'Two-factor sign-in', 'Sign out']);
    });

    it('signs out through the panel\'s own sign-out', () => {
        const onSignOut = vi.fn();
        const { element } = createAccountControl(onSignOut);
        element.querySelector<HTMLButtonElement>('.account-control-signout')!.click();
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });
});
