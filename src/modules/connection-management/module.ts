/**
 * Connection Management Module (managed/RBAC variant, admin-only).
 *
 * CRUD over the proxy's connection store (/managed/listConnections,
 * /managed/saveConnection, /managed/deleteConnection). Admin-only via
 * `isModuleVisible` (the id is in rbac.ts's ADMIN_ONLY_MODULES set); the kernel
 * re-renders on `rbac:changed`, on which this module reloads its list.
 *
 * Broker credentials are PACKED client-side with the per-deployment siteSeed
 * (WebCrypto) before they leave the browser — the proxy stores opaque blobs and
 * never unpacks them. The list response omits the blobs, so editing a
 * connection with blank password fields keeps the stored secrets. Imports only
 * from `src/core/*` and its own service.
 */
import { required } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { createRowList } from '../../core/components/row-list';
// Credential sealing goes through the core managed store: the deployment seed
// stays inside its closure and never reaches this module.
import { showToast } from '../../core/toast';
import { escapeHtml } from '../../core/utils';
import { logger } from '../../core/logger';
import { createConnMgmtService, type ManagedConnRecord } from './service';
import type { AppContext, ManagedSession } from '../../core/types';

const VPN_FIELDS = [
    { key: 'name', placeholder: 'vpn name' },
    { key: 'user', placeholder: 'username' },
    { key: 'pass', placeholder: 'password (blank = keep)', type: 'password' as const },
];

function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export const ConnectionManagementModule = {
    name: 'Conn. Mgmt',
    id: 'connection-management',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus } = app;

        const els = {
            listView: required<HTMLElement>(container, '#conn-mgmt-list-view'),
            rows: required<HTMLElement>(container, '#conn-mgmt-rows'),
            listError: required<HTMLElement>(container, '#conn-mgmt-list-error'),
            btnRefresh: required<HTMLButtonElement>(container, '#btn-conn-mgmt-refresh'),
            btnAdd: required<HTMLButtonElement>(container, '#btn-conn-mgmt-add'),

            formView: required<HTMLElement>(container, '#conn-mgmt-form-view'),
            formTitle: required<HTMLElement>(container, '#conn-mgmt-form-title'),
            broker: required<HTMLInputElement>(container, '#conn-mgmt-broker'),
            hostname: required<HTMLInputElement>(container, '#conn-mgmt-hostname'),
            sempPort: required<HTMLInputElement>(container, '#conn-mgmt-semp-port'),
            sempUser: required<HTMLInputElement>(container, '#conn-mgmt-semp-user'),
            sempPass: required<HTMLInputElement>(container, '#conn-mgmt-semp-pass'),
            sempPassHint: required<HTMLElement>(container, '#conn-mgmt-semp-pass-hint'),
            clientPort: required<HTMLInputElement>(container, '#conn-mgmt-client-port'),
            vpnRows: required<HTMLElement>(container, '#conn-mgmt-vpn-rows'),
            btnAddVpn: required<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn'),
            btnSave: required<HTMLButtonElement>(container, '#btn-conn-mgmt-save'),
            btnCancel: required<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel'),
            formError: required<HTMLElement>(container, '#conn-mgmt-form-error'),
        };

        const service = createConnMgmtService();
        const vpnList = createRowList(els.vpnRows, VPN_FIELDS);
        const gate = createGate(container, {
            id: 'conn-mgmt-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in to Connections as an administrator to manage connections.',
        });

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

        function renderList(conns: ManagedConnRecord[]): void {
            els.rows.innerHTML = '';
            if (conns.length === 0) {
                els.rows.innerHTML = '<tr><td colspan="3" class="text-secondary">No connections.</td></tr>';
                return;
            }
            conns.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${escapeHtml(c.broker)}</td><td>${escapeHtml(c.hostname)}</td>`;
                const actions = document.createElement('td');
                actions.className = 'flex-row gap-2';
                const edit = document.createElement('button');
                edit.className = 'btn btn-secondary btn-sm';
                edit.textContent = 'Edit';
                edit.addEventListener('click', () => openEdit(c));
                const del = document.createElement('button');
                del.className = 'btn btn-danger btn-sm';
                del.textContent = 'Delete';
                del.addEventListener('click', () => void removeConn(c.broker));
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
                const conns = await service.listConnections(m.username, m.token);
                if (!conns) {
                    setError(els.listError, 'Failed to load connections.');
                    return;
                }
                renderList(conns);
            } catch (e) {
                setError(els.listError, errMessage(e));
            }
        }

        function openCreate(): void {
            els.formTitle.textContent = 'Add connection';
            els.broker.value = '';
            els.broker.disabled = false;
            els.hostname.value = '';
            els.sempPort.value = '';
            els.sempUser.value = '';
            els.sempPass.value = '';
            els.sempPassHint.textContent = '';
            els.clientPort.value = '';
            vpnList.clear();
            setError(els.formError, null);
            showView('form');
        }

        function openEdit(c: ManagedConnRecord): void {
            els.formTitle.textContent = `Edit connection "${c.broker}"`;
            els.broker.value = c.broker;
            els.broker.disabled = true; // broker is the key; rename = delete + recreate
            els.hostname.value = c.hostname;
            els.sempPort.value = c.semp.port;
            els.sempUser.value = c.semp.user;
            els.sempPass.value = '';
            els.sempPassHint.textContent = '(leave blank to keep current)';
            els.clientPort.value = c.client.port;
            vpnList.clear();
            (c.client.msgVpns ?? []).forEach(v =>
                vpnList.addRow({ name: v.name, user: v.user, pass: '' }),
            );
            setError(els.formError, null);
            showView('form');
        }

        async function saveForm(): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            const broker = els.broker.value.trim();
            if (!broker) {
                setError(els.formError, 'Broker name is required.');
                return;
            }
            els.btnSave.disabled = true;
            setError(els.formError, null);
            try {
                const sempPlain = els.sempPass.value;
                const msgVpns = [];
                for (const r of vpnList.readRows()) {
                    msgVpns.push({
                        name: r.name,
                        user: r.user,
                        pass: r.pass ? await app.managedStore.packSecret(r.pass) : '',
                    });
                }
                const connection: ManagedConnRecord = {
                    broker,
                    hostname: els.hostname.value.trim(),
                    semp: {
                        port: els.sempPort.value.trim(),
                        user: els.sempUser.value.trim(),
                        pass: sempPlain ? await app.managedStore.packSecret(sempPlain) : '',
                    },
                    client: { port: els.clientPort.value.trim(), msgVpns },
                };
                const ok = await service.saveConnection(m.username, m.token, connection);
                if (!ok) {
                    setError(els.formError, 'Save failed.');
                    return;
                }
                showToast('Connection saved', 'ok');
                applyGate(); // back to the list, reloaded
            } catch (e) {
                setError(els.formError, errMessage(e));
            } finally {
                els.btnSave.disabled = false;
            }
        }

        async function removeConn(broker: string): Promise<void> {
            const m = appState.managed;
            if (!m) return;
            if (!confirm(`Delete connection "${broker}"?`)) return;
            try {
                const ok = await service.deleteConnection(m.username, m.token, broker);
                if (!ok) {
                    showToast('Delete failed', 'error');
                    return;
                }
                showToast('Connection deleted', 'ok');
                await loadList(m);
            } catch (e) {
                showToast(errMessage(e), 'error');
            }
        }

        els.btnAdd.addEventListener('click', openCreate);
        els.btnRefresh.addEventListener('click', () => applyGate());
        els.btnSave.addEventListener('click', () => void saveForm());
        els.btnCancel.addEventListener('click', () => showView('list'));
        els.btnAddVpn.addEventListener('click', () => vpnList.addRow());
        eventBus.on('rbac:changed', () => applyGate());

        applyGate(); // gate until an admin session exists; load the list when it does
        logger.info('Connection Management Module Setup Complete');
    },
};
