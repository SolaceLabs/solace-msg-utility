import { describe, it, expect } from 'vitest';
import { createManagedService } from '../../../src/core/services/managed-service';

describe('core/services/managed-service', () => {
    it('POSTs username+token and returns the profile on 200', async () => {
        const profile = { admin: false, siteSeed: 'AAA=', operate: [], readOnly: [], brokers: [] };
        (globalThis.fetch as any).mockResolvedValue({ status: 200, json: async () => profile });

        const result = await createManagedService().getConnections('admin', 'tok-abc');

        expect(result).toEqual(profile);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/getConnections', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', token: 'tok-abc' }),
        }));
    });

    it('returns null on 400 (unknown user / bad password — indistinguishable)', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 400 });
        expect(await createManagedService().getConnections('x', 'y')).toBeNull();
    });

    it('reload POSTs username+token to /managed/reload and returns true on 204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 204 });
        const result = await createManagedService().reload('admin', 'tok-abc');
        expect(result).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/reload', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', token: 'tok-abc' }),
        }));
    });

    it('reload returns false on a non-204 (auth failure or server reload error)', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 400 });
        expect(await createManagedService().reload('x', 'y')).toBe(false);
    });
});
