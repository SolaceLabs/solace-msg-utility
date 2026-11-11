/**
 * Connections Module -- Direct entry.
 *
 * Manages Solace broker and SEMP connections typed into the Direct form.
 * Priority 100: Must initialize first since other modules depend on connection state.
 *
 * The broker-side service factories live in `src/core/services/` and are
 * pure (no AppContext, no UI). This file wires their lifecycle hooks
 * to global AppState + bus events + the connections form's UI, making
 * connections the *primary specialist*. Other modules (queue-copy) use the
 * same factories with their own hook bridging for *secondary* connections
 * that don't touch global state.
 *
 * Two entry files share this module id. This one is what every Release bundle
 * installs: Direct only, and it never imports the managed files. The `managed`
 * variant installs `module.managed.ts` instead, which reuses `installDirect`
 * below and adds the Managed tab (see `MODULE_ENTRIES` in
 * `src/variants/managed.ts`).
 */

import { config } from './config.js';
import { ui } from './ui.js';
import { createServiceSolace, type SolaceConnectionHooks } from '../../core/services/solace-client';
import { createServiceSemp, type SempConnectionHooks } from '../../core/services/semp-client';
import { showToast } from '../../core/toast';
import { INPUT_DEBOUNCE_MS } from '../../core/timing';
import { logger } from '../../core/logger';
import { required } from '../../core/dom';
import { normalizeUrlPath, generateUuid, sdkClientName, sempAccountError } from '../../core/utils';
import { createOptionalField } from './optional-field';
import { isHostedDeployment, limitSchemeOptions, probeDeployment, usableScheme } from '../../core/hosted';
import { DEFAULT_CONN_CONFIG } from '../../core/connections/conn-modes';
import { DEFAULT_MAX_MESSAGES_PER_QUEUE, MAX_MESSAGES_PER_QUEUE } from '../../core/connections/defaults';
import { createVpnSwitch, type CheckConnectionRequest } from './vpn-switch';
import type { AppContext, ConnectionConfig, SolaceConfig, SempConfig } from '../../core/types';

const log = logger.withTag('Connections');

/** Sidebar icon, shared with the managed entry (`module.managed.ts`). */
export const CONNECTIONS_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';

export type { CheckConnectionRequest };

export interface DirectConnectionOptions {
    /**
     * Runs just before the Direct form starts a Solace or SEMP connect. The
     * managed entry passes its managed-session teardown here, so only one
     * connection mode is ever live.
     */
    onBeforeConnect?: () => void;
}

/** What an entry file needs to drive the Direct form. */
export interface DirectConnection {
    /** Drop any live Direct Solace and SEMP connection. */
    disconnect(): void;
    /** Open a queue over the Direct form: connect or switch VPN, then hand off. */
    checkConnection(request: CheckConnectionRequest): void;
}

/**
 * Wire the Direct form: element cache, service factories bridged to global
 * AppState + bus, saved settings, validation, Connect/Save/Load/Reset, and the
 * Direct side of the shared VPN switch (`vpn-switch.ts`). Shared by both entry
 * files. It registers no cross-module router; each entry routes
 * `connection:*` requests itself. Runs after the entry published the
 * `/hosted` verdict (`AppState.connConfig`), which it reads once here.
 */
export function installDirect(app: AppContext, opts: DirectConnectionOptions = {}): DirectConnection {
    const { container, appState, eventBus, loadSelf } = app;
    const hosted = isHostedDeployment(appState);

    // 1. Initialize UI (Cache Elements)
    ui.cacheElements(container);
    ui.initEvents();
    const els = ui.getElements();
    // Without the gateway, an https page cannot open ws:// or http://.
    limitSchemeOptions(els.elSolProtocol, hosted);
    limitSchemeOptions(els.elSempProtocol, hosted);

    // The URL Path fields open on demand; sync() after any write in code.
    const urlPaths = [
        createOptionalField({ wrap: els.elSolUrlPathField, input: els.elSolUrlPath, add: els.btnSolUrlPathAdd, clear: els.btnSolUrlPathClear }),
        createOptionalField({ wrap: els.elSempUrlPathField, input: els.elSempUrlPath, add: els.btnSempUrlPathAdd, clear: els.btnSempUrlPathClear }),
    ];
    const syncUrlPaths = () => urlPaths.forEach(f => f.sync());

    // 2. Build broker-side service clients with bridging hooks.
    //    These hooks ARE the primary-specific behavior: writes to global
    //    AppState, emits global bus events, mutates the connections form UI.
    //    Future secondary-connection modules (queue-copy) will define their
    //    own hooks that target module-scoped state instead.

    // True from a Connect click until the SDK reports up, failed or down. The
    // Connect button stays disabled meanwhile, so no second connect can race
    // the first (solace-client refuses one anyway).
    let solaceConnecting = false;

    function resetSolaceButton() {
        solaceConnecting = false;
        els.btnSolace.textContent = 'Connect';
        els.btnSolace.classList.remove('btn-danger');
        els.btnSolace.classList.add('btn-primary');
        els.btnSolace.disabled = false;
    }

    /** The SEMP button and attempt after any SEMP teardown -- ours, or the kernel's on a 401. */
    function resetSempUi() {
        lastSempAttempt = null;
        els.btnSemp.textContent = 'Connect';
        els.btnSemp.classList.remove('btn-danger');
        els.btnSemp.classList.add('btn-primary');
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
            solaceConnecting = false;
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
            if (infoStr && infoStr.includes('Connection error') && !hosted) {
                helpUrl = `${els.elSempProtocol.value}://${els.elHost.value}:${els.elSempPort.value}${normalizeUrlPath(els.elSempUrlPath.value)}`;
            }
            ui.showConnectError(els.elSolError, `Connection Failed: ${infoStr}`, helpUrl);
            resetSolaceButton();
            vpnSwitch.connectFailed(`Connection Failed: ${infoStr}`);
        },
        onError: (err) => {
            let helpUrl: string | null = null;
            if (err.message && err.message.includes('Certificate') && !hosted) {
                helpUrl = `${els.elSempProtocol.value}://${els.elHost.value}:${els.elSempPort.value}`;
            }
            ui.showConnectError(els.elSolError, err.message, helpUrl);
            resetSolaceButton();
            vpnSwitch.connectFailed(err.message);
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
            // The semp:disconnected listener below resets the button.
            eventBus.emit('semp:disconnected');
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

    // Helper: Apply Config to UI. Each field is guarded individually so a partial
    // saved config (e.g. a user only ever set host + vpn) doesn't blank the rest.
    function applyConfig(cfg: any) {
        // A saved plain scheme this page cannot use moves to its TLS form, with a
        // warning: the saved port is most likely the plain one.
        const moved: string[] = [];
        const scheme = (saved: string): string => {
            const s = usableScheme(saved, hosted);
            if (s !== saved) moved.push(`${saved}:// is now ${s}://`);
            return s;
        };
        if (cfg.host) els.elHost.value = cfg.host;

        if (cfg.solace) {
            if (cfg.solace.protocol) els.elSolProtocol.value = scheme(cfg.solace.protocol);
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
            if (cfg.semp.protocol) els.elSempProtocol.value = scheme(cfg.semp.protocol);
            if (cfg.semp.port) els.elSempPort.value = cfg.semp.port;
            if (cfg.semp.urlPath !== undefined) els.elSempUrlPath.value = cfg.semp.urlPath;
            if (cfg.semp.user) els.elSempUser.value = cfg.semp.user;
        }
        syncUrlPaths();
        if (moved.length) {
            showToast(`${moved.join(' and ')}: without the gateway, a page served over https reaches brokers only over TLS. Check the port.`, 'warn');
        }
    }

    // 4. Load Saved Settings
    const cfg = config.load();
    if (cfg) {
        applyConfig(cfg);
        log.info('settings loaded from saved config');
    }

    // Autofill the Client Name Identifier if the user has no saved value.
    // The user can edit this freely; we only generate when the field is blank
    // so a returning user keeps their previously-saved identifier.
    if (!els.elSolClientNameId.value) {
        els.elSolClientNameId.value = generateUuid();
    }

    // 5. Wire Click Handlers

    // Max-messages cap: integer, 1..MAX_MESSAGES_PER_QUEUE. Inline error on blur + blocks save.
    function validateMaxMessages(): number | null {
        const raw = els.elMaxMessages.value.trim();
        const n = Number(raw);
        let err: string | null = null;
        if (raw === '' || !Number.isFinite(n) || !Number.isInteger(n)) {
            err = 'Must be a whole number.';
        } else if (n < 1) {
            err = 'Must be at least 1.';
        } else if (n > MAX_MESSAGES_PER_QUEUE) {
            err = `Must not exceed ${MAX_MESSAGES_PER_QUEUE}.`;
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
        syncUrlPaths();

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

    // The SEMP account must meet the Solace CLI user-account rules
    // (sempAccountError): the Basic header is plain ASCII btoa, built the same
    // way for the probe and every later request, and a credential outside the
    // rules is refused here with the reason, before any request is sent.
    function validateSemp() {
        let valid = true;
        if (!ui.isValidHost(els.elHost.value)) { ui.showError(els.elHost, true); valid = false; } else ui.showError(els.elHost, false);
        if (!ui.isValidPort(els.elSempPort.value)) { ui.showError(els.elSempPort, true); valid = false; } else ui.showError(els.elSempPort, false);
        const account = sempAccountError(els.elSempUser.value, els.elSempPass.value);
        ui.showError(els.elSempUser, account?.field === 'user');
        ui.showError(els.elSempPass, account?.field === 'pass');
        ui.showConnectError(els.elSempError, account ? account.message : null);
        if (account) valid = false;
        return valid;
    }

    /**
     * Start a Direct Solace connect from the form. False when the form does
     * not validate (the fields say why); otherwise the outcome arrives through
     * the hooks. The Connect click and the VPN switch both start here.
     */
    function connectSolace(): boolean {
        if (!validateSolace()) return false;
        opts.onBeforeConnect?.();
        // Match the other Advanced Settings fields: read live from input at
        // connect time. A separate Save click persists to localStorage, but
        // the *current session* uses whatever the modal shows right now.
        const maxMessages = validateMaxMessages();
        if (maxMessages !== null) {
            eventBus.emit('config:max-messages-changed', { value: maxMessages });
        }

        // Trim defensively -- Enter-to-connect can fire without a prior
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
            maxMessagesPerQueue: maxMessages ?? DEFAULT_MAX_MESSAGES_PER_QUEUE,
            clientNameId,
            hosted,
        };

        // Compose the SDK clientName at connect initiation time so the
        // embedded timestamp reflects when this session started.
        const clientName = sdkClientName(clientNameId);

        // Pre-connect UI: clear error, button feedback. Hooks handle the rest.
        ui.showConnectError(els.elSolError, null);
        ui.showFeedback(els.btnSolace, 'Connecting...');
        els.btnSolace.disabled = true;
        solaceConnecting = true;

        // Stash the cfg + host + password so onConnected can publish
        // them into AppState.solaceConnection for cross-module consumers
        // (queue-copy mirrors the password into its source-side panel).
        lastSolaceAttempt = { host: els.elHost.value, cfg, pass: els.elSolPass.value };

        log.info(`connecting to ${els.elHost.value} VPN "${cfg.vpn}"`);
        serviceSolace.connect(cfg, els.elHost.value, els.elSolPass.value, clientName);
        return true;
    }

    // Connect Solace
    els.btnSolace.addEventListener('click', () => {
        if (appState.isConnected) {
            serviceSolace.disconnect();
        } else {
            connectSolace();
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
            opts.onBeforeConnect?.();

            const cfg: SempConfig = {
                protocol: els.elSempProtocol.value,
                port: els.elSempPort.value,
                urlPath: els.elSempUrlPath.value,
                user: els.elSempUser.value,
                hosted,
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
    // Every SEMP teardown resets the button: this form's own disconnect, and
    // the kernel's when a request gets a 401 (kernel.ts sempFetch), which
    // clears AppState and emits this without going through the hooks.
    eventBus.on('semp:disconnected', () => {
        logger.debug('EventBus: semp:disconnected -> Updating Input State');
        resetSempUi();
        ui.updateInputState(appState);
    });

    ui.updateInputState(appState);

    // Cross-module "open this queue" requests: the shared VPN switch, with the
    // Direct form's own connect. A form that does not validate fails the
    // switch at once with the reason, rather than waiting out the timeout.
    const vpnSwitch = createVpnSwitch({
        eventBus, loadSelf: () => loadSelf?.(), log,
        mode: {
            isConnected: () => appState.isConnected,
            currentVpn: () => els.elSolVpn.value,
            isConnecting: () => solaceConnecting,
            connect(vpn: string): void {
                els.elSolVpn.value = vpn;
                if (!connectSolace()) {
                    throw new Error('Fix the highlighted fields in the connection form, then connect again.');
                }
            },
            disconnect: () => serviceSolace.disconnect(),
            showError: (message: string) => ui.showConnectError(els.elSolError, message),
        },
    });

    return {
        disconnect() {
            if (appState.isConnected) serviceSolace.disconnect();
            if (appState.isSempConnected) void serviceSemp.disconnect();
        },
        checkConnection: vpnSwitch.request,
    };
}

/**
 * Reveal an inconclusive-`/hosted` notice and wire its Retry button to a page
 * reload, so every reader of the verdict (read once at install) sees the new
 * one. Shared by both entry files, which each own their notice element.
 */
export function showProbeNotice(notice: HTMLElement, retry: HTMLElement, reload: () => void): void {
    notice.classList.remove('hidden');
    retry.addEventListener('click', () => reload());
}

export const ConnectionsModule = {
    name: 'Connections',
    id: 'connections',
    icon: CONNECTIONS_ICON,

    async install(app: AppContext, opts: { reload?: () => void } = {}) {
        const { container, eventBus, loadSelf } = app;

        // 0. Probe `/hosted`. Behind go-web-proxy with hosted on, every broker
        //    URL (Solace WebSocket + SEMP HTTP) must route via the gateway proxy
        //    path `/{scheme}/{port}/{host}{urlPath}`. Awaited so the flag is set
        //    before any Connect click can race the probe.
        //    The verdict's one home is AppState.connConfig.hosted (read with
        //    isHostedDeployment); the probe has its own deadline, so a stalled
        //    /hosted cannot keep the page blank.
        const { hosted, conn, inconclusive } = await probeDeployment();
        // This bundle offers Direct only, whatever the gateway advertises. Publish
        // that, so modules deriving their own connection choices (queue-copy's
        // destination) never offer a provisioned mode no session can back.
        if (conn.connModes !== 'direct') {
            log.warn(`the gateway offers Provisioned sign-in (connModes=${conn.connModes}), `
                + 'but this bundle is Direct-only. Serve provisioned.html for the sign-in (the gateway does in Provisioned mode).');
        }
        app.setState('connConfig', { ...DEFAULT_CONN_CONFIG, hosted });
        log.info(`mode = ${hosted ? 'hosted' : 'browser'}`);
        // An inconclusive probe keeps the app usable standalone, but says so.
        if (inconclusive) {
            showProbeNotice(
                required<HTMLElement>(container, '#conn-probe-notice'),
                required<HTMLElement>(container, '#btn-conn-probe-retry'),
                opts.reload ?? (() => window.location.reload()),
            );
        }

        const direct = installDirect(app);

        // Cross-module routers: "Edit in Connections" navigates here; an "open
        // this queue" request runs the Direct connect / VPN-switch dance.
        eventBus.on('connection:edit-requested', () => {
            if (loadSelf) loadSelf();
        });
        eventBus.on('connection:check-connection', direct.checkConnection);

        logger.info('Connections Module Setup Complete');
    }
};
