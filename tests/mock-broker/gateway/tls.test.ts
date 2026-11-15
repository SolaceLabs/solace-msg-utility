import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createGateway } from '../../../src/mock-broker/gateway';
import { DEMO_SUBJECT, parsePem, START_CERTIFICATE_BYTES } from '../../../src/mock-broker/gateway/tls';
import { contractSeed } from './helpers';

/**
 * The fake gateway's TLS console (src/mock-broker/gateway/tls.ts): the
 * certificate and the trusted CA files behind GET /managed/tls and its
 * writes, with the statuses, codes and shapes of the gateway's. The PEM is
 * well formed but made up: the fake cannot read X.509, and none of it is a
 * real certificate or key. The key below is a throwaway string, not a key.
 */
const NOW = new Date(Date.UTC(2026, 10, 9, 9, 0, 0));
const gateway = (now: () => Date = () => NOW) => createGateway({ seed: contractSeed(), now });
type Gw = ReturnType<typeof gateway>;

const call = (gw: Gw, method: string, path: string, body?: unknown, who = 'admin') => gw.handle({
    method, path, query: '', body: body === undefined ? '' : JSON.stringify(body), session: who === '' ? null : gw.openSession(who, false),
});
const pem = (label: string, bytes: string) => `-----BEGIN ${label}-----\n${btoa(bytes)}\n-----END ${label}-----\n`;
const fp = (bytes: string) => createHash('sha256').update(bytes).digest('hex').toUpperCase().replace(/(..)(?!$)/g, '$1:');

const LEAF = pem('CERTIFICATE', 'leaf certificate bytes');
const CHAIN = LEAF + pem('CERTIFICATE', 'intermediate certificate bytes');
const KEY_BYTES = 'throwaway test key bytes, not a key';
const KEY = pem('PRIVATE KEY', KEY_BYTES);
const CA = pem('CERTIFICATE', 'broker ca bytes');
const PAIR = { certificate: LEAF, key: KEY };

const get = async (gw: Gw) => (await call(gw, 'GET', '/managed/tls')).json as any;
const INVALID = (field: string) => expect.objectContaining({ status: 422, json: expect.objectContaining({ error: 'invalid', field }) });

describe('mock-broker/gateway/tls -- PEM', () => {
    it('reads every block, with CRLF line ends, wrapped lines and blank space around', () => {
        const text = `\n  -----BEGIN CERTIFICATE-----\r\n${btoa('one')}\r\n-----END CERTIFICATE-----\r\n\n${pem('PRIVATE KEY', 'two')}\n`;
        const read = parsePem(text);
        expect(read.blocks.map(b => [b.label, new TextDecoder().decode(b.der)])).toEqual([['CERTIFICATE', 'one'], ['PRIVATE KEY', 'two']]);
        expect(read.rest.trim()).toBe('');
        const body = btoa('a longer certificate body').replace(/(.{8})/g, '$1\n');
        const wrapped = `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
        expect(parsePem(wrapped).blocks[0].der.length).toBe('a longer certificate body'.length);
    });

    it('passes over text before and between blocks, as the gateway does, and keeps what follows the last one', () => {
        expect(parsePem(`junk\n${LEAF}junk\n${LEAF}`).blocks).toHaveLength(2);
        expect(parsePem(`${LEAF}junk`).rest.trim()).toBe('junk');
    });

    it.each([
        ['nothing', ''],
        ['only blank space', ' \n\t\n'],
        ['text that is not PEM', 'certificate please'],
        ['an END that does not match its BEGIN', `-----BEGIN CERTIFICATE-----\n${btoa('x')}\n-----END PRIVATE KEY-----`],
        ['a block without its END', `-----BEGIN CERTIFICATE-----\n${btoa('x')}\n`],
        ['a body that is not base64', '-----BEGIN CERTIFICATE-----\nA\n-----END CERTIFICATE-----'],
        ['a body that holds nothing', '-----BEGIN CERTIFICATE-----\n\n\n-----END CERTIFICATE-----'],
    ])('finds no block in %s', (_what, text) => {
        expect(parsePem(text).blocks).toEqual([]);
    });
});

describe('mock-broker/gateway/tls -- GET /managed/tls', () => {
    it('starts with one self-signed demo certificate, both flags true and no CA', async () => {
        const body = await get(gateway());
        expect(body).toEqual({
            certificate: {
                subject: DEMO_SUBJECT, issuer: DEMO_SUBJECT, names: [],
                notBefore: '2026-11-09T09:00:00Z', notAfter: '2027-11-09T09:00:00Z',
                sha256: fp(START_CERTIFICATE_BYTES), selfSigned: true, expired: false,
            },
            certificateWritable: true, trustWritable: true, trust: [],
        });
        expect(JSON.stringify(body)).not.toContain('/tls');   // paths are never in the answer
    });

    it('is for administrators: no session is 401 and a user without the flag is 403, on every TLS route', async () => {
        const gw = gateway();
        const routes: [string, string, unknown][] = [
            ['GET', '/managed/tls', undefined],
            ['POST', '/managed/tls/certificate/check', PAIR],
            ['PUT', '/managed/tls/certificate', PAIR],
            ['POST', '/managed/tls/trust', { certificate: CA }],
            ['DELETE', '/managed/tls/trust/ca.crt', undefined],
        ];
        for (const [method, path, body] of routes) {
            expect([method, path, (await call(gw, method, path, body, '')).status]).toEqual([method, path, 401]);
            expect([method, path, (await call(gw, method, path, body, 'viewer')).status]).toEqual([method, path, 403]);
        }
        expect((await get(gw)).certificate.sha256).toBe(fp(START_CERTIFICATE_BYTES));
    });
});

describe('mock-broker/gateway/tls -- the certificate', () => {
    it('checks a pair and describes the leaf, writing nothing', async () => {
        const gw = gateway();
        const res = await call(gw, 'POST', '/managed/tls/certificate/check', { certificate: CHAIN, key: KEY });
        expect(res).toEqual({
            status: 200,
            json: { certificate: {
                subject: DEMO_SUBJECT, issuer: DEMO_SUBJECT, names: [], notBefore: '2026-11-09T09:00:00Z', notAfter: '2027-11-09T09:00:00Z',
                sha256: fp('leaf certificate bytes'), selfSigned: true, expired: false,
            } },
        });
        expect((await get(gw)).certificate.sha256).toBe(fp(START_CERTIFICATE_BYTES));
    });

    it('replaces it at once: the next GET shows the new fingerprint and the time it was added', async () => {
        let t = NOW;
        const gw = gateway(() => t);
        t = new Date(Date.UTC(2026, 10, 10, 12, 30, 45, 678));
        const res = await call(gw, 'PUT', '/managed/tls/certificate', { certificate: CHAIN, key: KEY });
        expect(res.status).toBe(200);
        expect((res.json as any).certificate).toMatchObject({ sha256: fp('leaf certificate bytes'), notBefore: '2026-11-10T12:30:45Z', notAfter: '2027-11-10T12:30:45Z' });
        expect((await get(gw)).certificate).toEqual((res.json as any).certificate);
    });

    it.each([
        ['a certificate that is not PEM', { certificate: 'nope', key: KEY }, 'certificate'],
        ['no certificate', { key: KEY }, 'certificate'],
        ['a private key where the certificate goes', { certificate: KEY, key: KEY }, 'certificate'],
        ['a private key after the certificates', { certificate: LEAF + KEY, key: KEY }, 'certificate'],
        ['no key', { certificate: LEAF }, 'key'],
        ['a key that is not PEM', { certificate: LEAF, key: 'nope' }, 'key'],
        ['a certificate where the key goes', { certificate: LEAF, key: LEAF }, 'key'],
        ['two keys', { certificate: LEAF, key: KEY + KEY }, 'key'],
    ])('refuses %s, and neither checks nor swaps anything', async (_what, body, field) => {
        const gw = gateway();
        for (const [method, path] of [['POST', '/managed/tls/certificate/check'], ['PUT', '/managed/tls/certificate']]) {
            const res = await call(gw, method, path, body);
            expect(res).toEqual(INVALID(field));
            expect(JSON.stringify(res.json)).not.toContain(btoa(KEY_BYTES));
        }
        expect((await get(gw)).certificate.sha256).toBe(fp(START_CERTIFICATE_BYTES));
    });

    it('takes any kind of private key block that is not encrypted, and passes over the EC PARAMETERS block beside an EC key', async () => {
        const gw = gateway();
        for (const key of [pem('RSA PRIVATE KEY', 'k'), pem('EC PRIVATE KEY', 'k'), pem('EC PARAMETERS', 'p') + pem('EC PRIVATE KEY', 'k')]) {
            const res = await call(gw, 'POST', '/managed/tls/certificate/check', { certificate: LEAF, key });
            expect(res.status).toBe(200);
        }
    });

    // The reasons are the gateway's own (go-web-proxy/tls.go parseCertificatePEM
    // and parseKeyPEM): the contract goldens hold them.
    it.each([
        ['nothing that is PEM', { certificate: 'nope', key: KEY }, 'certificate', 'No certificate was found. Send the PEM text, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.'],
        ['a key among the certificates', { certificate: LEAF + KEY, key: KEY }, 'certificate', 'A private key was found. A private key never belongs here: send only the certificate.'],
        ['another kind of block', { certificate: LEAF + pem('PUBLIC KEY', 'p'), key: KEY }, 'certificate', 'A "PUBLIC KEY" block was found. Only CERTIFICATE blocks are accepted.'],
        ['text after the certificates', { certificate: `${LEAF}junk`, key: KEY }, 'certificate', 'There is text after the last certificate block. Send only certificate blocks.'],
        ['an encrypted key', { certificate: LEAF, key: pem('ENCRYPTED PRIVATE KEY', 'k') }, 'key', 'The key is encrypted. Send it without a passphrase (openssl pkey -in key.pem -out plain.pem).'],
        ['a certificate where the key goes', { certificate: LEAF, key: LEAF }, 'key', 'A "CERTIFICATE" block was found. Only the private key belongs here.'],
        ['two keys', { certificate: LEAF, key: KEY + KEY }, 'key', 'More than one private key was found. Send exactly one.'],
        ['no key', { certificate: LEAF, key: 'nope' }, 'key', 'No private key was found. Send the PEM text, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----.'],
        ['text after the key', { certificate: LEAF, key: `${KEY}junk` }, 'key', 'There is text after the key block. Send only the key.'],
    ])('refuses %s in the gateway\'s words', async (_what, body, field, reason) => {
        expect(await call(gateway(), 'POST', '/managed/tls/certificate/check', body)).toEqual({ status: 422, json: { error: 'invalid', field, reason } });
    });

    it('never answers with the key, on success or refusal', async () => {
        const gw = gateway();
        const answers = [
            await call(gw, 'PUT', '/managed/tls/certificate', PAIR),
            await call(gw, 'PUT', '/managed/tls/certificate', { certificate: LEAF, key: KEY + KEY }),
            await call(gw, 'GET', '/managed/tls'),
        ];
        for (const a of answers) expect(JSON.stringify(a)).not.toContain(btoa(KEY_BYTES));
        expect(JSON.stringify(gw.snapshot())).not.toContain(btoa(KEY_BYTES));
    });

    it('answers 400 bad_request for a body that is not strict JSON, and changes nothing', async () => {
        const gw = gateway();
        const raw = (body: string) => gw.handle({ method: 'PUT', path: '/managed/tls/certificate', query: '', body, session: gw.openSession('admin', false) });
        expect(await raw('{"certificate":')).toEqual({ status: 400, json: { error: 'bad_request' } });
        expect(await raw(JSON.stringify({ ...PAIR, extra: 1 }))).toEqual({ status: 400, json: { error: 'bad_request' } });
        expect(await raw(JSON.stringify({ certificate: 5, key: KEY }))).toEqual({ status: 400, json: { error: 'bad_request' } });
        expect((await get(gw)).certificate.sha256).toBe(fp(START_CERTIFICATE_BYTES));
    });
});

describe('mock-broker/gateway/tls -- the trusted CAs', () => {
    const add = (gw: Gw, body: object) => call(gw, 'POST', '/managed/tls/trust', body);

    it('adds a named file and answers with the GET body: a certificate for each block', async () => {
        const gw = gateway();
        const res = await add(gw, { name: 'broker-ca.crt', certificate: CA + pem('CERTIFICATE', 'second ca bytes') });
        expect(res.status).toBe(200);
        expect(res.json).toEqual(await get(gw));
        const [file] = (res.json as any).trust;
        expect(file).toMatchObject({ name: 'broker-ca.crt', problem: '' });
        expect(file.certificates.map((c: any) => c.sha256)).toEqual([fp('broker ca bytes'), fp('second ca bytes')]);
        expect(file.certificates[0]).toMatchObject({ subject: DEMO_SUBJECT, notBefore: '2026-11-09T09:00:00Z', selfSigned: true });
    });

    it('names a file after the certificate when none is given, once: the same name again exists', async () => {
        const gw = gateway();
        expect(((await add(gw, { certificate: CA })).json as any).trust.map((f: any) => f.name)).toEqual(['demo-certificate.crt']);
        expect(await add(gw, { certificate: CA })).toEqual({ status: 409, json: { error: 'exists' } });
        expect(await add(gw, { name: 'demo-certificate.crt', certificate: CA })).toEqual({ status: 409, json: { error: 'exists' } });
        expect((await get(gw)).trust).toHaveLength(1);
    });

    it('lists the files sorted by name', async () => {
        const gw = gateway();
        for (const name of ['m.crt', 'z.pem', 'a.crt', 'Z.crt']) await add(gw, { name, certificate: CA });
        expect((await get(gw)).trust.map((f: any) => f.name)).toEqual(['Z.crt', 'a.crt', 'm.crt', 'z.pem']);
    });

    it('takes a 64-character name and refuses a 65-character one', async () => {
        const gw = gateway();
        expect((await add(gw, { name: `${'a'.repeat(64)}.crt`, certificate: CA })).status).toBe(200);
        expect(await add(gw, { name: `${'a'.repeat(65)}.crt`, certificate: CA })).toEqual(INVALID('name'));
    });

    it.each(['../ca.crt', 'a/b.crt', 'ca.txt', 'ca', '.crt', '-ca.crt', 'a b.crt', 'ca.CRT', 'ca.crt\n'])('refuses the name %j, and writes nothing', async name => {
        const gw = gateway();
        expect(await add(gw, { name, certificate: CA })).toEqual(INVALID('name'));
        expect((await get(gw)).trust).toEqual([]);
    });

    it.each([
        ['a private key', KEY],
        ['a certificate with a key after it', CA + KEY],
        ['text that is not PEM', 'nope'],
        ['nothing', ''],
    ])('refuses %s as a CA, and writes nothing', async (_what, certificate) => {
        const gw = gateway();
        const res = await add(gw, { name: 'ca.crt', certificate });
        expect(res).toEqual(INVALID('certificate'));
        expect(JSON.stringify(res.json)).not.toContain(btoa(KEY_BYTES));
        expect((await get(gw)).trust).toEqual([]);
    });

    it('answers 400 bad_request for an unknown field or a body that is not JSON', async () => {
        const gw = gateway();
        expect(await add(gw, { certificate: CA, path: '/etc' })).toEqual({ status: 400, json: { error: 'bad_request' } });
        expect(await gw.handle({ method: 'POST', path: '/managed/tls/trust', query: '', body: '[', session: gw.openSession('admin', false) }))
            .toEqual({ status: 400, json: { error: 'bad_request' } });
    });

    it('deletes a file and answers with the GET body', async () => {
        const gw = gateway();
        await add(gw, { name: 'a.crt', certificate: CA });
        await add(gw, { name: 'b.crt', certificate: CA });
        const res = await call(gw, 'DELETE', '/managed/tls/trust/a.crt');
        expect(res.status).toBe(200);
        expect((res.json as any).trust.map((f: any) => f.name)).toEqual(['b.crt']);
        expect(res.json).toEqual(await get(gw));
    });

    it('answers 404 not_found for a file that is not there, and 422 for a name that could leave the directory', async () => {
        const gw = gateway();
        await add(gw, { name: 'a.crt', certificate: CA });
        expect(await call(gw, 'DELETE', '/managed/tls/trust/ghost.crt')).toEqual({ status: 404, json: { error: 'not_found' } });
        for (const name of ['..%2Fa.crt', 'a.txt', '.crt']) expect(await call(gw, 'DELETE', `/managed/tls/trust/${name}`)).toEqual(INVALID('name'));
        expect((await get(gw)).trust.map((f: any) => f.name)).toEqual(['a.crt']);
    });
});

describe('mock-broker/gateway/tls -- read-only files', () => {
    async function readOnlyGateway() {
        const gw = gateway();
        await call(gw, 'POST', '/managed/tls/trust', { name: 'a.crt', certificate: CA });
        gw.faults.tlsReadOnly = true;
        return gw;
    }

    it('turns both flags false', async () => {
        const body = await get(await readOnlyGateway());
        expect([body.certificateWritable, body.trustWritable]).toEqual([false, false]);
    });

    it('refuses every write with 409 tls_read_only and changes nothing', async () => {
        const gw = await readOnlyGateway();
        const refused = { status: 409, json: { error: 'tls_read_only' } };
        expect(await call(gw, 'PUT', '/managed/tls/certificate', PAIR)).toEqual(refused);
        expect(await call(gw, 'POST', '/managed/tls/trust', { name: 'b.crt', certificate: CA })).toEqual(refused);
        expect(await call(gw, 'DELETE', '/managed/tls/trust/a.crt')).toEqual(refused);
        const body = await get(gw);
        expect(body.certificate.sha256).toBe(fp(START_CERTIFICATE_BYTES));
        expect(body.trust.map((f: any) => f.name)).toEqual(['a.crt']);
    });

    it('still checks a pair (nothing is written) and still refuses bad input as invalid before it refuses the write', async () => {
        const gw = await readOnlyGateway();
        expect((await call(gw, 'POST', '/managed/tls/certificate/check', PAIR)).status).toBe(200);
        expect(await call(gw, 'PUT', '/managed/tls/certificate', { certificate: 'nope', key: KEY })).toEqual(INVALID('certificate'));
        expect(await call(gw, 'POST', '/managed/tls/trust', { name: '../x', certificate: CA })).toEqual(INVALID('name'));
        expect(await call(gw, 'DELETE', '/managed/tls/trust/x.txt')).toEqual(INVALID('name'));
    });

    it('allows writes again once the switch is off', async () => {
        const gw = await readOnlyGateway();
        gw.faults.tlsReadOnly = false;
        expect((await call(gw, 'PUT', '/managed/tls/certificate', PAIR)).status).toBe(200);
    });
});

describe('mock-broker/gateway/tls -- across a reload', () => {
    it('carries the certificate, the CA files and the read-only switch in the snapshot', async () => {
        const gw = gateway();
        await call(gw, 'PUT', '/managed/tls/certificate', PAIR);
        await call(gw, 'POST', '/managed/tls/trust', { name: 'a.crt', certificate: CA });
        gw.faults.tlsReadOnly = true;
        const snap = JSON.parse(JSON.stringify(gw.snapshot()));

        const again = gateway();
        again.restore(snap);
        expect(await get(again)).toEqual(await get(gw));
        expect((await get(again)).certificateWritable).toBe(false);
    });

    it('keeps what it has when the snapshot is from a build before the TLS console', async () => {
        const gw = gateway();
        await call(gw, 'PUT', '/managed/tls/certificate', PAIR);
        const old = JSON.parse(JSON.stringify(gw.snapshot()));
        delete old.tls;
        const again = gateway();
        again.restore(old);
        expect((await get(again)).certificate.sha256).toBe(fp(START_CERTIFICATE_BYTES));
        expect((await get(again)).trust).toEqual([]);
    });
});
