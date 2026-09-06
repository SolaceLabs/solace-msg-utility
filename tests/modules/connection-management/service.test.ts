import { describe, it, expect } from 'vitest';
import { createConnMgmtService, type ManagedConnRecord } from '../../../src/modules/connection-management/service';

const CONN: ManagedConnRecord = {
    broker: 'b1', hostname: 'host1',
    semp: { port: '1943', user: 'mon', pass: 'V1:s' },
    client: { port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: 'V1:c' }] },
};

describe('connection-management/service', () => {
    it('listConnections POSTs {username, token} and returns connections on 200', async () => {
        const connections = [{ broker: 'b1', hostname: 'h', semp: { port: '', user: '', pass: '' }, client: { port: '', msgVpns: [] } }];
        (globalThis.fetch as any).mockResolvedValue({ status: 200, json: async () => ({ connections }) });

        const result = await createConnMgmtService().listConnections('admin', 'tok');

        expect(result).toEqual(connections);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/listConnections', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', token: 'tok' }),
        }));
    });

    it('listConnections returns null on a non-200', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 400 });
        expect(await createConnMgmtService().listConnections('x', 'y')).toBeNull();
    });

    it('saveConnection POSTs the connection and returns true on 204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 204 });
        expect(await createConnMgmtService().saveConnection('admin', 'tok', CONN)).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/saveConnection', expect.objectContaining({
            body: JSON.stringify({ username: 'admin', token: 'tok', connection: CONN }),
        }));
    });

    it('saveConnection returns false on a non-204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 400 });
        expect(await createConnMgmtService().saveConnection('a', 'b', CONN)).toBe(false);
    });

    it('deleteConnection POSTs the target and returns true on 204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 204 });
        expect(await createConnMgmtService().deleteConnection('admin', 'tok', 'b1')).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/deleteConnection', expect.objectContaining({
            body: JSON.stringify({ username: 'admin', token: 'tok', target: 'b1' }),
        }));
    });

    it('deleteConnection returns false on a non-204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 404 });
        expect(await createConnMgmtService().deleteConnection('a', 'b', 'c')).toBe(false);
    });
});
