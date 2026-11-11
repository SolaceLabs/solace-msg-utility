/**
 * Gateway Settings Module (managed/RBAC variant, admin-only).
 *
 * Edits the gateway's config.yaml over `GET`/`PUT /managed/settings`
 * (go-web-proxy/settings.go). Ships in the standalone `/solAdmin` app (the
 * `admin` variant); the id maps to `'admin'` in rbac.ts's MODULE_REQUIREMENTS.
 *
 * The gateway validates a save exactly as at startup and applies most keys on
 * the next request. The keys it reports as `restartOnly` are tagged "restart"
 * here, and a banner lists the ones saved but not yet running. The path keys
 * it reports as `hostOnly` are shown read-only and tagged "edit on host": only
 * a hand edit of config.yaml changes them. It refuses an
 * access list that would deny this browser (`would_lock_out`, shown with the
 * gateway's reason) and a save over a hand edit of the file it has not loaded
 * (`changedOnDisk`, which also disables Save). Imports only from
 * `src/core/*` and its own service.
 */
import { required, setError as setErrorOn } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { showToast } from '../../core/toast';
import { moduleLabel } from '../../core/utils';
import { logger } from '../../core/logger';
import { reportManagedFailure } from '../../core/services/managed-api';
import { createSettingsService, type ClientSeen, type GatewaySettings, type SettingsView } from './service';
import type { AppContext } from '../../core/types';

type Kind = 'text' | 'bool' | 'int' | 'lines';

/**
 * Every form field: its config.yaml key and how its input holds the value.
 * The input's id is `gw-set-` plus the key with the dot as a dash.
 * `modules.offered` is a checkbox per catalog module, handled on its own.
 */
const FIELDS: ReadonlyArray<{ key: string; kind: Kind }> = [
    { key: 'connModes', kind: 'text' },
    { key: 'defaultConn', kind: 'text' },
    { key: 'access.allow', kind: 'lines' },
    { key: 'access.trustedProxies', kind: 'lines' },
    { key: 'session.idleMinutes', kind: 'int' },
    { key: 'session.absoluteMinutes', kind: 'int' },
    { key: 'login.maxFailures', kind: 'int' },
    { key: 'login.backoffSeconds', kind: 'int' },
    { key: 'login.maxBackoffSeconds', kind: 'int' },
    { key: 'login.unauthenticatedPerMinute', kind: 'int' },
    { key: 'modules.userDefault', kind: 'text' },
    { key: 'logLevel', kind: 'text' },
    { key: 'usersFile', kind: 'text' },
    { key: 'connectionsFile', kind: 'text' },
    { key: 'tls.certFile', kind: 'text' },
    { key: 'tls.keyFile', kind: 'text' },
    { key: 'tls.trustDir', kind: 'text' },
    { key: 'tls.insecureSkipVerify', kind: 'bool' },
];

type Tree = Record<string, unknown>;
type Input = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function read(tree: Tree, key: string): unknown {
    return key.split('.').reduce<unknown>((node, part) => (node as Tree)[part], tree);
}

function write(tree: Tree, key: string, value: unknown): void {
    const parts = key.split('.');
    const last = parts.pop() as string;
    parts.reduce<Tree>((node, part) => node[part] as Tree, tree)[last] = value;
}

export const GatewaySettingsModule = {
    name: 'Settings',
    id: 'gateway-settings',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus } = app;

        const els = {
            view: required<HTMLElement>(container, '#gw-set-view'),
            btnReload: required<HTMLButtonElement>(container, '#btn-gw-set-reload'),
            btnSave: required<HTMLButtonElement>(container, '#btn-gw-set-save'),
            disk: required<HTMLElement>(container, '#gw-set-disk'),
            pending: required<HTMLElement>(container, '#gw-set-pending'),
            client: required<HTMLElement>(container, '#gw-set-client'),
            offered: required<HTMLElement>(container, '#gw-set-modules-offered'),
            error: required<HTMLElement>(container, '#gw-set-error'),
        };
        const inputs = new Map(FIELDS.map(f => [f.key, required<Input>(container, `#gw-set-${f.key.replace('.', '-')}`)] as const));

        const service = createSettingsService();
        const gate = createGate(container, {
            id: 'gw-set-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in as an administrator to change the gateway settings.',
        });

        // The settings as last loaded; a save sends a copy with the form's
        // values. null until the first load succeeds.
        let loaded: GatewaySettings | null = null;

        function setError(msg: string | null): void {
            setErrorOn(els.error, msg);
        }

        function showChangedOnDisk(changed: boolean): void {
            els.disk.classList.toggle('hidden', !changed);
            els.btnSave.disabled = changed;
        }

        function render(view: SettingsView): void {
            loaded = view.settings;
            const tree = view.settings as unknown as Tree;
            for (const f of FIELDS) {
                const input = inputs.get(f.key) as Input;
                const value = read(tree, f.key);
                if (f.kind === 'bool') (input as HTMLInputElement).checked = value as boolean;
                else if (f.kind === 'lines') input.value = (value as string[]).join('\n');
                else input.value = String(value);
                input.disabled = view.hostOnly.includes(f.key);
            }
            els.offered.innerHTML = '';
            for (const id of view.catalog) {
                const label = document.createElement('label');
                label.className = 'flex-row items-center gap-2 m-0';
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.value = id;
                box.checked = view.settings.modules.offered.includes(id);
                label.append(box, ` ${moduleLabel(id)}`);
                els.offered.appendChild(label);
            }
            container.querySelectorAll<HTMLElement>('[data-key]').forEach(group => {
                const key = group.dataset.key as string;
                const hostOnly = view.hostOnly.includes(key);
                group.classList.toggle('gw-set-host', hostOnly);
                group.classList.toggle('gw-set-restart', !hostOnly && view.restartOnly.includes(key));
            });
            const pending = view.pendingRestart;
            els.pending.textContent = pending.length ? `Saved, applies when the gateway restarts: ${pending.join(', ')}.` : '';
            els.pending.classList.toggle('hidden', pending.length === 0);
            showChangedOnDisk(view.changedOnDisk);
        }

        /** The one line saying which address the gateway takes this browser for, and why. */
        function clientLine(seen: ClientSeen): string {
            const head = 'Your address as the gateway sees it: ';
            if (!seen.address) {
                return `${head}unknown. The connection comes from ${seen.peer} and its X-Forwarded-For header could not be read.`;
            }
            if (seen.viaProxy) {
                return `${head}${seen.address} (from X-Forwarded-For, sent by the trusted proxy ${seen.peer}).`;
            }
            return `${head}${seen.address} (the TCP peer). If this is a proxy's or Docker's address and not yours, every user looks like it: for a reverse proxy, list it under Trusted reverse proxies and have it pass X-Forwarded-For.`;
        }

        async function showClient(): Promise<void> {
            const res = await service.client();
            els.client.textContent = res.ok ? clientLine(res.data) : 'Your address as the gateway sees it: unavailable.';
        }

        async function load(): Promise<void> {
            setError(null);
            const res = await service.load();
            if (!res.ok) {
                reportManagedFailure(res, eventBus, setError);
                return;
            }
            render(res.data);
            await showClient();
        }

        /** The form as a whole file, or the reason it cannot be sent. */
        function collect(base: GatewaySettings): GatewaySettings | string {
            const next = JSON.parse(JSON.stringify(base)) as Tree;
            for (const f of FIELDS) {
                const input = inputs.get(f.key) as Input;
                let value: unknown = input.value;
                if (f.kind === 'bool') {
                    value = (input as HTMLInputElement).checked;
                } else if (f.kind === 'lines') {
                    value = input.value.split('\n').map(line => line.trim()).filter(Boolean);
                } else if (f.kind === 'int') {
                    value = input.value.trim() === '' ? NaN : Number(input.value);
                    if (!Number.isInteger(value)) return `${f.key} must be a whole number.`;
                }
                write(next, f.key, value);
            }
            const offered = [...els.offered.querySelectorAll<HTMLInputElement>('input')].filter(b => b.checked).map(b => b.value);
            write(next, 'modules.offered', offered);
            return next as unknown as GatewaySettings;
        }

        async function save(): Promise<void> {
            if (!loaded) return;
            const next = collect(loaded);
            if (typeof next === 'string') {
                setError(next);
                return;
            }
            els.btnSave.disabled = true;
            setError(null);
            const res = await service.save(next);
            els.btnSave.disabled = false;
            if (!res.ok) {
                if (res.code === 'config_changed_on_disk') showChangedOnDisk(true);
                reportManagedFailure(res, eventBus, setError);
                return;
            }
            showToast('Settings saved', 'ok');
            await load(); // the gateway's normalised values and the restart banner
        }

        // Admin sessions only, like the other admin modules. Called at install
        // and on every rbac:changed.
        function applyGate(): void {
            if (!appState.managed?.admin) {
                els.view.classList.add('hidden');
                gate.show();
                return;
            }
            gate.hide();
            els.view.classList.remove('hidden');
            void load();
        }

        els.btnReload.addEventListener('click', () => void load());
        els.btnSave.addEventListener('click', () => void save());
        eventBus.on('rbac:changed', () => applyGate());

        applyGate();
        logger.info('Gateway Settings Module Setup Complete');
    },
};
