// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import {
    APP_CONNECT_TIMEOUT_MS, BROKER_FIELDS, SESSION_COOKIE, SIGNIN_COOKIE, aliasAddress, auditMissing, base32Decode, basisMoved, certFingerprint, continueLinkFromPage,
    createCookieJar, detailsFileText, dnsServers, findTokens, freshTotp,
    hostAliasProblem,
    issueCert, issueExpiredCert, jsonFindings, listedRev, listedRow, machineLookup, makeCA, maskSecrets, parseAuditLog, parseDetailsFile, parseSetCookie, pemCertificates, recoveryCodeProblems,
    recoveryCodesFromPage, refusalProblem, resolutionOverride, resolveDetails, resolverLookup, sealedHeaderProblem, sempPreflightProblem, sessionCookieProblems,
    signinCookieProblems, smfPreflightProblem, sweepSecrets, tlsFingerprint, totpAt, totpCode, totpStep, twoFactorSecretFromPage, wrongTotp, wroteFile,
} from '../../scripts/e2e-lib.mjs';
import { DEFAULT_CONNECT_TIMEOUT_MS } from '../../src/core/connections/defaults';
import { REPO_ROOT } from '../helpers/sources';
import { WIDENING, securityOpt, serviceBlock } from '../helpers/compose';

// The gateway's own Set-Cookie for a sign-in (go-web-proxy/session.go).
const GATEWAY_COOKIE = `${SESSION_COOKIE}=c2Vzc2lvbi12YWx1ZQ; Path=/; HttpOnly; Secure; SameSite=Lax`;
// The ticket cookie of a half-finished sign-in (setSigninCookie in go-web-proxy/session.go).
const TICKET_COOKIE = `${SIGNIN_COOKIE}=dGlja2V0; Path=/; HttpOnly; Secure; SameSite=Strict`;

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

    it('issues an expired certificate the CA signed: one day of validity that ended 29 days ago', () => {
        const now = new Date('2026-11-15T08:00:00Z');
        const cert = new X509Certificate(issueExpiredCert(ca, { cn: 'localhost', dns: ['localhost'], ip: ['127.0.0.1'], now }).certPem);
        expect(new Date(cert.validFrom).toISOString()).toBe('2026-10-16T07:00:00.000Z');
        expect(new Date(cert.validTo).toISOString()).toBe('2026-10-17T08:00:00.000Z');
        expect(cert.checkIssued(new X509Certificate(ca.certPem))).toBe(true);
        expect(cert.subjectAltName).toBe('DNS:localhost, IP Address:127.0.0.1');
        expect(new Date(new X509Certificate(issueExpiredCert(ca, { cn: 'x' }).certPem).validTo).getTime()).toBeLessThan(Date.now());
    });

    it('writes a fingerprint as the gateway shows one: upper-case hex pairs joined by colons, of the first certificate', () => {
        const fp = certFingerprint(`${leaf.keyPem}${leaf.certPem}${ca.certPem}`);
        expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
        expect(fp).toBe(new X509Certificate(leaf.certPem).fingerprint256);
        expect(fp).not.toBe(certFingerprint(ca.certPem));
        expect(() => certFingerprint(leaf.keyPem)).toThrow('holds no PEM certificate');
    });

    describe('reading the certificate a server presents', () => {
        const listen = (server: net.Server) => new Promise<number>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
        });

        it('gives the fingerprint of the certificate served now, and the next one after the server swaps it', async () => {
            const server = tls.createServer({ cert: leaf.certPem, key: leaf.keyPem }, (s) => { s.on('error', () => {}); s.end(); });
            server.on('tlsClientError', () => {});
            const port = await listen(server);
            try {
                expect(await tlsFingerprint({ host: '127.0.0.1', port })).toBe(certFingerprint(leaf.certPem));
                const second = issueCert(ca, { cn: 'localhost', dns: ['localhost'], ip: ['127.0.0.1'] });
                server.setSecureContext({ cert: second.certPem, key: second.keyPem });
                const now = await tlsFingerprint({ host: '127.0.0.1', port, servername: 'localhost', timeoutMs: 5_000 });
                expect(now).toBe(certFingerprint(second.certPem));
                expect(now).not.toBe(certFingerprint(leaf.certPem));
            } finally {
                server.close();
            }
        });

        it('does not need to trust the certificate: a server whose CA the client has never seen still answers', async () => {
            const stranger = issueCert(makeCA('a CA nobody trusts'), { cn: 'stranger', dns: ['stranger'], ip: ['127.0.0.1'] });
            const server = tls.createServer({ cert: stranger.certPem, key: stranger.keyPem }, (s) => { s.on('error', () => {}); s.end(); });
            server.on('tlsClientError', () => {});
            const port = await listen(server);
            try {
                expect(await tlsFingerprint({ host: '127.0.0.1', port })).toBe(certFingerprint(stranger.certPem));
            } finally {
                server.close();
            }
        });

        it('rejects when nothing listens, and when the server never finishes the handshake', async () => {
            const closed = net.createServer();
            const gone = await listen(closed);
            await new Promise((r) => closed.close(r));
            await expect(tlsFingerprint({ host: '127.0.0.1', port: gone })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
            // Accepts the connection and says nothing, so the client waits for a ServerHello.
            const silent = net.createServer((socket) => { socket.on('error', () => {}); });
            const port = await listen(silent);
            try {
                await expect(tlsFingerprint({ host: '127.0.0.1', port, timeoutMs: 100 }))
                    .rejects.toThrow(`127.0.0.1:${port} did not finish a TLS handshake in 100 ms`);
            } finally {
                silent.close();
            }
        });
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
            brokerAddr: '', dns: '', insecure: '0', browser: '1',
        });
    });

    it('lists what neither gives, in prompt order, offering the defaults and no secret', () => {
        const file = parseDetailsFile('E2E_BROKER_HOST=broker.example.com\nE2E_SEMP_PASSWORD=\n', FILE);
        const { values, missing } = resolveDetails({}, file, FILE);
        expect(values).toEqual({ host: 'broker.example.com', brokerAddr: '', dns: '', insecure: '0', browser: '1' });
        expect(missing.map((f) => [f.env, f.offer, !!f.secret])).toEqual([
            ['E2E_BROKER_CA', '', false], ['E2E_SEMP_PORT', '1943', false], ['E2E_SEMP_USER', 'admin', false],
            ['E2E_SEMP_PASSWORD', '', true], ['E2E_SMF_PORT', '1443', false], ['E2E_VPN', 'default', false],
            ['E2E_CLIENT_USER', '', false], ['E2E_CLIENT_PASSWORD', '', true], ['E2E_QUEUE', '', false],
        ]);
        expect(resolveDetails({}).missing).toHaveLength(BROKER_FIELDS.filter((f) => !f.optional).length);
    });

    // An optional flag: verification stays on unless asked off, and only 1
    // turns it off, so a "true" or "yes" fails loudly instead.
    it('never asks for E2E_INSECURE: unset is 0, the environment overrides the file, and only 0 or 1 is taken', () => {
        const file = parseDetailsFile('E2E_INSECURE=1\n', FILE);
        expect(resolveDetails({}, file, FILE).values.insecure).toBe('1');
        expect(resolveDetails({ E2E_INSECURE: '0' }, file, FILE).values.insecure).toBe('0');
        expect(resolveDetails({}).missing.map((f) => f.env)).not.toContain('E2E_INSECURE');
        expect(resolveDetails({ E2E_INSECURE: 'true' }).errors).toEqual(['E2E_INSECURE (environment) is not 0 or 1: true']);
    });

    // The browser checks run unless asked off, and only 0 turns them off.
    it('never asks for E2E_BROWSER: unset is 1, the environment overrides the file, and only 0 or 1 is taken', () => {
        const file = parseDetailsFile('E2E_BROWSER=0\n', FILE);
        expect(resolveDetails({}, file, FILE).values.browser).toBe('0');
        expect(resolveDetails({ E2E_BROWSER: '1' }, file, FILE).values.browser).toBe('1');
        expect(resolveDetails({}).missing.map((f) => f.env)).not.toContain('E2E_BROWSER');
        expect(resolveDetails({ E2E_BROWSER: 'no' }).errors).toEqual(['E2E_BROWSER (environment) is not 0 or 1: no']);
    });

    it('names where each refused value came from, and never repeats a password', () => {
        const file = parseDetailsFile('# comment\n\nE2E_SEMP_PORT = 99999\nE2E_BROKER_HOST=https://broker:943\n', FILE);
        const env = { E2E_SEMP_USER: 'mon:itor', E2E_CLIENT_PASSWORD: 'pass\u0007word', E2E_VPN: 'v\u007f' };
        expect(resolveDetails(env, file, FILE).errors).toEqual([
            `E2E_BROKER_HOST (${FILE} line 4) is not a host name (A-Z a-z 0-9 . _ -) or an IP address, without scheme or port: https://broker:943`,
            `E2E_SEMP_PORT (${FILE} line 3) is not a port number (1-65535): 99999`,
            'E2E_SEMP_USER (environment) is not a SEMP username (up to 32 characters from A-Z a-z 0-9 _ -): mon:itor',
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
        for (const ok of ['admin', 'ops-monitor_2']) expect(check('E2E_SEMP_USER', ok)).toBe('');
        for (const bad of ['ops.monitor', 'a'.repeat(33)]) expect(check('E2E_SEMP_USER', bad)).toMatch(/^is not a SEMP username /);
        for (const ok of ['default', 'app user:1']) expect(check('E2E_CLIENT_USER', ok)).toBe('');
        for (const bad of ['app*', 'who?', 'caf\u00e9', 'a'.repeat(190)]) expect(check('E2E_CLIENT_USER', bad)).toMatch(/^is not a client username /);
        for (const ok of ['10.14.128.129', 'fd00::5', 'broker.lab.example.net']) expect(check('E2E_BROKER_ADDR', ok)).toBe('');
        for (const bad of ['https://broker.example.net', 'broker.example.net:943', 'fe80::1%eth0']) {
            expect(check('E2E_BROKER_ADDR', bad)).toBe(`is not a host name (A-Z a-z 0-9 . _ -) or an IP address, without scheme or port: ${bad}`);
        }
        for (const ok of ['10.14.128.2', '10.14.128.2, fd00::53']) expect(check('E2E_DNS', ok)).toBe('');
        for (const bad of ['dns.example.net', '10.14.128.2,', '10.14.128.2:53', '10.14.128.2 10.14.128.3']) {
            expect(check('E2E_DNS', bad)).toBe(`is not a list of IP addresses separated by commas: ${bad}`);
        }
    });

    // The certificate names solxps.handy, which nothing resolves: the alias
    // maps that name to the broker's address inside both gateway containers.
    it('aliases a host name to E2E_BROKER_ADDR, never an address', () => {
        const file = parseDetailsFile('E2E_BROKER_HOST=solxps.handy\nE2E_BROKER_ADDR=10.14.128.129\n', FILE);
        expect(resolveDetails({}, file, FILE).values).toMatchObject({ host: 'solxps.handy', brokerAddr: '10.14.128.129' });
        expect(hostAliasProblem('solxps.handy', '10.14.128.129')).toBe('');
        expect(hostAliasProblem('solxps.handy', 'broker.lab.example.net')).toBe('');
        expect(hostAliasProblem('10.14.128.129', '')).toBe('');
        expect(hostAliasProblem('10.14.128.129', '10.14.128.130')).toBe(
            "E2E_BROKER_ADDR needs E2E_BROKER_HOST to be a name in the broker's certificate, not an address: 10.14.128.129");
        expect(JSON.parse(resolutionOverride('solxps.handy', 'fd00::5'))).toEqual({ services: {
            gateway: { extra_hosts: ['solxps.handy:fd00::5'] }, direct: { extra_hosts: ['solxps.handy:fd00::5'] },
        } });
    });

    // E2E_DNS: the gateway containers resolve the broker's name themselves, with
    // or without an alias beside it.
    it('gives both gateway containers the E2E_DNS servers, in the order written', () => {
        expect(dnsServers('')).toEqual([]);
        const servers = dnsServers('10.14.128.2, fd00::53');
        expect(servers).toEqual(['10.14.128.2', 'fd00::53']);
        expect(JSON.parse(resolutionOverride('solxps.handy', '', servers))).toEqual({ services: { gateway: { dns: servers }, direct: { dns: servers } } });
        const both = { extra_hosts: ['solxps.handy:10.14.128.129'], dns: ['10.14.128.2'] };
        expect(JSON.parse(resolutionOverride('solxps.handy', '10.14.128.129', ['10.14.128.2']))).toEqual({ services: { gateway: both, direct: both } });
    });

    it('asks the E2E_DNS servers for an E2E_BROKER_ADDR name: its A record, else its AAAA record, else the refusal names them', async () => {
        const none = () => Object.assign(new Error('queryA ENODATA'), { code: 'ENODATA' });
        const resolver = {
            resolve4: vi.fn(async (name: string) => { if (name !== 'broker.lab.example.net') throw none(); return ['10.14.128.129', '10.14.128.130']; }),
            resolve6: vi.fn(async (name: string) => { if (name !== 'v6.lab.example.net') throw Object.assign(none(), { code: 'ENOTFOUND' }); return ['fd00::5']; }),
        };
        const lookup = resolverLookup(resolver);
        expect(await aliasAddress('broker.lab.example.net', lookup, 'E2E_DNS 10.14.128.2')).toBe('10.14.128.129');
        expect(resolver.resolve6).not.toHaveBeenCalled();
        expect(await aliasAddress('v6.lab.example.net', lookup, 'E2E_DNS 10.14.128.2')).toBe('fd00::5');
        await expect(aliasAddress('nowhere.invalid', lookup, 'E2E_DNS 10.14.128.2')).rejects.toThrow(
            'E2E_BROKER_ADDR nowhere.invalid does not resolve (ENOTFOUND, asked E2E_DNS 10.14.128.2): give an IP address, or a name that resolver knows');
    });

    // The compose network carries IPv4 only, and this machine's resolver may
    // list a name's IPv6 address first.
    it("asks this machine's resolver for an E2E_BROKER_ADDR name's IPv4 address, and for any address only when it has none", async () => {
        const none = () => Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
        const system = vi.fn(async (name: string, options?: { family: number }) => {
            if (name === 'both.lab.example.net') return { address: options?.family === 4 ? '10.14.1.2' : 'fd00::5' };
            if (name === 'v6.lab.example.net' && !options) return { address: 'fd00::5' };
            throw none();
        });
        const lookup = machineLookup(system);
        expect(await aliasAddress('both.lab.example.net', lookup)).toBe('10.14.1.2');
        expect(system.mock.calls).toEqual([['both.lab.example.net', { family: 4 }]]);
        expect(await aliasAddress('v6.lab.example.net', lookup)).toBe('fd00::5');
        expect(system.mock.calls.slice(1)).toEqual([['v6.lab.example.net', { family: 4 }], ['v6.lab.example.net']]);
        await expect(aliasAddress('nowhere.invalid', lookup)).rejects.toThrow(
            "E2E_BROKER_ADDR nowhere.invalid does not resolve (ENOTFOUND, asked this machine's resolver): give an IP address, or a name that resolver knows");
    });

    // A compose extra_hosts entry takes an address, so a DNS name given as
    // E2E_BROKER_ADDR is resolved by the harness, on the machine that runs it.
    it('maps the alias to E2E_BROKER_ADDR as given when it is an address, and to what a DNS name resolves to', async () => {
        const lookup = vi.fn(async (name: string) => ({ address: name === 'v6.lab.example.net' ? 'fd00::5' : '10.14.128.129' }));
        expect(await aliasAddress('10.14.128.130', lookup)).toBe('10.14.128.130');
        expect(await aliasAddress('fd00::7', lookup)).toBe('fd00::7');
        expect(lookup).not.toHaveBeenCalled();
        expect(await aliasAddress('broker.lab.example.net', lookup)).toBe('10.14.128.129');
        expect(await aliasAddress('v6.lab.example.net', lookup)).toBe('fd00::5');
        expect(lookup.mock.calls).toEqual([['broker.lab.example.net'], ['v6.lab.example.net']]);
    });

    it('refuses an E2E_BROKER_ADDR name that does not resolve, or resolves to an address with a zone', async () => {
        const unknown = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND nowhere.invalid'), { code: 'ENOTFOUND' }); };
        await expect(aliasAddress('nowhere.invalid', unknown)).rejects.toThrow(
            "E2E_BROKER_ADDR nowhere.invalid does not resolve (ENOTFOUND, asked this machine's resolver): give an IP address, or a name that resolver knows");
        const uncoded = async () => { throw new Error('lookup stopped'); };
        await expect(aliasAddress('nowhere.invalid', uncoded)).rejects.toThrow("does not resolve (lookup stopped, asked this machine's resolver)");
        await expect(aliasAddress('linklocal.example.net', async () => ({ address: 'fe80::1%eth0' }))).rejects.toThrow(
            'E2E_BROKER_ADDR linklocal.example.net resolved to fe80::1%eth0, which the gateway containers cannot use: give an IP address instead');
    });

    it('refuses the old name E2E_BROKER_IP, in the file and in the environment, naming the new one', () => {
        expect(() => parseDetailsFile('E2E_BROKER_HOST=solxps.handy\nE2E_BROKER_IP=10.14.128.129\n', FILE))
            .toThrow(`${FILE} line 2: E2E_BROKER_IP is renamed to E2E_BROKER_ADDR; rename the key`);
        expect(resolveDetails({ E2E_BROKER_IP: '10.14.128.129' }, undefined, FILE).errors)
            .toEqual(['E2E_BROKER_IP (environment) is renamed to E2E_BROKER_ADDR; set that instead']);
    });

    it('refuses a file line it cannot use, by line number and without its value', () => {
        expect(() => parseDetailsFile('E2E_VPN=a\nsecret-on-its-own', FILE)).toThrow(`${FILE} line 2: want KEY=value`);
        expect(() => parseDetailsFile('=orphan', FILE)).toThrow(`${FILE} line 1: want KEY=value`);
        expect(() => parseDetailsFile('E2E_BROKR_HOST=x', FILE)).toThrow(/^docker\/e2e-broker\.env line 1: unknown key E2E_BROKR_HOST; the keys are E2E_BROKER_HOST, /);
        expect(() => parseDetailsFile('E2E_VPN=a\r\nE2E_VPN=', FILE)).toThrow(`${FILE} line 2: E2E_VPN is already set on line 1`);
    });

    // A VPN or queue name with spaces is naturally written in quotes; kept,
    // they would reach the broker as part of the name.
    it('drops one pair of matching quotes around a file value, and no other quote', () => {
        const text = [
            'E2E_VPN="A VPN WITH SPACES"', "E2E_QUEUE='a queue'", 'E2E_CLIENT_USER=\'"quoted"\'', 'E2E_SEMP_USER="open', "E2E_BROKER_HOST=it's", 'E2E_SEMP_PASSWORD=""',
            'E2E_CLIENT_PASSWORD="',
        ].join('\n');
        expect(parseDetailsFile(text, FILE).values).toEqual({
            E2E_VPN: 'A VPN WITH SPACES', E2E_QUEUE: 'a queue', E2E_CLIENT_USER: '"quoted"', E2E_SEMP_USER: '"open', E2E_BROKER_HOST: "it's", E2E_CLIENT_PASSWORD: '"',
        });
    });

    it('writes a value that begins and ends with one quote character so that it reads back whole', () => {
        const text = detailsFileText('E2E_VPN=\n', { E2E_VPN: '"v"', E2E_QUEUE: "'q'", E2E_CLIENT_USER: 'plain user' });
        expect(text).toBe('E2E_VPN=""v""\nE2E_QUEUE="\'q\'"\nE2E_CLIENT_USER=plain user\n');
        expect(parseDetailsFile(text, FILE).values).toEqual({ E2E_VPN: '"v"', E2E_QUEUE: "'q'", E2E_CLIENT_USER: 'plain user' });
    });

    it('starts a new file with its header and fills an existing one in place', () => {
        const fresh = detailsFileText(null, { E2E_BROKER_HOST: 'broker', E2E_VPN: 'default' });
        expect(fresh).toMatch(/^# Broker details for \.\/scripts\/dev\.sh e2e .*\n(#.*\n)+E2E_BROKER_HOST=broker\nE2E_VPN=default\n$/);
        expect(parseDetailsFile(fresh, FILE).values).toEqual({ E2E_BROKER_HOST: 'broker', E2E_VPN: 'default' });
        const own = '# mine\r\nE2E_SEMP_PASSWORD=kept-by-hand\r\nE2E_QUEUE = \r\n';
        expect(detailsFileText(own, { E2E_QUEUE: 'q1', E2E_VPN: 'v' })).toBe('# mine\nE2E_SEMP_PASSWORD=kept-by-hand\nE2E_QUEUE=q1\nE2E_VPN=v\n');
    });
});

// What the harness says when its broker preflight (preflight in
// scripts/e2e.mjs) cannot use the broker: the line is all a person has to go
// on, so each answer must name the details to check.
describe('e2e-lib -- broker preflight', () => {
    const b = { host: 'broker.example', sempPort: '1943', sempUser: 'ro', smfPort: '1443', vpn: 'v1', clientUser: 'app', queue: 'q1' };
    const SEMP = 'https://broker.example:1943';
    const queueAnswer = (queueName: string) => ({ status: 200, body: JSON.stringify({ data: { queueName } }) });

    it('accepts the SEMP answer that names the queue', () => {
        expect(sempPreflightProblem(queueAnswer('q1'), b)).toBe('');
    });

    it('names the SEMP credential when the broker refuses it, and the user, VPN and queue when the broker forbids the read', () => {
        expect(sempPreflightProblem({ status: 401, body: '' }, b))
            .toBe(`the broker refused the SEMP username or password (401 from ${SEMP} as ro): check E2E_SEMP_USER and E2E_SEMP_PASSWORD`);
        expect(sempPreflightProblem({ status: 403, body: '' }, b))
            .toBe(`the broker does not let SEMP user ro read queue q1 in VPN v1 (403 from ${SEMP}): check E2E_SEMP_USER, E2E_VPN and E2E_QUEUE`);
    });

    it("says the SEMP port is not reachable for the relay's 502 and for no answer at all", () => {
        const refused = sempPreflightProblem({ status: 502, body: '502 bad gateway: upstream unreachable\n' }, b);
        expect(refused.startsWith(`the broker's SEMP port is not reachable at ${SEMP} from the gateway container (502: 502 bad gateway: upstream unreachable): `)).toBe(true);
        for (const detail of ['E2E_BROKER_HOST and E2E_SEMP_PORT', 'E2E_BROKER_ADDR or E2E_DNS', 'E2E_BROKER_CA', 'the direct log']) expect(refused).toContain(detail);
        const silent = sempPreflightProblem({ status: 0, body: 'direct GET /https/1943/broker.example/SEMP: no answer in 30s' }, b);
        expect(silent).toContain('is not reachable');
        expect(silent).toContain('(no answer: direct GET /https/1943/broker.example/SEMP: no answer in 30s)');
    });

    it('names the VPN and the queue for an answer that is not the queue, and the SEMP port for a 200 from something else', () => {
        const missing = '{"meta":{"error":{"status":"NOT_FOUND"}}}';
        expect(sempPreflightProblem({ status: 400, body: missing }, b))
            .toBe(`SEMP at ${SEMP} did not return queue q1 of VPN v1 (400: ${missing}): check E2E_VPN and E2E_QUEUE`);
        for (const res of [queueAnswer('other'), { status: 200, body: '{}' }, { status: 200, body: '<html>' }, { status: 200, body: 'null' }]) {
            expect(sempPreflightProblem(res, b)).toBe(`SEMP at ${SEMP} answered without queue q1 (200: ${res.body}): check E2E_SEMP_PORT and E2E_QUEUE`);
        }
    });

    it('quotes no more than the start of a long answer', () => {
        const problem = sempPreflightProblem({ status: 500, body: 'x'.repeat(5000) }, b);
        expect(problem).toContain(`(500: ${'x'.repeat(200)})`);
    });

    it('tells an SMF port the relay could not open from a login the broker refused', () => {
        const unopened = smfPreflightProblem('SMF connect failed: closed; gateway answer: 502 bad gateway: upstream unreachable', 'refused', b);
        expect(unopened.startsWith('no WebSocket to the broker at wss://broker.example:1443 from the gateway container '
            + '(SMF connect failed: closed; gateway answer: 502 bad gateway: upstream unreachable): ')).toBe(true);
        expect(unopened).toContain('E2E_BROKER_HOST and E2E_SMF_PORT');
        expect(unopened).not.toContain('E2E_CLIENT_PASSWORD');
        expect(smfPreflightProblem('SMF connect failed: Unauthorized; gateway answer: none', 'opened', b))
            .toBe('the broker at wss://broker.example:1443 did not log client username app in to VPN v1 '
                + '(SMF connect failed: Unauthorized; gateway answer: none): check E2E_VPN, E2E_CLIENT_USER and E2E_CLIENT_PASSWORD');
    });

    // A broker that takes longer to accept a connection than the SDK waits
    // for a WebSocket: the relay has answered nothing yet, so no credential
    // has been judged and none is named.
    it('tells a broker too slow for the SDK from one that refused the login', () => {
        const slow = smfPreflightProblem('SMF connect failed: Connection timed out; gateway answer: none', 'pending', b);
        expect(slow).toBe('the gateway container was still connecting to the broker at wss://broker.example:1443 when the SDK gave up '
            + "(SMF connect failed: Connection timed out; gateway answer: none): a WebSocket has 10 seconds to open, the app's connect timeout, "
            + 'so check that the broker accepts a connection on E2E_SMF_PORT well inside that, and that nothing filters the port');
        expect(slow).not.toContain('E2E_CLIENT_PASSWORD');
    });

    // A harness more patient than the app would pass a broker the browser
    // checks then fail against.
    it("connects its SMF sessions with the app's connect timeout, for the session and for the WebSocket's opening", () => {
        expect(APP_CONNECT_TIMEOUT_MS).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
        const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts/e2e.mjs'), 'utf-8');
        expect(harness).toContain('props.connectTimeoutInMsecs = APP_CONNECT_TIMEOUT_MS;');
        expect(harness).toContain('props.transportDowngradeTimeoutInMsecs = APP_CONNECT_TIMEOUT_MS;');
    });

    // The bridge reports 'none' as the gateway's answer both when a WebSocket
    // opened and when the gateway has not answered, so the preflight asks it
    // which.
    it('asks the bridge what became of the WebSocket, not whether the gateway refused it', () => {
        const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts/e2e.mjs'), 'utf-8');
        expect(harness).toContain("upgrade: () => (opened ? 'opened' : lastRefusal ? 'refused' : 'pending'),");
        expect(harness).toContain('smfPreflightProblem(e.message, bridge.upgrade(), broker)');
    });

    // A check that ran before the preflight would fail against a broker the
    // preflight is there to refuse, and the Provisioned gateway and the browser
    // would start for nothing.
    it('runs after the direct service starts alone, and before the Provisioned gateway starts', () => {
        const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts/e2e.mjs'), 'utf-8');
        expect(harness).toMatch(/compose\(\[\s*'up',\s*'-d',\s*'direct'\s*\]\)/);
        expect(harness).toMatch(/await startDirect\(\);\s*await preflight\(\);\s*await startGateway\(\);\s*const admin = await configureGateway\(\);/);
    });
});

// A hard-coded "true" left in the compose file would make every run skip
// verification while the harness reports that it verified.
describe('e2e stack -- broker verification', () => {
    const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

    it('verifies the broker unless the harness passes E2E_INSECURE=1 through', () => {
        // One per gateway service: gateway (Provisioned mode) and direct (Gateway mode).
        expect(read('docker/docker-compose.e2e.yaml').match(/^[ \t]*SMU_SSL_SKIP_CERT_VERIFY:.*$/gm))
            .toEqual(Array(2).fill('      SMU_SSL_SKIP_CERT_VERIFY: ${E2E_GATEWAY_SKIP_VERIFY:-}'));
        expect(read('scripts/e2e.mjs')).toMatch(/E2E_GATEWAY_SKIP_VERIFY:\s*insecure\(\)\s*\?\s*'true'\s*:\s*''/);
    });

    it('has both gateway services the resolution override extends', () => {
        const text = read('docker/docker-compose.e2e.yaml');
        for (const name of ['gateway', 'direct']) expect(text).toMatch(new RegExp(`^services:\\n(?:.*\\n)*?  ${name}:$`, 'm'));
    });
});

// The browser for checks B1-B9 and D4 (scripts/e2e.mjs): a pulled image, so its
// posture, its pin and its version are held here, where `test` runs without
// Docker.
describe('e2e stack -- browser', () => {
    const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    const block = serviceBlock(read('docker/docker-compose.e2e.yaml'), 'browser');
    const count = (text: string, part: string) => text.split(part).length - 1;

    it('runs locked down: non-root, read-only, no capability or new privilege, one client, its port on loopback', () => {
        expect(block, 'the browser service').not.toBe('');
        for (const line of [
            '    user: "1001:1001"', '    privileged: false', '    read_only: true', '    cap_drop:\n      - ALL',
            '    security_opt:\n      - no-new-privileges=true', '    tmpfs:\n      - /tmp',
            '      - ../node_modules/playwright-core:/pw:ro', '"--max-clients", "1"', '      - "127.0.0.1:39444:3000"',
        ]) expect(count(block, line), line).toBe(1);
        expect(block).not.toMatch(WIDENING);
        expect(securityOpt(block), 'security_opt holds no-new-privileges and nothing else').toBe('      - no-new-privileges=true\n');
        expect(block).not.toContain('--unsafe');
    });

    it('pins the Playwright image by digest, at the playwright-core version npm installs', () => {
        const pin: string = JSON.parse(read('package.json')).devDependencies?.['playwright-core'];
        expect(pin, "package.json devDependencies['playwright-core']").toMatch(/^\d+\.\d+\.\d+$/);
        const image = block.match(/^ {4}image: mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}$/m);
        expect(image, 'the browser image, by tag and digest').not.toBeNull();
        expect(image![1]).toBe(pin);
        expect(JSON.parse(read('node_modules/playwright-core/package.json')).version, 'the installed playwright-core').toBe(pin);
    });

    // A bare `up` would start the browser even with E2E_BROWSER=0.
    it('is started by name, and only when the browser checks run', () => {
        expect(read('scripts/e2e.mjs')).toMatch(/compose\(\[\s*'up',\s*'-d',\s*'gateway',\s*\.\.\.\(browserOn\(\)\s*\?\s*\['browser'\]\s*:\s*\[\]\)\s*\]\)/);
    });

    it('never reaches the app: nothing under src/ names playwright', () => {
        const files = fs.readdirSync(path.join(REPO_ROOT, 'src'), { recursive: true, encoding: 'utf-8' })
            .filter((rel) => /\.(?:ts|mjs|js|html|css)$/.test(rel));
        expect(files.length).toBeGreaterThan(0);
        expect(files.filter((rel) => /playwright/i.test(read(path.join('src', rel))))).toEqual([]);
    });
});

// The Gateway-mode service for checks D1-D4 (scripts/e2e.mjs): the gateway's
// image in its default mode. Its posture, and its distance from Provisioned
// mode's settings, secrets and data, are held here.
describe('e2e stack -- Gateway mode', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'docker/docker-compose.e2e.yaml'), 'utf-8');
    const block = (name: string) => serviceBlock(text, name);
    const count = (t: string, part: string) => t.split(part).length - 1;
    const direct = block('direct');

    it('runs locked down like the gateway: non-root, read-only, no capability or new privilege, its port on loopback', () => {
        expect(direct, 'the direct service').not.toBe('');
        for (const line of [
            '    user: "65532:65532"', '    privileged: false', '    read_only: true', '    cap_drop:\n      - ALL',
            '    security_opt:\n      - no-new-privileges=true', '    pull_policy: never', '      - "127.0.0.1:39445:9443"',
        ]) expect(count(direct, line), line).toBe(1);
        expect(direct).not.toMatch(WIDENING);
        expect(securityOpt(direct), 'security_opt holds no-new-privileges and nothing else').toBe('      - no-new-privileges=true\n');
    });

    it("runs the gateway's image in Gateway mode, on its own volume, with none of Provisioned mode's settings or secrets", () => {
        const image = /^ {4}image: .+$/m;
        expect(direct.match(image)?.[0], 'the direct image').toBeDefined();
        expect(direct.match(image)?.[0]).toBe(block('gateway').match(image)?.[0]);
        expect(direct).not.toMatch(/^ {6}(?:SMU_CONN_MODES|SMU_HOSTED|SMU_DEFAULT_CONN|SMU_ADMIN_PASSWORD|SMU_ADMIN_PASSWORD_FILE):/m);
        expect(direct).not.toContain('/run/secrets/');
        expect(count(direct, '      - direct-data:/data\n')).toBe(1);
        expect(text).toMatch(/^volumes:\n(?: {2}[\w-]+:\n)*? {2}direct-data:$/m);
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

    it("accepts the gateway's sign-in ticket cookie, which is SameSite=Strict where the session cookie is Lax", () => {
        expect(signinCookieProblems([TICKET_COOKIE, 'unrelated=1'])).toEqual([]);
        expect(signinCookieProblems([TICKET_COOKIE.replace('Strict', 'Lax')])).toEqual(['SameSite=Lax, want Strict']);
        expect(sessionCookieProblems([TICKET_COOKIE])).toEqual([`want one ${SESSION_COOKIE} cookie, got 0`]);
    });

    it('names each way the ticket cookie can be wrong, and wants exactly one', () => {
        expect(signinCookieProblems([`${SIGNIN_COOKIE}=; Domain=example.com; Max-Age=60`])).toEqual([
            'empty value', 'not Secure', 'not HttpOnly', 'SameSite=(absent), want Strict', 'Path=(absent), want /',
            'has a Domain', 'outlives the browser session (Max-Age or Expires)',
        ]);
        expect(signinCookieProblems()).toEqual([`want one ${SIGNIN_COOKIE} cookie, got 0`]);
        expect(signinCookieProblems([TICKET_COOKIE, TICKET_COOKIE])).toEqual([`want one ${SIGNIN_COOKIE} cookie, got 2`]);
    });

    it('drops the ticket cookie when the gateway ends it, and keeps it apart from the session cookie', () => {
        const jar = createCookieJar();
        jar.store([TICKET_COOKIE]);
        expect(jar.header()).toBe(`${SIGNIN_COOKIE}=dGlja2V0`);
        jar.store([GATEWAY_COOKIE, `${SIGNIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`]);
        expect(jar.get(SIGNIN_COOKIE)).toBeUndefined();
        expect(jar.get(SESSION_COOKIE)).toBe('c2Vzc2lvbi12YWx1ZQ');
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

describe('e2e-lib -- audit log', () => {
    const line = (e: Record<string, unknown>) => JSON.stringify({ time: '2026-11-12T10:00:00Z', actor: 'u', client: '10.0.0.1', outcome: 'ok', msg: 'm', ...e });
    // Keys in the gateway's order, whatever order the literal was written in.
    const entry = (e: Record<string, unknown>) => {
        const full = JSON.parse(line(e)) as Record<string, unknown>;
        const order = ['time', 'actor', 'client', 'action', 'target', 'outcome', 'code', 'changed', 'wrote', 'msg'];
        return JSON.stringify(Object.fromEntries(order.filter((k) => k in full).map((k) => [k, full[k]])));
    };

    it('parses well-formed lines and ignores blank ones', () => {
        const text = `${entry({ action: 'signin' })}\n\n${entry({ action: 'settings.update', changed: ['connModes'], target: 't' })}\n`
            + `${entry({ action: 'user.update', target: 'u', changed: ['grants'], wrote: [{ file: 'users.yaml', seq: 3 }] })}\n`;
        const { entries, problems } = parseAuditLog(text);
        expect(problems).toEqual([]);
        expect(entries.map((e) => e.action)).toEqual(['signin', 'settings.update', 'user.update']);
    });

    it('reports a line that is not JSON, not an object, or has unknown, missing or misordered fields', () => {
        const { problems } = parseAuditLog([
            'not json',
            '[1]',
            JSON.stringify({ time: '2026-11-12T10:00:00Z', actor: 'u', client: 'c', action: 'signin', outcome: 'ok', msg: 'm', extra: 1 }),
            JSON.stringify({ time: '2026-11-12T10:00:00Z', actor: 'u' }),
            JSON.stringify({ time: '2026-11-12T10:00:00Z', actor: 'u', client: 'c', outcome: 'ok', action: 'signin', msg: 'm' }),
        ].join('\n'));
        expect(problems).toEqual([
            'line 1 is not JSON',
            'line 2 is not a JSON object',
            'line 3 has unknown field(s) extra',
            'line 4 lacks client, action, outcome, msg',
            'line 5 has its fields out of order: time, actor, client, outcome, action, msg',
        ]);
    });

    it('reports a time that is not RFC 3339 UTC and an outcome other than ok or refused', () => {
        const { problems } = parseAuditLog(entry({ action: 'signin', time: '2026-11-12 10:00:00', outcome: 'maybe' }));
        expect(problems).toEqual(['line 1 has time 2026-11-12 10:00:00, not RFC 3339 UTC', 'line 1 has outcome maybe']);
        expect(parseAuditLog(entry({ action: 'signin', time: '2026-11-12T10:00:00.123456Z' })).problems).toEqual([]);
    });

    const want = { user: 'e2e-user', settingsKeys: ['connModes', 'modules.userDefault'] };
    const importWrote = [{ file: 'users.yaml', seq: 7 }, { file: 'connections.yaml', seq: 4 }, { file: 'config.yaml' }];
    const complete = [
        { action: 'signin', outcome: 'refused', code: 'bad_credentials', actor: '', target: 'e2e-user' },
        { action: 'signin', outcome: 'ok', actor: 'e2e-user' },
        { action: 'user.create', outcome: 'ok', target: 'e2e-user', wrote: [{ file: 'users.yaml', seq: 2 }] },
        { action: 'settings.update', outcome: 'ok', changed: ['modules.userDefault'], wrote: [{ file: 'config.yaml' }] },
        { action: 'settings.update', outcome: 'ok', changed: ['connModes'], wrote: [{ file: 'config.yaml' }] },
        { action: 'backup.export', outcome: 'ok' },
        { action: 'backup.import', outcome: 'ok', wrote: importWrote },
    ];

    it('finds nothing missing in a log that holds every decided entry', () => {
        expect(auditMissing(complete, want)).toEqual([]);
    });

    it('names each decided entry that is missing', () => {
        expect(auditMissing([], want)).toEqual([
            'a refused signin for e2e-user with code bad_credentials', 'an ok signin for e2e-user',
            'an ok settings.update naming connModes', 'an ok settings.update naming modules.userDefault',
            'an ok backup.export', 'an ok backup.import',
            'an ok user.create for e2e-user that wrote users.yaml with a seq', 'an ok settings.update that wrote config.yaml',
            'an ok backup.import that wrote users.yaml, connections.yaml and config.yaml',
        ]);
    });

    it('does not count a refused entry, another user, another code or a settings entry without a changed list', () => {
        const wrong = [
            { action: 'signin', outcome: 'refused', code: 'throttled', actor: '', target: 'e2e-user' },
            { action: 'signin', outcome: 'refused', code: 'bad_credentials', actor: '', target: 'someone-else' },
            { action: 'signin', outcome: 'ok', actor: 'admin' },
            { action: 'settings.update', outcome: 'refused', changed: ['connModes'] },
            { action: 'settings.update', outcome: 'ok' },
            { action: 'backup.export', outcome: 'refused' },
        ];
        expect(auditMissing(wrong, want)).toHaveLength(9);
    });

    it('names a change that committed without saying which file it wrote', () => {
        const unsaid = complete.map((e) => ({ ...e, wrote: undefined }));
        expect(auditMissing(unsaid, want)).toEqual([
            'an ok user.create for e2e-user that wrote users.yaml with a seq', 'an ok settings.update that wrote config.yaml',
            'an ok backup.import that wrote users.yaml, connections.yaml and config.yaml',
        ]);
    });

    describe('with the TLS checks', () => {
        const wantTls = { ...want, tls: { trustFile: 'broker-ca.crt' } };
        const msg = 'admin replaced the gateway certificate (subject CN=localhost, expires 2026-11-22T08:00:00Z)';
        const tlsEntries = [
            { action: 'tls.certificate.replace', outcome: 'ok', actor: 'admin', msg },
            { action: 'gateway.restart', outcome: 'ok', actor: 'admin' },
            { action: 'tls.trust.add', outcome: 'ok', actor: 'admin', target: 'broker-ca.crt' },
            { action: 'tls.trust.remove', outcome: 'ok', actor: 'admin', target: 'broker-ca.crt' },
        ];

        it('asks nothing more when the TLS checks are not named, and names what is missing when they are', () => {
            expect(auditMissing(complete, want)).toEqual([]);
            expect(auditMissing(complete, wantTls)).toEqual([
                'an ok tls.certificate.replace by admin whose message names the subject and the expiry and holds no key',
                'an ok gateway.restart by admin',
                'an ok tls.trust.add of broker-ca.crt by admin',
                'an ok tls.trust.remove of broker-ca.crt by admin',
            ]);
        });

        it('finds nothing missing once the replace, the restart and the CA file add and delete are there', () => {
            expect(auditMissing([...complete, ...tlsEntries], wantTls)).toEqual([]);
        });

        it('wants no CA file entry when the run skipped the CA check (an insecure run)', () => {
            expect(auditMissing([...complete, ...tlsEntries.slice(0, 2)], { ...want, tls: {} })).toEqual([]);
            expect(auditMissing(complete, { ...want, tls: {} })).toHaveLength(2);
        });

        it('does not count a refused entry, another actor, another file, or a message that names no subject or holds a PEM block', () => {
            const wrong = [
                { ...tlsEntries[0], outcome: 'refused' },
                { ...tlsEntries[0], actor: 'e2e-user' },
                { ...tlsEntries[0], msg: 'admin replaced the gateway certificate' },
                { ...tlsEntries[0], msg: `${msg} -----BEGIN PRIVATE KEY-----` },
                { ...tlsEntries[1], outcome: 'refused' },
                { ...tlsEntries[1], actor: 'e2e-user' },
                { ...tlsEntries[2], target: 'other.crt' },
                { ...tlsEntries[3], actor: 'e2e-user' },
            ];
            expect(auditMissing([...complete, ...wrong], wantTls)).toHaveLength(4);
        });
    });

    describe('with the two-factor user', () => {
        const wantTf = { ...want, twoFactorUser: 'e2e-scratch' };
        const tf = [
            { action: 'twofactor.enrol', outcome: 'ok', actor: 'e2e-scratch', target: 'e2e-scratch', wrote: [{ file: 'users.yaml', seq: 5 }] },
            { action: 'user.twofactor.reset', outcome: 'ok', actor: 'admin', target: 'e2e-scratch', wrote: [{ file: 'users.yaml', seq: 8 }] },
            { action: 'signin', outcome: 'refused', code: 'bad_code', actor: '' },
        ];

        it('asks nothing more when no two-factor user is named', () => {
            expect(auditMissing(complete, want)).toEqual([]);
            expect(auditMissing(complete, wantTf)).toEqual([
                'an ok twofactor.enrol for e2e-scratch that wrote users.yaml with a seq',
                'an ok user.twofactor.reset of e2e-scratch by admin that wrote users.yaml with a seq',
                'a refused signin with code bad_code',
            ]);
        });

        it('finds nothing missing once the enrolment, the reset and the refused code are there', () => {
            expect(auditMissing([...complete, ...tf], wantTf)).toEqual([]);
        });

        it('does not count another user, a reset by someone else, a refused enrolment, or one that wrote no file', () => {
            const wrong = [
                { ...tf[0], target: 'someone-else' },
                { ...tf[1], actor: 'e2e-scratch' },
                { ...tf[0], outcome: 'refused', code: 'bad_code' },
                { ...tf[1], wrote: undefined },
                { ...tf[2], code: 'bad_credentials' },
            ];
            expect(auditMissing([...complete, ...wrong], wantTf)).toHaveLength(3);
        });
    });

    it('reads wrote as the gateway writes it: a seq on a store file, none on config.yaml', () => {
        expect(wroteFile({ wrote: [{ file: 'users.yaml', seq: 1 }] }, 'users.yaml')).toBe(true);
        expect(wroteFile({ wrote: [{ file: 'config.yaml' }] }, 'config.yaml')).toBe(true);
        expect(wroteFile({}, 'users.yaml')).toBe(false);
        expect(wroteFile({ wrote: [{ file: 'users.yaml' }] }, 'users.yaml')).toBe(false);
        expect(wroteFile({ wrote: [{ file: 'users.yaml', seq: 0 }] }, 'users.yaml')).toBe(false);
        expect(wroteFile({ wrote: [{ file: 'users.yaml', seq: 2.5 }] }, 'users.yaml')).toBe(false);
        expect(wroteFile({ wrote: [{ file: 'config.yaml', seq: 3 }] }, 'config.yaml')).toBe(false);
        expect(wroteFile({ wrote: [{ file: 'connections.yaml', seq: 3 }] }, 'users.yaml')).toBe(false);
        expect(wroteFile({ wrote: 'users.yaml' }, 'users.yaml')).toBe(false);
        expect(wroteFile({ wrote: [null] }, 'users.yaml')).toBe(false);
    });
});

describe('e2e-lib -- versions', () => {
    const users = JSON.stringify({ users: [{ username: 'admin', rev: 1 }, { username: 'e2e-user', rev: 4 }, { username: 'odd', rev: 0 }, { username: 'bad', rev: '2' }] });

    it('reads the rev a list shows for one record', () => {
        expect(listedRev(users, 'users', 'username', 'e2e-user')).toBe(4);
        expect(listedRev(JSON.stringify({ connections: [{ broker: 'b1', rev: 9 }] }), 'connections', 'broker', 'b1')).toBe(9);
    });

    it('has no rev for an absent record, a rev that is not a whole number from 1, or an answer that is not a list', () => {
        expect(listedRev(users, 'users', 'username', 'nobody')).toBeNull();
        expect(listedRev(users, 'users', 'username', 'odd')).toBeNull();
        expect(listedRev(users, 'users', 'username', 'bad')).toBeNull();
        expect(listedRev(users, 'connections', 'broker', 'b1')).toBeNull();
        expect(listedRev('{"error":"forbidden"}', 'users', 'username', 'admin')).toBeNull();
        expect(listedRev('not json', 'users', 'username', 'admin')).toBeNull();
    });

    it('reads one whole row of a list, or none', () => {
        const rows = JSON.stringify({ users: [{ username: 'a', rev: 1, twoFactor: false }, { username: 'b', rev: 2, twoFactor: true }] });
        expect(listedRow(rows, 'users', 'username', 'b')).toEqual({ username: 'b', rev: 2, twoFactor: true });
        expect(listedRow(rows, 'users', 'username', 'c')).toBeNull();
        expect(listedRow(rows, 'connections', 'broker', 'b1')).toBeNull();
        expect(listedRow('{"error":"forbidden"}', 'users', 'username', 'a')).toBeNull();
        expect(listedRow('not json', 'users', 'username', 'a')).toBeNull();
    });

    it('accepts a refusal that has the wanted status, code and current rev', () => {
        const stale = { status: 409, body: '{"error":"stale","rev":5}' };
        expect(refusalProblem(stale, { status: 409, error: 'stale', rev: 5 })).toBe('');
        expect(refusalProblem(stale, { status: 409, error: 'stale' })).toBe('');
        expect(refusalProblem({ status: 404, body: '{"error":"not_found"}' }, { status: 404, error: 'not_found' })).toBe('');
    });

    it('says what is wrong with an answer that is not the refusal wanted', () => {
        const stale = { status: 409, body: '{"error":"stale","rev":5}' };
        expect(refusalProblem(stale, { status: 409, error: 'stale', rev: 6 })).toBe('want stale carrying rev 6, got 409 {"error":"stale","rev":5}');
        expect(refusalProblem(stale, { status: 404, error: 'not_found' })).toBe('want 404 not_found, got 409 {"error":"stale","rev":5}');
        expect(refusalProblem({ status: 200, body: '{"rev":2}' }, { status: 409, error: 'stale' })).toBe('want 409 stale, got 200 {"rev":2}');
        expect(refusalProblem({ status: 409, body: 'not json' }, { status: 409, error: 'stale' })).toBe('want 409 stale, got 409 not json');
    });

    it('names the sections whose version moved between two bases', () => {
        const seen = { users: 1, connections: 1, settings: 'abc' };
        expect(basisMoved(seen, { users: 2, connections: 1, settings: 'abc' })).toEqual(['users']);
        expect(basisMoved(seen, { users: 2, connections: 3, settings: 'xyz' })).toEqual(['users', 'connections', 'settings']);
        expect(basisMoved(seen, { ...seen })).toEqual([]);
        expect(basisMoved(seen, undefined as unknown as Record<string, unknown>)).toEqual(['users', 'connections', 'settings']);
    });
});

describe('e2e-lib -- two-factor sign-in', () => {
    // The RFC 6238 SHA-1 vectors the gateway's own tests read too (go-web-proxy/totp_test.go).
    const vectors: { secret: string; vectors: { time: number; code: string }[] } = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'go-web-proxy', 'testdata', 'contract', 'totp.json'), 'utf8'));
    const SECRET = vectors.secret;

    it('decodes the vectors file secret to the RFC ASCII secret', () => {
        expect(base32Decode(SECRET).toString('ascii')).toBe('12345678901234567890');
        expect(base32Decode('')).toEqual(Buffer.alloc(0));
    });

    it('refuses a character outside the base32 alphabet, lower case and padding included', () => {
        expect(() => base32Decode('GEZD1')).toThrow(/not base32/);
        expect(() => base32Decode('gezd')).toThrow(/not base32/);
        expect(() => base32Decode('GEZD====')).toThrow(/not base32/);
    });

    it('gives each RFC 6238 vector its code, by time and by step', () => {
        expect(vectors.vectors.length).toBeGreaterThanOrEqual(6);
        for (const v of vectors.vectors) {
            expect({ time: v.time, code: totpAt(SECRET, v.time) }).toEqual({ time: v.time, code: v.code });
            expect({ time: v.time, code: totpCode(SECRET, totpStep(v.time * 1000)) }).toEqual({ time: v.time, code: v.code });
        }
    });

    it('keeps leading zeros and holds one code for the whole 30 second step', () => {
        expect(totpAt(SECRET, 1234567890)).toBe('005924');
        expect(totpAt(SECRET, 1111111109)).toBe(totpAt(SECRET, 1111111109 - 1111111109 % 30 + 29));
        expect(totpAt(SECRET, 1111111109)).not.toBe(totpAt(SECRET, 1111111109 + 30));
    });

    // Ten seconds into a step, so the arithmetic below is exact.
    const mid = (37037037 * 30 + 10) * 1000;
    const step = totpStep(mid);

    it('offers the current step, or the next one when the current is used up, and none when both are', () => {
        expect(freshTotp(SECRET, mid)).toEqual({ code: totpCode(SECRET, step), step });
        expect(freshTotp(SECRET, mid, step - 1)).toEqual({ code: totpCode(SECRET, step), step });
        expect(freshTotp(SECRET, mid, step)).toEqual({ code: totpCode(SECRET, step + 1), step: step + 1 });
        expect(freshTotp(SECRET, mid, step + 1)).toBeNull();
        expect(freshTotp(SECRET, mid, step + 7)).toBeNull();
    });

    it('makes a wrong code that is none of the codes the gateway would take around now', () => {
        const wrong = wrongTotp(SECRET, mid);
        expect(wrong).toMatch(/^\d{6}$/);
        for (const d of [-2, -1, 0, 1, 2]) expect(wrong).not.toBe(totpCode(SECRET, step + d));
    });

    const enrolPage = `<form><p class="note">Key: <code id="two-factor-secret" class="secret">${SECRET.match(/.{4}/g)!.join(' ')}</code></p></form>`;

    it('reads the secret off an enrol page without its spaces', () => {
        expect(twoFactorSecretFromPage(enrolPage)).toBe(SECRET);
        expect(twoFactorSecretFromPage(`<code class="secret" id="two-factor-secret">${SECRET.match(/.{4}/g)!.join(' ')}</code>`)).toBe(SECRET);
    });

    it('reads no secret from a page without one, or one not in groups of four', () => {
        expect(twoFactorSecretFromPage('<p>no secret</p>')).toBeNull();
        expect(twoFactorSecretFromPage('<code id="two-factor-secret">')).toBeNull();
        expect(twoFactorSecretFromPage(`<code id="two-factor-secret">${SECRET}</code>`)).toBeNull();
        expect(twoFactorSecretFromPage('<code id="two-factor-secret">GEZD GEZD</code>')).toBeNull();
        expect(twoFactorSecretFromPage(enrolPage.toLowerCase())).toBeNull();
    });

    const codes = ['ABCD-EFGH-JKLM-NPQR', 'STUV-WXYZ-2345-6789', ...Array.from({ length: 8 }, (_, i) => `AAAA-BBBB-CCCC-DDD${i + 2}`)];
    const recoveryPage = `<ol id="recovery-codes" class="codes">${codes.map((c) => `<li>${c}</li>`).join('')}</ol>`
        + '<a id="two-factor-continue" class="link-button" href="/solAdmin?a=1&amp;b=2">Continue</a>';

    it('reads the recovery codes in page order and the Continue link, unescaped', () => {
        expect(recoveryCodesFromPage(recoveryPage)).toEqual(codes);
        expect(continueLinkFromPage(recoveryPage)).toBe('/solAdmin?a=1&b=2');
        expect(continueLinkFromPage('<a id="two-factor-continue" href="/">Continue</a>')).toBe('/');
    });

    it('reads none from a page without them', () => {
        expect(recoveryCodesFromPage('<p>nothing</p>')).toEqual([]);
        expect(recoveryCodesFromPage('<ol id="recovery-codes"></ol>')).toEqual([]);
        expect(continueLinkFromPage('<p>nothing</p>')).toBeNull();
        expect(continueLinkFromPage('<a id="two-factor-continue">Continue</a>')).toBeNull();
        expect(continueLinkFromPage('<a href="/">Continue</a>')).toBeNull();
    });

    it('accepts ten different codes in the gateway\'s shape', () => {
        expect(recoveryCodeProblems(codes)).toBe('');
    });

    it('names what is wrong with a recovery code list without repeating a code', () => {
        expect(recoveryCodeProblems(codes.slice(1))).toBe('want 10 recovery codes, got 9');
        expect(recoveryCodeProblems([...codes.slice(1), 'abcd-efgh-jklm-npqr'])).toBe('1 of the recovery codes are not XXXX-XXXX-XXXX-XXXX');
        expect(recoveryCodeProblems([...codes.slice(1), 'ABCD-EFGH-IJKL-NPQR'])).toBe('1 of the recovery codes are not XXXX-XXXX-XXXX-XXXX');
        expect(recoveryCodeProblems([...codes.slice(1), codes[1]])).toBe('the recovery codes are not all different');
        const message = [recoveryCodeProblems([...codes.slice(1), 'abcd-efgh-jklm-npqr']), recoveryCodeProblems([...codes.slice(1), codes[1]])].join(' ');
        for (const c of [...codes, 'abcd-efgh-jklm-npqr']) expect(message).not.toContain(c);
    });
});
