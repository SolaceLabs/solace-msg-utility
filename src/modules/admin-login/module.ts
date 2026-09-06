/**
 * Admin Login Module — the entry point of the standalone `/solAdmin` app.
 *
 * Same managed-login intent as the connections module's Managed tab, minus the
 * broker: it authenticates against the managed user list and adopts the profile,
 * but never creates a Solace or SEMP connection. The admin app exists to edit
 * entitlement data, not to browse queues, so `AppState.isConnected` /
 * `isSempConnected` stay false for its whole lifetime.
 *
 * Non-admins are refused **at login**: the profile is discarded and no session is
 * published, so an ordinary user who reaches this URL gets an error rather than a
 * signed-in shell with an empty sidebar.
 *
 * Adopting the profile into `ctx.managedStore` matters even with no broker in
 * play — `connection-management` seals credentials with the deployment's site
 * seed through `packSecret`, and the store is the only holder of that seed.
 */
import { required } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { stamp } from '../../core/encode';
import { probeDeployment } from '../../core/hosted';
import { createManagedService } from '../../core/services/managed-service';
import { logger } from '../../core/logger';
import { errMessage } from '../../core/utils';
import type { AppContext } from '../../core/types';

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
            username: required<HTMLInputElement>(container, '#admin-login-username'),
            password: required<HTMLInputElement>(container, '#admin-login-password'),
            btnLogin: required<HTMLButtonElement>(container, '#btn-admin-login'),
            loginError: required<HTMLElement>(container, '#admin-login-error'),

            sessionView: required<HTMLElement>(container, '#admin-session-view'),
            sessionSummary: required<HTMLElement>(container, '#admin-session-summary'),
            btnLogout: required<HTMLButtonElement>(container, '#btn-admin-logout'),
        };

        // Unlike the Managed tab — whose availability is expressed by the tab
        // simply not being offered — this app IS the deployment surface, so it
        // has to say why it cannot work when served without a gateway.
        const gate = createGate(container, {
            id: 'admin-login-gate',
            title: 'Deployment Gateway Required',
            message: 'Administration is served by the deployment gateway in managed mode. '
                + 'Open it at /solAdmin on a gateway that has managed mode enabled.',
        });

        function setError(el: HTMLElement, msg: string | null): void {
            el.textContent = msg ?? '';
            el.classList.toggle('hidden', !msg);
        }

        function showView(view: 'login' | 'session'): void {
            gate.hide();
            els.loginView.classList.toggle('hidden', view !== 'login');
            els.sessionView.classList.toggle('hidden', view !== 'session');
        }

        function showGate(): void {
            els.loginView.classList.add('hidden');
            els.sessionView.classList.add('hidden');
            gate.show();
        }

        async function doLogin(): Promise<void> {
            const username = els.username.value.trim();
            const password = els.password.value;
            if (!username || !password) {
                setError(els.loginError, 'Enter a username and password.');
                return;
            }
            els.btnLogin.disabled = true;
            setError(els.loginError, null);
            try {
                const token = stamp(username, password);
                const p = await service.getConnections(username, token);
                if (!p) {
                    setError(els.loginError, 'Invalid username or password.');
                    return;
                }
                if (!p.admin) {
                    // Refuse before anything is adopted: no store, no AppState,
                    // no emit. The account is valid, just not for this app.
                    logger.warn(`[AdminLogin] refused non-admin sign-in for "${username}"`);
                    setError(els.loginError, 'This account is not an administrator.');
                    return;
                }
                // Adopt the profile BEFORE publishing state or emitting, so no
                // observer of `rbac:changed` can see a half-built session.
                await store.setProfile(p);
                app.setState('managed', {
                    admin: true, username, token, broker: '',
                    operate: p.operate, readOnly: p.readOnly, vpns: [],
                });
                eventBus.emit('rbac:changed');
                els.sessionSummary.textContent = `Signed in as ${username} (administrator).`;
                showView('session');
            } catch (e) {
                setError(els.loginError, errMessage(e));
            } finally {
                els.btnLogin.disabled = false;
            }
        }

        function doLogout(): void {
            store.clear();
            app.setState('managed', null);
            eventBus.emit('rbac:changed');
            els.username.value = '';
            els.password.value = '';
            setError(els.loginError, null);
            showView('login');
            app.loadSelf();
        }

        els.btnLogin.addEventListener('click', () => { void doLogin(); });
        els.btnLogout.addEventListener('click', doLogout);
        [els.username, els.password].forEach((input) => {
            input.addEventListener('keydown', (e) => {
                if ((e as KeyboardEvent).key === 'Enter') void doLogin();
            });
        });

        const info = await probeDeployment();
        if (info.hosted) {
            showView('login');
        } else {
            showGate();
        }
        logger.info('Admin Login Module Setup Complete');
    },
};
