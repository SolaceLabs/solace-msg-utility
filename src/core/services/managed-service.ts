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
}

/**
 * A broker the user is entitled to: names only. The gateway keeps the address
 * and every credential; the SEMP relay and dial use them on the user's behalf.
 */
export interface ManagedConnection {
    broker: string;
    msgVpns: ManagedVpn[];
}

/** The /managed/me response: the signed-in user's profile + entitled connections. */
export interface ManagedProfile {
    username: string;
    admin: boolean;
    /** The user's raw permission rows (drive client-side queue filtering). */
    operate: QGlob[];
    readOnly: QGlob[];
    brokers: ManagedConnection[];
    /** App modules this user may open; drives module control (`rbac.ts`). */
    modules: string[];
}

/**
 * The POST /managed/dial answer: the VPN's client username and password, and
 * the gateway path of its SMF socket. The one broker credential the browser
 * ever receives, used for the SDK login at once and never stored.
 */
export interface DialResponse {
    smfPath: string;
    vpn: string;
    user: string;
    pass: string;
}

export interface ManagedService {
    /**
     * GET /managed/me. The profile of the session's user, or the gateway's
     * code: `unauthenticated` (no session), `password_change_required`.
     */
    me(): Promise<ManagedResult<ManagedProfile>>;
    /** POST /managed/logout. Ends the gateway session; callers ignore the outcome. */
    logout(): Promise<ManagedResult<void>>;
    /** POST /managed/dial: `not_found` alike for an unknown and a not-entitled VPN. */
    dial(broker: string, vpn: string): Promise<ManagedResult<DialResponse>>;
    /** The SEMP relay base for a broker: every SEMP path is appended to it. */
    relayBase(broker: string): string;
}

export function createManagedService(): ManagedService {
    return {
        me: () => managedRequest<ManagedProfile>('GET', '/managed/me'),
        logout: () => managedRequest('POST', '/managed/logout'),
        dial: (broker, vpn) => managedRequest<DialResponse>('POST', '/managed/dial', { broker, vpn }),
        relayBase: broker => `/managed/relay/${encodeURIComponent(broker)}`,
    };
}
