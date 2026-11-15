import { describe, it, expect } from 'vitest';
import { createConnMgmtService, type ManagedConnRecord } from '../../../src/modules/connection-management/service';

const CONN: ManagedConnRecord = {
    rev: 3, broker: 'b1', hostname: 'host1',
    semp: { port: '1943', user: 'mon', pass: 'V1:s' },
    client: { port: '1443', msgVpns: [{ name: 'v1', user: 'u1', pass: 'V1:c' }] },
};

const fetchMock = () => globalThis.fetch as any;

describe('connection-management/service', () => {
    it('listConnections GETs /managed/connections and unwraps the list', async () => {
        const connections = [{ rev: 1, broker: 'b1', hostname: 'h', semp: { port: '', user: '', pass: '' }, client: { port: '', msgVpns: [] } }];
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ connections }) });

        expect(await createConnMgmtService().listConnections()).toEqual({ ok: true, data: connections });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/connections', { method: 'GET', credentials: 'same-origin' });
    });

    it('listConnections passes a failure through', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'unauthenticated' }) });
        expect(await createConnMgmtService().listConnections()).toEqual(expect.objectContaining({ ok: false, code: 'unauthenticated' }));
    });

    it('saveConnection PUTs the record under its broker name with its rev, broker not repeated in the body; answers the new rev', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rev: 4 }) });
        expect(await createConnMgmtService().saveConnection(CONN)).toEqual({ ok: true, data: { rev: 4 } });
        const { broker: _broker, ...body } = CONN;
        expect(fetchMock()).toHaveBeenCalledWith('/managed/connections/b1', expect.objectContaining({
            method: 'PUT', body: JSON.stringify(body),
        }));
        expect(JSON.parse(fetchMock().mock.calls[0][1].body).rev).toBe(3);
    });

    it('a stale save carries the current rev', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'stale', rev: 9 }) });
        expect(await createConnMgmtService().saveConnection(CONN)).toEqual(expect.objectContaining({ ok: false, code: 'stale', rev: 9 }));
    });

    it('deleteConnection DELETEs the escaped broker path with the rev in the query', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 204 });
        expect(await createConnMgmtService().deleteConnection('b 1', 5)).toEqual({ ok: true, data: undefined });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/connections/b%201?rev=5', { method: 'DELETE', credentials: 'same-origin' });
    });
});
