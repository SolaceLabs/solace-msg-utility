/**
 * User Management Module (managed/RBAC variant, admin-only).
 *
 * CRUD over the gateway's user store (`/managed/users`).
 * Ships in the standalone `/solAdmin` app (the `admin` variant). Sidebar
 * visibility is gated by `isModuleVisible` (the id maps to `'admin'` in rbac.ts's
 * MODULE_REQUIREMENTS) keyed off `appState.managed.admin`; the kernel re-renders
 * on `rbac:changed`, so this module appears the moment an admin logs in and the
 * list is (re)loaded on that event.
 *
 * The password is sent as typed, over TLS, and hashed by the gateway, which
 * never returns a hash, so editing a user with a blank password keeps the
 * existing one. A new password, a changed administrator flag or a deletion
 * ends that user's sessions at the gateway. When it is the signed-in admin's
 * own account, the module asks the session owner to sign out
 * (`rbac:sign-out-requested`) instead of patching a session that no longer
 * exists.
 *
 * The modules editor sets which app modules the user may open: the
 * deployment default (config.yaml's `modules.userDefault`, named in its
 * label), or "Choose for this user". Modules show as pills; with a list of
 * their own each pill has a remove button and the Add module menu lists the
 * offered modules not yet chosen. The gateway only ever grants what
 * `modules.offered` allows, so a chosen module outside it is a pill marked
 * "not offered", which can be removed. Under the default the pills show what
 * it grants, without remove buttons. A save sends no list for the default and
 * the chosen list otherwise. Imports only from `src/core/*` and its own files.
 *
 * The Two-factor column shows whether a user has set up two-factor sign-in (a
 * code from an authenticator app). A row that has it carries a Reset two-factor
 * button (`DELETE /managed/users/{name}/totp`): the user sets it up again at
 * their next sign-in. A save never carries the field. Resetting your own
 * account ends your session, so it asks the session owner to sign out.
 *
 * The list filters as you type in its search box (`matchContains`: contains,
 * case-insensitive, `*` = any run), from the last load without a refetch. The
 * Permission test card below it (`./access-test`) shows what a saved user gets
 * on a given broker, Message VPN and queue.
 *
 * Every listed user carries a `rev`. The form keeps the rev of the record it
 * opened (0 for a new user) and a save sends it; the 200 answer carries the
 * new rev. A delete sends the rev of its row. When someone else got there first
 * the gateway answers `stale` (a dialog with a Reload button, which reloads
 * the list and closes the form) or `not_found` (the user was deleted meanwhile:
 * a message and the reloaded list), see `src/core/admin-conflict.ts`.
 */
import { required, setError } from '../../core/dom';
import { createGate, gateOnAdminSession } from '../../core/components/module-gate';
import { createRowList, renderAdminRows } from '../../core/components/row-list';
import { createSlideChoice } from '../../core/slide-choice';
import { iconButton } from '../../core/icons';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { showToast } from '../../core/toast';
import { escapeHtml, matchContains, moduleLabel } from '../../core/utils';
import { logger } from '../../core/logger';
import { handleConflict } from '../../core/admin-conflict';
import { reportManagedFailure, SIGNED_OUT_TOAST_MS } from '../../core/services/managed-api';
import { createUserMgmtService, type ManagedUser, type ModuleChoices, type UserPayload } from './service';
import { createAccessTest, grantedModules } from './access-test';
import type { AppContext, QGlob } from '../../core/types';

const GLOB_FIELDS = [
    { key: 'brokers', placeholder: 'brokers (e.g. *)', label: 'Brokers' },
    { key: 'msgVpns', placeholder: 'msgVpns (e.g. *)', label: 'Message VPNs' },
    { key: 'queues', placeholder: 'queues (e.g. *)', label: 'Queues' },
];

/** What an empty entitlement list means, shown in its place. */
export const NO_OPERATE = 'None: this user changes no queue (no delete, no copy into one). Read-only rows still let them browse.';
export const NO_READ_ONLY = 'None. With no operate rows either, this user can sign in but reaches no broker.';

/** The Reset two-factor row button's icon: a shield with a bar through it. */
const RESET_TWO_FACTOR_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

export const UserManagementModule = {
    name: 'User Mgmt.',
    id: 'user-management',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus } = app;

        const els = {
            listView: required<HTMLElement>(container, '#user-mgmt-list-view'),
            rows: required<HTMLElement>(container, '#user-mgmt-rows'),
            listError: required<HTMLElement>(container, '#user-mgmt-list-error'),
            search: required<HTMLInputElement>(container, '#user-mgmt-search'),
            btnRefresh: required<HTMLButtonElement>(container, '#btn-user-mgmt-refresh'),
            btnAdd: required<HTMLButtonElement>(container, '#btn-user-mgmt-add'),
            testView: required<HTMLElement>(container, '#user-mgmt-test-view'),

            formView: required<HTMLElement>(container, '#user-mgmt-form-view'),
            formTitle: required<HTMLElement>(container, '#user-mgmt-form-title'),
            username: required<HTMLInputElement>(container, '#user-mgmt-username'),
            password: required<HTMLInputElement>(container, '#user-mgmt-password'),
            passwordHint: required<HTMLElement>(container, '#user-mgmt-password-hint'),
            admin: required<HTMLInputElement>(container, '#user-mgmt-admin'),
            modulesMode: required<HTMLElement>(container, '#user-mgmt-modules-mode'),
            modulesDefaultHint: required<HTMLElement>(container, '#user-mgmt-modules-default-hint'),
            modules: required<HTMLElement>(container, '#user-mgmt-modules'),
            moduleAdd: required<HTMLElement>(container, '#user-mgmt-module-add'),
            btnAddModule: required<HTMLButtonElement>(container, '#btn-user-mgmt-add-module'),
            moduleMenu: required<HTMLElement>(container, '#user-mgmt-module-menu'),
            operateRows: required<HTMLElement>(container, '#user-mgmt-operate-rows'),
            readonlyRows: required<HTMLElement>(container, '#user-mgmt-readonly-rows'),
            btnAddOperate: required<HTMLButtonElement>(container, '#btn-user-mgmt-add-operate'),
            btnAddReadonly: required<HTMLButtonElement>(container, '#btn-user-mgmt-add-readonly'),
            btnSave: required<HTMLButtonElement>(container, '#btn-user-mgmt-save'),
            btnCancel: required<HTMLButtonElement>(container, '#btn-user-mgmt-cancel'),
            formError: required<HTMLElement>(container, '#user-mgmt-form-error'),
        };

        const service = createUserMgmtService();
        const operateList = createRowList(els.operateRows, GLOB_FIELDS, { empty: NO_OPERATE });
        const readonlyList = createRowList(els.readonlyRows, GLOB_FIELDS, { empty: NO_READ_ONLY });
        const accessTest = createAccessTest(container);
        const gate = createGate(container, {
            id: 'user-mgmt-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in as an administrator to manage users.',
        });

        // null = creating a new user; otherwise the username being edited.
        let editing: string | null = null;
        // The rev of the record the form opened: 0 when creating.
        let editingRev = 0;
        // From the last list load; empty until then.
        let choices: ModuleChoices = { catalog: [], offered: [], userDefault: 'all' };
        let users: ManagedUser[] = [];

        function showView(view: 'list' | 'form'): void {
            gate.hide();
            if (view !== 'form') forgetPassword();
            els.listView.classList.toggle('hidden', view !== 'list');
            els.testView.classList.toggle('hidden', view !== 'list');
            els.formView.classList.toggle('hidden', view !== 'form');
        }
        function showGate(): void {
            forgetPassword();
            els.listView.classList.add('hidden');
            els.testView.classList.add('hidden');
            els.formView.classList.add('hidden');
            gate.show();
        }
        /** A hidden form keeps no typed password: Cancel, a save, a sign-out or a 401. */
        function forgetPassword(): void {
            els.password.value = '';
        }
        /** The loaded users the search box matches (by username), or a row saying why there are none. */
        function renderList(): void {
            const query = els.search.value.trim();
            const shown = users.filter(u => matchContains(u.username, query));
            renderAdminRows(els.rows, shown, users.length, query, {
                plural: 'users',
                columns: 4,
                noun: 'user',
                classPrefix: 'user-mgmt',
                cells: u => `<td>${escapeHtml(u.username)}</td><td>${u.admin ? 'Admin' : 'User'}</td><td>${u.twoFactor ? 'On' : 'Off'}</td>`,
                label: u => u.username,
                onEdit: openEdit,
                onDelete: u => void removeUser(u.username, u.rev),
            });
            // Reset two-factor sits beside Edit and Delete on the rows that have it on.
            // A row exists per shown user, in order, whenever there are any.
            shown.forEach((u, i) => {
                if (!u.twoFactor) return;
                const actions = required<HTMLElement>(els.rows.children[i] as HTMLElement, '.flex-row');
                actions.prepend(iconButton(RESET_TWO_FACTOR_ICON, `Reset two-factor for user "${u.username}"`,
                    'user-mgmt-reset-2fa', () => void resetTwoFactor(u.username)));
            });
        }

        // Gate the module on an admin session: non-admin (or not-logged-in) sees
        // the gate; an admin sees the list and it (re)loads. Called at install and
        // on an rbac:changed that changes the session (login / logout / self-demote).
        const applyGate = gateOnAdminSession(app, {
            onNoAdmin: showGate,
            onAdmin: () => {
                showView('list');
                void loadList();
            },
        });

        async function loadList(): Promise<void> {
            setError(els.listError, null);
            const res = await service.listUsers();
            if (!res.ok) {
                reportManagedFailure(res, eventBus, msg => setError(els.listError, msg));
                return;
            }
            choices = res.data.modules;
            users = res.data.users;
            renderList();
            accessTest.setData(users, choices);
        }

        // The user's own module list while "Choose for this user" is selected.
        let chosen: string[] = [];
        // Deployment default, or a list of the user's own. Leaving the default
        // starts that list from what the default grants; returning to it shows
        // the default again.
        const modulesMode = createSlideChoice<'default' | 'choose'>(els.modulesMode, {
            choices: ['default', 'choose'],
            onChange: (mode) => {
                if (mode === 'choose') chosen = grantedModules(null, choices);
                renderModules();
            },
        });

        function closeMenu(): void {
            els.moduleMenu.classList.add('hidden');
            els.btnAddModule.setAttribute('aria-expanded', 'false');
        }

        /** A module pill: its name, a "not offered" mark when the deployment no longer offers it, a remove button when editable. */
        function modulePill(id: string, removable: boolean): HTMLElement {
            const pill = document.createElement('span');
            pill.className = 'user-mgmt-pill';
            pill.dataset.module = id;
            const name = document.createElement('span');
            name.textContent = moduleLabel(id);
            pill.append(name);
            if (!choices.offered.includes(id)) {
                const tag = document.createElement('span');
                tag.className = 'user-mgmt-pill-tag';
                tag.textContent = 'not offered';
                pill.append(tag);
            }
            if (removable) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'user-mgmt-pill-remove';
                remove.setAttribute('aria-label', `Remove ${moduleLabel(id)}`);
                remove.textContent = 'x';
                remove.addEventListener('click', () => {
                    chosen = chosen.filter(m => m !== id);
                    renderModules();
                });
                pill.append(remove);
            }
            return pill;
        }

        function menuItem(id: string): HTMLElement {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'user-mgmt-menu-item';
            item.setAttribute('role', 'menuitem');
            item.dataset.module = id;
            item.textContent = moduleLabel(id);
            item.addEventListener('click', () => {
                chosen = [...chosen, id];
                renderModules();
            });
            return item;
        }

        /**
         * Draws the modules card from the selected mode. Under the default the
         * pills show what the default grants and cannot be removed; otherwise
         * they are the user's own list, and the Add module menu offers the
         * offered modules not yet in it.
         */
        function renderModules(): void {
            const useDefault = modulesMode.value() === 'default';
            const given = grantedModules(null, choices);
            els.modulesDefaultHint.textContent = given.length ? given.map(moduleLabel).join(', ') : 'no modules';
            const shown = useDefault ? given : chosen;
            if (shown.length) {
                els.modules.replaceChildren(...shown.map(id => modulePill(id, !useDefault)));
            } else {
                const none = document.createElement('p');
                none.className = 'user-mgmt-hint text-secondary';
                none.textContent = 'No modules.';
                els.modules.replaceChildren(none);
            }
            const free = choices.offered.filter(id => !chosen.includes(id));
            els.moduleAdd.classList.toggle('hidden', useDefault);
            els.btnAddModule.disabled = free.length === 0;
            els.moduleMenu.replaceChildren(...free.map(menuItem));
            closeMenu();
        }

        /** Selects the deployment default (own = null) or the user's own list, and draws it. */
        function setModules(own: string[] | null): void {
            chosen = own ?? [];
            modulesMode.set(own === null ? 'default' : 'choose');
            renderModules();
        }

        function openCreate(): void {
            editing = null;
            editingRev = 0;
            els.formTitle.textContent = 'Add user';
            els.username.value = '';
            els.username.disabled = false;
            els.password.value = '';
            els.passwordHint.textContent = '(required)';
            els.admin.checked = false;
            setModules(null);
            operateList.clear();
            readonlyList.clear();
            setError(els.formError, null);
            showView('form');
        }

        function openEdit(u: ManagedUser): void {
            editing = u.username;
            editingRev = u.rev;
            els.formTitle.textContent = `Edit user "${u.username}"`;
            els.username.value = u.username;
            els.username.disabled = true; // username is the key; rename = delete + recreate
            els.password.value = '';
            els.passwordHint.textContent = '(leave blank to keep current)';
            els.admin.checked = u.admin;
            setModules(u.modules);
            operateList.clear();
            u.operate.forEach(r => operateList.addRow(r as unknown as Record<string, string>));
            readonlyList.clear();
            u.readOnly.forEach(r => readonlyList.addRow(r as unknown as Record<string, string>));
            setError(els.formError, null);
            showView('form');
        }

        async function saveForm(): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            const username = els.username.value.trim();
            const pw = els.password.value;
            if (!username) {
                setError(els.formError, 'Username is required.');
                return;
            }
            if (!editing && !pw) {
                setError(els.formError, 'A password is required for a new user.');
                return;
            }
            // Early check; the gateway refuses it too (exists) when the list is out of date.
            if (!editing && users.some(u => u.username === username)) {
                setError(els.formError, `User "${username}" already exists. Use Edit to change it.`);
                return;
            }
            const payload: UserPayload = {
                username,
                password: pw,
                admin: els.admin.checked,
                operate: operateList.readRows() as unknown as QGlob[],
                readOnly: readonlyList.readRows() as unknown as QGlob[],
                modules: modulesMode.value() === 'default' ? null : [...chosen],
                rev: editingRev,
            };
            els.btnSave.disabled = true;
            setError(els.formError, null);
            const res = await service.saveUser(payload);
            els.btnSave.disabled = false;
            if (!res.ok) {
                if (res.code === 'exists') {
                    setError(els.formError, `User "${username}" already exists. Use Edit to change it.`);
                    return;
                }
                if (await handleConflict(res, 'This user', () => applyGate())) return;
                reportManagedFailure(res, eventBus, msg => setError(els.formError, msg));
                return;
            }
            editingRev = res.data.rev;
            forgetPassword();
            const own = username === m.username;
            if (own && (pw !== '' || payload.admin !== m.admin)) {
                // A new password or administrator flag on your own account ended
                // this session at the gateway, so patching AppState.managed
                // would only fail on the next call. Ask the session owner to
                // sign out; its rbac:changed re-gates this module via applyGate.
                const what = pw ? 'Password changed' : 'Administrator flag changed';
                showToast(`${what}. Sign in again.`, 'ok', SIGNED_OUT_TOAST_MS);
                eventBus.emit('rbac:sign-out-requested');
                return;
            }
            showToast('User saved', 'ok');
            // Editing your own entitlements leaves the session alive. Update the
            // local copy (preserving broker/vpns via the spread) BEFORE emitting
            // so the kernel re-reads fresh state. The user and admin flag are
            // unchanged, so this module's rbac:changed handler ignores the emit;
            // applyGate puts the list back, reloaded.
            if (own) {
                app.setState('managed', { ...m, operate: payload.operate, readOnly: payload.readOnly });
                eventBus.emit('rbac:changed');
            }
            applyGate(); // back to the list, reloaded
        }

        async function removeUser(username: string, rev: number): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            const own = username === m.username;
            const question = own
                ? `Delete your own account "${username}"? You will be signed out.`
                : `Delete user "${username}"?`;
            if (!(await confirmDialog(question, { confirmLabel: 'Delete' }))) return;
            const res = await service.deleteUser(username, rev);
            if (!res.ok) {
                if (await handleConflict(res, 'This user', loadList)) return;
                reportManagedFailure(res, eventBus, msg => showToast(msg, 'error'));
                return;
            }
            if (own) {
                // The session's account is gone, and the gateway ended the
                // session with it — sign out instead of reloading the list.
                showToast('Account deleted. You have been signed out.', 'ok', SIGNED_OUT_TOAST_MS);
                eventBus.emit('rbac:sign-out-requested');
                return;
            }
            showToast('User deleted', 'ok');
            await loadList();
        }

        async function resetTwoFactor(username: string): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            const own = username === m.username;
            const question = own
                ? `Reset your own two-factor sign-in? You will be signed out and must set it up again.`
                : `Reset two-factor sign-in for "${username}"? They will have to set it up again.`;
            if (!(await confirmDialog(question, { confirmLabel: 'Reset' }))) return;
            const res = await service.resetTwoFactor(username);
            if (!res.ok) {
                if (await handleConflict(res, 'This user', loadList)) return;
                reportManagedFailure(res, eventBus, msg => showToast(msg, 'error'));
                return;
            }
            if (own) {
                // The gateway ended this user's sessions with the reset.
                showToast('Two-factor sign-in reset. You have been signed out.', 'ok', SIGNED_OUT_TOAST_MS);
                eventBus.emit('rbac:sign-out-requested');
                return;
            }
            showToast('Two-factor sign-in reset', 'ok');
            await loadList();
        }

        els.btnAdd.addEventListener('click', openCreate);
        els.btnRefresh.addEventListener('click', () => applyGate());
        els.search.addEventListener('input', renderList);
        els.btnSave.addEventListener('click', () => void saveForm());
        els.btnCancel.addEventListener('click', () => showView('list'));
        els.btnAddOperate.addEventListener('click', () => operateList.addRow());
        els.btnAddReadonly.addEventListener('click', () => readonlyList.addRow());
        els.btnAddModule.addEventListener('click', () => {
            const open = els.moduleMenu.classList.toggle('hidden') === false;
            els.btnAddModule.setAttribute('aria-expanded', String(open));
        });
        els.moduleAdd.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            closeMenu();
            els.btnAddModule.focus();
        });

        applyGate(); // gate until an admin session exists; load the list when it does
        logger.info('User Management Module Setup Complete');
    },
};
