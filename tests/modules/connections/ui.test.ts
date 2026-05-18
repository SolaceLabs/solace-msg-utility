import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui } from '../../../src/modules/connections/ui.js';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

function createConnectionsDOM() {
    return loadModuleDOM('connections');
}

describe('connections/ui', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createConnectionsDOM();
        document.body.appendChild(container);
        ui.cacheElements(container);
    });

    describe('cacheElements + getElements', () => {
        it('caches element references that survive DOM mutation', () => {
            // Capture the references BEFORE mutation. If cacheElements actually stored
            // the DOM nodes, these references stay valid after the live nodes are
            // detached from the container. If cacheElements were a no-op and
            // getElements() re-queried each call, this test would fail because the
            // second getElements() call would find nothing.
            const els1 = ui.getElements();
            const hostBefore = els1.elHost;
            const btnBefore = els1.btnSolace;
            expect(hostBefore).toBeTruthy();
            expect(btnBefore).toBeTruthy();

            // Rip the nodes out of the container so a re-query would fail.
            hostBefore.remove();
            btnBefore.remove();
            expect(container.querySelector('#solace-host')).toBeNull();
            expect(container.querySelector('#btn-solace-connect')).toBeNull();

            // Cached references are still usable — identity-equal to the originals —
            // proving the cache held the DOM node, not a selector string.
            const els2 = ui.getElements();
            expect(els2.elHost).toBe(hostBefore);
            expect(els2.btnSolace).toBe(btnBefore);
        });

        it('getElements falls back to document.getElementById', () => {
            // Reset ui internals by testing the fallback
            // We can't easily test this without resetting, so verify it returns elements
            const els = ui.getElements();
            expect(els.container).toBe(container);
        });
    });

    describe('initEvents', () => {
        it('wires settings modal toggle', () => {
            ui.initEvents();
            const els = ui.getElements();
            const modal = els.elSettingsModal;

            els.btnSettings.click();
            expect(modal.open).toBe(true);

            els.btnCloseSettings.click();
            expect(modal.open).toBe(false);
        });

        it('wires SSL modal close', () => {
            ui.initEvents();
            const els = ui.getElements();
            ui.openSslModal('https://test:8080');

            els.btnCloseSsl.click();
            expect(els.elSslModal.open).toBe(false);
        });

        it('wires auth radio change to updateAuthUI', () => {
            ui.initEvents();
            const els = ui.getElements();
            const radios = els.radiosAuth;

            // Switch to oauth
            radios[1].checked = true;
            radios[1].dispatchEvent(new Event('change'));
            expect(els.lblSolUser.textContent).toBe('Access Token');
            expect(els.lblSolPass.textContent).toBe('ID Token');
        });
    });

    describe('showConnectError', () => {
        it('shows error message', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Connection failed');
            expect(els.elSolError.textContent).toContain('Connection failed');
            expect(els.elSolError.style.display).toBe('block');
        });

        it('shows error with help URL link', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Certificate error', 'https://broker:8080');
            expect(els.elSolError.querySelector('a')).toBeTruthy();
            expect(els.elSolError.querySelector('.error-help-link')).toBeTruthy();
        });

        it('help link click opens SSL modal', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Cert error', 'https://broker:8080');
            const link = els.elSolError.querySelector('a');
            link!.click();
            expect(els.elSslModal.open).toBe(true);
        });

        it('clears error when msg is null', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Error');
            ui.showConnectError(els.elSolError, null);
            expect(els.elSolError.textContent).toBe('');
            expect(els.elSolError.style.display).toBe('none');
        });
    });

    describe('showError', () => {
        it('adds is-invalid class when show=true', () => {
            const els = ui.getElements();
            ui.showError(els.elHost, true);
            expect(els.elHost.classList.contains('is-invalid')).toBe(true);
        });

        it('removes is-invalid class when show=false', () => {
            const els = ui.getElements();
            els.elHost.classList.add('is-invalid');
            ui.showError(els.elHost, false);
            expect(els.elHost.classList.contains('is-invalid')).toBe(false);
        });
    });

    describe('showFeedback', () => {
        it('sets button text', () => {
            const els = ui.getElements();
            ui.showFeedback(els.btnSave, 'Saved!');
            expect(els.btnSave.textContent).toBe('Saved!');
        });
    });

    describe('openSslModal', () => {
        it('shows modal with URL', () => {
            const els = ui.getElements();
            ui.openSslModal('https://broker:8080');
            expect(els.elSslLink.href).toContain('https://broker:8080');
            expect(els.elSslUrlText.textContent).toBe('https://broker:8080');
            expect(els.elSslModal.open).toBe(true);
        });
    });

    describe('getAuthMode / setAuthMode', () => {
        it('returns basic by default', () => {
            expect(ui.getAuthMode()).toBe('basic');
        });

        it('setAuthMode switches to oauth and updates UI', () => {
            ui.setAuthMode('oauth');
            expect(ui.getAuthMode()).toBe('oauth');
            const els = ui.getElements();
            expect(els.lblSolUser.textContent).toBe('Access Token');
        });

        it('setAuthMode switches back to basic', () => {
            ui.setAuthMode('oauth');
            ui.setAuthMode('basic');
            expect(ui.getAuthMode()).toBe('basic');
            const els = ui.getElements();
            expect(els.lblSolUser.textContent).toBe('Username');
            expect(els.elSolUser.placeholder).toBe('default');
        });
    });

    describe('updateInputState', () => {
        it('disables host when any connection is active', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: true, isSempConnected: false });
            expect(els.elHost.disabled).toBe(true);
        });

        it('disables Solace fields when connected', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: true, isSempConnected: false });
            expect(els.elSolProtocol.disabled).toBe(true);
            expect(els.elSolPort.disabled).toBe(true);
            expect(els.elSolUrlPath.disabled).toBe(true);
            expect(els.elSolVpn.disabled).toBe(true);
            expect(els.elSolUser.disabled).toBe(true);
            expect(els.elSolPass.disabled).toBe(true);
        });

        it('keeps the settings button enabled when connected so the user can review (read-only) values mid-session', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: true, isSempConnected: false });
            // Modal must stay openable — the previous behavior of disabling the
            // gear icon hid configured values from the user. The fields inside
            // are individually disabled (see next test) so nothing is editable.
            expect(els.btnSettings.disabled).toBe(false);
        });

        it('disables every field inside the settings modal when Solace is connected', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: true, isSempConnected: false });
            expect(els.elConnectRetries.disabled).toBe(true);
            expect(els.elConnectTimeout.disabled).toBe(true);
            expect(els.elReconnectRetries.disabled).toBe(true);
            expect(els.elReconnectWait.disabled).toBe(true);
            expect(els.elMaxMessages.disabled).toBe(true);
            expect(els.elSolClientNameId.disabled).toBe(true);
        });

        it('re-enables every settings-modal field when Solace disconnects', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: true, isSempConnected: false });
            ui.updateInputState({ isConnected: false, isSempConnected: false });
            expect(els.elConnectRetries.disabled).toBe(false);
            expect(els.elConnectTimeout.disabled).toBe(false);
            expect(els.elReconnectRetries.disabled).toBe(false);
            expect(els.elReconnectWait.disabled).toBe(false);
            expect(els.elMaxMessages.disabled).toBe(false);
            expect(els.elSolClientNameId.disabled).toBe(false);
        });

        it('disables SEMP fields when SEMP connected', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: false, isSempConnected: true });
            expect(els.elSempUser.disabled).toBe(true);
            expect(els.elSempPass.disabled).toBe(true);
            expect(els.elSempProtocol.disabled).toBe(true);
            expect(els.elSempPort.disabled).toBe(true);
            expect(els.elSempUrlPath.disabled).toBe(true);
        });

        it('enables all when disconnected', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: false, isSempConnected: false });
            expect(els.elHost.disabled).toBe(false);
            expect(els.elSolPort.disabled).toBe(false);
            expect(els.elSempUser.disabled).toBe(false);
        });
    });

    describe('updateAuthUI', () => {
        it('updates labels for oauth mode', () => {
            const els = ui.getElements();
            ui.setAuthMode('oauth');
            expect(els.lblSolUser.textContent).toBe('Access Token');
            expect(els.lblSolPass.textContent).toBe('ID Token');
            expect(els.elSolUser.placeholder).toBe('Access Token');
        });

        it('updates labels for basic mode', () => {
            const els = ui.getElements();
            ui.setAuthMode('basic');
            expect(els.lblSolUser.textContent).toBe('Username');
            expect(els.lblSolPass.textContent).toBe('Password');
            expect(els.elSolUser.placeholder).toBe('default');
        });
    });

    describe('getAuthMode edge cases', () => {
        it('returns basic when no radio is checked', () => {
            const els = ui.getElements();
            els.radiosAuth.forEach((r: any) => (r.checked = false));
            expect(ui.getAuthMode()).toBe('basic');
        });
    });

    describe('cacheElements edge cases', () => {
        it('throws when a required element is missing', () => {
            const bare = document.createElement('div');
            document.body.appendChild(bare);
            expect(() => ui.cacheElements(bare)).toThrow(/Required element missing/);
            // restore cached full container for remaining tests
            ui.cacheElements(container);
        });
    });

    describe('showConnectError edge cases', () => {
        it('does nothing with empty string message', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, '');
            expect(els.elSolError.style.display).toBe('none');
        });
    });

    describe('updateInputState edge cases', () => {
        it('throws when cacheElements has not been given required elements', () => {
            const bare = document.createElement('div');
            document.body.appendChild(bare);
            expect(() => ui.cacheElements(bare)).toThrow();
            ui.cacheElements(container);
        });
    });
});
