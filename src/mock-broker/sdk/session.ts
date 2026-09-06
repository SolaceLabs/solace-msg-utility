/**
 * Session emulation.
 *
 * Deliberately a plain object literal with own, writable function properties.
 * The managed panel reassigns `session.createQueueBrowser` at runtime to wrap
 * it with the entitlement check — a class instance (non-configurable prototype
 * method) would make that patch a silent no-op and disable RBAC enforcement
 * with no error anywhere. Keep it an object literal.
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
import { FAULT, MOCK_HOST, scenario } from '../fixtures';

export interface MockSession {
    [key: string]: any;
}

export function createSession(props: any): MockSession {
    const emitter = createEmitter();
    const vpn: string = props?.vpnName ?? 'default';
    const host: string = String(props?.url ?? '');
    let up = false;

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
            up = false;
            setTimeout(() => emitter.emit(SessionEventCode.DISCONNECTED), 0);
        },

        dispose(): void {
            up = false;
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

            publish(dest.getName(), dest.getType(), msg);
            setTimeout(() => {
                emitter.emit(SessionEventCode.ACKNOWLEDGED_MESSAGE, { correlationKey: key });
            }, Math.max(1, Math.round(scenario.latencyMs / 6)));
        },

        // Own, writable property — see the file header.
        createQueueBrowser(browserProps: any) {
            return createQueueBrowser(vpn, browserProps);
        },
    };

    /** Panel hook: drop a live session so the app's DOWN path can be demoed. */
    session._mockDrop = () => {
        if (!up) return;
        up = false;
        emitter.emit(SessionEventCode.DISCONNECTED);
    };

    return session;
}
