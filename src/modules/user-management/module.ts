/**
 * User Management Module (managed/RBAC variant, admin-only).
 *
 * CRUD over the proxy's user store (/managed/listUsers|saveUser|deleteUser).
 * Ships in the standalone `/solAdmin` app (the `admin` variant). Sidebar
 * visibility is gated by `isModuleVisible` (the id maps to `'admin'` in rbac.ts's
 * MODULE_REQUIREMENTS) keyed off `appState.managed.admin`; the kernel re-renders
 * on `rbac:changed`, so this module appears the moment an admin logs in and the
 * list is (re)loaded on that event.
 *
 * Passwords are one-way-stamped client-side before they leave the browser; the
 * proxy never returns a stored token, so editing a user with a blank password
 * keeps the existing one. Imports only from `src/core/*` and its own service.
 */
import { required } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { createRowList } from '../../core/components/row-list';
import { stamp } from '../../core/encode';
import { showToast } from '../../core/toast';
import { escapeHtml } from '../../core/utils';
import { logger } from '../../core/logger';
import { errMessage } from '../../core/utils';
import { createUserMgmtService, type ManagedUser, type UserPayload } from './service';
import type { AppContext, QGlob, ManagedSession } from '../../core/types';

const GLOB_FIELDS = [
    { key: 'brokers', placeholder: 'brokers (e.g. *)' },
    { key: 'msgVpns', placeholder: 'msgVpns (e.g. *)' },
    { key: 'queues', placeholder: 'queues (e.g. *)' },
];

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
            btnRefresh: required<HTMLButtonElement>(container, '#btn-user-mgmt-refresh'),
            btnAdd: required<HTMLButtonElement>(container, '#btn-user-mgmt-add'),

            formView: required<HTMLElement>(container, '#user-mgmt-form-view'),
            formTitle: required<HTMLElement>(container, '#user-mgmt-form-title'),
            username: required<HTMLInputElement>(container, '#user-mgmt-username'),
            password: required<HTMLInputElement>(container, '#user-mgmt-password'),
            passwordHint: required<HTMLElement>(container, '#user-mgmt-password-hint'),
            admin: required<HTMLInputElement>(container, '#user-mgmt-admin'),
            operateRows: required<HTMLElement>(container, '#user-mgmt-operate-rows'),
            readonlyRows: required<HTMLElement>(container, '#user-mgmt-readonly-rows'),
            btnAddOperate: required<HTMLButtonElement>(container, '#btn-user-mgmt-add-operate'),
            btnAddReadonly: required<HTMLButtonElement>(container, '#btn-user-mgmt-add-readonly'),
            btnSave: required<HTMLButtonElement>(container, '#btn-user-mgmt-save'),
            btnCancel: required<HTMLButtonElement>(container, '#btn-user-mgmt-cancel'),
            formError: required<HTMLElement>(container, '#user-mgmt-form-error'),
        };

        const service = createUserMgmtService();
        const operateList = createRowList(els.operateRows, GLOB_FIELDS);
        const readonlyList = createRowList(els.readonlyRows, GLOB_FIELDS);
        const gate = createGate(container, {
            id: 'user-mgmt-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in to Connections as an administrator to manage users.',
        });

        // null = creating a new user; otherwise the username being edited.
        let editing: string | null = null;

        function showView(view: 'list' | 'form'): void {
            gate.hide();
            els.listView.classList.toggle('hidden', view !== 'list');
            els.formView.classList.toggle('hidden', view !== 'form');
        }
        function showGate(): void {
            els.listView.classList.add('hidden');
            els.formView.classList.add('hidden');
            gate.show();
        }
        function setError(el: HTMLElement, msg: string | null): void {
            el.textContent = msg ?? '';
            el.classList.toggle('hidden', !msg);
        }

        function renderList(users: ManagedUser[]): void {
            els.rows.innerHTML = '';
            if (users.length === 0) {
                els.rows.innerHTML = '<tr><td colspan="3" class="text-secondary">No users.</td></tr>';
                return;
            }
            users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${escapeHtml(u.username)}</td><td>${u.admin ? 'Admin' : 'User'}</td>`;
                const actions = document.createElement('td');
                actions.className = 'flex-row gap-2';
                const edit = document.createElement('button');
                edit.className = 'btn btn-secondary btn-sm';
                edit.textContent = 'Edit';
                edit.addEventListener('click', () => openEdit(u));
                const del = document.createElement('button');
                del.className = 'btn btn-danger btn-sm';
                del.textContent = 'Delete';
                del.addEventListener('click', () => void removeUser(u.username));
                actions.append(edit, del);
                tr.appendChild(actions);
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
            void loadList(m);
        }

        async function loadList(m: ManagedSession): Promise<void> {
            setError(els.listError, null);
            try {
                const users = await service.listUsers(m.username, m.token);
                if (!users) {
                    setError(els.listError, 'Failed to load users.');
                    return;
                }
                renderList(users);
            } catch (e) {
                setError(els.listError, errMessage(e));
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
            const payload: UserPayload = {
                username,
                password: pw ? stamp(username, pw) : '',
                admin: els.admin.checked,
                operate: operateList.readRows() as unknown as QGlob[],
                readOnly: readonlyList.readRows() as unknown as QGlob[],
            };
            els.btnSave.disabled = true;
            setError(els.formError, null);
            try {
                const ok = await service.saveUser(m.username, m.token, payload);
                if (!ok) {
                    setError(els.formError, 'Save failed.');
                    return;
                }
                showToast('User saved', 'ok');
                // Editing your own record may flip your own admin flag. Update the
                // local session (preserving token/broker/vpns via the spread)
                // BEFORE emitting so the kernel + this module's rbac:changed handler
                // (applyGate) re-gate off fresh state — emitting alone leaves
                // appState.managed.admin stale. A self-demote then lands on the gate.
                if (username === m.username) {
                    app.setState('managed', { ...m, admin: payload.admin, operate: payload.operate, readOnly: payload.readOnly });
                    eventBus.emit('rbac:changed');
                } else {
                    applyGate(); // back to the list, reloaded
                }
            } catch (e) {
                setError(els.formError, errMessage(e));
            } finally {
                els.btnSave.disabled = false;
            }
        }

        async function removeUser(username: string): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            if (!confirm(`Delete user "${username}"?`)) return;
            try {
                const ok = await service.deleteUser(m.username, m.token, username);
                if (!ok) {
                    showToast('Delete failed', 'error');
                    return;
                }
                showToast('User deleted', 'ok');
                await loadList(m);
            } catch (e) {
                showToast(errMessage(e), 'error');
            }
        }

        els.btnAdd.addEventListener('click', openCreate);
        els.btnRefresh.addEventListener('click', () => applyGate());
        els.btnSave.addEventListener('click', () => void saveForm());
        els.btnCancel.addEventListener('click', () => showView('list'));
        els.btnAddOperate.addEventListener('click', () => operateList.addRow());
        els.btnAddReadonly.addEventListener('click', () => readonlyList.addRow());
        eventBus.on('rbac:changed', () => applyGate());

        applyGate(); // gate until an admin session exists; load the list when it does
        logger.info('User Management Module Setup Complete');
    },
};
