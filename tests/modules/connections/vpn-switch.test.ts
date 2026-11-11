import { describe, it, expect, vi } from 'vitest';
import { createVpnSwitch, type VpnSwitchMode } from '../../../src/modules/connections/vpn-switch';
import { createEventBus } from '../../../src/core/event-bus';
import { logger } from '../../../src/core/logger';

/**
 * The VPN switch both connection modes share, against a stand-in mode. The
 * navigation contract (docs/architecture.md, "VPN-switch handoff") is the
 * table below; the Direct form and the Provisioned panel run the same switch
 * with their own actions (tests/modules/connections/module.test.ts and
 * tests/modules/connections/managed-panel.test.ts).
 */
function setup(over: Partial<VpnSwitchMode> = {}) {
    const eventBus = createEventBus();
    const loadSelf = vi.fn();
    const mode: VpnSwitchMode = {
        isConnected: vi.fn(() => true),
        currentVpn: vi.fn(() => 'old'),
        isConnecting: vi.fn(() => false),
        connect: vi.fn(),
        disconnect: vi.fn(),
        showError: vi.fn(),
        ...over,
    };
    const vpnSwitch = createVpnSwitch({ eventBus, loadSelf, log: logger.withTag('Connections'), mode });
    const browse = vi.fn();
    const copied = vi.fn();
    eventBus.on('browser:browse-queue', browse);
    eventBus.on('copy:vpn-switched', copied);
    return { eventBus, loadSelf, mode, vpnSwitch, browse, copied };
}

/** The open switch question (core confirm dialog): its text, after answering it. */
async function answer(yes: boolean): Promise<string> {
    const dialog = document.querySelector('dialog.confirm-dialog') as HTMLDialogElement;
    const text = dialog.querySelector('.confirm-dialog-message')!.textContent!;
    (dialog.querySelector(yes ? '.confirm-dialog-ok' : '.confirm-dialog-cancel') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    return text;
}

describe('connections/vpn-switch -- navigation contract', () => {
    it('auto-connect (not connected): navigates before connecting, finishes on the new session', () => {
        const { eventBus, loadSelf, mode, vpnSwitch, browse } = setup({ isConnected: vi.fn(() => false) });
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        expect(loadSelf).toHaveBeenCalledTimes(1);
        expect(mode.connect).toHaveBeenCalledWith('v2');
        eventBus.emit('client:connected', { session: {} });
        expect(browse).toHaveBeenCalledWith({ queue: 'q' });
    });

    it('already on the target VPN: finishes at once, without navigating', () => {
        const { loadSelf, vpnSwitch, copied } = setup();
        vpnSwitch.request({ vpn: 'old', queue: 'q', returnTo: 'queue-copy' });
        expect(loadSelf).not.toHaveBeenCalled();
        expect(copied).toHaveBeenCalledWith({ vpn: 'old', queue: 'q' });
    });

    it('VPN switch, user confirms: navigates after the confirm, closes, connects, finishes', async () => {
        const { eventBus, loadSelf, mode, vpnSwitch, copied } = setup();
        vpnSwitch.request({ vpn: 'v2', queue: 'q', returnTo: 'queue-copy' });
        expect(loadSelf).not.toHaveBeenCalled();   // nothing happens while the question is open
        expect(await answer(true)).toBe('Current VPN is "old". Switch to "v2"?');
        expect(loadSelf).toHaveBeenCalledTimes(1);
        expect(mode.disconnect).toHaveBeenCalled();
        expect(mode.connect).not.toHaveBeenCalled();

        eventBus.emit('client:disconnected');
        expect(mode.connect).toHaveBeenCalledWith('v2');
        eventBus.emit('client:connected', { session: {} });
        expect(copied).toHaveBeenCalledWith({ vpn: 'v2', queue: 'q' });
    });

    it('VPN switch, user cancels: no navigation, nothing closed, and the next request is asked again', async () => {
        const { loadSelf, mode, vpnSwitch } = setup();
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        await answer(false);
        expect(loadSelf).not.toHaveBeenCalled();
        expect(mode.disconnect).not.toHaveBeenCalled();
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        expect(document.querySelector('dialog.confirm-dialog')).not.toBeNull();
    });

    it('ignores a request while the switch question is open', async () => {
        const { mode, vpnSwitch } = setup();
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        vpnSwitch.request({ vpn: 'v3', queue: 'q' });
        expect(document.querySelectorAll('dialog.confirm-dialog')).toHaveLength(1);
        await answer(true);
        expect(mode.disconnect).toHaveBeenCalledTimes(1);
    });

    it('a mode that never auto-connects shows its own connect view instead', () => {
        const showConnectView = vi.fn();
        const { loadSelf, mode, vpnSwitch } = setup({ isConnected: vi.fn(() => false), showConnectView });
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        expect(loadSelf).toHaveBeenCalledTimes(1);
        expect(showConnectView).toHaveBeenCalledTimes(1);
        expect(mode.connect).not.toHaveBeenCalled();
    });
});

describe('connections/vpn-switch -- failures end the switch', () => {
    it('a rejected connect shows the reason and frees the switch for a retry', async () => {
        const { eventBus, mode, vpnSwitch, browse } = setup({
            isConnected: vi.fn(() => false),
            connect: vi.fn(async () => { throw new Error('dial refused'); }),
        });
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        await vi.waitFor(() => expect(mode.showError).toHaveBeenCalledWith('dial refused'));
        eventBus.emit('client:connected', { session: {} });
        expect(browse).not.toHaveBeenCalled();
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        expect(mode.connect).toHaveBeenCalledTimes(2);
    });

    it("connectFailed ends a waiting switch without writing over the mode's own message", () => {
        const { mode, vpnSwitch } = setup({ isConnected: vi.fn(() => false) });
        vpnSwitch.connectFailed('ignored: no switch in progress');
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        vpnSwitch.connectFailed('Connection Failed: refused');
        expect(mode.showError).not.toHaveBeenCalled();
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        expect(mode.connect).toHaveBeenCalledTimes(2);
    });

    it('ignores a request while a switch runs, and one while the mode is connecting', () => {
        const { mode, vpnSwitch } = setup({ isConnected: vi.fn(() => false) });
        vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        vpnSwitch.request({ vpn: 'v3', queue: 'q' });
        expect(mode.connect).toHaveBeenCalledTimes(1);

        const busy = setup({ isConnecting: vi.fn(() => true) });
        busy.vpnSwitch.request({ vpn: 'v2', queue: 'q' });
        expect(busy.loadSelf).not.toHaveBeenCalled();
        expect(busy.mode.disconnect).not.toHaveBeenCalled();
    });
});
