/**
 * The `solace.*` enum surface.
 *
 * Two constraints shape this file:
 *
 * 1. `solace-client.ts` does `Object.entries(solace.SessionEventCode)` to attach
 *    a debug listener to every code the SDK ships. So these must be plain,
 *    enumerable objects — not Proxies, not class statics — and `SessionEventCode`
 *    carries the full set rather than only the handful the app compares against,
 *    otherwise the emulation is knowingly partial.
 * 2. The numeric values matter where the app compares numbers rather than
 *    identity: `service-events.ts` maps delivery mode `0/1/2` to DIRECT /
 *    PERSISTENT / NON_PERSISTENT, and reads `MessageType` / `SDTFieldType` /
 *    `DestinationType` the same way. These match the real SDK.
 *
 * Mock-only.
 */

export const SolclientFactoryProfiles = { version10: 'version10' } as const;

export const LogLevel = {
    FATAL: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, TRACE: 5,
} as const;

export const AuthenticationScheme = {
    BASIC: 'AUTHENTICATION_SCHEME_BASIC',
    OAUTH2: 'AUTHENTICATION_SCHEME_OAUTH2',
    CLIENT_CERTIFICATE: 'AUTHENTICATION_SCHEME_CLIENT_CERTIFICATE',
} as const;

export const MessagePublisherAcknowledgeMode = {
    PER_MESSAGE: 'PER_MESSAGE',
    WINDOWED: 'WINDOWED',
} as const;

/**
 * The full session event set. The six the app handles by name are marked; the
 * rest exist so the debug-listener loop attaches the same breadth it would
 * against the real SDK.
 */
export const SessionEventCode = {
    UP_NOTICE: 'UP_NOTICE',                             // handled
    DOWN_ERROR: 'DOWN_ERROR',
    CONNECT_FAILED_ERROR: 'CONNECT_FAILED_ERROR',       // handled
    REJECTED_MESSAGE_ERROR: 'REJECTED_MESSAGE_ERROR',   // handled (publisher)
    SUBSCRIPTION_ERROR: 'SUBSCRIPTION_ERROR',
    SUBSCRIPTION_OK: 'SUBSCRIPTION_OK',
    VIRTUALROUTER_NAME_CHANGED: 'VIRTUALROUTER_NAME_CHANGED',
    MESSAGE: 'MESSAGE',                                 // handled (no-op)
    ACKNOWLEDGED_MESSAGE: 'ACKNOWLEDGED_MESSAGE',       // handled (publisher)
    DISCONNECTED: 'DISCONNECTED',                       // handled
    CAN_ACCEPT_DATA: 'CAN_ACCEPT_DATA',
    RECONNECTING_NOTICE: 'RECONNECTING_NOTICE',
    RECONNECTED_NOTICE: 'RECONNECTED_NOTICE',
    PROVISION_OK: 'PROVISION_OK',
    PROVISION_ERROR: 'PROVISION_ERROR',
    REPUBLISHING_UNACKED_MESSAGES: 'REPUBLISHING_UNACKED_MESSAGES',
    UNSUBSCRIBE_TE_TOPIC_OK: 'UNSUBSCRIBE_TE_TOPIC_OK',
    UNSUBSCRIBE_TE_TOPIC_ERROR: 'UNSUBSCRIBE_TE_TOPIC_ERROR',
    GUARANTEED_MESSAGE_PUBLISHER_DOWN: 'GUARANTEED_MESSAGE_PUBLISHER_DOWN',
} as const;

export const QueueBrowserEventName = {
    UP: 'UP',
    DOWN: 'DOWN',
    DOWN_ERROR: 'DOWN_ERROR',
    CONNECT_FAILED_ERROR: 'CONNECT_FAILED_ERROR',
    GM_DISABLED: 'GM_DISABLED',
    MESSAGE: 'MESSAGE',
    DISPOSED: 'DISPOSED',
} as const;

export const QueueType = { QUEUE: 'QUEUE', TOPIC_ENDPOINT: 'TOPIC_ENDPOINT' } as const;

export const MessageDeliveryModeType = { DIRECT: 0, PERSISTENT: 1, NON_PERSISTENT: 2 } as const;

export const MessageType = { TEXT: 0, BINARY: 1, MAP: 2, STREAM: 3 } as const;

export const SDTFieldType = {
    STRING: 0, MAP: 1, STREAM: 2, BOOL: 3, INT8: 4, INT16: 5, INT32: 6, INT64: 7,
    UINT8: 8, UINT16: 9, UINT32: 10, UINT64: 11, FLOATTYPE: 12, DOUBLETYPE: 13,
    BYTEARRAY: 14, DESTINATION: 15, NULLTYPE: 16, UNKNOWN: 17,
} as const;

export const DestinationType = { TOPIC: 0, QUEUE: 1, TEMPORARY_QUEUE: 2 } as const;

/** Version the shell's >= 10.18.3 gate reads; comfortably above the floor. */
export const Version = { version: '10.99.0-mock', build: 'mock', date: 'demo' } as const;
