/**
 * Admin Login Module — the entry point of the standalone `/solAdmin` app.
 *
 * The gateway serves `/solAdmin` only to an administrator's session (sign-in
 * happens on its own `/login` page), so this module does not sign anyone in:
 * it reads the session back (`GET /managed/me`), adopts the profile, and shows
 * who is signed in with Change password and Sign out. It never creates a
 * Solace or SEMP connection, so `AppState.isConnected` / `isSempConnected`
 * stay false for the app's whole lifetime.
 *
 * A non-admin profile is refused before anything is adopted (the gateway's
 * gate makes that a race with a demotion, not a normal path), so no ordinary
 * user gets a signed-in shell with an empty sidebar.
 *
 * Adopting the profile into `ctx.managedStore` matters even with no broker in
 * play — `connection-management` seals credentials with the deployment's site
 * seed through `packSecret`, and the store is the only holder of that seed.
 *
 * It is the session's only owner in the admin app, so a sign-out another
 * module needs (user-management, after a change that ended the session, or a
 * 401 from the gateway) arrives as `rbac:sign-out-requested` and runs the same
 * `doLogout` as the Sign out button.
 */
import { required } from '../../core/dom';
import { createManagedService } from '../../core/services/managed-service';
import { managedErrorMessage } from '../../core/services/managed-api';
import { logger } from '../../core/logger';
import { errMessage } from '../../core/utils';
import type { AppContext } from '../../core/types';

const SIGN_IN = '/login?next=/solAdmin';
const CHANGE_PASSWORD = '/login/password?next=/solAdmin';

export const AdminLoginModule = {
    name: 'Administration',
    id: 'admin-login',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',

    async install(app: AppContext) {
        const { container, eventBus } = app;
        const service = createManagedService();
        const store = app.managedStore;

        const els = {
            loginView: required<HTMLElement>(container, '#admin-login-view'),
            btnLogin: required<HTMLAnchorElement>(container, '#btn-admin-login'),
            loginError: required<HTMLElement>(container, '#admin-login-error'),

            sessionView: required<HTMLElement>(container, '#admin-session-view'),
            sessionSummary: required<HTMLElement>(container, '#admin-session-summary'),
            btnLogout: required<HTMLButtonElement>(container, '#btn-admin-logout'),
        };

        function showSignedOut(message: string | null, mustChange = false): void {
            els.btnLogin.href = mustChange ? CHANGE_PASSWORD : SIGN_IN;
            els.btnLogin.textContent = mustChange ? 'Change password' : 'Sign in';
            els.loginError.textContent = message ?? '';
            els.loginError.classList.toggle('hidden', !message);
            els.loginView.classList.remove('hidden');
            els.sessionView.classList.add('hidden');
        }

        function showSession(username: string): void {
            els.sessionSummary.textContent = `Signed in as ${username} (administrator).`;
            els.loginView.classList.add('hidden');
            els.sessionView.classList.remove('hidden');
        }

        // Whether THIS module holds the managed session. Module-local rather
        // than read off appState.managed: in the kitchen-sink build the
        // Connections Managed tab can own the session instead (and answers the
        // same sign-out request itself, before this handler runs).
        let signedIn = false;

        async function restore(): Promise<void> {
            const res = await service.me();
            if (!res.ok) {
                const quiet = res.code === 'unauthenticated';
                showSignedOut(quiet ? null : managedErrorMessage(res), res.code === 'password_change_required');
                return;
            }
            const p = res.data;
            if (!p.admin) {
                // Refuse before anything is adopted: no store, no AppState,
                // no emit. The account is valid, just not for this app.
                logger.warn(`[AdminLogin] refused non-admin session for "${p.username}"`);
                showSignedOut('This account is not an administrator.');
                return;
            }
            try {
                // Adopt the profile BEFORE publishing state or emitting, so no
                // observer of `rbac:changed` can see a half-built session.
                await store.setProfile(p);
            } catch (e) {
                showSignedOut(errMessage(e));
                return;
            }
            app.setState('managed', {
                admin: true, username: p.username, broker: '',
                operate: p.operate, readOnly: p.readOnly, vpns: [],
            });
            signedIn = true;
            eventBus.emit('rbac:changed');
            showSession(p.username);
        }

        function doLogout(): void {
            // End the gateway session too; an already-ended one is the same
            // outcome, so the answer is not awaited.
            void service.logout();
            signedIn = false;
            store.clear();
            app.setState('managed', null);
            eventBus.emit('rbac:changed');
            showSignedOut(null);
            app.loadSelf();
        }

        els.btnLogout.addEventListener('click', doLogout);
        // Another module ended the session: user-management after a change to
        // the admin's own account, or any admin module on a 401. Sign out
        // exactly as the button does (store, AppState, rbac:changed, signed-out
        // view, navigate here).
        eventBus.on('rbac:sign-out-requested', () => { if (signedIn) doLogout(); });

        await restore();
        logger.info('Admin Login Module Setup Complete');
    },
};
