/**
 * Session emulation.
 *
 * Deliberately a plain object literal with own, writable function properties.
 * Like the real SDK's. The managed panel (managed.html and the managed demo)
 * reassigns `session.createQueueBrowser` at runtime to wrap it with the
 * entitlement check — a class instance (non-configurable prototype method)
 * would make that patch a silent no-op and disable RBAC enforcement with no
 * error anywhere. Keep it an object literal.
 *
 * A URL on the gateway's SMF socket path (`/managed/smf/{broker}/{vpn}`) goes
 * through the socket gate the managed demo's boot sets (`setSocketGate`): the
 * fake gateway checks the session, the entitlement and the login, and closes
 * the session on revocation. demo.html sets none, so such a URL is just an
 * unknown host there.
 *
 * Publish acknowledgement round-trips through `ACKNOWLEDGED_MESSAGE` on the
 * session with the correlation key nested exactly where the publisher looks for
 * it (`event.correlationKey.Solace_Msg_Utility_Seq_Num`). Any other shape leaves
 * every publish hanging until the 30-second timeout.
 *
 * Mock-only.
 */
import { createEmitter } from '../emitter';
import { SessionEventCode } from './enums';
import { sessionError } from './errors';
import { createQueueBrowser } from './browser';
import { publish } from '../broker/store';
import { DIRECT_BROKER, FAULT, MOCK_HOST, scenario } from '../fixtures';

export interface MockSession {
    [key: string]: any;
}

/** What the SDK logs in with on a gateway socket. */
export interface SocketLogin { broker: string; vpn: string; vpnName: string; user: string; pass: string }

/**
 * The gateway's socket check: admitted (with a release for when the session
 * ends) or refused with the reason the SDK reports. `close` drops the session
 * when the gateway revokes the socket.
 */
export type SocketGate = (login: SocketLogin, close: () => void) =>
    { ok: true; release: () => void } | { ok: false; reason: string };

let socketGate: SocketGate | null = null;

/** Set by the managed demo's boot; null (demo.html) leaves every URL a broker host. */
export function setSocketGate(gate: SocketGate | null): void {
    socketGate = gate;
}

const SMF_PATH = /\/managed\/smf\/([^/?#]+)\/([^/?#]+)/;

export function createSession(props: any): MockSession {
    const emitter = createEmitter();
    const vpn: string = props?.vpnName ?? 'default';
    const host: string = String(props?.url ?? '');
    let up = false;
    /** The broker publishes reach: Direct, or the gateway socket's. */
    let broker = DIRECT_BROKER;
    let release: (() => void) | null = null;

    function end(): void {
        up = false;
        release?.();
        release = null;
    }

    /** Through the gateway's socket gate; false when the URL is not a gateway socket. */
    function connectThroughGateway(): boolean {
        const m = socketGate ? SMF_PATH.exec(host) : null;
        if (!m || !socketGate) return false;
        let target: [string, string];
        try {
            target = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
        } catch {
            fail(`Connection error: Unable to connect to ${host}`);
            return true;
        }
        const r = socketGate(
            { broker: target[0], vpn: target[1], vpnName: vpn, user: String(props?.userName ?? ''), pass: String(props?.password ?? '') },
            () => session._mockDrop(),
        );
        if (!r.ok) {
            fail(r.reason);
            return true;
        }
        broker = target[0];
        release = r.release;
        up = true;
        emitter.emit(SessionEventCode.UP_NOTICE);
        return true;
    }

    function fail(reason: string): void {
        // Session events carry the reason on `infoStr`, not `message`.
        emitter.emit(SessionEventCode.CONNECT_FAILED_ERROR, sessionError(reason));
    }

    const session: MockSession = {
        on: emitter.on,
        removeListener: emitter.removeListener,

        connect(): void {
            setTimeout(() => {
                if (scenario.fault === FAULT.CONNECT_FAILS) {
                    // One-shot: arming it should not wedge the demo permanently.
                    scenario.fault = FAULT.NONE;
                    fail('Connection error: mock broker refused the connection');
                    return;
                }
                if (connectThroughGateway()) return;
                if (host.includes(MOCK_HOST.UNTRUSTED)) {
                    fail('Certificate Not Trusted (mock broker)');
                    return;
                }
                if (!host.includes(MOCK_HOST.OK)) {
                    fail(`Connection error: Unable to connect to ${host}`);
                    return;
                }
                up = true;
                emitter.emit(SessionEventCode.UP_NOTICE);
            }, scenario.latencyMs);
        },

        disconnect(): void {
            if (!up) return;
            end();
            setTimeout(() => emitter.emit(SessionEventCode.DISCONNECTED), 0);
        },

        dispose(): void {
            end();
        },

        getSessionProperties: () => props,

        /**
         * Enqueue into the broker, then acknowledge asynchronously through the
         * session event the publisher subscribed to at construction.
         */
        send(msg: any): void {
            const key = msg?._fields?.correlationKey;
            const dest = msg?._fields?.destination;
            if (!dest) throw new Error('Message has no destination (mock broker)');

            publish(dest.getName(), dest.getType(), msg, broker);
            setTimeout(() => {
                emitter.emit(SessionEventCode.ACKNOWLEDGED_MESSAGE, { correlationKey: key });
            }, Math.max(1, Math.round(scenario.latencyMs / 6)));
        },

        // Own, writable property — see the file header.
        createQueueBrowser(browserProps: any) {
            return createQueueBrowser(vpn, browserProps);
        },
    };

    /** Panel hook, and the gateway's revocation: drop a live session so the app's DOWN path runs. */
    session._mockDrop = () => {
        if (!up) return;
        end();
        emitter.emit(SessionEventCode.DISCONNECTED);
    };

    return session;
}
