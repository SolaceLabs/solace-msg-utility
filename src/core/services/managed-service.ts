/**
 * Managed session client — the signed-in user's profile and sign-out, over the
 * gateway's session cookie (see `managed-api.ts`).
 *
 * Lives in core (not a module) because both the connections module's Managed
 * panel and the standalone admin app read the session through it.
 */
import type { QGlob } from '../types';
import { managedRequest, type ManagedResult } from './managed-api';

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

/** The /managed/me response: the signed-in user's profile + entitled connections. */
export interface ManagedProfile {
    username: string;
    admin: boolean;
    /** Per-deployment seed bytes, base64. Imported NON-extractable to unpack creds. */
    siteSeed: string;
    /** The user's raw permission rows (drive client-side queue filtering). */
    operate: QGlob[];
    readOnly: QGlob[];
    brokers: ManagedConnection[];
    /** App modules this user may open; drives module control (`rbac.ts`). */
    modules: string[];
}

export interface ManagedService {
    /**
     * GET /managed/me. The profile of the session's user, or the gateway's
     * code: `unauthenticated` (no session), `password_change_required`.
     */
    me(): Promise<ManagedResult<ManagedProfile>>;
    /** POST /managed/logout. Ends the gateway session; callers ignore the outcome. */
    logout(): Promise<ManagedResult<void>>;
}

export function createManagedService(): ManagedService {
    return {
        me: () => managedRequest<ManagedProfile>('GET', '/managed/me'),
        logout: () => managedRequest('POST', '/managed/logout'),
    };
}
