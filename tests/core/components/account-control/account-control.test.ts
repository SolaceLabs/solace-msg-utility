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

    it('gives each action its gateway page, an accessible name and a title, so the icons read without text', () => {
        const c = createAccountControl(vi.fn());
        const actions = [...c.element.querySelectorAll('.account-control-actions > *')];
        expect(actions.map(a => [a.getAttribute('href'), a.getAttribute('aria-label'), a.getAttribute('title')])).toEqual([
            ['/login/password', 'Change password', 'Change password'],
            ['/login/two-factor', 'Two-factor sign-in', 'Two-factor sign-in'],
            [null, 'Sign out', 'Sign out'],
        ]);
        // Two-factor sign-in is offered to every signed-in user, not only administrators.
        c.show({ username: 'operator', admin: false });
        expect(c.element.querySelector('.account-control-twofactor')!.classList.contains('hidden')).toBe(false);
    });

    it('returns the gateway\'s password and two-factor pages to the path it is given', () => {
        const { element } = createAccountControl(vi.fn(), { next: '/solAdmin' });
        expect(element.querySelector('.account-control-password')!.getAttribute('href')).toBe('/login/password?next=/solAdmin');
        expect(element.querySelector('.account-control-twofactor')!.getAttribute('href')).toBe('/login/two-factor?next=/solAdmin');
    });

    it.each(['https://evil.example', '/a?b', 'solAdmin', '//x.y'])('refuses a return path that is not a plain path: %s', (next) => {
        expect(() => createAccountControl(vi.fn(), { next })).toThrow(/next must be a path/);
    });

    it('signs out through the panel\'s own sign-out', () => {
        const onSignOut = vi.fn();
        const { element } = createAccountControl(onSignOut);
        element.querySelector<HTMLButtonElement>('.account-control-signout')!.click();
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });
});
