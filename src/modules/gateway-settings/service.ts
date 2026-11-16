/**
 * Gateway-settings service — the gateway's config.yaml over
 * `GET`/`PUT /managed/settings` (go-web-proxy/settings.go), authenticated by
 * the session cookie (see `src/core/services/managed-api.ts`).
 */
import { managedRequest, type ManagedResult } from '../../core/services/managed-api';

/** config.yaml as the settings page edits it: the same keys, without the version. */
export interface GatewaySettings {
    hosted: boolean;
    connModes: string;
    defaultConn: string;
    tls: { insecureSkipVerify: boolean };
    logLevel: string;
    access: { allow: string[]; trustedProxies: string[] };
    session: { idleMinutes: number; absoluteMinutes: number; connectsPerMinute: number };
    login: {
        maxFailures: number; perClient: boolean; clientMaxFailures: number; resetMinutes: number;
        backoffSeconds: number; maxBackoffSeconds: number; unauthenticatedPerMinute: number;
        passwordMinLength: number; twoFactor: string; twoFactorMinutes: number;
    };
    modules: { offered: string[]; userDefault: string };
    /** `onFailure`: "continue" logs a lost audit record and carries on; "refuse" refuses changes while the audit log cannot be written. */
    audit: { stdout: boolean; access: boolean; onFailure: string };
}

/** The GET /managed/settings body. */
export interface SettingsView {
    settings: GatewaySettings;
    /** The file's version, opaque text; a save sends it back, and the gateway refuses it once it is out of date (`stale`). */
    rev: string;
    /** The file was edited on the host since the gateway loaded it; a save is refused. */
    changedOnDisk: boolean;
    /** The modules `modules.offered` may list. */
    catalog: string[];
}

/** The GET /managed/client body: how the gateway sees this browser. */
export interface ClientSeen {
    /** The address the gateway resolved; empty when it could not. */
    address: string;
    /** The TCP peer: the browser itself, or the proxy (or Docker) in front of it. */
    peer: string;
    /** The address came from a trusted proxy's X-Forwarded-For. */
    viaProxy: boolean;
}

export interface SettingsService {
    load(): Promise<ManagedResult<SettingsView>>;
    /** The caller's address as the gateway resolves it (go-web-proxy/managed.go clientSeen). */
    client(): Promise<ManagedResult<ClientSeen>>;
    /** PUT the whole file with the `rev` it was loaded at; the answer carries the file's new version. */
    save(settings: GatewaySettings, rev: string): Promise<ManagedResult<{ rev: string }>>;
    /** POST /managed/restart: the gateway answers 202, then restarts itself in place. */
    restart(): Promise<ManagedResult<{ restarting: boolean }>>;
    /** True when `/hosted` answers: the gateway is up. A refused or dropped connection, or any other answer, is false. */
    ping(): Promise<boolean>;
}

export function createSettingsService(): SettingsService {
    return {
        load: () => managedRequest<SettingsView>('GET', '/managed/settings'),
        client: () => managedRequest<ClientSeen>('GET', '/managed/client'),
        save: (settings, rev) => managedRequest<{ rev: string }>('PUT', '/managed/settings', { ...settings, rev }),
        restart: () => managedRequest<{ restarting: boolean }>('POST', '/managed/restart'),
        async ping() {
            try {
                return (await fetch('/hosted', { method: 'GET', cache: 'no-store' })).ok;
            } catch {
                return false;
            }
        },
    };
}
