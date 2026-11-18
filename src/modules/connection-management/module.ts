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
 *
 * Every listed connection carries a `rev`. The form keeps the rev of the record
 * it opened (0 for a new connection) and a save sends it; the 200 answer
 * carries the new rev. A delete sends the rev of its row. When someone else got
 * there first the gateway answers `stale` (a dialog with a Reload button, which
 * reloads the list and closes the form) or `not_found` (the connection was
 * deleted meanwhile: a message and the reloaded list), see
 * `src/core/admin-conflict.ts`.
 */
import { required, setError } from '../../core/dom';
import { createGate, gateOnAdminSession } from '../../core/components/module-gate';
import { createRowList, renderAdminRows } from '../../core/components/row-list';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { showToast } from '../../core/toast';
import { escapeHtml, matchContains } from '../../core/utils';
import { logger } from '../../core/logger';
import { handleConflict } from '../../core/admin-conflict';
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
        const { container, eventBus } = app;

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
        // The rev of the record the form opened: 0 when adding.
        let editingRev = 0;
        // Connections from the last list load, and the VPNs the edited
        // connection has a stored password for (none when adding).
        let conns: ManagedConnRecord[] = [];
        let storedVpns = new Set<string>();

        function showView(view: 'list' | 'form'): void {
            gate.hide();
            if (view !== 'form') forgetPasswords();
            els.listView.classList.toggle('hidden', view !== 'list');
            els.formView.classList.toggle('hidden', view !== 'form');
        }
        function showGate(): void {
            forgetPasswords();
            els.listView.classList.add('hidden');
            els.formView.classList.add('hidden');
            gate.show();
        }
        /** A hidden form keeps no typed password, SEMP or VPN: Cancel, a save, a sign-out or a 401. */
        function forgetPasswords(): void {
            els.sempPass.value = '';
            vpnList.clear();
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
                onDelete: c => void removeConn(c.broker, c.rev),
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
            editingRev = 0;
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
            editingRev = c.rev;
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
            // Early check; the gateway refuses it too (exists) when the list is out of date.
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
                    rev: editingRev,
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
                    if (res.code === 'exists') {
                        setError(els.formError, `Connection "${broker}" already exists. Use Edit to change it.`);
                        return;
                    }
                    if (await handleConflict(res, 'This connection', () => applyGate())) return;
                    reportManagedFailure(res, eventBus, msg => setError(els.formError, msg));
                    return;
                }
                editingRev = res.data.rev;
                showToast('Connection saved', 'ok');
                applyGate(); // back to the list, reloaded
            } finally {
                els.btnSave.disabled = false;
            }
        }

        async function removeConn(broker: string, rev: number): Promise<void> {
            if (!(await confirmDialog(`Delete connection "${broker}"?`, { confirmLabel: 'Delete' }))) return;
            const res = await service.deleteConnection(broker, rev);
            if (!res.ok) {
                if (await handleConflict(res, 'This connection', loadList)) return;
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

        applyGate(); // gate until an admin session exists; load the list when it does
        logger.info('Connection Management Module Setup Complete');
    },
};
