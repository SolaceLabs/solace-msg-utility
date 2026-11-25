import { describe, it, expect, beforeEach } from 'vitest';
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
            expect(container.querySelector('#conn-host')).toBeNull();
            expect(container.querySelector('#btn-solace-connect')).toBeNull();

            // Cached references are still usable — identity-equal to the originals —
            // proving the cache held the DOM node, not a selector string.
            const els2 = ui.getElements();
            expect(els2.elHost).toBe(hostBefore);
            expect(els2.btnSolace).toBe(btnBefore);
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
            expect(els.elSslModal.open).toBe(true);

            els.btnCloseSsl.click();
            expect(els.elSslModal.open).toBe(false);
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
            // Inline CORS hint sits after the Trust Certificate? link so users see
            // both possible causes of a "Failed to fetch" before clicking through.
            expect(els.elSolError.textContent).toContain('(or CORS)');
        });

        it('omits CORS hint when no helpUrl is provided', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Auth failed');
            expect(els.elSolError.querySelector('a')).toBeNull();
            expect(els.elSolError.textContent).not.toContain('(or CORS)');
        });

        it('help link click opens SSL modal', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Cert error', 'https://broker:8080');
            const link = els.elSolError.querySelector('a');
            link!.click();
            expect(els.elSslModal.open).toBe(true);
            // Modal populates the page origin so the broker admin gets a copy-pasteable value.
            expect(els.elCorsOriginText.textContent).toBe(globalThis.location.origin);
        });

        it('clears error when msg is null', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Error');
            ui.showConnectError(els.elSolError, null);
            expect(els.elSolError.textContent).toBe('');
            expect(els.elSolError.style.display).toBe('none');
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
        const authButton = (mode: string) => container.querySelector<HTMLButtonElement>(`#solace-auth-mode [data-auth-mode="${mode}"]`)!;

        it('returns basic by default', () => {
            expect(ui.getAuthMode()).toBe('basic');
        });

        it('a click on OAuth2 makes it the mode and names the two fields as tokens', () => {
            const els = ui.getElements();
            authButton('oauth').click();
            expect(ui.getAuthMode()).toBe('oauth');
            expect([els.lblSolUser.textContent, els.lblSolPass.textContent]).toEqual(['Access Token', 'ID Token']);

            authButton('basic').click();
            expect([els.lblSolUser.textContent, els.lblSolPass.textContent]).toEqual(['Username', 'Password']);
        });

        it('setAuthMode keeps the mode for one the control does not offer', () => {
            ui.setAuthMode('oauth');
            ui.setAuthMode('kerberos');
            expect(ui.getAuthMode()).toBe('oauth');
            expect(ui.getElements().lblSolUser.textContent).toBe('Access Token');
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
        });
    });

    describe('updateInputState', () => {
        it('disables Solace fields when connected', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: true, isSempConnected: false });
            expect(els.elSolProtocol.disabled).toBe(true);
            expect(els.elSolPort.disabled).toBe(true);
            expect(els.elSolUrlPath.disabled).toBe(true);
            expect([els.btnSolUrlPathAdd.disabled, els.btnSolUrlPathClear.disabled]).toEqual([true, true]);
            expect(els.elSolVpn.disabled).toBe(true);
            expect(els.elSolUser.disabled).toBe(true);
            expect(els.elSolPass.disabled).toBe(true);
            const authButtons = [...container.querySelectorAll<HTMLButtonElement>('#solace-auth-mode button')];
            expect(authButtons.map(b => b.disabled)).toEqual([true, true]);
            ui.updateInputState({ isConnected: false, isSempConnected: false });
            expect(authButtons.map(b => b.disabled)).toEqual([false, false]);
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
            expect([els.btnSempUrlPathAdd.disabled, els.btnSempUrlPathClear.disabled]).toEqual([true, true]);
        });

        it('enables all when disconnected', () => {
            const els = ui.getElements();
            ui.updateInputState({ isConnected: false, isSempConnected: false });
            expect(els.elSolPort.disabled).toBe(false);
            expect(els.elSempUser.disabled).toBe(false);
            expect([els.btnSolUrlPathAdd.disabled, els.btnSempUrlPathClear.disabled]).toEqual([false, false]);
        });
    });

    describe('showConnectError edge cases', () => {
        it('does nothing with empty string message', () => {
            const els = ui.getElements();
            ui.showConnectError(els.elSolError, 'Earlier error');
            expect(els.elSolError.style.display).toBe('block');
            ui.showConnectError(els.elSolError, '');
            expect(els.elSolError.style.display).toBe('none');
            expect(els.elSolError.textContent).toBe('');
        });
    });
});
