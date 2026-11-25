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
import type { ManagedProfile as ServiceProfile } from '../../core/services/managed-service';
import type { ManagedUser } from '../../modules/user-management/service';
import type { GatewaySettings as ServiceSettings } from '../../modules/gateway-settings/service';
import type { TwoFactorMode } from './authenticator';
import type { CertInfo } from './tls';

export type { DialResponse } from '../../core/services/managed-service';
export type { UserList } from '../../modules/user-management/service';
export type { ManagedConnRecord } from '../../modules/connection-management/service';
export type { SettingsView } from '../../modules/gateway-settings/service';

/** What `GET /managed/me` carries beside the profile: the setting and whether this user has two-factor. */
export interface TwoFactorState { mode: TwoFactorMode; enrolled: boolean }

/** `GET /managed/me`, with the gateway's two-factor state spelled out. */
export type ManagedProfile = ServiceProfile & { twoFactor: TwoFactorState };

/**
 * The settings file with `login.twoFactor` (the fake validates it, so it is the narrow type), the
 * sign-in and connect limits the fake reads (`LoginLimitKeys`, `session.connectsPerMinute`), and
 * `tls` holding only `insecureSkipVerify` and `standardRoots`: the three TLS paths are environment variables, not keys.
 */
export type GatewaySettings = Omit<ServiceSettings, 'login' | 'session' | 'tls'> & {
    login: ServiceSettings['login'] & LoginLimitKeys & { twoFactor: TwoFactorMode };
    session: ServiceSettings['session'] & { connectsPerMinute: number };
    tls: Pick<ServiceSettings['tls'], 'insecureSkipVerify' | 'standardRoots'>;
};

/** The `login` keys that bound the sign-in throttle, the password rule and the two-factor step. */
interface LoginLimitKeys {
    perClient: boolean;
    clientMaxFailures: number;
    resetMinutes: number;
    passwordMinLength: number;
    twoFactorMinutes: number;
}

/** A user as `GET /managed/users` lists one (the gateway adds the flag, the two-factor state and the record's rev). */
export type ListedUser = ManagedUser & { mustChangePassword: boolean; twoFactor: boolean; rev: number };

/** A user's two-factor record (store.go `userTOTP`): the base32 secret and the SHA-256 hex of each unused recovery code. */
export interface UserTotp { secret: string; recovery: string[] }

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
    /** Absent: no two-factor. */
    totp?: UserTotp;
}

export interface VpnRec { name: string; username: string; password: string }

/**
 * A connections-file record (store.go `connRec`). A blank or absent scheme is
 * TLS (https for SEMP, wss for SMF); a save stores the TLS scheme as absent,
 * so a record names only the plain one (http, ws). The client part names a
 * hostname only for an appliance, whose messaging answers on a host of its
 * own: it may be the record's hostname, and the record is an appliance all
 * the same. Either part may name a URL path, the path the broker's own paths
 * sit under (validate.ts `validUrlPath`); absent is none.
 */
export interface ConnRec {
    broker: string;
    hostname: string;
    semp: { scheme?: string; port: string; urlPath?: string; username: string; password: string };
    client: { hostname?: string; scheme?: string; port: string; urlPath?: string; msgVpns: VpnRec[] };
}

/** A connection as `GET /managed/connections` lists it: no password, both schemes named, a client hostname only for an appliance, a URL path only where one is set. */
export interface ListedConn {
    rev: number;
    broker: string;
    hostname: string;
    semp: { scheme: string; port: string; urlPath?: string; user: string; pass: string };
    client: { hostname?: string; scheme: string; port: string; urlPath?: string; msgVpns: { name: string; user: string; pass: string }[] };
}

/** `GET /managed/client`: the address the gateway took the browser for, and how. */
export interface ClientSeen {
    address: string;
    peer: string;
    viaProxy: boolean;
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
    /** The standard root CAs the image carries, as `GET /managed/tls` describes them; absent, the image holds none. */
    standardRoots?: CertInfo[];
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
