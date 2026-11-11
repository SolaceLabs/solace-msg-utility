/**
 * The VPN switch both connection modes share: what the connections module does
 * with a `connection:check-connection` request ("open queue Q on VPN V").
 *
 *   - Not connected: navigate to the Connections page, then connect to V the
 *     mode's own way (the Direct form auto-connects; the Provisioned panel
 *     shows its broker/VPN choice instead, `showConnectView`).
 *   - Already on V: finish at once, no navigation.
 *   - On another VPN: ask (the core confirm dialog); on Cancel nothing
 *     happens. On Switch navigate to the Connections page, close the session,
 *     connect to V, finish.
 *
 * Finishing emits `browser:browse-queue` or `copy:vpn-switched` (`returnTo`),
 * which takes the user back to the requesting module with the queue bound.
 * Every way a switch can fail -- the connect fails, the new session closes
 * before it is up, the old session does not close within
 * `SWITCH_DISCONNECT_TIMEOUT_MS`, the new one does not come up within
 * `SWITCH_CONNECT_TIMEOUT_MS` -- ends the same way: the reason on the
 * Connections page (`showError`), a warning toast, a warn log, and the switch
 * cleared so the user can retry. The navigation contract is documented in
 * docs/architecture.md ("VPN-switch handoff"), its single source of truth.
 */
import { showToast } from '../../core/toast';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { errMessage } from '../../core/utils';
import type { TaggedLogger } from '../../core/logger';
import type { BusEvents, EventBus } from '../../core/types';

/** A request to open a queue on a given VPN (`connection:check-connection`). */
export type CheckConnectionRequest = BusEvents['connection:check-connection'];

/** How long the old session may take to close before the switch gives up. */
export const SWITCH_DISCONNECT_TIMEOUT_MS = 10_000;
/** How long the new session may take to come up before the switch gives up. */
export const SWITCH_CONNECT_TIMEOUT_MS = 30_000;

/** How long a failed switch's toast stays up: it carries the reason. */
const FAILURE_TOAST_MS = 5000;

/** What a connection mode supplies; the switch itself is the same for both. */
export interface VpnSwitchMode {
    /** The primary session is up. */
    isConnected(): boolean;
    /** The VPN the live session is on. */
    currentVpn(): string;
    /** The mode's own connect (the user's Connect click) is in flight. */
    isConnecting(): boolean;
    /**
     * Start connecting the primary to `vpn` the mode's way. Success arrives as
     * `client:connected`; a failure through `VpnSwitch.connectFailed`, a throw
     * or a rejection.
     */
    connect(vpn: string): void | Promise<void>;
    /** Close the primary session; its `client:disconnected` lets the switch go on. */
    disconnect(): void;
    /** Show why a switch failed, on the Connections page. */
    showError(message: string): void;
    /**
     * Set by a mode that never auto-connects: a request with no live session
     * shows this instead (Provisioned: the broker/VPN choice).
     */
    showConnectView?(): void;
}

export interface VpnSwitch {
    /** Handle one `connection:check-connection` request. */
    request(req: CheckConnectionRequest): void;
    /**
     * The mode's connect failed and its hook has shown `message`: ends a
     * switch waiting for it (no-op otherwise), with the toast and the log.
     */
    connectFailed(message: string): void;
}

export function createVpnSwitch(deps: {
    eventBus: EventBus;
    /** Navigate to the Connections page. */
    loadSelf: () => void;
    log: TaggedLogger;
    mode: VpnSwitchMode;
}): VpnSwitch {
    const { eventBus, loadSelf, log, mode } = deps;

    /** The switch in progress: its target VPN and how to stop its current wait. */
    let active: { vpn: string; stop: () => void } | null = null;
    /** The switch question is open; a request meanwhile is ignored. */
    let asking = false;

    function finish(req: CheckConnectionRequest): void {
        if (req.returnTo === 'queue-copy') {
            log.info(`VPN "${req.vpn}" is ready; returning queue "${req.queue}" to Queue Copy`);
            eventBus.emit('copy:vpn-switched', { vpn: req.vpn, queue: req.queue });
        } else {
            log.info(`VPN "${req.vpn}" is ready; opening queue "${req.queue}" in Queue Browser`);
            eventBus.emit('browser:browse-queue', { queue: req.queue });
        }
    }

    /**
     * End the switch in progress with `reason`; no-op when none is. `shown`:
     * the mode has put the reason on the page already (its failure hook did,
     * with whatever help it adds), so it is not written over.
     */
    function fail(reason: string, shown = false): void {
        if (!active) return;
        const { vpn, stop } = active;
        stop();
        active = null;
        log.warn(`switch to VPN "${vpn}" failed: ${reason}`);
        if (!shown) mode.showError(reason);
        showToast(`Could not switch to VPN "${vpn}": ${reason}`, 'warn', FAILURE_TOAST_MS);
    }

    /** Wait for `event` (or `fail` after `ms`); the returned `stop` undoes both. */
    function waitFor(event: 'client:connected' | 'client:disconnected', onEvent: () => void, ms: number, timeoutReason: string): () => void {
        const timer = setTimeout(() => fail(timeoutReason), ms);
        eventBus.on(event, onEvent);
        return () => {
            clearTimeout(timer);
            eventBus.off(event, onEvent);
        };
    }

    /** Connect to the target and wait for the session; a session that drops meanwhile fails the switch. */
    function connectTo(req: CheckConnectionRequest): void {
        const onDown = () => fail(`the connection to VPN "${req.vpn}" closed before it came up.`);
        const onUp = () => {
            active!.stop();
            active = null;
            finish(req);
        };
        const stopUp = waitFor('client:connected', onUp, SWITCH_CONNECT_TIMEOUT_MS,
            `VPN "${req.vpn}" did not connect within ${SWITCH_CONNECT_TIMEOUT_MS / 1000} s.`);
        eventBus.on('client:disconnected', onDown);
        active = {
            vpn: req.vpn,
            stop: () => {
                stopUp();
                eventBus.off('client:disconnected', onDown);
            }
        };

        // A mode's connect is either synchronous (it may throw) or a promise.
        let started: Promise<void> | undefined;
        try {
            started = mode.connect(req.vpn) as Promise<void> | undefined;
        } catch (e) {
            fail(errMessage(e));
            return;
        }
        if (started) started.catch((e: unknown) => fail(errMessage(e)));
    }

    function request(req: CheckConnectionRequest): void {
        const { vpn, queue } = req;
        log.info(`request to open queue "${queue}" on VPN "${vpn}" for ${req.returnTo ?? 'queue-browser'}`);

        if (active || asking) {
            log.warn(`a VPN switch is in progress; ignoring the request for VPN "${vpn}"`);
            return;
        }
        if (mode.isConnecting()) {
            log.warn(`a connect is in flight; ignoring the request for VPN "${vpn}"`);
            showToast('A connection attempt is in progress. Try again once it has finished.', 'warn');
            return;
        }

        if (!mode.isConnected()) {
            loadSelf();
            if (mode.showConnectView) {
                mode.showConnectView();
                return;
            }
            log.info(`not connected; connecting to VPN "${vpn}"`);
            connectTo(req);
            return;
        }

        const current = mode.currentVpn();
        if (current === vpn) {
            finish(req);
            return;
        }
        void switchFrom(current, req);
    }

    /** Ask, then (on Switch) navigate, close the session on `current` and connect to the target. */
    async function switchFrom(current: string, req: CheckConnectionRequest): Promise<void> {
        const { vpn } = req;
        asking = true;
        const yes = await confirmDialog(`Current VPN is "${current}". Switch to "${vpn}"?`, { confirmLabel: 'Switch' });
        asking = false;
        if (!yes) return;

        loadSelf();
        log.info(`switching from VPN "${current}" to VPN "${vpn}"`);
        active = {
            vpn,
            stop: waitFor('client:disconnected', () => {
                active!.stop();
                connectTo(req);
            }, SWITCH_DISCONNECT_TIMEOUT_MS,
            `the session on VPN "${current}" did not close within ${SWITCH_DISCONNECT_TIMEOUT_MS / 1000} s.`)
        };
        mode.disconnect();
    }

    return { request, connectFailed: (message: string) => fail(message, true) };
}
