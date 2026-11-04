import { describe, it, expect, beforeAll } from 'vitest';
import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import {
    BROKER_FIELDS, SESSION_COOKIE, createCookieJar, detailsFileText, findTokens, issueCert, jsonFindings, makeCA,
    maskSecrets, parseDetailsFile, parseSetCookie, pemCertificates, resolveDetails, sealedHeaderProblem,
    sessionCookieProblems, sweepSecrets,
} from '../../scripts/e2e-lib.mjs';

// The gateway's own Set-Cookie for a sign-in (go-web-proxy/session.go).
const GATEWAY_COOKIE = `${SESSION_COOKIE}=c2Vzc2lvbi12YWx1ZQ; Path=/; HttpOnly; Secure; SameSite=Lax`;

describe('e2e-lib -- TLS material', () => {
    let ca: ReturnType<typeof makeCA>;
    let leaf: ReturnType<typeof issueCert>;

    beforeAll(() => {
        ca = makeCA('smu-e2e test CA');
        leaf = issueCert(ca, { cn: 'localhost', dns: ['localhost', 'solace-broker'], ip: ['127.0.0.1'] });
    });

    it('makes a self-signed CA certificate', () => {
        const cert = new X509Certificate(ca.certPem);
        expect(cert.ca).toBe(true);
        expect(cert.subject).toBe('CN=smu-e2e test CA');
        expect(cert.verify(cert.publicKey)).toBe(true);
    });

    it('issues a server certificate the CA signed, for exactly the names asked', () => {
        const caCert = new X509Certificate(ca.certPem);
        const cert = new X509Certificate(leaf.certPem);
        expect(cert.ca).toBe(false);
        expect(cert.checkIssued(caCert)).toBe(true);
        expect(cert.verify(caCert.publicKey)).toBe(true);
        expect(cert.subjectAltName).toBe('DNS:localhost, DNS:solace-broker, IP Address:127.0.0.1');
        expect(cert.checkHost('solace-broker')).toBe('solace-broker');
        expect(cert.checkHost('other.example')).toBeUndefined();
        expect(cert.checkIP('127.0.0.1')).toBe('127.0.0.1');
        expect(cert.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']);
        expect(leaf.keyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\n/);
    });

    it('is valid from an hour ago for the days asked', () => {
        const now = new Date('2026-11-03T08:00:00Z');
        const cert = new X509Certificate(issueCert(ca, { cn: 'x', dns: ['x'], now, days: 2 }).certPem);
        expect(new Date(cert.validFrom).toISOString()).toBe('2026-11-03T07:00:00.000Z');
        expect(new Date(cert.validTo).toISOString()).toBe('2026-11-05T08:00:00.000Z');
    });

    it('writes a validity date from 2050 on as GeneralizedTime', () => {
        const cert = new X509Certificate(issueCert(ca, { cn: 'x', dns: ['x'], now: new Date('2049-12-30T00:00:00Z'), days: 7 }).certPem);
        expect(new Date(cert.validTo).toISOString()).toBe('2050-01-06T00:00:00.000Z');
    });

    it('serves TLS that a client trusting only the CA accepts, and one trusting nothing refuses', async () => {
        const server = tls.createServer({ cert: leaf.certPem, key: leaf.keyPem }, (s) => { s.on('error', () => {}); s.end(); });
        // A refused handshake is the client's verdict; the server side just drops it.
        server.on('tlsClientError', () => {});
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        const { port } = server.address() as AddressInfo;
        const handshake = (opts: tls.ConnectionOptions) => new Promise<string>((resolve) => {
            const socket = tls.connect({ host: '127.0.0.1', port, ...opts }, () => { socket.destroy(); resolve('ok'); });
            socket.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? e.message));
        });
        try {
            expect(await handshake({ ca: ca.certPem })).toBe('ok');
            expect(await handshake({ ca: ca.certPem, servername: 'solace-broker' })).toBe('ok');
            expect(await handshake({ ca: ca.certPem, servername: 'other.example' })).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
            expect(await handshake({ ca: makeCA('a different CA').certPem })).toBe('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
        } finally {
            server.close();
        }
    });

    it('refuses an IP SAN that is not IPv4', () => {
        expect(() => issueCert(ca, { cn: 'x', ip: ['::1'] })).toThrow('not an IPv4 address: ::1');
        expect(() => issueCert(ca, { cn: 'x', ip: ['10.0.0.256'] })).toThrow('not an IPv4 address: 10.0.0.256');
    });

    it('reads every certificate from a broker CA file and ignores a private key beside them', () => {
        const certs = pemCertificates(`${leaf.keyPem}${leaf.certPem}\n${ca.certPem}`);
        expect(certs.map((c) => c.subject)).toEqual(['CN=localhost', 'CN=smu-e2e test CA']);
        expect(certs[1].toString()).toBe(new X509Certificate(ca.certPem).toString());
    });

    it('refuses a CA file with no certificate, or one that does not parse', () => {
        expect(() => pemCertificates(leaf.keyPem)).toThrow('holds no PEM certificate');
        expect(() => pemCertificates('-----BEGIN CERTIFICATE-----\nbm90IGRlcg==\n-----END CERTIFICATE-----'))
            .toThrow(/^certificate 1 does not parse: /);
    });
});

describe('e2e-lib -- broker details', () => {
    const FILE = 'docker/e2e-broker.env';
    const complete = {
        E2E_BROKER_HOST: 'broker.example.com', E2E_BROKER_CA: 'certs/ca.pem', E2E_SEMP_PORT: '943', E2E_SEMP_USER: 'monitor',
        E2E_SEMP_PASSWORD: 'semp-secret-1', E2E_SMF_PORT: '443', E2E_VPN: 'prod-vpn', E2E_CLIENT_USER: 'app',
        E2E_CLIENT_PASSWORD: 'client-secret-1', E2E_QUEUE: 'orders/in',
    };

    it('takes every detail from the file, the environment overriding it, and asks for nothing', () => {
        const file = parseDetailsFile(Object.entries(complete).map(([k, v]) => `${k}=${v}`).join('\n'), FILE);
        const { values, missing, errors } = resolveDetails({ E2E_QUEUE: 'orders/other' }, file, FILE);
        expect(errors).toEqual([]);
        expect(missing).toEqual([]);
        expect(values).toEqual({
            host: 'broker.example.com', caFile: 'certs/ca.pem', sempPort: '943', sempUser: 'monitor', sempPassword: 'semp-secret-1',
            smfPort: '443', vpn: 'prod-vpn', clientUser: 'app', clientPassword: 'client-secret-1', queue: 'orders/other',
        });
    });

    it('lists what neither gives, in prompt order, offering the defaults and no secret', () => {
        const file = parseDetailsFile('E2E_BROKER_HOST=broker.example.com\nE2E_SEMP_PASSWORD=\n', FILE);
        const { values, missing } = resolveDetails({}, file, FILE);
        expect(values).toEqual({ host: 'broker.example.com' });
        expect(missing.map((f) => [f.env, f.offer, !!f.secret])).toEqual([
            ['E2E_BROKER_CA', '', false], ['E2E_SEMP_PORT', '1943', false], ['E2E_SEMP_USER', 'admin', false],
            ['E2E_SEMP_PASSWORD', '', true], ['E2E_SMF_PORT', '1443', false], ['E2E_VPN', 'default', false],
            ['E2E_CLIENT_USER', '', false], ['E2E_CLIENT_PASSWORD', '', true], ['E2E_QUEUE', '', false],
        ]);
        expect(resolveDetails({}).missing).toHaveLength(BROKER_FIELDS.length);
    });

    it('names where each refused value came from, and never repeats a password', () => {
        const file = parseDetailsFile('# comment\n\nE2E_SEMP_PORT = 99999\nE2E_BROKER_HOST=https://broker:943\n', FILE);
        const env = { E2E_SEMP_USER: 'mon:itor', E2E_CLIENT_PASSWORD: 'pass\u0007word', E2E_VPN: 'v\u007f' };
        expect(resolveDetails(env, file, FILE).errors).toEqual([
            `E2E_BROKER_HOST (${FILE} line 4) is not a host name (A-Z a-z 0-9 . _ -) or an IP address, without scheme or port: https://broker:943`,
            `E2E_SEMP_PORT (${FILE} line 3) is not a port number (1-65535): 99999`,
            'E2E_SEMP_USER (environment) holds a ":", which a SEMP username cannot',
            'E2E_VPN (environment) holds a control character',
            'E2E_CLIENT_PASSWORD (environment) holds a control character',
        ]);
    });

    it('checks each detail the way the gateway will', () => {
        const check = (env: string, v: string) => BROKER_FIELDS.find((f) => f.env === env)!.check(v);
        for (const ok of ['broker', 'host.docker.internal', 'solace_1', '10.0.0.5', 'fd00::5']) expect(check('E2E_BROKER_HOST', ok)).toBe('');
        for (const bad of ['-broker', 'broker:943', 'a b', 'user@broker', 'fe80::1%eth0']) expect(check('E2E_BROKER_HOST', bad)).not.toBe('');
        for (const ok of ['orders', 'orders/in', 'a.b-c_d']) expect(check('E2E_QUEUE', ok)).toBe('');
        for (const bad of ['orders%2024', 'a;b', 'a\\b', '/lead', 'a//b', 'a/../b', '.']) {
            expect(check('E2E_QUEUE', bad)).toMatch(/^cannot go through the gateway's relay /);
        }
        expect(check('E2E_VPN', 'v;1')).toMatch(/^cannot go through the gateway's relay /);
        for (const ok of ['1', '943', '65535']) expect(check('E2E_SEMP_PORT', ok)).toBe('');
        for (const bad of ['0', '65536', '+943', '9 43', '']) expect(check('E2E_SMF_PORT', bad)).not.toBe('');
        expect(check('E2E_SEMP_PASSWORD', '')).toBe('is empty');
    });

    it('refuses a file line it cannot use, by line number and without its value', () => {
        expect(() => parseDetailsFile('E2E_VPN=a\nsecret-on-its-own', FILE)).toThrow(`${FILE} line 2: want KEY=value`);
        expect(() => parseDetailsFile('=orphan', FILE)).toThrow(`${FILE} line 1: want KEY=value`);
        expect(() => parseDetailsFile('E2E_BROKR_HOST=x', FILE)).toThrow(/^docker\/e2e-broker\.env line 1: unknown key E2E_BROKR_HOST; the keys are E2E_BROKER_HOST, /);
        expect(() => parseDetailsFile('E2E_VPN=a\r\nE2E_VPN=', FILE)).toThrow(`${FILE} line 2: E2E_VPN is already set on line 1`);
    });

    it('starts a new file with its header and fills an existing one in place', () => {
        const fresh = detailsFileText(null, { E2E_BROKER_HOST: 'broker', E2E_VPN: 'default' });
        expect(fresh).toMatch(/^# Broker details for \.\/scripts\/dev\.sh e2e .*\n(#.*\n)+E2E_BROKER_HOST=broker\nE2E_VPN=default\n$/);
        expect(parseDetailsFile(fresh, FILE).values).toEqual({ E2E_BROKER_HOST: 'broker', E2E_VPN: 'default' });
        const own = '# mine\r\nE2E_SEMP_PASSWORD=kept-by-hand\r\nE2E_QUEUE = \r\n';
        expect(detailsFileText(own, { E2E_QUEUE: 'q1', E2E_VPN: 'v' })).toBe('# mine\nE2E_SEMP_PASSWORD=kept-by-hand\nE2E_QUEUE=q1\nE2E_VPN=v\n');
    });
});

describe('e2e-lib -- cookies', () => {
    it('parses a Set-Cookie line, attribute names lower-cased and flags as true', () => {
        expect(parseSetCookie(GATEWAY_COOKIE)).toEqual({
            name: SESSION_COOKIE, value: 'c2Vzc2lvbi12YWx1ZQ',
            attrs: { path: '/', httponly: true, secure: true, samesite: 'Lax' },
        });
        expect(parseSetCookie('a=b; ; Max-Age=0')).toEqual({ name: 'a', value: 'b', attrs: { 'max-age': '0' } });
    });

    it('returns null for a line without name=value', () => {
        expect(parseSetCookie('novalue; Secure')).toBeNull();
        expect(parseSetCookie('=orphan')).toBeNull();
    });

    it('keeps the latest value per name and drops a cleared cookie', () => {
        const jar = createCookieJar();
        jar.store([GATEWAY_COOKIE, 'other=1', 'garbage']);
        expect(jar.header()).toBe(`${SESSION_COOKIE}=c2Vzc2lvbi12YWx1ZQ; other=1`);
        jar.store([`${SESSION_COOKIE}=next; Path=/`]);
        expect(jar.get(SESSION_COOKIE)).toBe('next');
        jar.store([`${SESSION_COOKIE}=; Path=/; Max-Age=0`, 'other=1; Max-Age=0']);
        expect(jar.header()).toBe('');
        jar.store();
        expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    });

    it("accepts the gateway's sign-in cookie", () => {
        expect(sessionCookieProblems([GATEWAY_COOKIE, 'unrelated=1'])).toEqual([]);
    });

    it('names each way the sign-in cookie can be wrong', () => {
        expect(sessionCookieProblems([`${SESSION_COOKIE}=; Domain=example.com; Max-Age=60`])).toEqual([
            'empty value', 'not Secure', 'not HttpOnly', 'SameSite=(absent), want Lax', 'Path=(absent), want /',
            'has a Domain', 'outlives the browser session (Max-Age or Expires)',
        ]);
        expect(sessionCookieProblems([`${SESSION_COOKIE}=v; Path=/app; Secure; HttpOnly; SameSite=None; Expires=Wed, 01 Jan 2031 00:00:00 GMT`]))
            .toEqual(['SameSite=None, want Lax', 'Path=/app, want /', 'outlives the browser session (Max-Age or Expires)']);
    });

    it('wants exactly one session cookie', () => {
        expect(sessionCookieProblems()).toEqual([`want one ${SESSION_COOKIE} cookie, got 0`]);
        expect(sessionCookieProblems([GATEWAY_COOKIE, GATEWAY_COOKIE])).toEqual([`want one ${SESSION_COOKIE} cookie, got 2`]);
    });
});

describe('e2e-lib -- sealed store header', () => {
    const sealed = (role: number) => Buffer.concat([Buffer.from('SMUS'), Buffer.from([1, role]), Buffer.from('ciphertext')]);

    it('accepts each store with its own role byte', () => {
        expect(sealedHeaderProblem(sealed(1), 'users')).toBe('');
        expect(sealedHeaderProblem(sealed(2), 'connections')).toBe('');
    });

    it('refuses a swapped role, a plaintext YAML store and an empty file', () => {
        expect(sealedHeaderProblem(sealed(2), 'users')).toBe('header 534d55530102, want 534d55530101');
        expect(sealedHeaderProblem(Buffer.from('msg-utility-users:\n'), 'users')).toMatch(/^header 6d73672d7574, want 534d55530101$/);
        expect(sealedHeaderProblem(Buffer.alloc(0), 'connections')).toBe('header (empty), want 534d55530102');
    });

    it('throws on a role it does not know', () => {
        expect(() => sealedHeaderProblem(sealed(1), 'keys')).toThrow('unknown store role: keys');
    });
});

describe('e2e-lib -- secrets', () => {
    const secrets = { pass: 'Sup3rSecretValue', longer: 'Sup3rSecretValue-and-more', short: 'admin', none: undefined };

    it('masks every secret, the longest first so an overlap is masked whole', () => {
        expect(maskSecrets('a Sup3rSecretValue-and-more b Sup3rSecretValue', secrets)).toBe('a [masked] b [masked]');
    });

    it('leaves short and missing values alone', () => {
        expect(maskSecrets('user admin signed in', secrets)).toBe('user admin signed in');
        expect(maskSecrets(42, {})).toBe('42');
    });

    it('masks a short secret when asked to, as for a password the user gave', () => {
        expect(maskSecrets('semp admin:admin', { pass: 'admin' }, { min: 1 })).toBe('semp [masked]:[masked]');
        expect(maskSecrets('nothing', { pass: '' }, { min: 1 })).toBe('nothing');
    });

    it('finds a forbidden key or an exact forbidden value anywhere in a JSON text', () => {
        const me = JSON.stringify({
            username: 'u', brokers: [{ broker: 'b1', msgVpns: [{ name: 'v', pass: 'x' }], note: 'broker.example.com:943' }],
            extra: { hostname: 'broker.example.com' },
        });
        expect(jsonFindings(me, { keys: ['pass', 'hostname'], values: ['broker.example.com', 'app'] }))
            .toEqual(['key "pass"', 'key "hostname"', 'value "broker.example.com"']);
        expect(jsonFindings('[1, null, "app"]', { values: ['app'] })).toEqual(['value "app"']);
        expect(jsonFindings('{}')).toEqual([]);
    });

    it('lists the tokens a text contains', () => {
        expect(findTokens('{"username":"u","port":"1443"}', ['"port"', '"pass"', '1443', ''])).toEqual(['"port"', '1443']);
    });

    it('finds a secret in headers or body, except where it is allowed', () => {
        const records = [
            { label: 'POST /managed/dial -> 200', headers: 'Cache-Control: no-store\r\n', body: '{"pass":"Sup3rSecretValue"}' },
            { label: 'GET /managed/me -> 200', headers: 'X-Leak: Sup3rSecretValue\r\n', body: '{}' },
            { label: 'GET /hosted -> 200', headers: '', body: undefined as unknown as string },
        ];
        const allowDial = (r: { label: string }, name: string, where: string) =>
            name === 'pass' && where === 'body' && r.label.startsWith('POST /managed/dial');
        expect(sweepSecrets(records, secrets, allowDial)).toEqual(['pass in the headers of GET /managed/me -> 200']);
        expect(sweepSecrets(records, { pass: secrets.pass })).toEqual([
            'pass in the body of POST /managed/dial -> 200', 'pass in the headers of GET /managed/me -> 200',
        ]);
    });
});
