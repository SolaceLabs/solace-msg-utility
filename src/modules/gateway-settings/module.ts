/**
 * Gateway Settings Module (managed/RBAC variant, admin-only).
 *
 * Edits the gateway's settings over `GET`/`PUT /managed/settings`
 * (go-web-proxy/settings.go). Ships in the standalone `/solAdmin` app (the
 * `admin` variant); the id maps to `'admin'` in rbac.ts's MODULE_REQUIREMENTS.
 *
 * The gateway validates a save exactly as at startup and applies the keys on
 * the next request (the TLS paths are environment variables, not settings, and
 * the certificate and trusted CAs live in the Certificates module). The
 * Restart gateway button of the "Gateway" card asks first, then sends
 * `POST /managed/restart`, waits for `/hosted` to answer again and moves to
 * the sign-in. The gateway refuses an
 * access list that would deny this browser (`would_lock_out`, shown with the
 * gateway's reason) and a save over a hand edit of the file it has not loaded
 * (`changedOnDisk`, which also disables Save). Imports only from
 * `src/core/*` and its own service.
 *
 * The file's `rev` (opaque text) comes with every load and goes back at the top
 * level of the save body; the answer carries the new one. When someone else
 * saved first the gateway answers `stale`: a dialog with a Reload button that
 * reloads the form (`src/core/admin-conflict.ts`).
 */
import { required, setError as setErrorOn } from '../../core/dom';
import { createGate, gateOnAdminSession } from '../../core/components/module-gate';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { showToast } from '../../core/toast';
import { moduleLabel } from '../../core/utils';
import { logger } from '../../core/logger';
import { askReload } from '../../core/admin-conflict';
import { reportManagedFailure } from '../../core/services/managed-api';
import { createSettingsService, type ClientSeen, type GatewaySettings, type SettingsView } from './service';
import type { AppContext } from '../../core/types';

type Kind = 'text' | 'bool' | 'int' | 'lines';

/**
 * Every form field: its settings key and how its input holds the value.
 * The input's id is `gw-set-` plus the key with the dot as a dash.
 * `modules.offered` is a toggle tile per catalog module, handled on its own.
 */
const FIELDS: ReadonlyArray<{ key: string; kind: Kind }> = [
    { key: 'connModes', kind: 'text' },
    { key: 'defaultConn', kind: 'text' },
    { key: 'access.allow', kind: 'lines' },
    { key: 'access.trustedProxies', kind: 'lines' },
    { key: 'session.idleMinutes', kind: 'int' },
    { key: 'session.absoluteMinutes', kind: 'int' },
    { key: 'session.connectsPerMinute', kind: 'int' },
    { key: 'login.perClient', kind: 'bool' },
    { key: 'login.maxFailures', kind: 'int' },
    { key: 'login.clientMaxFailures', kind: 'int' },
    { key: 'login.resetMinutes', kind: 'int' },
    { key: 'login.backoffSeconds', kind: 'int' },
    { key: 'login.maxBackoffSeconds', kind: 'int' },
    { key: 'login.unauthenticatedPerMinute', kind: 'int' },
    { key: 'login.passwordMinLength', kind: 'int' },
    { key: 'login.twoFactor', kind: 'text' },
    { key: 'login.twoFactorMinutes', kind: 'int' },
    { key: 'modules.userDefault', kind: 'text' },
    { key: 'logLevel', kind: 'text' },
    { key: 'audit.stdout', kind: 'bool' },
    { key: 'audit.access', kind: 'bool' },
    { key: 'audit.onFailure', kind: 'text' },
    { key: 'tls.insecureSkipVerify', kind: 'bool' },
];

/** One line under each module's name on its tile; a module not listed shows its name alone. */
const MODULE_DESCRIPTIONS: Readonly<Record<string, string>> = {
    'queue-browser': 'Browse, inspect and delete queued messages.',
    'queue-copy': 'Copy or move messages between queues.',
    'queue-subscription-explorer': 'See which topics each queue subscribes to.',
};

/** The question Restart gateway asks before it restarts. */
const RESTART_QUESTION = 'Restart the gateway? Everyone is signed out and open broker connections close. It is back in a few seconds.';
/** The first look at `/hosted` comes after the old process has had time to stop; later ones every second, for a minute. */
const RESTART_FIRST_WAIT_MS = 2000;
const RESTART_POLL_MS = 1000;
const RESTART_ATTEMPTS = 60;

/** Seams of the restart wait, for tests: how to sleep and how to reload the page. */
export interface GatewaySettingsOptions {
    wait?: (ms: number) => Promise<void>;
    reload?: () => void;
}

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
    name: 'Gateway Settings',
    id: 'gateway-settings',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',

    async install(app: AppContext, opts: GatewaySettingsOptions = {}) {
        const { container, eventBus } = app;

        const els = {
            view: required<HTMLElement>(container, '#gw-set-view'),
            btnReload: required<HTMLButtonElement>(container, '#btn-gw-set-reload'),
            btnSave: required<HTMLButtonElement>(container, '#btn-gw-set-save'),
            disk: required<HTMLElement>(container, '#gw-set-disk'),
            btnRestart: required<HTMLButtonElement>(container, '#btn-gw-set-restart'),
            restarting: required<HTMLElement>(container, '#gw-set-restarting'),
            restartError: required<HTMLElement>(container, '#gw-set-restart-error'),
            client: required<HTMLElement>(container, '#gw-set-client'),
            offered: required<HTMLElement>(container, '#gw-set-modules-offered'),
            error: required<HTMLElement>(container, '#gw-set-error'),
        };
        const inputs = new Map(FIELDS.map(f => [f.key, required<Input>(container, `#gw-set-${f.key.replace('.', '-')}`)] as const));

        const service = createSettingsService();
        const wait = opts.wait ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
        // Back at the same address, the gateway answers a browser without a session
        // with its sign-in, which returns here; the demo restores itself the same way.
        /* v8 ignore start -- jsdom does not implement a page reload, so every test
           injects its own; the default is one call to the browser. */
        const reload = opts.reload ?? (() => window.location.reload());
        /* v8 ignore stop */
        const gate = createGate(container, {
            id: 'gw-set-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in as an administrator to change the gateway settings.',
        });

        // The settings as last loaded; a save sends a copy with the form's
        // values. null until the first load succeeds.
        let loaded: GatewaySettings | null = null;
        // The rev the settings were loaded at, sent back by a save.
        let loadedRev = '';

        function setError(msg: string | null): void {
            setErrorOn(els.error, msg);
        }

        function showChangedOnDisk(changed: boolean): void {
            els.disk.classList.toggle('hidden', !changed);
            els.btnSave.disabled = changed;
        }

        /** A toggle tile for one catalog module: a button whose aria-pressed says whether it is on offer. */
        function moduleTile(id: string, on: boolean): HTMLButtonElement {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'gw-set-tile';
            tile.dataset.module = id;
            tile.setAttribute('aria-pressed', String(on));
            const name = document.createElement('span');
            name.className = 'gw-set-tile-name';
            name.textContent = moduleLabel(id);
            tile.appendChild(name);
            const description = MODULE_DESCRIPTIONS[id];
            if (description) {
                const line = document.createElement('span');
                line.className = 'gw-set-tile-desc';
                line.textContent = description;
                tile.appendChild(line);
            }
            tile.addEventListener('click', () => tile.setAttribute('aria-pressed', String(tile.getAttribute('aria-pressed') !== 'true')));
            return tile;
        }

        function render(view: SettingsView): void {
            loaded = view.settings;
            loadedRev = view.rev;
            const tree = view.settings as unknown as Tree;
            for (const f of FIELDS) {
                const input = inputs.get(f.key) as Input;
                const value = read(tree, f.key);
                if (f.kind === 'bool') (input as HTMLInputElement).checked = value as boolean;
                else if (f.kind === 'lines') input.value = (value as string[]).join('\n');
                else input.value = String(value);
            }
            els.offered.innerHTML = '';
            for (const id of view.catalog) els.offered.appendChild(moduleTile(id, view.settings.modules.offered.includes(id)));
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
            const offered = [...els.offered.querySelectorAll<HTMLElement>('.gw-set-tile')]
                .filter(t => t.getAttribute('aria-pressed') === 'true')
                .map(t => t.dataset.module as string);
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
            const res = await service.save(next, loadedRev);
            els.btnSave.disabled = false;
            if (!res.ok) {
                if (res.code === 'stale') {
                    if (await askReload('This settings page')) await load();
                    return;
                }
                if (res.code === 'config_changed_on_disk') showChangedOnDisk(true);
                reportManagedFailure(res, eventBus, setError);
                return;
            }
            loadedRev = res.data.rev;
            showToast('Settings saved', 'ok');
            await load(); // the gateway's normalised values
        }

        function setRestartError(msg: string | null): void {
            setErrorOn(els.restartError, msg);
        }

        /** Ask, then restart: after the gateway's 202, wait for `/hosted` to answer again and go to the sign-in. */
        async function restart(): Promise<void> {
            if (!await confirmDialog(RESTART_QUESTION, { confirmLabel: 'Restart gateway' })) return;
            setRestartError(null);
            els.btnRestart.disabled = true;
            const res = await service.restart();
            if (!res.ok) {
                els.btnRestart.disabled = false;
                reportManagedFailure(res, eventBus, setRestartError);
                return;
            }
            els.restarting.textContent = 'Restarting the gateway. This page goes to the sign-in when the gateway answers again.';
            els.restarting.classList.remove('hidden');
            for (let attempt = 0; attempt < RESTART_ATTEMPTS; attempt++) {
                await wait(attempt === 0 ? RESTART_FIRST_WAIT_MS : RESTART_POLL_MS);
                if (await service.ping()) {
                    reload();
                    return;
                }
            }
            els.restarting.classList.add('hidden');
            els.btnRestart.disabled = false;
            setRestartError('The gateway has not answered after a minute. Check it on its host, then reload this page.');
        }

        // Admin sessions only, like the other admin modules. Called at install
        // and on an rbac:changed that changes the session.
        const applyGate = gateOnAdminSession(app, {
            onNoAdmin: () => {
                els.view.classList.add('hidden');
                gate.show();
            },
            onAdmin: () => {
                gate.hide();
                els.view.classList.remove('hidden');
                void load();
            },
        });

        els.btnReload.addEventListener('click', () => void load());
        els.btnSave.addEventListener('click', () => void save());
        els.btnRestart.addEventListener('click', () => void restart());

        applyGate();
        logger.info('Gateway Settings Module Setup Complete');
    },
};
