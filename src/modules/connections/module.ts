/**
 * Connections Module
 *
 * Manages Solace broker and SEMP connections.
 * Priority 100: Must initialize first since other modules depend on connection state.
 *
 * The broker-side service factories live in `src/core/services/` and are
 * pure (no AppContext, no UI). This module wires their lifecycle hooks
 * to global AppState + bus events + the connections form's UI — making
 * connections the *primary specialist*. Other modules (e.g. future
 * queue-copy) will use the same factories with their own hook bridging
 * for *secondary* connections that don't touch global state.
 */

import { config } from './config.js';
import { ui } from './ui.js';
import { createServiceSolace, type SolaceConnectionHooks } from '../../core/services/solace-client';
import { createServiceSemp, type SempConnectionHooks } from '../../core/services/semp-client';
import { showToast } from '../../core/toast';
import { INPUT_DEBOUNCE_MS } from '../../core/timing';
import { logger } from '../../core/logger';
import { normalizeUrlPath, generateUuid } from '../../core/utils';
import { isHosted, probeDeployment, setHosted } from '../../core/hosted';
import { resolveConnTabs } from '../../core/connections/conn-modes';
import { createManagedPanel } from './managed-panel';
import type { AppContext, ConnectionConfig, SolaceConfig, SempConfig } from '../../core/types';

export const ConnectionsModule = {
    name: 'Connections',
    id: 'connections',

    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus, loadSelf } = app;

        // 0. Probe `/hosted`. When the PWA is deployed behind go-web-proxy with
        //    HOSTED=true, the gateway returns body "true" and every broker URL
        //    (Solace WebSocket + SEMP HTTP) must route via the gateway proxy
        //    path `/{scheme}/{port}/{host}{urlPath}`. Awaited so the flag is
        //    set before any Connect click can race the probe.
        const { hosted, conn } = await probeDeployment();
        setHosted(hosted);
        // Publish the deployment's connection config so other modules can derive
        // what they may offer for their own secondary connections without
        // re-probing the gateway.
        app.setState('connConfig', conn);
        logger.info(`[Connections] mode = ${hosted ? 'hosted' : 'browser'}`);

        // 1. Initialize UI (Cache Elements)
        ui.cacheElements(container);
        ui.initEvents();
        const els = ui.getElements();

        // 1a. Connection-mode tabs (Direct / Managed). resolveConnTabs yields
        //     Direct-only unless a hosted gateway advertised Managed via /hosted;
        //     the tab bar hides itself for a single-mode deployment. The Managed
        //     panel itself is instantiated further down (after the Direct
        //     services) and only when that tab is actually offered, so a
        //     Direct-only deployment behaves exactly as it did pre-merge.
        const tabs = resolveConnTabs(conn);
        ui.renderTabs(tabs);

        // 2. Build broker-side service clients with bridging hooks.
        //    These hooks ARE the primary-specific behavior: writes to global
        //    AppState, emits global bus events, mutates the connections form UI.
        //    Future secondary-connection modules (queue-copy) will define their
        //    own hooks that target module-scoped state instead.

        function resetSolaceButton() {
            els.btnSolace.textContent = 'Connect';
            els.btnSolace.classList.remove('btn-danger');
            els.btnSolace.classList.add('btn-primary');
            els.btnSolace.disabled = false;
        }

        // Captured per Connect-click so the async hook can publish the
        // connection details (including password) into AppState. Cleared on
        // disconnect.
        let lastSolaceAttempt: { host: string; cfg: SolaceConfig; pass: string } | null = null;
        // Mirror for SEMP — onConnected needs the original cfg + host to
        // publish the structured fields (protocol/host/port/urlPath) into
        // AppState.sempCredentials so downstream UI (queue-copy) can read
        // what the user typed instead of reverse-engineering the wire URL.
        let lastSempAttempt: { host: string; cfg: SempConfig } | null = null;

        const solaceHooks: SolaceConnectionHooks = {
            onConnected: (session, vpn) => {
                ui.showConnectError(els.elSolError, null);
                els.btnSolace.textContent = 'Disconnect';
                els.btnSolace.classList.remove('btn-primary');
                els.btnSolace.classList.add('btn-danger');
                els.btnSolace.disabled = false;

                app.setState('isConnected', true);
                app.setState('selectedVpn', vpn);
                // onConnected only fires after the Connect button handler set
                // lastSolaceAttempt synchronously, so the non-null assertion is
                // safe here.
                const { host, cfg, pass } = lastSolaceAttempt!;
                app.setState('solaceConnection', {
                    host,
                    protocol: cfg.protocol,
                    port: cfg.port,
                    urlPath: cfg.urlPath,
                    vpn: cfg.vpn,
                    user: cfg.user,
                    pass,
                });
                eventBus.emit('client:connected', { session });
            },
            onDisconnected: () => {
                resetSolaceButton();
                app.setState('isConnected', false);
                app.setState('selectedVpn', null);
                app.setState('solaceConnection', null);
                lastSolaceAttempt = null;
                eventBus.emit('client:disconnected');
            },
            onConnectFailed: ({ infoStr }) => {
                // Help URL points the user at the broker's HTTPS endpoint so
                // they can accept its self-signed cert. In hosted mode the
                // broker is internal-only — the user can't reach it, so
                // suppress the link.
                let helpUrl: string | null = null;
                if (infoStr && infoStr.includes('Connection error') && !isHosted()) {
                    helpUrl = `${els.elSempProtocol.value}://${els.elHost.value}:${els.elSempPort.value}${normalizeUrlPath(els.elSempUrlPath.value)}`;
                }
                ui.showConnectError(els.elSolError, `Connection Failed: ${infoStr}`, helpUrl);
                resetSolaceButton();
            },
            onError: (err) => {
                let helpUrl: string | null = null;
                if (err.message && err.message.includes('Certificate') && !isHosted()) {
                    helpUrl = `${els.elSempProtocol.value}://${els.elHost.value}:${els.elSempPort.value}`;
                }
                ui.showConnectError(els.elSolError, err.message, helpUrl);
                resetSolaceButton();
            },
        };

        const sempHooks: SempConnectionHooks = {
            onConnected: (sempCtx, creds) => {
                // onConnected only fires after the Connect button handler set
                // lastSempAttempt synchronously, so the non-null assertion is
                // safe here.
                const { host: sempHost, cfg: sempCfg } = lastSempAttempt!;
                app.setState('sempCredentials', {
                    user: creds.user,
                    pass: creds.pass,
                    baseUrl: sempCtx.baseUrl,
                    protocol: sempCfg.protocol,
                    host: sempHost,
                    port: sempCfg.port,
                    urlPath: sempCfg.urlPath,
                });
                app.setState('isSempConnected', true);
                eventBus.emit('semp:connected');

                els.btnSemp.textContent = 'Disconnect';
                els.btnSemp.classList.remove('btn-primary');
                els.btnSemp.classList.add('btn-danger');

                ui.showError(els.elSempUser, false);
                ui.showError(els.elSempPass, false);
            },
            onDisconnected: () => {
                app.setState('isSempConnected', false);
                app.setState('sempCredentials', null);
                lastSempAttempt = null;
                eventBus.emit('semp:disconnected');

                els.btnSemp.textContent = 'Connect';
                els.btnSemp.classList.remove('btn-danger');
                els.btnSemp.classList.add('btn-primary');
            },
            onAuthFailed: () => {
                ui.showConnectError(els.elSempError, 'Authentication Failed (401). Check username/password.');
            },
            onError: ({ message, isNetworkError, baseUrl }) => {
                const helpUrl = isNetworkError ? baseUrl : null;
                ui.showConnectError(els.elSempError, `SEMP Network Error: ${message}`, helpUrl);
            },
        };

        const serviceSolace = createServiceSolace(solaceHooks);
        const serviceSemp = createServiceSemp(sempHooks);

        // 3. Initialize Solace Factory
        serviceSolace.init();

        // 3a. Managed panel (the "Managed" tab). Built after the Direct services
        //     so this module's own factory instances are created first; it owns
        //     its own factory pair + hooks and bridges them to the same global
        //     AppState/bus contract the Direct hooks use.
        const managedPanel = tabs.includes('managed')
            ? createManagedPanel(app, {
                // Only one mode may be live: drop the Direct connection when the
                // Managed panel connects.
                tearDownOther: () => {
                    if (appState.isConnected) serviceSolace.disconnect();
                    if (appState.isSempConnected) void serviceSemp.disconnect();
                },
            })
            : null;
        /** Mirror image: drop a managed session before a Direct connect, so RBAC
         *  (which keys off appState.managed) can't leak onto a direct session. */
        function tearDownManaged(): void {
            if (appState.managed) managedPanel?.logout();
        }
        els.connTabDirect.addEventListener('click', () => ui.showTab('direct'));
        els.connTabManaged.addEventListener('click', () => {
            ui.showTab('managed');
            managedPanel?.refreshView();
        });

        // Helper: Apply Config to UI. Each field is guarded individually so a partial
        // saved config (e.g. a user only ever set host + vpn) doesn't blank the rest.
        function applyConfig(cfg: any) {
            if (cfg.host) els.elHost.value = cfg.host;

            if (cfg.solace) {
                if (cfg.solace.protocol) els.elSolProtocol.value = cfg.solace.protocol;
                if (cfg.solace.port) els.elSolPort.value = cfg.solace.port;
                if (cfg.solace.urlPath !== undefined) els.elSolUrlPath.value = cfg.solace.urlPath;
                if (cfg.solace.vpn) els.elSolVpn.value = cfg.solace.vpn;
                if (cfg.solace.user) els.elSolUser.value = cfg.solace.user;
                if (cfg.solace.authMode) ui.setAuthMode(cfg.solace.authMode);
                if (cfg.solace.connectRetries !== undefined) els.elConnectRetries.value = cfg.solace.connectRetries;
                if (cfg.solace.connectTimeout !== undefined) els.elConnectTimeout.value = cfg.solace.connectTimeout;
                if (cfg.solace.reconnectRetries !== undefined) els.elReconnectRetries.value = cfg.solace.reconnectRetries;
                if (cfg.solace.reconnectWait !== undefined) els.elReconnectWait.value = cfg.solace.reconnectWait;
                if (cfg.solace.maxMessagesPerQueue !== undefined) {
                    els.elMaxMessages.value = cfg.solace.maxMessagesPerQueue;
                    // No emit here — the cap only takes effect at Connect time, and
                    // the Connect handler reads this input live. No point pushing the
                    // value into queue-browser state until a session actually starts.
                }
                if (cfg.solace.clientNameId) els.elSolClientNameId.value = cfg.solace.clientNameId;
            }

            if (cfg.semp) {
                if (cfg.semp.protocol) els.elSempProtocol.value = cfg.semp.protocol;
                if (cfg.semp.port) els.elSempPort.value = cfg.semp.port;
                if (cfg.semp.urlPath !== undefined) els.elSempUrlPath.value = cfg.semp.urlPath;
                if (cfg.semp.user) els.elSempUser.value = cfg.semp.user;
            }
        }

        // 4. Load Saved Settings
        const cfg = config.load();
        if (cfg) {
            applyConfig(cfg);
            logger.info('Settings loaded via config.js');
        }

        // Autofill the Client Name Identifier if the user has no saved value.
        // The user can edit this freely; we only generate when the field is blank
        // so a returning user keeps their previously-saved identifier.
        if (!els.elSolClientNameId.value) {
            els.elSolClientNameId.value = generateUuid();
        }

        // 5. Wire Click Handlers

        // Max-messages cap: integer, 1..10000. Inline error on blur + blocks save.
        const MAX_MESSAGES_LIMIT = 10000;
        function validateMaxMessages(): number | null {
            const raw = els.elMaxMessages.value.trim();
            const n = Number(raw);
            let err: string | null = null;
            if (raw === '' || !Number.isFinite(n) || !Number.isInteger(n)) {
                err = 'Must be a whole number.';
            } else if (n < 1) {
                err = 'Must be at least 1.';
            } else if (n > MAX_MESSAGES_LIMIT) {
                err = `Must not exceed ${MAX_MESSAGES_LIMIT}.`;
            }
            if (err) {
                els.elMaxMessages.classList.add('is-invalid');
                els.elMaxMessagesError.textContent = err;
                return null;
            }
            els.elMaxMessages.classList.remove('is-invalid');
            els.elMaxMessagesError.textContent = '';
            return n;
        }
        // Debounced input validation: blur fires immediately (cancelling any pending
        // input timer); typing schedules validation INPUT_DEBOUNCE_MS after the last
        // keystroke. Gives the user time to finish typing before an error appears and
        // keeps the eager-clear UX when correcting a previously-invalid value.
        let validateTimer: ReturnType<typeof setTimeout> | null = null;
        els.elMaxMessages.addEventListener('blur', () => {
            if (validateTimer !== null) {
                clearTimeout(validateTimer);
                validateTimer = null;
            }
            validateMaxMessages();
        });
        els.elMaxMessages.addEventListener('input', () => {
            if (validateTimer !== null) clearTimeout(validateTimer);
            validateTimer = setTimeout(() => {
                validateTimer = null;
                validateMaxMessages();
            }, INPUT_DEBOUNCE_MS);
        });

        // Client Name Identifier: 1..100 chars, alphanumeric + !@#$%^&*-=_+/.,
        // Validated on blur and at save/connect time. The HTML maxlength attribute
        // caps typed length; this regex catches paste and disallowed characters.
        const CLIENT_NAME_ID_REGEX = /^[A-Za-z0-9!@#$%^&*\-=_+/.,]{1,100}$/;
        function validateClientNameId(): string | null {
            // Trim before validating so surrounding whitespace (typically from
            // paste) doesn't flag an otherwise-valid identifier — the trimmed
            // value is also what gets forwarded to the SDK.
            const raw = els.elSolClientNameId.value.trim();
            let err: string | null = null;
            if (!raw) {
                err = 'Identifier is required.';
            } else if (raw.length > 100) {
                err = 'Must not exceed 100 characters.';
            } else if (!CLIENT_NAME_ID_REGEX.test(raw)) {
                err = 'Allowed: letters, digits, and !@#$%^&*-=_+/.,';
            }
            if (err) {
                els.elSolClientNameId.classList.add('is-invalid');
                els.elSolClientNameIdError.textContent = err;
                return null;
            }
            els.elSolClientNameId.classList.remove('is-invalid');
            els.elSolClientNameIdError.textContent = '';
            return raw;
        }
        // Normalize on blur: write the trimmed value back to the input so the
        // displayed string matches what's forwarded to the SDK. If the result
        // is empty (whitespace-only paste, manual clear), autofill a fresh
        // UUID rather than leave the field invalid — keeps the form in a
        // ready-to-connect state without an extra error round-trip.
        els.elSolClientNameId.addEventListener('blur', () => {
            const trimmed = els.elSolClientNameId.value.trim();
            els.elSolClientNameId.value = trimmed === '' ? generateUuid() : trimmed;
            validateClientNameId();
        });
        els.elSolClientNameId.addEventListener('input', () => {
            // Clear stale error eagerly while the user is correcting; full
            // validation runs on blur to avoid red-flashing mid-edit.
            if (els.elSolClientNameId.classList.contains('is-invalid')) {
                els.elSolClientNameId.classList.remove('is-invalid');
                els.elSolClientNameIdError.textContent = '';
            }
        });

        // Save
        els.btnSave.addEventListener('click', () => {
            const maxMessages = validateMaxMessages();
            if (maxMessages === null) {
                // Inline error already shown by validateMaxMessages — block save.
                return;
            }
            const clientNameId = validateClientNameId();
            if (clientNameId === null) {
                return;
            }
            const newCfg: ConnectionConfig = {
                host: els.elHost.value,
                solace: {
                    protocol: els.elSolProtocol.value,
                    port: els.elSolPort.value,
                    urlPath: els.elSolUrlPath.value,
                    vpn: els.elSolVpn.value,
                    user: els.elSolUser.value,
                    authMode: ui.getAuthMode() as 'basic' | 'oauth',
                    connectRetries: parseInt(els.elConnectRetries.value, 10),
                    connectTimeout: parseInt(els.elConnectTimeout.value, 10),
                    reconnectRetries: parseInt(els.elReconnectRetries.value, 10),
                    reconnectWait: parseInt(els.elReconnectWait.value, 10),
                    maxMessagesPerQueue: maxMessages,
                    clientNameId
                },
                semp: {
                    protocol: els.elSempProtocol.value,
                    port: els.elSempPort.value,
                    urlPath: els.elSempUrlPath.value,
                    user: els.elSempUser.value
                }
            };
            if (config.save(newCfg)) {
                // No emit here — Save persists to localStorage; the cap only takes
                // effect at Connect time, via the Connect handler reading the input.
                showToast('Configuration saved', 'ok');
            } else {
                // config.save() returns false on localStorage quota exceeded or
                // similar errors. Surface the failure instead of leaving the user
                // to assume success.
                showToast('Failed to save configuration — storage unavailable', 'error');
            }
        });

        // Load
        els.btnLoad.addEventListener('click', () => {
            const c = config.load();
            if (c) {
                applyConfig(c);
                showToast('Configuration loaded', 'ok');
            }
        });

        // Reset
        els.btnReset.addEventListener('click', () => {
            els.elHost.value = '';
            els.elSolProtocol.value = 'wss';
            els.elSolPort.value = '';
            els.elSolUrlPath.value = '';
            els.elSolVpn.value = '';
            els.elSolUser.value = '';
            els.elSolPass.value = '';
            // Regenerate the identifier instead of blanking — the field is
            // always meant to hold a value, and a fresh UUID matches the
            // initial-load behavior.
            els.elSolClientNameId.value = generateUuid();
            els.elSolClientNameId.classList.remove('is-invalid');
            els.elSolClientNameIdError.textContent = '';
            ui.setAuthMode('basic');

            els.elSempProtocol.value = 'https';
            els.elSempPort.value = '';
            els.elSempUrlPath.value = '';
            els.elSempUser.value = '';
            els.elSempPass.value = '';

            [els.elHost, els.elSolPort, els.elSolVpn, els.elSolUser, els.elSempPort, els.elSempUser, els.elSempPass]
                .forEach((el: any) => ui.showError(el, false));

            showToast('Form reset', 'info');
        });

        // Validate Helpers
        function validateSolace() {
            let valid = true;
            if (!ui.isValidHost(els.elHost.value)) { ui.showError(els.elHost, true); valid = false; } else ui.showError(els.elHost, false);
            if (!ui.isValidPort(els.elSolPort.value)) { ui.showError(els.elSolPort, true); valid = false; } else ui.showError(els.elSolPort, false);
            if (!els.elSolVpn.value.trim()) { ui.showError(els.elSolVpn, true); valid = false; } else ui.showError(els.elSolVpn, false);
            if (!els.elSolUser.value.trim()) { ui.showError(els.elSolUser, true); valid = false; } else ui.showError(els.elSolUser, false);
            if (validateClientNameId() === null) valid = false;
            return valid;
        }

        // Build a YYYYMMDDHHMMSS local-time stamp for the SDK clientName property.
        // Local time mirrors what the user sees on their own clock when reading
        // a clientName in broker tooling.
        function formatConnectTimestamp(d: Date): string {
            const p = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
        }

        function validateSemp() {
            let valid = true;
            if (!ui.isValidHost(els.elHost.value)) { ui.showError(els.elHost, true); valid = false; } else ui.showError(els.elHost, false);
            if (!ui.isValidPort(els.elSempPort.value)) { ui.showError(els.elSempPort, true); valid = false; } else ui.showError(els.elSempPort, false);
            if (!els.elSempUser.value.trim()) { ui.showError(els.elSempUser, true); valid = false; } else ui.showError(els.elSempUser, false);
            if (!els.elSempPass.value.trim()) { ui.showError(els.elSempPass, true); valid = false; } else ui.showError(els.elSempPass, false);
            return valid;
        }

        // Connect Solace
        els.btnSolace.addEventListener('click', () => {
            if (appState.isConnected) {
                serviceSolace.disconnect();
            } else {
                if (!validateSolace()) return;
                tearDownManaged();
                // Match the other Advanced Settings fields: read live from input at
                // connect time. A separate Save click persists to localStorage, but
                // the *current session* uses whatever the modal shows right now.
                const maxMessages = validateMaxMessages();
                if (maxMessages !== null) {
                    eventBus.emit('config:max-messages-changed', { value: maxMessages });
                }

                // Trim defensively — Enter-to-connect can fire without a prior
                // blur, in which case the normalize-on-blur handler hasn't run.
                const clientNameId = els.elSolClientNameId.value.trim();
                const cfg: SolaceConfig = {
                    protocol: els.elSolProtocol.value,
                    port: els.elSolPort.value,
                    urlPath: els.elSolUrlPath.value,
                    vpn: els.elSolVpn.value,
                    user: els.elSolUser.value,
                    authMode: ui.getAuthMode() as 'basic' | 'oauth',
                    connectRetries: parseInt(els.elConnectRetries.value, 10),
                    connectTimeout: parseInt(els.elConnectTimeout.value, 10),
                    reconnectRetries: parseInt(els.elReconnectRetries.value, 10),
                    reconnectWait: parseInt(els.elReconnectWait.value, 10),
                    maxMessagesPerQueue: maxMessages ?? 100,
                    clientNameId
                };

                // Compose the SDK clientName at connect initiation time so the
                // embedded timestamp reflects when this session started.
                const clientName = `SolMsgUtil/${formatConnectTimestamp(new Date())}/${clientNameId}`;

                // Pre-connect UI: clear error, button feedback. Hooks handle the rest.
                ui.showConnectError(els.elSolError, null);
                ui.showFeedback(els.btnSolace, 'Connecting...');

                // Stash the cfg + host + password so onConnected can publish
                // them into AppState.solaceConnection for cross-module consumers
                // (queue-copy mirrors the password into its source-side panel).
                lastSolaceAttempt = { host: els.elHost.value, cfg, pass: els.elSolPass.value };

                serviceSolace.connect(cfg, els.elHost.value, els.elSolPass.value, clientName);
            }
        });

        // Enter key helpers — `keydown` (not deprecated `keypress`) for parity with the
        // queue-browser bind/forward inputs and consistent behaviour across keyboard layouts.
        function onEnter(e: KeyboardEvent, btn: HTMLElement) {
            if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
        }

        [els.elHost, els.elSolPort, els.elSolUrlPath, els.elSolVpn, els.elSolUser, els.elSolPass].forEach((input: any) => {
            input.addEventListener('keydown', (e: KeyboardEvent) => onEnter(e, els.btnSolace));
        });
        [els.elSempPort, els.elSempUrlPath, els.elSempUser, els.elSempPass].forEach((input: any) => {
            input.addEventListener('keydown', (e: KeyboardEvent) => onEnter(e, els.btnSemp));
        });

        // Connect SEMP
        els.btnSemp.addEventListener('click', async () => {
            if (appState.isSempConnected) {
                await serviceSemp.disconnect();
            } else {
                if (!validateSemp()) return;
                tearDownManaged();

                const cfg: SempConfig = {
                    protocol: els.elSempProtocol.value,
                    port: els.elSempPort.value,
                    urlPath: els.elSempUrlPath.value,
                    user: els.elSempUser.value,
                };

                // Pre-connect UI: button spinner state, clear error. The factory's
                // hooks will update button text on success/disconnect; the finally
                // below restores the button state if connect rejected outright.
                els.btnSemp.disabled = true;
                els.btnSemp.innerHTML = '<span class="spinner">⌛</span> Connecting...';
                ui.showConnectError(els.elSempError, null);

                // Stash before connect() so the async onConnected hook can publish
                // the original user-typed components into AppState.sempCredentials.
                lastSempAttempt = { host: els.elHost.value, cfg };

                try {
                    await serviceSemp.connect(cfg, els.elHost.value, els.elSempPass.value);
                } finally {
                    els.btnSemp.disabled = false;
                    if (!appState.isSempConnected) {
                        els.btnSemp.innerHTML = 'Connect';
                    } else {
                        els.btnSemp.innerHTML = 'Disconnect';
                    }
                }
            }
        });

        // Listen for Global Events to Update UI State via EventBus
        eventBus.on('client:connected', () => {
            logger.debug('EventBus: client:connected -> Updating Input State');
            ui.updateInputState(appState);
        });
        eventBus.on('client:disconnected', () => {
            logger.debug('EventBus: client:disconnected -> Updating Input State');
            ui.updateInputState(appState);
        });
        eventBus.on('semp:connected', () => {
            logger.debug('EventBus: semp:connected -> Updating Input State');
            ui.updateInputState(appState);
        });
        eventBus.on('semp:disconnected', () => {
            logger.debug('EventBus: semp:disconnected -> Updating Input State');
            ui.updateInputState(appState);
        });

        ui.updateInputState(appState);

        // Cross-Module: Handle "Open in Browser" request via EventBus.
        // A VPN switch is a multi-step async dance: disconnect → wait for teardown →
        // reconnect → wait for UP. We guard against rapid duplicate clicks with
        // `opInProgress`; the flag is set when we begin async work and cleared by
        // every terminal path (success, failure, timeout, disconnect-timeout).
        let opInProgress = false;

        // Routes the connection to the caller-selected downstream event once
        // the VPN is live. `returnTo='queue-browser'` (default) emits
        // `browser:browse-queue`; `returnTo='queue-copy'` emits
        // `copy:vpn-switched` so queue-copy can navigate back and rewrite
        // the source queue field.
        eventBus.on('connection:edit-requested', () => {
            // A live managed session owns the view — let its panel decide which
            // managed view to show; otherwise just navigate to this module.
            if (appState.managed && managedPanel) {
                managedPanel.handleEditRequested();
                return;
            }
            if (loadSelf) loadSelf();
        });

        eventBus.on('connection:check-connection', (payload) => {
            // Route by the ACTIVE connection mode: a managed session drives the
            // provisioned-broker switch, otherwise the Direct form dance below.
            if (appState.managed && managedPanel) {
                managedPanel.handleCheckConnection(payload);
                return;
            }
            const { vpn: targetVpn, queue: targetQueue, returnTo } = payload;
            logger.info('[Connections] Received Open Request:', targetVpn, targetQueue, returnTo ?? 'queue-browser');

            if (opInProgress) {
                logger.warn('[Connections] Operation already in progress, ignoring duplicate request');
                return;
            }

            const navigateToConnections = () => { if (loadSelf) loadSelf(); };

            const finish = () => {
                if (returnTo === 'queue-copy') {
                    logger.info('[Connections] Connection Ready. Returning to queue-copy…');
                    eventBus.emit('copy:vpn-switched', { vpn: targetVpn, queue: targetQueue });
                } else {
                    logger.info('[Connections] Connection Ready. Requesting Browse...');
                    eventBus.emit('browser:browse-queue', { queue: targetQueue });
                }
            };

            // Wait for the next `client:connected` (success → finish) or `client:disconnected`
            // (failure → give up). A 30 s timeout ensures listeners can't leak if the broker
            // stalls and neither event fires. Clears `opInProgress` on every exit path.
            function waitForConnect(): void {
                let onSuccess: () => void;
                let onFail: () => void;
                const cleanup = () => {
                    clearTimeout(timer);
                    eventBus.off('client:connected', onSuccess);
                    eventBus.off('client:disconnected', onFail);
                    opInProgress = false;
                };
                onSuccess = () => { cleanup(); finish(); };
                onFail = () => { cleanup(); };
                const timer = setTimeout(cleanup, 30_000);
                eventBus.on('client:connected', onSuccess);
                eventBus.on('client:disconnected', onFail);
            }

            if (!appState.isConnected) {
                logger.info('[Connections] Not connected. Auto-connecting...');
                navigateToConnections();
                opInProgress = true;
                els.elSolVpn.value = targetVpn;
                waitForConnect();
                els.btnSolace.click();
            } else if (els.elSolVpn.value === targetVpn) {
                // Already on the right VPN — synchronous path, no async gate needed.
                // No navigation: there's nothing to do on the connections page, and
                // a flicker would be jarring. The caller stays where it is and
                // receives the finish event in-place.
                finish();
            } else {
                const doSwitch = confirm(`Current VPN is "${els.elSolVpn.value}". Switch to "${targetVpn}" to browse queue?`);
                if (doSwitch) {
                    // Navigate AFTER the user confirms — otherwise a Cancel
                    // click would strand the user on the connections page
                    // even though they declined the switch.
                    navigateToConnections();
                    opInProgress = true;
                    // Replace the previous arbitrary 500 ms delay with an event-driven
                    // handoff: wait for the actual `client:disconnected` signal (SDK
                    // finished teardown) before initiating the reconnect. 10 s safety
                    // timeout in case the broker hangs on disconnect.
                    let disconnectTimer: ReturnType<typeof setTimeout>;
                    const onDisconnected = () => {
                        clearTimeout(disconnectTimer);
                        eventBus.off('client:disconnected', onDisconnected);
                        els.elSolVpn.value = targetVpn;
                        waitForConnect();
                        els.btnSolace.click();
                    };
                    eventBus.on('client:disconnected', onDisconnected);
                    disconnectTimer = setTimeout(() => {
                        eventBus.off('client:disconnected', onDisconnected);
                        opInProgress = false;
                        logger.warn('[Connections] Disconnect timed out (10s); aborting VPN switch');
                    }, 10_000);

                    serviceSolace.disconnect();
                }
            }
        });

        logger.info('Connections Module Setup Complete');
    }
};
