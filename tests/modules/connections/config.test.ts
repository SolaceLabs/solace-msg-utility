import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config } from '../../../src/modules/connections/config.js';

describe('connections/config', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('save()', () => {
        it('saves config to localStorage under the obfuscated format (OBF1: prefix)', () => {
            const cfg = { host: 'broker.test', solace: { port: '8000' } };
            const result = config.save(cfg);
            expect(result).toBe(true);

            const stored = (localStorage.setItem as any).mock.calls.at(-1)[1];
            expect(stored.startsWith('OBF1:')).toBe(true);
            // Sanity: the obfuscated value must NOT contain recognisable plaintext
            // like the hostname — that's the whole point. If this fails, obfuscate()
            // isn't actually obfuscating.
            expect(stored).not.toContain('broker.test');
            expect(stored).not.toContain('"host"');
        });

        it('returns false on localStorage error', () => {
            (localStorage.setItem as any).mockImplementationOnce(() => {
                throw new Error('QuotaExceeded');
            });
            expect(config.save({ test: true })).toBe(false);
        });
    });

    describe('load()', () => {
        it('round-trips a saved config through obfuscation', () => {
            const cfg = {
                host: 'broker.test',
                solace: { port: '8000', vpn: 'default', user: 'admin', connectRetries: 3 },
                semp: { protocol: 'https', port: '943', user: 'admin' }
            };
            // Go through real save to produce an OBF1 blob, then feed it back.
            config.save(cfg);
            const stored = (localStorage.setItem as any).mock.calls.at(-1)[1];
            (localStorage.getItem as any).mockReturnValue(stored);

            expect(config.load()).toEqual(cfg);
        });

        it('round-trips multi-byte (non-ASCII) values correctly', () => {
            // UTF-8 handling matters — XOR on raw char codes would mangle ü/ó.
            const cfg = { host: 'brökër.tëst', semp: { user: 'Müller' } };
            config.save(cfg);
            const stored = (localStorage.setItem as any).mock.calls.at(-1)[1];
            (localStorage.getItem as any).mockReturnValue(stored);

            expect(config.load()).toEqual(cfg);
        });

        it('returns null when no config saved', () => {
            (localStorage.getItem as any).mockReturnValue(null);
            expect(config.load()).toBeNull();
        });

        it('returns null when stored value is NOT in OBF1 format (legacy plaintext is rejected)', () => {
            // Legacy plaintext JSON from older versions is no longer accepted —
            // the user has to reconfigure. Matches the "no back-compat" decision.
            (localStorage.getItem as any).mockReturnValue('{"host":"old.plaintext"}');
            expect(config.load()).toBeNull();
        });

        it('returns null on corrupted OBF1 blob (bad base64)', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            (localStorage.getItem as any).mockReturnValue('OBF1:@@@not-base64@@@');
            expect(config.load()).toBeNull();
            // deobfuscate() returns null on failure without logging; load() only
            // logs when something throws BEFORE the deobf null-check. A bad-base64
            // blob is handled cleanly and silently.
            consoleSpy.mockRestore();
        });

        it('returns null on OBF1 blob decoded with a wrong key (garbage UTF-8)', () => {
            // A blob that decodes via atob but whose XOR result isn't valid UTF-8
            // should be rejected (TextDecoder fatal mode) rather than returning mojibake.
            // Craft a base64 blob of random bytes that won't produce valid UTF-8 after
            // XOR with the real key.
            (localStorage.getItem as any).mockReturnValue('OBF1:' + btoa('\xff\xff\xff\xff\xff\xff\xff\xff'));
            expect(config.load()).toBeNull();
        });

        it('returns null and logs when localStorage.getItem throws', () => {
            // localStorage can throw SecurityError in browser privacy mode,
            // sandboxed iframes, or file:// origins where storage is denied.
            // The outer catch at config.js:64-67 turns that into "no saved config"
            // so install() doesn't break — covered here.
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const err = new DOMException('storage denied', 'SecurityError');
            (localStorage.getItem as any).mockImplementationOnce(() => { throw err; });

            expect(config.load()).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith('Failed to load settings', err);
            consoleSpy.mockRestore();
        });
    });
});
