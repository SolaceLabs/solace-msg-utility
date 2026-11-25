// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createTlsService } from '../../../src/modules/tls-certificates/service';

const fetchMock = () => globalThis.fetch as any;
const answer = (status: number, json?: unknown) =>
    fetchMock().mockResolvedValue({ ok: status < 300, status, json: async () => json });
const sent = () => fetchMock().mock.calls[0] as [string, RequestInit];

const CERT = {
    subject: 'CN=gw.example.com', issuer: 'CN=Example CA', names: ['gw.example.com'],
    notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z',
    sha256: 'AB:CD', selfSigned: false, expired: false,
};

describe('tls-certificates/service', () => {
    it('view GETs /managed/tls', async () => {
        const view = { certificate: CERT, certificateWritable: true, trustWritable: false, trust: [] };
        answer(200, view);
        expect(await createTlsService().view()).toEqual({ ok: true, data: view });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/tls', { method: 'GET', credentials: 'same-origin' });
    });

    it('check POSTs the pair to the check route and answers the leaf', async () => {
        answer(200, { certificate: CERT });
        const body = { certificate: 'CERT-PEM', key: 'KEY-PEM' };
        expect(await createTlsService().check(body)).toEqual({ ok: true, data: { certificate: CERT } });
        expect(sent()).toEqual(['/managed/tls/certificate/check', expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })]);
    });

    it('replace PUTs the pair to /managed/tls/certificate', async () => {
        answer(200, { certificate: CERT });
        const body = { certificate: 'CERT-PEM', key: 'KEY-PEM' };
        expect(await createTlsService().replace(body)).toEqual({ ok: true, data: { certificate: CERT } });
        expect(sent()).toEqual(['/managed/tls/certificate', expect.objectContaining({ method: 'PUT', body: JSON.stringify(body) })]);
    });

    it('addTrust POSTs the PEM and the optional name, and answers the whole view', async () => {
        const view = { certificate: CERT, certificateWritable: true, trustWritable: true, trust: [{ name: 'ca.crt', certificates: [CERT], problem: '' }] };
        answer(200, view);
        const body = { name: 'ca.crt', certificate: 'CA-PEM' };
        expect(await createTlsService().addTrust(body)).toEqual({ ok: true, data: view });
        expect(sent()).toEqual(['/managed/tls/trust', expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })]);
    });

    it('removeTrust DELETEs one file by its name, escaped', async () => {
        answer(204);
        await createTlsService().removeTrust('../ca.crt');
        expect(sent()[0]).toBe('/managed/tls/trust/..%2Fca.crt');
        expect(sent()[1]).toEqual({ method: 'DELETE', credentials: 'same-origin' });
    });
});
