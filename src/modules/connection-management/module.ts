/**
 * Connection Management Module (managed/RBAC variant, admin-only).
 *
 * CRUD over the gateway's connection store (`/managed/connections`), on the
 * gateway session cookie. Admin-only via
 * `isModuleVisible` (the id maps to `'admin'` in rbac.ts's MODULE_REQUIREMENTS); the kernel
 * re-renders on `rbac:changed`, on which this module reloads its list.
 *
 * Broker passwords are sent as typed, over TLS; the gateway keeps them in its
 * encrypted connections file and never sends them back. The list response
 * omits them, so editing a connection with blank password fields keeps the
 * stored ones. The list filters as you type in its search box (`matchContains`
 * on broker or hostname: contains, case-insensitive, `*` = any run), from the
 * last load without a refetch. Imports only from `src/core/*` and its own
 * service.
 */
import { required, setError } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { createRowList, renderAdminRows } from '../../core/components/row-list';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { showToast } from '../../core/toast';
import { escapeHtml, matchContains } from '../../core/utils';
import { logger } from '../../core/logger';
import { reportManagedFailure } from '../../core/services/managed-api';
import { createConnMgmtService, type ManagedConnRecord } from './service';
import type { AppContext } from '../../core/types';

const VPN_FIELDS = [
    { key: 'name', placeholder: 'vpn name', label: 'Message VPN' },
    { key: 'user', placeholder: 'username', label: 'Client username' },
    { key: 'pass', placeholder: 'password (blank = keep)', type: 'password' as const, label: 'Client password' },
];

/** What an empty VPN list means, shown in its place. */
export const NO_VPNS = 'None: no user can reach this broker until it lists a Message VPN.';

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
            search: required<HTMLInputElement>(container, '#conn-mgmt-search'),
            btnRefresh: required<HTMLButtonElement>(container, '#btn-conn-mgmt-refresh'),
            btnAdd: required<HTMLButtonElement>(container, '#btn-conn-mgmt-add'),

            formView: required<HTMLElement>(container, '#conn-mgmt-form-view'),
            formTitle: required<HTMLElement>(container, '#conn-mgmt-form-title'),
            broker: required<HTMLInputElement>(container, '#conn-mgmt-broker'),
            hostname: required<HTMLInputElement>(container, '#conn-mgmt-hostname'),
            sempScheme: required<HTMLSelectElement>(container, '#conn-mgmt-semp-scheme'),
            sempPort: required<HTMLInputElement>(container, '#conn-mgmt-semp-port'),
            sempUser: required<HTMLInputElement>(container, '#conn-mgmt-semp-user'),
            sempPass: required<HTMLInputElement>(container, '#conn-mgmt-semp-pass'),
            sempPassHint: required<HTMLElement>(container, '#conn-mgmt-semp-pass-hint'),
            clientScheme: required<HTMLSelectElement>(container, '#conn-mgmt-client-scheme'),
            clientPort: required<HTMLInputElement>(container, '#conn-mgmt-client-port'),
            vpnRows: required<HTMLElement>(container, '#conn-mgmt-vpn-rows'),
            btnAddVpn: required<HTMLButtonElement>(container, '#btn-conn-mgmt-add-vpn'),
            btnSave: required<HTMLButtonElement>(container, '#btn-conn-mgmt-save'),
            btnCancel: required<HTMLButtonElement>(container, '#btn-conn-mgmt-cancel'),
            formError: required<HTMLElement>(container, '#conn-mgmt-form-error'),
        };

        const service = createConnMgmtService();
        const vpnList = createRowList(els.vpnRows, VPN_FIELDS, { empty: NO_VPNS });
        const gate = createGate(container, {
            id: 'conn-mgmt-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in as an administrator to manage connections.',
        });

        // null = adding a connection; otherwise the broker being edited.
        let editing: string | null = null;
        // Connections from the last list load, and the VPNs the edited
        // connection has a stored password for (none when adding).
        let conns: ManagedConnRecord[] = [];
        let storedVpns = new Set<string>();

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

        /** The loaded connections the search box matches (broker or hostname), or a row saying why there are none. */
        function renderList(): void {
            const query = els.search.value.trim();
            const shown = conns.filter(c => matchContains(c.broker, query) || matchContains(c.hostname, query));
            renderAdminRows(els.rows, shown, conns.length, query, {
                plural: 'connections',
                noun: 'connection',
                classPrefix: 'conn-mgmt',
                cells: c => `<td>${escapeHtml(c.broker)}</td><td>${escapeHtml(c.hostname)}</td>`,
                label: c => c.broker,
                onEdit: openEdit,
                onDelete: c => void removeConn(c.broker),
            });
        }

        // The session as this module last applied it: signed-in user and admin
        // flag, null when signed out. A replayed or unrelated rbac:changed (the
        // kernel's held replay at start, a broker connect) leaves it equal.
        const sessionKey = (): string | null => {
            const m = appState.managed;
            return m ? JSON.stringify([m.username, m.admin]) : null;
        };
        let appliedKey = sessionKey();

        // Gate the module on an admin session: non-admin (or not-logged-in) sees
        // the gate; an admin sees the list and it (re)loads. Called at install and
        // on an rbac:changed that changes the session (login / logout / self-demote).
        function applyGate(): void {
            appliedKey = sessionKey();
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
            const res = await service.listConnections();
            if (!res.ok) {
                reportManagedFailure(res, eventBus, msg => setError(els.listError, msg));
                return;
            }
            conns = res.data;
            renderList();
        }

        function openCreate(): void {
            editing = null;
            storedVpns = new Set();
            els.formTitle.textContent = 'Add connection';
            els.broker.value = '';
            els.broker.disabled = false;
            els.hostname.value = '';
            els.sempScheme.value = 'https';
            els.sempPort.value = '';
            els.sempUser.value = '';
            els.sempPass.value = '';
            els.sempPassHint.textContent = '';
            els.clientScheme.value = 'wss';
            els.clientPort.value = '';
            vpnList.clear();
            setError(els.formError, null);
            showView('form');
        }

        function openEdit(c: ManagedConnRecord): void {
            editing = c.broker;
            storedVpns = new Set((c.client.msgVpns ?? []).map(v => v.name));
            els.formTitle.textContent = `Edit connection "${c.broker}"`;
            els.broker.value = c.broker;
            els.broker.disabled = true; // broker is the key; rename = delete + recreate
            els.hostname.value = c.hostname;
            els.sempScheme.value = c.semp.scheme === 'http' ? 'http' : 'https';
            els.sempPort.value = c.semp.port;
            els.sempUser.value = c.semp.user;
            els.sempPass.value = '';
            els.sempPassHint.textContent = '(leave blank to keep current)';
            els.clientScheme.value = c.client.scheme === 'ws' ? 'ws' : 'wss';
            els.clientPort.value = c.client.port;
            vpnList.clear();
            (c.client.msgVpns ?? []).forEach(v =>
                vpnList.addRow({ name: v.name, user: v.user, pass: '' }),
            );
            setError(els.formError, null);
            showView('form');
        }

        async function saveForm(): Promise<void> {
            const broker = els.broker.value.trim();
            if (!broker) {
                setError(els.formError, 'Broker name is required.');
                return;
            }
            // The gateway's save replaces a connection of the same name, so
            // Add must not reach an existing one.
            if (!editing && conns.some(c => c.broker === broker)) {
                setError(els.formError, `Connection "${broker}" already exists. Use Edit to change it.`);
                return;
            }
            // A blank password keeps the stored one, matched by VPN name; a new
            // or renamed VPN has none to keep.
            const rows = vpnList.readRows();
            const unkept = rows.find(r => r.name && !r.pass && !storedVpns.has(r.name));
            if (unkept) {
                setError(els.formError, `VPN "${unkept.name}" has no stored password to keep. Enter its password.`);
                return;
            }
            els.btnSave.disabled = true;
            setError(els.formError, null);
            try {
                // A blank password is sent blank: the gateway keeps the stored one.
                const connection: ManagedConnRecord = {
                    broker,
                    hostname: els.hostname.value.trim(),
                    semp: {
                        scheme: els.sempScheme.value === 'http' ? 'http' : 'https',
                        port: els.sempPort.value.trim(),
                        user: els.sempUser.value.trim(),
                        pass: els.sempPass.value,
                    },
                    client: {
                        scheme: els.clientScheme.value === 'ws' ? 'ws' : 'wss',
                        port: els.clientPort.value.trim(),
                        msgVpns: rows.map(r => ({ name: r.name, user: r.user, pass: r.pass })),
                    },
                };
                const res = await service.saveConnection(connection);
                if (!res.ok) {
                    reportManagedFailure(res, eventBus, msg => setError(els.formError, msg));
                    return;
                }
                showToast('Connection saved', 'ok');
                applyGate(); // back to the list, reloaded
            } finally {
                els.btnSave.disabled = false;
            }
        }

        async function removeConn(broker: string): Promise<void> {
            if (!(await confirmDialog(`Delete connection "${broker}"?`, { confirmLabel: 'Delete' }))) return;
            const res = await service.deleteConnection(broker);
            if (!res.ok) {
                reportManagedFailure(res, eventBus, msg => showToast(msg, 'error'));
                return;
            }
            showToast('Connection deleted', 'ok');
            await loadList();
        }

        els.btnAdd.addEventListener('click', openCreate);
        els.btnRefresh.addEventListener('click', () => applyGate());
        els.search.addEventListener('input', renderList);
        els.btnSave.addEventListener('click', () => void saveForm());
        els.btnCancel.addEventListener('click', () => showView('list'));
        els.btnAddVpn.addEventListener('click', () => vpnList.addRow());
        eventBus.on('rbac:changed', () => {
            if (sessionKey() !== appliedKey) applyGate();
        });

        applyGate(); // gate until an admin session exists; load the list when it does
        logger.info('Connection Management Module Setup Complete');
    },
};
