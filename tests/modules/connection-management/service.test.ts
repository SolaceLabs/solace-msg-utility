import { describe, it, expect } from 'vitest';
import { createConnMgmtService, type ManagedConnRecord } from '../../../src/modules/connection-management/service';

const CONN: ManagedConnRecord = {
    broker: 'b1', hostname: 'host1',
    semp: { port: '1943', user: 'mon', pass: 'V1:s' },
    client: { port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: 'V1:c' }] },
};

const fetchMock = () => globalThis.fetch as any;

describe('connection-management/service', () => {
    it('listConnections GETs /managed/connections and unwraps the list', async () => {
        const connections = [{ broker: 'b1', hostname: 'h', semp: { port: '', user: '', pass: '' }, client: { port: '', msgVpns: [] } }];
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ connections }) });

        expect(await createConnMgmtService().listConnections()).toEqual({ ok: true, data: connections });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/connections', { method: 'GET', credentials: 'same-origin' });
    });

    it('listConnections passes a failure through', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'unauthenticated' }) });
        expect(await createConnMgmtService().listConnections()).toEqual(expect.objectContaining({ ok: false, code: 'unauthenticated' }));
    });

    it('saveConnection PUTs the record under its broker name, broker not repeated in the body', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 204 });
        expect(await createConnMgmtService().saveConnection(CONN)).toEqual({ ok: true, data: undefined });
        const { broker: _broker, ...body } = CONN;
        expect(fetchMock()).toHaveBeenCalledWith('/managed/connections/b1', expect.objectContaining({
            method: 'PUT', body: JSON.stringify(body),
        }));
    });

    it('deleteConnection DELETEs the escaped broker path', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 204 });
        expect(await createConnMgmtService().deleteConnection('b 1')).toEqual({ ok: true, data: undefined });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/connections/b%201', { method: 'DELETE', credentials: 'same-origin' });
    });
});
