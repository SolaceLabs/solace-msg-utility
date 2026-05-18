import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, validateConfig } from '../../../src/core/connections/defaults';
import type { ConnectionConfig } from '../../../src/core/connections/types';

/**
 * DEFAULT_CONFIG is the canonical fallback shape for a new ConnectionConfig.
 * Any consumer (queue-copy's destination form, future "saved profiles", etc.)
 * relies on it to be (a) parseable by validateConfig once required fields are
 * filled in, and (b) consistent with what the connections module's HTML form
 * shows on first launch.
 */
describe('core/connections/defaults — DEFAULT_CONFIG', () => {
    it('matches the connections module HTML defaults — same first-launch UX', () => {
        // These values are the ones rendered by src/modules/connections/index.html.
        // If the HTML changes, this test must be updated to match — the contract
        // is "DEFAULT_CONFIG === what the user sees on first launch."
        expect(DEFAULT_CONFIG.host).toBe('localhost');
        expect(DEFAULT_CONFIG.solace.protocol).toBe('wss');
        expect(DEFAULT_CONFIG.solace.authMode).toBe('basic');
        expect(DEFAULT_CONFIG.solace.connectRetries).toBe(0);
        expect(DEFAULT_CONFIG.solace.connectTimeout).toBe(3000);
        expect(DEFAULT_CONFIG.solace.reconnectRetries).toBe(1);
        expect(DEFAULT_CONFIG.solace.reconnectWait).toBe(3000);
        expect(DEFAULT_CONFIG.solace.maxMessagesPerQueue).toBe(100);
        expect(DEFAULT_CONFIG.semp.protocol).toBe('https');
    });

    it('is incomplete on its own — required fields are blank by design', () => {
        // The defaults intentionally leave port/vpn/user blank so the user
        // is forced to fill them in. validateConfig should reject this state.
        const errors = validateConfig(DEFAULT_CONFIG);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors).toContain('Solace port: must be an integer 1–65535.');
        expect(errors).toContain('Solace VPN: required.');
        expect(errors).toContain('Solace username: required.');
        expect(errors).toContain('SEMP port: must be an integer 1–65535.');
        expect(errors).toContain('SEMP username: required.');
    });
});

describe('core/connections/defaults — validateConfig', () => {
    /** Minimal valid config — every required field filled in with a sensible value. */
    function validCfg(): ConnectionConfig {
        return {
            host: 'broker.example.com',
            solace: {
                protocol: 'wss',
                port: '8008',
                urlPath: '',
                vpn: 'default',
                user: 'admin',
                authMode: 'basic',
                connectRetries: 0,
                connectTimeout: 3000,
                reconnectRetries: 1,
                reconnectWait: 3000,
                maxMessagesPerQueue: 100,
                clientNameId: 'test-client-id',
            },
            semp: {
                protocol: 'https',
                port: '8080',
                urlPath: '',
                user: 'admin',
            },
        };
    }

    it('returns no errors for a valid config', () => {
        expect(validateConfig(validCfg())).toEqual([]);
    });

    it('flags an invalid host', () => {
        const cfg = validCfg();
        cfg.host = '!!!not a host!!!';
        expect(validateConfig(cfg)).toContain('Broker host: invalid hostname or IP address.');
    });

    it('accepts an IPv4 host', () => {
        const cfg = validCfg();
        cfg.host = '192.168.1.1';
        expect(validateConfig(cfg)).toEqual([]);
    });

    it('flags non-numeric or out-of-range ports', () => {
        const cfg = validCfg();
        cfg.solace.port = 'abc';
        cfg.semp.port = '99999';
        const errors = validateConfig(cfg);
        expect(errors).toContain('Solace port: must be an integer 1–65535.');
        expect(errors).toContain('SEMP port: must be an integer 1–65535.');
    });

    it('flags missing VPN / users (whitespace-only is empty)', () => {
        const cfg = validCfg();
        cfg.solace.vpn = '   ';
        cfg.solace.user = '';
        cfg.semp.user = '\t\n';
        const errors = validateConfig(cfg);
        expect(errors).toContain('Solace VPN: required.');
        expect(errors).toContain('Solace username: required.');
        expect(errors).toContain('SEMP username: required.');
    });

    it('flags out-of-range advanced settings', () => {
        const cfg = validCfg();
        cfg.solace.connectRetries = -5;
        cfg.solace.connectTimeout = 50;
        cfg.solace.reconnectRetries = -10;
        cfg.solace.reconnectWait = 10;
        cfg.solace.maxMessagesPerQueue = 999999;
        const errors = validateConfig(cfg);
        expect(errors).toContain('Solace connectRetries: must be ≥ 0.');
        expect(errors).toContain('Solace connectTimeout: must be ≥ 100 ms.');
        expect(errors).toContain('Solace reconnectRetries: must be ≥ -1 (-1 means infinite).');
        expect(errors).toContain('Solace reconnectWait: must be ≥ 100 ms.');
        expect(errors).toContain('Solace maxMessagesPerQueue: must be 1–10000.');
    });

    it('accepts -1 reconnectRetries (the documented "infinite" sentinel)', () => {
        const cfg = validCfg();
        cfg.solace.reconnectRetries = -1;
        expect(validateConfig(cfg)).toEqual([]);
    });

    it('accepts maxMessagesPerQueue of 1 and 10000 (boundary)', () => {
        const cfg = validCfg();
        cfg.solace.maxMessagesPerQueue = 1;
        expect(validateConfig(cfg)).toEqual([]);
        cfg.solace.maxMessagesPerQueue = 10000;
        expect(validateConfig(cfg)).toEqual([]);
    });

    it('returns multiple errors when multiple fields are invalid', () => {
        const cfg = validCfg();
        cfg.host = '';
        cfg.solace.port = '';
        cfg.solace.vpn = '';
        const errors = validateConfig(cfg);
        expect(errors.length).toBeGreaterThanOrEqual(3);
    });
});
