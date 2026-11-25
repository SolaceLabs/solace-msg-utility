/**
 * The SMF socket gate and its revocation (go-web-proxy/smf.go, sockets.go),
 * for the SDK emulator's sessions instead of WebSockets.
 *
 * A socket opens with the page's session (`401` without one, `403` while the
 * password must change), an entitlement to the VPN (`404` otherwise, as for an
 * unknown one), a connect within the user's window (`429` past it; dial shares
 * the window, throttle.ts), and the login the broker would check: the VPN's
 * client credential, which only `dial` hands out. It closes only on
 * revocation: its session dropped, its user's sessions dropped (a password
 * change, a changed administrator flag, a deleted user), or an edit after which
 * the user can no longer reach the VPN, or a restart of the gateway. There is
 * no timer, and an expired session leaves its socket open, as in the gateway.
 *
 * Not simulated: the `Origin` check and the cap on open sockets (20 per user,
 * 1000 in all).
 *
 * Mock-only.
 */
import type { SocketGate } from '../sdk/session';
import type { GatewaySessions } from './sessions';
import type { GatewayStore } from './store';
import type { ConnectWindow } from './throttle';

interface OpenSocket { sid: string; user: string; broker: string; vpn: string; close: () => void }

const refused = (status: string) =>
    ({ ok: false as const, reason: `Connection error: the gateway refused the SMF socket (${status})` });

export function createSockets(store: GatewayStore, sessions: GatewaySessions, cookie: () => string | null, connects: ConnectWindow) {
    const open = new Set<OpenSocket>();

    function closeWhere(pred: (s: OpenSocket) => boolean): void {
        // Collected first: closing runs the app's DOWN path, which may open another.
        const doomed = Array.from(open).filter(pred);
        doomed.forEach(s => open.delete(s));
        doomed.forEach(s => s.close());
    }

    sessions.onDrop(id => closeWhere(s => s.sid === id));
    sessions.onDropUser(user => closeWhere(s => s.user === user));

    const gate: SocketGate = (login, close) => {
        const sid = cookie();
        const s = sessions.get(sid);
        if (!s || !sid) return refused('401 unauthenticated');
        if (s.mustChange) return refused('403 password_change_required');
        const t = store.smfTarget(s.user, login.broker, login.vpn);
        if (!t) return refused('404 not_found');
        if (connects.take(s.user) > 0) return refused('429 rate_limited');
        if (login.vpnName !== login.vpn || login.user !== t.user || login.pass !== t.pass) {
            return { ok: false, reason: 'Login failure: 401 Unauthorized (the broker refused the client username or password)' };
        }
        const sock: OpenSocket = { sid, user: s.user, broker: login.broker, vpn: login.vpn, close };
        open.add(sock);
        return { ok: true, release: () => { open.delete(sock); } };
    };

    return {
        gate,
        /** After a user or connection edit: close what the user can no longer reach. */
        recheck(): void {
            closeWhere(s => !store.smfTarget(s.user, s.broker, s.vpn));
        },
        /** A restart of the gateway: every socket closes, an expired session's included. */
        closeAll(): void {
            closeWhere(() => true);
        },
        /** The open sockets, for the control panel. */
        list(): { user: string; broker: string; vpn: string }[] {
            return Array.from(open, s => ({ user: s.user, broker: s.broker, vpn: s.vpn }));
        },
    };
}

export type GatewaySockets = ReturnType<typeof createSockets>;
