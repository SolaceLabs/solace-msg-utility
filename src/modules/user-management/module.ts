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
 * deployment default (config.yaml's `modules.userDefault`), or a list of
 * their own. The gateway only ever grants what `modules.offered` allows, so a
 * module outside it is marked "not offered". Imports only from `src/core/*`
 * and its own files.
 *
 * The list filters as you type in its search box (`matchContains`: contains,
 * case-insensitive, `*` = any run), from the last load without a refetch. The
 * Permission test card below it (`./access-test`) shows what a saved user gets
 * on a given broker, Message VPN and queue.
 */
import { required } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { createRowList } from '../../core/components/row-list';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { showToast } from '../../core/toast';
import { escapeHtml, matchContains, moduleLabel } from '../../core/utils';
import { ICONS, iconButton } from '../../core/icons';
import { logger } from '../../core/logger';
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
            modulesDefault: required<HTMLInputElement>(container, '#user-mgmt-modules-default'),
            modulesDefaultHint: required<HTMLElement>(container, '#user-mgmt-modules-default-hint'),
            modules: required<HTMLElement>(container, '#user-mgmt-modules'),
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
        // From the last list load; empty until then.
        let choices: ModuleChoices = { catalog: [], offered: [], userDefault: 'all' };
        let users: ManagedUser[] = [];

        function showView(view: 'list' | 'form'): void {
            gate.hide();
            els.listView.classList.toggle('hidden', view !== 'list');
            els.testView.classList.toggle('hidden', view !== 'list');
            els.formView.classList.toggle('hidden', view !== 'form');
        }
        function showGate(): void {
            els.listView.classList.add('hidden');
            els.testView.classList.add('hidden');
            els.formView.classList.add('hidden');
            gate.show();
        }
        function setError(el: HTMLElement, msg: string | null): void {
            el.textContent = msg ?? '';
            el.classList.toggle('hidden', !msg);
        }

        /** The loaded users the search box matches (by username), or a row saying why there are none. */
        function renderList(): void {
            const query = els.search.value.trim();
            const shown = users.filter(u => matchContains(u.username, query));
            els.rows.innerHTML = '';
            if (shown.length === 0) {
                const td = document.createElement('td');
                td.colSpan = 3;
                td.className = 'text-secondary';
                td.textContent = users.length === 0 ? 'No users.' : `No users match "${query}".`;
                els.rows.appendChild(document.createElement('tr')).appendChild(td);
                return;
            }
            shown.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${escapeHtml(u.username)}</td><td>${u.admin ? 'Admin' : 'User'}</td>`;
                const actions = document.createElement('div');
                actions.className = 'flex-row gap-2';
                actions.append(
                    iconButton(ICONS.edit, `Edit user "${u.username}"`, 'user-mgmt-edit', () => openEdit(u)),
                    iconButton(ICONS.delete, `Delete user "${u.username}"`, 'btn-icon-danger user-mgmt-delete',
                        () => void removeUser(u.username)),
                );
                const cell = document.createElement('td');
                cell.className = 'user-mgmt-actions-col';
                cell.appendChild(actions);
                tr.appendChild(cell);
                els.rows.appendChild(tr);
            });
        }

        // Gate the module on an admin session: non-admin (or not-logged-in) sees
        // the gate; an admin sees the list and it (re)loads. Called at install and
        // on every rbac:changed (login / logout / self-demote).
        function applyGate(): void {
            const m = appState.managed;
            if (!m?.admin) {
                showGate();
                return;
            }
            showView('list');
            void loadList();
        }

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

        function checkedModules(): string[] {
            return [...els.modules.querySelectorAll<HTMLInputElement>('input')].filter(b => b.checked).map(b => b.value);
        }

        /**
         * One checkbox per catalog module. Under the deployment default they
         * show what the default grants and are locked; otherwise they edit the
         * user's own list.
         */
        function renderModules(own: string[] | null): void {
            const useDefault = own === null;
            const shown = useDefault ? grantedModules(null, choices) : own;
            els.modulesDefault.checked = useDefault;
            els.modulesDefaultHint.textContent = choices.userDefault === 'all' ? '(every offered module)' : '(no modules)';
            els.modules.innerHTML = '';
            for (const id of choices.catalog) {
                const label = document.createElement('label');
                label.className = 'flex-row items-center gap-2 m-0';
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.value = id;
                box.checked = shown.includes(id);
                box.disabled = useDefault;
                label.append(box, ` ${moduleLabel(id)}${choices.offered.includes(id) ? '' : ' (not offered)'}`);
                els.modules.appendChild(label);
            }
        }

        function openCreate(): void {
            editing = null;
            els.formTitle.textContent = 'Add user';
            els.username.value = '';
            els.username.disabled = false;
            els.password.value = '';
            els.passwordHint.textContent = '(required)';
            els.admin.checked = false;
            renderModules(null);
            operateList.clear();
            readonlyList.clear();
            setError(els.formError, null);
            showView('form');
        }

        function openEdit(u: ManagedUser): void {
            editing = u.username;
            els.formTitle.textContent = `Edit user "${u.username}"`;
            els.username.value = u.username;
            els.username.disabled = true; // username is the key; rename = delete + recreate
            els.password.value = '';
            els.passwordHint.textContent = '(leave blank to keep current)';
            els.admin.checked = u.admin;
            renderModules(u.modules ?? null);
            operateList.clear();
            (u.operate ?? []).forEach(r => operateList.addRow(r as unknown as Record<string, string>));
            readonlyList.clear();
            (u.readOnly ?? []).forEach(r => readonlyList.addRow(r as unknown as Record<string, string>));
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
            // The gateway's save replaces a user of the same name, so Add
            // must not reach an existing one.
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
                modules: els.modulesDefault.checked ? null : checkedModules(),
            };
            els.btnSave.disabled = true;
            setError(els.formError, null);
            const res = await service.saveUser(payload);
            els.btnSave.disabled = false;
            if (!res.ok) {
                reportManagedFailure(res, eventBus, msg => setError(els.formError, msg));
                return;
            }
            // Don't leave the typed password in the hidden form.
            els.password.value = '';
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
            // so the kernel + this module's rbac:changed handler (applyGate)
            // re-read fresh state.
            if (own) {
                app.setState('managed', { ...m, operate: payload.operate, readOnly: payload.readOnly });
                eventBus.emit('rbac:changed');
            } else {
                applyGate(); // back to the list, reloaded
            }
        }

        async function removeUser(username: string): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            const own = username === m.username;
            const question = own
                ? `Delete your own account "${username}"? You will be signed out.`
                : `Delete user "${username}"?`;
            if (!(await confirmDialog(question, { confirmLabel: 'Delete' }))) return;
            const res = await service.deleteUser(username);
            if (!res.ok) {
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

        els.btnAdd.addEventListener('click', openCreate);
        els.btnRefresh.addEventListener('click', () => applyGate());
        els.search.addEventListener('input', renderList);
        els.btnSave.addEventListener('click', () => void saveForm());
        els.btnCancel.addEventListener('click', () => showView('list'));
        els.btnAddOperate.addEventListener('click', () => operateList.addRow());
        els.btnAddReadonly.addEventListener('click', () => readonlyList.addRow());
        // Leaving the default starts the user's own list from what the
        // default grants; returning to it shows the default again.
        els.modulesDefault.addEventListener('change', () =>
            renderModules(els.modulesDefault.checked ? null : checkedModules()));
        eventBus.on('rbac:changed', () => applyGate());

        applyGate(); // gate until an admin session exists; load the list when it does
        logger.info('User Management Module Setup Complete');
    },
};
