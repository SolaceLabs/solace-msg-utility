/**
 * Connection-domain types shared across the connections module (primary)
 * and any future module that needs broker connectivity (e.g. queue-copy's
 * secondary destination connection).
 *
 * These describe the persisted/in-memory *data shape* — they say nothing
 * about lifecycle, persistence, or how a particular module bridges connection
 * events to its own state. That's the consumer's job.
 */

/** Solace messaging client config. Ports are persisted as strings (raw form values). */
export interface SolaceConfig {
    protocol: string;
    port: string;
    urlPath: string;
    vpn: string;
    user: string;
    authMode: 'basic' | 'oauth';
    connectRetries: number;
    connectTimeout: number;
    reconnectRetries: number;
    reconnectWait: number;
    maxMessagesPerQueue: number;
    /**
     * User-editable identifier embedded into the SDK `clientName` session
     * property. The connections module autofills with a UUID at install time,
     * persists the user's chosen value via config, and at Connect time
     * composes the full clientName as `SolMsgUtil/YYYYMMDDHHMMSS/{clientNameId}`.
     */
    clientNameId: string;
}

/** SEMP REST management config. */
export interface SempConfig {
    protocol: string;
    port: string;
    urlPath: string;
    user: string;
}

/** Full broker connection config. Host is shared between Solace and SEMP. */
export interface ConnectionConfig {
    host: string;
    solace: SolaceConfig;
    semp: SempConfig;
}

/**
 * Live credentials. Never persisted (passwords are sensitive); held in memory
 * only for the duration of a connect attempt or session.
 */
export interface ConnectionCredentials {
    solacePass?: string;
    sempPass?: string;
}

/**
 * A scoped SEMP fetch context. Returned by the SEMP factory's onConnected hook
 * after credentials are validated, and consumed by the discovery service and
 * any other module that needs to make SEMP requests against a specific broker.
 *
 * `fetch` is bound to those creds — caller doesn't need to inject auth headers.
 * `baseUrl` is the validated SEMP base (e.g. `https://broker.example.com:943/SEMP/v2`).
 */
export interface SempContext {
    fetch: (url: string, opts?: RequestInit) => Promise<Response>;
    baseUrl: string;
}
