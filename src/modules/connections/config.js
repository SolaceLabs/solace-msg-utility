/**
 * @typedef {import('../../core/connections/types').ConnectionConfig} ConnectionConfig
 */

import { logger } from '../../core/logger';

/** @type {{
 *   load: () => ConnectionConfig | null,
 *   save: (cfg: ConnectionConfig) => boolean,
 * }} */
export const config = /** @type {any} */ ({});

(function () {
    const STORAGE_KEY = 'solace_utility_config';

    // Obfuscation — NOT encryption. Browser storage is inherently untrusted;
    // anyone with DevTools access can still recover the value (the XOR key
    // lives in this file). The goal is to prevent casual glance-reading of
    // hostnames / VPN names / SEMP URLs when a user happens to open
    // Application → Local Storage. See improvement-plan 3.9.
    //
    // Format: `OBF1:` prefix + base64(xor(utf8(json), OBF_KEY)). The prefix
    // lets us (a) reject anything not matching the current scheme and (b)
    // evolve the format later (OBF2, etc.) without colliding. Any stored
    // value that isn't OBF1 is treated as missing — no legacy plaintext
    // fallback, so a bad/corrupted/old value forces a clean reconfigure.
    const OBF_PREFIX = 'OBF1:';
    const OBF_KEY = 'SolaceMsgUtility_v1';

    function obfuscate(plain) {
        const enc = new TextEncoder();
        const bytes = enc.encode(plain);
        const keyBytes = enc.encode(OBF_KEY);
        const xored = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            xored[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
        }
        // btoa needs a Latin-1 string — bytes are 0-255 so this is safe.
        let binary = '';
        for (let i = 0; i < xored.length; i++) {
            binary += String.fromCharCode(xored[i]);
        }
        return OBF_PREFIX + btoa(binary);
    }

    function deobfuscate(value) {
        if (!value.startsWith(OBF_PREFIX)) return null;
        try {
            const binary = atob(value.slice(OBF_PREFIX.length));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const enc = new TextEncoder();
            const keyBytes = enc.encode(OBF_KEY);
            const plain = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
                plain[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            }
            // fatal:true rejects garbage (e.g. wrong key) instead of returning mojibake.
            return new TextDecoder('utf-8', { fatal: true }).decode(plain);
        } catch {
            return null;
        }
    }

    config.load = function () {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const plain = deobfuscate(raw);
            return plain ? JSON.parse(plain) : null;
        } catch (e) {
            logger.error('Failed to load settings', e);
            return null;
        }
    };

    config.save = function (cfg) {
        try {
            localStorage.setItem(STORAGE_KEY, obfuscate(JSON.stringify(cfg)));
            return true;
        } catch (e) {
            logger.error('Failed to save settings', e);
            return false;
        }
    };
})();
