/**
 * The fake gateway's shapes. What it sends the browser is typed with the
 * product's own interfaces, so a field the app expects and the fake forgets
 * fails `tsc`. What it stores mirrors the gateway's store records
 * (go-web-proxy/store.go), and its seed is the contract seed's format
 * (go-web-proxy/testdata/contract/seed.json), so the same file seeds both.
 *
 * Mock-only.
 */
import type { QGlob } from '../../core/types';
import type { ManagedUser } from '../../modules/user-management/service';
import type { GatewaySettings } from '../../modules/gateway-settings/service';

export type { DialResponse, ManagedProfile } from '../../core/services/managed-service';
export type { UserList } from '../../modules/user-management/service';
export type { ManagedConnRecord } from '../../modules/connection-management/service';
export type { GatewaySettings, SettingsView } from '../../modules/gateway-settings/service';

/** A user as `GET /managed/users` lists one (the gateway adds the flag). */
export type ListedUser = ManagedUser & { mustChangePassword: boolean };

/** A users-file record (store.go `userRec`), the password in plain text: it is fake. */
export interface UserRec {
    username: string;
    password: string;
    admin: boolean;
    mustChangePassword: boolean;
    operate: QGlob[];
    readOnly: QGlob[];
    /** null: the deployment default. */
    modules: string[] | null;
}

export interface VpnRec { name: string; username: string; password: string }

/** A connections-file record (store.go `connRec`). */
export interface ConnRec {
    broker: string;
    hostname: string;
    semp: { port: string; username: string; password: string };
    client: { port: string; msgVpns: VpnRec[] };
}

/** A user as the seed holds it: the users file's YAML names. */
export interface SeedUser {
    username: string;
    password: string;
    admin: boolean;
    mustChangePassword?: boolean;
    operate?: QGlob[];
    'read-only'?: QGlob[];
    modules?: string[] | null;
}

/** The fake's seed, in the contract seed's format. */
export interface GatewaySeed {
    'msg-utility-users': SeedUser[];
    'msg-utility-connections': ConnRec[];
    /** config.yaml as the gateway starts with it. */
    settings: GatewaySettings;
    /** The browser's address, as the gateway would see it (for `would_lock_out`). */
    client: string;
}

/** A request as the gateway's router sees it. */
export interface GatewayRequest {
    method: string;
    /** The escaped path, as `URL.pathname` gives it. */
    path: string;
    /** The raw query, without `?`. */
    query: string;
    body: string;
    /** The session cookie's value; null without one. */
    session: string | null;
}

/** An answer: a JSON body, a text body, or none. */
export interface GatewayResponse {
    status: number;
    json?: unknown;
    text?: string;
    contentType?: string;
    headers?: Record<string, string>;
}
