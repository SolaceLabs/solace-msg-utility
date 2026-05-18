import { isValidHost, isValidPort } from '../../core/utils';
import { required, attachBackdropClose } from '../../core/dom';

/** @type {any} */
export const ui = {};

(function () {
    let elements = {};

    ui.getElements = function () {
        return elements;
    };

    ui.cacheElements = function (container) {
        elements.container = container;

        // Broker Inputs — required: module installs require these.
        elements.elHost = required(container, '#conn-host');
        elements.btnSave = required(container, '#btn-save-config');
        elements.btnLoad = required(container, '#btn-load-config');
        elements.btnReset = required(container, '#btn-reset-form');

        // Solace Inputs — required.
        elements.elSolProtocol = required(container, '#solace-protocol');
        elements.elSolPort = required(container, '#solace-port');
        elements.elSolUrlPath = required(container, '#solace-url-path');
        elements.elSolVpn = required(container, '#solace-vpn');
        elements.elSolUser = required(container, '#solace-username');
        elements.elSolPass = required(container, '#solace-password');
        elements.elSolClientNameId = required(container, '#solace-client-name-id');
        elements.elSolClientNameIdError = required(container, '#solace-client-name-id-error');
        elements.btnSolace = required(container, '#btn-solace-connect');
        elements.radiosAuth = container.querySelectorAll('input[name="solace-auth-mode"]');
        elements.lblSolUser = container.querySelector('#lbl-solace-username');
        elements.lblSolPass = container.querySelector('#lbl-solace-password');

        // SEMP Inputs — required.
        elements.elSempProtocol = required(container, '#semp-protocol');
        elements.elSempPort = required(container, '#semp-port');
        elements.elSempUrlPath = required(container, '#semp-url-path');
        elements.elSempUser = required(container, '#semp-username');
        elements.elSempPass = required(container, '#semp-password');
        elements.btnSemp = required(container, '#btn-semp-connect');

        // Feedback — required.
        elements.elSolError = required(container, '#solace-connect-error');
        elements.elSempError = required(container, '#semp-connect-error');

        // Advanced — required.
        elements.btnSettings = required(container, '#btn-solace-settings');
        elements.elSettingsModal = required(container, '#solace-settings-modal');
        elements.btnCloseSettings = required(container, '#btn-cancel-settings');
        elements.elConnectRetries = required(container, '#sol-connect-retries');
        elements.elConnectTimeout = required(container, '#sol-connect-timeout');
        elements.elReconnectRetries = required(container, '#sol-reconnect-retries');
        elements.elReconnectWait = required(container, '#sol-reconnect-wait');
        elements.elMaxMessages = required(container, '#sol-max-messages');
        elements.elMaxMessagesError = required(container, '#sol-max-messages-error');

        // SSL Modal — required.
        elements.elSslModal = required(container, '#ssl-trust-modal');
        elements.elSslLink = required(container, '#ssl-trust-link');
        elements.elSslUrlText = required(container, '#ssl-trust-url-text');
        elements.btnCloseSsl = required(container, '#btn-close-ssl-modal');
    };

    ui.initEvents = function () {
        const els = elements;
        els.btnSettings.addEventListener('click', () => els.elSettingsModal.showModal());
        els.btnCloseSettings.addEventListener('click', () => els.elSettingsModal.close());
        els.btnCloseSsl.addEventListener('click', () => els.elSslModal.close());
        attachBackdropClose(els.elSettingsModal);
        attachBackdropClose(els.elSslModal);
        // Auth Toggle — radiosAuth is a NodeList from querySelectorAll (never null).
        els.radiosAuth.forEach(r => r.addEventListener('change', ui.updateAuthUI));
    };

    ui.showConnectError = function (el, msg, helpUrl) {
        if (msg) {
            el.textContent = msg;
            el.className = 'invalid-feedback';
            el.style.display = 'block';
            el.style.color = 'var(--status-error)';

            if (helpUrl) {
                const span = document.createElement('span');
                span.textContent = ' ⚠️ ';
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = 'Trust Certificate?';
                link.className = 'error-help-link';
                link.style.marginLeft = '0.25rem';
                link.style.color = 'var(--status-error)';
                link.style.fontWeight = 'bold';
                link.style.textDecoration = 'underline';
                link.title = 'Open broker URL to manually accept certificate';

                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    ui.openSslModal(helpUrl);
                });

                el.appendChild(span);
                el.appendChild(link);
            }
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    };

    ui.showError = function (el, show) {
        if (show) el.classList.add('is-invalid');
        else el.classList.remove('is-invalid');
    };

    ui.showFeedback = function (btn, text) {
        btn.textContent = text;
    };

    ui.openSslModal = function (url) {
        const els = elements;
        els.elSslLink.href = url;
        els.elSslUrlText.textContent = url;
        els.elSslModal.showModal();
    };

    ui.getAuthMode = function () {
        // `radiosAuth` is a NodeList from querySelectorAll — never null, empty if no matches.
        for (const r of elements.radiosAuth) {
            if (r.checked) return r.value;
        }
        return 'basic';
    };

    ui.setAuthMode = function (mode) {
        for (const r of elements.radiosAuth) {
            if (r.value === mode) r.checked = true;
        }
        ui.updateAuthUI();
    };

    ui.updateAuthUI = function () {
        const els = elements;
        const mode = ui.getAuthMode();
        if (mode === 'oauth') {
            els.lblSolUser.textContent = 'Access Token';
            els.lblSolPass.textContent = 'ID Token';
            els.elSolUser.placeholder = 'Access Token';
        } else {
            els.lblSolUser.textContent = 'Username';
            els.lblSolPass.textContent = 'Password';
            els.elSolUser.placeholder = 'default';
        }
    };

    // CRITICAL: Matches global state logic to disable inputs
    // Accepts appState parameter — no window.App references.
    ui.updateInputState = function (appState) {
        const isSempConnected = appState.isSempConnected;
        const isSolaceConnected = appState.isConnected;
        const els = elements;

        const anyConnected = isSolaceConnected || isSempConnected;
        els.elHost.disabled = anyConnected;

        // Solace Fields
        els.elSolProtocol.disabled = isSolaceConnected;
        els.elSolPort.disabled = isSolaceConnected;
        els.elSolUrlPath.disabled = isSolaceConnected;
        els.elSolVpn.disabled = isSolaceConnected;
        els.elSolUser.disabled = isSolaceConnected;
        els.elSolPass.disabled = isSolaceConnected;
        els.radiosAuth.forEach(r => r.disabled = isSolaceConnected);
        // Settings modal stays openable while connected so the user can review
        // the values that took effect — each field inside is disabled below
        // so nothing can be edited mid-session.
        els.elConnectRetries.disabled = isSolaceConnected;
        els.elConnectTimeout.disabled = isSolaceConnected;
        els.elReconnectRetries.disabled = isSolaceConnected;
        els.elReconnectWait.disabled = isSolaceConnected;
        els.elMaxMessages.disabled = isSolaceConnected;
        els.elSolClientNameId.disabled = isSolaceConnected;

        // SEMP Fields
        els.elSempUser.disabled = isSempConnected;
        els.elSempPass.disabled = isSempConnected;
        els.elSempProtocol.disabled = isSempConnected;
        els.elSempPort.disabled = isSempConnected;
        els.elSempUrlPath.disabled = isSempConnected;
    };

    // Delegate to core/utils
    ui.isValidHost = isValidHost;
    ui.isValidPort = isValidPort;

})();
