/**
 * Managed API client — talks to the go-web-proxy's `/managed/*` endpoints.
 *
 * These are same-origin endpoints served by the proxy (the SPA is served by the
 * same proxy in managed mode), so plain `fetch` is used — NOT the SEMP fetch
 * helper, which is for broker SEMP calls. Auth is the resend-token scheme: the
 * client sends `{ username, token }` where `token` is the one-way `stamp()` of
 * the typed password (the proxy never decrypts; it string-matches).
 *
 * Lives in core (not a module) because both the connections module's Managed
 * panel and the standalone admin app authenticate through it.
 */
import type { QGlob } from '../types';

/** A single Message VPN the user may connect to on a broker. */
export interface ManagedVpn {
    name: string;
    /** Client (SMF) connection details. `pass` is packed (decrypted client-side). */
    client: { port: string; user: string; pass: string };
}

/** A broker connection the user is entitled to. */
export interface ManagedConnection {
    broker: string;
    hostname: string;
    /** SEMP (management) details. `pass` is packed (decrypted client-side). */
    semp: { port: string; user: string; pass: string };
    msgVpns: ManagedVpn[];
}

/** The full getConnections response: the user's profile + entitled connections. */
export interface ManagedProfile {
    admin: boolean;
    /** Per-deployment seed bytes, base64. Imported NON-extractable to unpack creds. */
    siteSeed: string;
    /** The user's raw permission rows (drive client-side queue filtering). */
    operate: QGlob[];
    readOnly: QGlob[];
    brokers: ManagedConnection[];
}

export interface ManagedService {
    /**
     * POST /managed/getConnections. Resolves to the profile on 200, or `null`
     * on auth failure (the proxy returns 400 for both unknown-user and bad
     * password — indistinguishable by design). Network/other errors reject.
     */
    getConnections(username: string, token: string): Promise<ManagedProfile | null>;
    /**
     * POST /managed/reload. Asks the proxy to re-read users.yaml +
     * connections.yaml from disk into its in-memory store (so out-of-band edits
     * take effect without a restart). Resolves `true` on 204; `false` on auth
     * failure (400) or a server-side reload error (500). Network errors reject.
     */
    reload(username: string, token: string): Promise<boolean>;
}

export function createManagedService(): ManagedService {
    async function getConnections(username: string, token: string): Promise<ManagedProfile | null> {
        const res = await fetch('/managed/getConnections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token }),
        });
        if (res.status === 200) {
            return (await res.json()) as ManagedProfile;
        }
        return null;
    }
    async function reload(username: string, token: string): Promise<boolean> {
        const res = await fetch('/managed/reload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token }),
        });
        return res.status === 204;
    }
    return { getConnections, reload };
}
