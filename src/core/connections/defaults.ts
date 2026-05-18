/**
 * Default ConnectionConfig values + a data-level validator.
 *
 * The defaults match the initial values rendered by the connections module's
 * form (src/modules/connections/index.html) so a fresh ConnectionConfig is
 * indistinguishable from "what the user would see on first launch."
 *
 * Validation here is data-shape validation — checks the persisted/in-memory
 * shape and returns error messages for required-field problems. It does NOT
 * paint DOM error states; that remains the connections module's UI concern
 * (see ui.js's `showError` and `validateSolace`/`validateSemp` helpers).
 */

import { isValidHost, isValidPort } from '../utils';
import type { ConnectionConfig } from './types';

export const DEFAULT_CONFIG: ConnectionConfig = {
    host: 'localhost',
    solace: {
        protocol: 'wss',
        port: '',
        urlPath: '',
        vpn: '',
        user: '',
        authMode: 'basic',
        connectRetries: 0,
        connectTimeout: 3000,
        reconnectRetries: 1,
        reconnectWait: 3000,
        maxMessagesPerQueue: 100,
        // Empty by default — the connections module autofills with a UUID at
        // install time when the form input is blank. validateConfig does not
        // gate on this field; that's the form-level concern.
        clientNameId: '',
    },
    semp: {
        protocol: 'https',
        port: '',
        urlPath: '',
        user: '',
    },
};

/**
 * Validate a ConnectionConfig at the data level. Returns an array of
 * human-readable error messages — empty array means valid.
 *
 * Required fields (matching today's DOM-level validators in
 * src/modules/connections/module.ts validateSolace/validateSemp):
 * - host (valid hostname or IPv4)
 * - solace.port (valid port number string)
 * - solace.vpn (non-empty after trim)
 * - solace.user (non-empty after trim)
 * - semp.port (valid port number string)
 * - semp.user (non-empty after trim)
 *
 * Optional sanity checks on advanced settings (numeric ranges) — these are
 * looser than the HTML `min` attributes because the persisted config may
 * carry values from older versions; we only flag clearly-broken values.
 *
 * Passwords are NOT checked here — they're not part of ConnectionConfig
 * (see ConnectionCredentials in types.ts).
 */
export function validateConfig(cfg: ConnectionConfig): string[] {
    const errors: string[] = [];

    if (!isValidHost(cfg.host)) {
        errors.push('Broker host: invalid hostname or IP address.');
    }

    // Solace
    if (!isValidPort(cfg.solace.port)) {
        errors.push('Solace port: must be an integer 1–65535.');
    }
    if (!cfg.solace.vpn.trim()) {
        errors.push('Solace VPN: required.');
    }
    if (!cfg.solace.user.trim()) {
        errors.push('Solace username: required.');
    }
    if (cfg.solace.connectRetries < 0) {
        errors.push('Solace connectRetries: must be ≥ 0.');
    }
    if (cfg.solace.connectTimeout < 100) {
        errors.push('Solace connectTimeout: must be ≥ 100 ms.');
    }
    if (cfg.solace.reconnectRetries < -1) {
        errors.push('Solace reconnectRetries: must be ≥ -1 (-1 means infinite).');
    }
    if (cfg.solace.reconnectWait < 100) {
        errors.push('Solace reconnectWait: must be ≥ 100 ms.');
    }
    if (cfg.solace.maxMessagesPerQueue < 1 || cfg.solace.maxMessagesPerQueue > 10000) {
        errors.push('Solace maxMessagesPerQueue: must be 1–10000.');
    }

    // SEMP
    if (!isValidPort(cfg.semp.port)) {
        errors.push('SEMP port: must be an integer 1–65535.');
    }
    if (!cfg.semp.user.trim()) {
        errors.push('SEMP username: required.');
    }

    return errors;
}
