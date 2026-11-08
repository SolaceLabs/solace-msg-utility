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
    appDir: string;
    tls: { certFile: string; keyFile: string; trustDir: string; insecureSkipVerify: boolean };
    logLevel: string;
    usersFile: string;
    connectionsFile: string;
    access: { allow: string[]; trustedProxies: string[] };
    session: { idleMinutes: number; absoluteMinutes: number };
    login: { maxFailures: number; backoffSeconds: number; maxBackoffSeconds: number; unauthenticatedPerMinute: number };
    modules: { offered: string[]; userDefault: string };
}

/** The GET /managed/settings body. */
export interface SettingsView {
    settings: GatewaySettings;
    /** Keys that apply when the gateway restarts; every other key applies at once. */
    restartOnly: string[];
    /** Path keys a save may not change: only a hand edit of config.yaml on the host does. */
    hostOnly: string[];
    /** Restart-only keys saved with a value the running gateway does not have yet. */
    pendingRestart: string[];
    /** The file was edited on the host since the gateway loaded it; a save is refused. */
    changedOnDisk: boolean;
    /** The modules `modules.offered` may list. */
    catalog: string[];
}

export interface SettingsService {
    load(): Promise<ManagedResult<SettingsView>>;
    /** PUT the whole file. `restartRequired` lists the saved keys that wait for a restart. */
    save(settings: GatewaySettings): Promise<ManagedResult<{ restartRequired: string[] }>>;
}

export function createSettingsService(): SettingsService {
    return {
        load: () => managedRequest<SettingsView>('GET', '/managed/settings'),
        save: (settings) => managedRequest('PUT', '/managed/settings', settings),
    };
}
