// Pure helpers for scripts/e2e.mjs: throwaway TLS material, the broker details
// and their file, the session-cookie rules, the sealed-store header, and the
// secret sweep and masking. No files, and the one helper that opens a socket
// (tlsFingerprint) dials only the address it is given, so
// tests/build/e2e-lib.test.ts covers them without Docker or a broker.
import { X509Certificate, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

// --- X.509 -------------------------------------------------------------------
// Just enough DER for a CA and the leaf certificate the run needs (the
// gateway's own, which the harness trusts). Node can sign but has no certificate builder,
// and an openssl binary or image would be one more pinned dependency per OS.

function derLength(n) {
    if (n < 0x80) return Buffer.from([n]);
    const bytes = [];
    for (let v = n; v > 0; v >>>= 8) bytes.unshift(v & 0xff);
    return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, ...parts) {
    const body = Buffer.concat(parts);
    return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

const seq = (...parts) => tlv(0x30, ...parts);
const set = (...parts) => tlv(0x31, ...parts);
// DER BOOLEAN TRUE. There is no FALSE: the two fields that take it (an
// extension's critical, basicConstraints' cA) DEFAULT FALSE, and DER omits a
// value equal to its default.
const TRUE = tlv(0x01, Buffer.from([0xff]));
const octets = (buf) => tlv(0x04, buf);
const bitString = (buf, unusedBits = 0) => tlv(0x03, Buffer.from([unusedBits]), buf);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const NULL = Buffer.from([0x05, 0x00]);

/**
 * A DER INTEGER from big-endian bytes that are already its minimal positive
 * form: a first byte from 0x01 to 0x7f, or the single byte of a small number.
 * The two callers give exactly that (the version, 2, and the serial, whose
 * first byte `certificate` masks into 0x40-0x7f), so there is no sign byte to
 * add and no leading zero to drop.
 */
function integer(buf) {
    return tlv(0x02, buf);
}

function oid(dotted) {
    const [a, b, ...rest] = dotted.split('.').map(Number);
    const out = [40 * a + b];
    for (const n of rest) {
        const chunk = [n & 0x7f];
        for (let v = n >>> 7; v > 0; v >>>= 7) chunk.unshift(0x80 | (v & 0x7f));
        out.push(...chunk);
    }
    return tlv(0x06, Buffer.from(out));
}

/** UTCTime through 2049, GeneralizedTime from 2050 (RFC 5280 section 4.1.2.5). */
function derTime(d) {
    const stamp = d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(stamp.slice(2))) : tlv(0x18, Buffer.from(stamp));
}

function ipv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
        throw new Error(`not an IPv4 address: ${ip}`);
    }
    return Buffer.from(parts);
}

const SHA256_WITH_RSA = seq(oid('1.2.840.113549.1.1.11'), NULL);
const commonName = (cn) => seq(set(seq(oid('2.5.4.3'), utf8(cn))));
const extension = (id, critical, value) => seq(oid(id), ...(critical ? [TRUE] : []), octets(value));

function pem(label, der) {
    return `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
}

function certificate({ subject, issuer, publicKey, signingKey, ca, dns, ip, now, days }) {
    const serial = randomBytes(16);
    serial[0] = (serial[0] & 0x7f) | 0x40; // positive and never zero
    const exts = [
        extension('2.5.29.19', true, ca ? seq(TRUE) : seq()),                   // basicConstraints
        extension('2.5.29.15', true, ca ? bitString(Buffer.from([0x06]), 1)            // keyCertSign, cRLSign
            : bitString(Buffer.from([0xa0]), 5)),                                       // digitalSignature, keyEncipherment
    ];
    if (!ca) exts.push(extension('2.5.29.37', false, seq(oid('1.3.6.1.5.5.7.3.1')))); // extKeyUsage serverAuth
    const names = [
        ...dns.map((d) => tlv(0x82, Buffer.from(d, 'ascii'))),
        ...ip.map((a) => tlv(0x87, ipv4(a))),
    ];
    if (names.length) exts.push(extension('2.5.29.17', false, seq(...names)));         // subjectAltName
    const tbs = seq(
        tlv(0xa0, integer(Buffer.from([2]))),                                           // v3
        integer(serial),
        SHA256_WITH_RSA,
        commonName(issuer),
        seq(derTime(new Date(now.getTime() - 3_600_000)), derTime(new Date(now.getTime() + days * 86_400_000))),
        commonName(subject),
        publicKey.export({ type: 'spki', format: 'der' }),
        tlv(0xa3, seq(...exts)),
    );
    return pem('CERTIFICATE', seq(tbs, SHA256_WITH_RSA, bitString(sign('sha256', tbs, signingKey))));
}

const rsaKeyPair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });

/**
 * A self-signed RSA CA, valid from an hour before `now` for `days`.
 * @param {string} cn
 * @param {{ now?: Date, days?: number }} [validity]
 */
export function makeCA(cn, { now = new Date(), days = 7 } = {}) {
    const { publicKey, privateKey } = rsaKeyPair();
    const certPem = certificate({ subject: cn, issuer: cn, publicKey, signingKey: privateKey, ca: true, dns: [], ip: [], now, days });
    return { cn, certPem, privateKey };
}

/**
 * A TLS server certificate signed by `ca`, with its PKCS#1 key, for the given names.
 * @param {ReturnType<typeof makeCA>} ca
 * @param {{ cn: string, dns?: string[], ip?: string[], now?: Date, days?: number }} names
 */
export function issueCert(ca, { cn, dns = [], ip = [], now = new Date(), days = 7 }) {
    const { publicKey, privateKey } = rsaKeyPair();
    const certPem = certificate({ subject: cn, issuer: ca.cn, publicKey, signingKey: ca.privateKey, ca: false, dns, ip, now, days });
    return { certPem, keyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }) };
}

/**
 * A TLS server certificate from `ca` that has expired: valid for one day,
 * ending 29 days before `now`. Same names and key shape as issueCert.
 * @param {ReturnType<typeof makeCA>} ca
 * @param {{ cn: string, dns?: string[], ip?: string[], now?: Date }} names
 */
export function issueExpiredCert(ca, { cn, dns = [], ip = [], now = new Date() }) {
    return issueCert(ca, { cn, dns, ip, now: new Date(now.getTime() - 30 * 86_400_000), days: 1 });
}

/**
 * The SHA-256 fingerprint of the first certificate in a PEM text, written as
 * the gateway shows it (GET /managed/tls: upper-case hex pairs joined by ":").
 * Throws, like pemCertificates, when there is no certificate.
 * @param {string} text
 */
export function certFingerprint(text) {
    return pemCertificates(text)[0].fingerprint256;
}

/**
 * The fingerprint (as certFingerprint writes it) of the certificate a TLS
 * server presents to a new connection. The handshake is not verified: which
 * certificate is served is the question, not who signed it. The connection is
 * closed as soon as the handshake ends and nothing is sent. Rejects when the
 * server cannot be reached or has not finished the handshake in `timeoutMs`.
 * @param {{ host: string, port: number, servername?: string, timeoutMs?: number }} server
 * @returns {Promise<string>}
 */
export function tlsFingerprint({ host, port, servername, timeoutMs = 10_000 }) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ host, port, servername, rejectUnauthorized: false }, () => {
            resolve(socket.getPeerCertificate().fingerprint256);
            socket.destroy();
        });
        socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`${host}:${port} did not finish a TLS handshake in ${timeoutMs} ms`)));
        socket.on('error', reject);
    });
}

/**
 * Every certificate in a PEM text, as X509Certificate; anything else in it (a
 * private key, say) is ignored. Throws when there is none or one does not parse.
 */
export function pemCertificates(text) {
    const blocks = String(text).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    if (!blocks.length) throw new Error('holds no PEM certificate (-----BEGIN CERTIFICATE-----)');
    return blocks.map((block, i) => {
        try {
            return new X509Certificate(block);
        } catch (e) {
            throw new Error(`certificate ${i + 1} does not parse: ${e.message}`);
        }
    });
}

// --- broker details ----------------------------------------------------------
// The run uses an existing broker and changes nothing on it. Its details come
// from E2E_* environment variables, then the details file, then a prompt.

const CONTROL = /[\u0000-\u001f\u007f]/;
// The gateway's own rule for a connection's hostname (go-web-proxy/store.go).
const HOST_NAME = /^[A-Za-z0-9_]([A-Za-z0-9_.-]{0,251}[A-Za-z0-9_])?$/;

// Each check returns why a value is refused, or ''. A secret's reason never
// repeats the value.
const plain = (v) => (v === '' ? 'is empty' : CONTROL.test(v) ? 'holds a control character' : '');
// An IPv6 zone (fe80::1%eth0) passes net.isIP but not the gateway's net.ParseIP.
const hostRule = (v) => plain(v)
    || ((net.isIP(v) && !v.includes('%')) || HOST_NAME.test(v) ? '' : `is not a host name (A-Z a-z 0-9 . _ -) or an IP address, without scheme or port: ${v}`);
const ipRule = (v) => (net.isIP(v) && !v.includes('%') ? '' : `is not an IP address: ${v}`);
const dnsRule = (v) => (dnsServers(v).every((s) => !ipRule(s)) ? '' : `is not a list of IP addresses separated by commas: ${v}`);
const portRule = (v) => (/^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 ? '' : `is not a port number (1-65535): ${v}`);
const sempUserRule = (v) => plain(v) || (v.includes(':') ? 'holds a ":", which a SEMP username cannot' : '');
// A VPN or queue name travels as one relay path segment, so it must pass the
// relay's own rule (safeSegment in go-web-proxy/relay.go), or check 3 would
// report the relay's designed refusal as a failure.
const segmentRule = (v) => plain(v)
    || (/[\\%;]/.test(v) || v.split('/').some((p) => p === '' || p === '.' || p === '..')
        ? `cannot go through the gateway's relay (no \\ % or ;, and no empty, . or .. part between slashes): ${v}` : '');
const flagRule = (v) => (v === '0' || v === '1' ? '' : `is not 0 or 1: ${v}`);

/**
 * What the run needs to know about the broker, in prompt order. A `secret` is
 * read without echo, masked in all output and never written to the details
 * file by the harness; `fallback` is the answer a prompt offers. An
 * `optional` detail is never asked for: unset, it takes its fallback.
 */
export const BROKER_FIELDS = [
    { key: 'host', env: 'E2E_BROKER_HOST', check: hostRule,
        label: "broker host the gateway containers dial; it must match the broker's TLS certificate (a broker on this machine: host.docker.internal)" },
    { key: 'brokerAddr', env: 'E2E_BROKER_ADDR', fallback: '', optional: true, check: hostRule,
        label: 'IP address or DNS name both gateway containers map E2E_BROKER_HOST to (a host alias), for a name they cannot resolve' },
    { key: 'dns', env: 'E2E_DNS', fallback: '', optional: true, check: dnsRule,
        label: 'DNS server addresses, separated by commas: both gateway containers resolve through them, and so does the harness for an E2E_BROKER_ADDR name' },
    { key: 'caFile', env: 'E2E_BROKER_CA', check: plain,
        label: "PEM file with the CA that signed the broker's TLS certificate, or that certificate itself" },
    { key: 'sempPort', env: 'E2E_SEMP_PORT', fallback: '1943', check: portRule, label: 'SEMP over TLS port' },
    { key: 'sempUser', env: 'E2E_SEMP_USER', fallback: 'admin', check: sempUserRule, label: 'SEMP username (read-only access is enough)' },
    { key: 'sempPassword', env: 'E2E_SEMP_PASSWORD', secret: true, check: plain, label: 'SEMP password' },
    { key: 'smfPort', env: 'E2E_SMF_PORT', fallback: '1443', check: portRule, label: 'secured web transport (wss) port' },
    { key: 'vpn', env: 'E2E_VPN', fallback: 'default', check: segmentRule, label: 'message VPN' },
    { key: 'clientUser', env: 'E2E_CLIENT_USER', check: plain, label: 'client username in that VPN' },
    { key: 'clientPassword', env: 'E2E_CLIENT_PASSWORD', secret: true, check: plain, label: 'client password' },
    { key: 'queue', env: 'E2E_QUEUE', check: segmentRule,
        label: 'existing queue in that VPN the client username may browse (nothing is consumed)' },
    { key: 'insecure', env: 'E2E_INSECURE', fallback: '0', optional: true, check: flagRule,
        label: "1: the gateways skip verifying the broker's TLS certificate (SMU_SSL_SKIP_CERT_VERIFY, the e2e stack only)" },
    { key: 'browser', env: 'E2E_BROWSER', fallback: '1', optional: true, check: flagRule,
        label: '0: skip the browser checks B1-B9 and D4 and do not start the browser container' },
];

// Details that changed name: the old one is refused with the new one named,
// since an ignored alias would only show later, as a broker nothing reaches.
/** @type {Record<string, string>} */
const RENAMED = { E2E_BROKER_IP: 'E2E_BROKER_ADDR' };

/**
 * The KEY=value lines of a details file as { values, lines }, keyed by the
 * env name. Blank lines and '#' comments are skipped, keys and values are
 * trimmed, and an empty value counts as unset. Throws on a line without '=',
 * an unknown, renamed or repeated key, naming the line but never its value.
 */
export function parseDetailsFile(text, name) {
    const known = BROKER_FIELDS.map((f) => f.env);
    const values = {};
    const lines = {};
    String(text).split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        const where = `${name} line ${i + 1}`;
        const eq = line.indexOf('=');
        if (eq < 1) throw new Error(`${where}: want KEY=value`);
        const key = line.slice(0, eq).trim();
        if (key in RENAMED) throw new Error(`${where}: ${key} is now ${RENAMED[key]}; rename the key`);
        if (!known.includes(key)) throw new Error(`${where}: unknown key ${key}; the keys are ${known.join(', ')}`);
        if (key in lines) throw new Error(`${where}: ${key} is already set on line ${lines[key]}`);
        lines[key] = i + 1;
        const value = line.slice(eq + 1).trim();
        if (value) values[key] = value;
    });
    return { values, lines };
}

/**
 * Each broker detail from the environment, else the parsed details file:
 * { values, missing, errors }. `values` is keyed by field key; `missing`
 * lists the fields neither gives, each with the answer to offer (an optional
 * one takes its fallback instead); `errors`
 * names where each refused value came from, and each renamed variable the
 * environment still sets under its old name.
 */
export function resolveDetails(env, file = { values: {}, lines: {} }, fileName = 'the details file') {
    /** @type {Record<string, string>} */
    const values = {};
    const missing = [];
    const errors = [];
    for (const f of BROKER_FIELDS) {
        const fromEnv = env[f.env] ?? '';
        const raw = fromEnv || (file.values[f.env] ?? '');
        if (!raw) {
            if (f.optional) values[f.key] = f.fallback;
            else missing.push({ ...f, offer: f.fallback ?? '' });
            continue;
        }
        const problem = f.check(raw);
        if (problem) errors.push(`${f.env} (${fromEnv ? 'environment' : `${fileName} line ${file.lines[f.env]}`}) ${problem}`);
        else values[f.key] = raw;
    }
    for (const [old, now] of Object.entries(RENAMED)) {
        if (env[old]) errors.push(`${old} (environment) is now ${now}; set that instead`);
    }
    return { values, missing, errors };
}

/**
 * Why E2E_BROKER_ADDR cannot alias this host, or '': an alias maps a name, so
 * the host must be one (the name in the broker's certificate), not an address.
 */
export function hostAliasProblem(host, addr) {
    return addr && net.isIP(host)
        ? `E2E_BROKER_ADDR needs E2E_BROKER_HOST to be a name in the broker's certificate, not an address: ${host}` : '';
}

/** The server addresses of an E2E_DNS value, in order; none when it is unset. */
export function dnsServers(value) {
    return value ? value.split(',').map((s) => s.trim()) : [];
}

/**
 * The IP address a host alias maps to: E2E_BROKER_ADDR itself when it is one,
 * else the address `lookup` finds for that name, because a compose extra_hosts
 * entry takes an address only. `lookup` is dns.promises.lookup (this machine's
 * resolver) or resolverLookup over the E2E_DNS servers, and `asked` names it
 * for the error. Throws, naming the variable, when the name does not resolve,
 * or resolves to an address the gateway would not parse (an IPv6 zone).
 * @param {string} addr
 * @param {(name: string) => Promise<{ address: string }>} lookup
 * @param {string} [asked]
 */
export async function aliasAddress(addr, lookup, asked = "this machine's resolver") {
    if (net.isIP(addr)) return addr;
    let found;
    try {
        found = (await lookup(addr)).address;
    } catch (e) {
        throw new Error(`E2E_BROKER_ADDR ${addr} does not resolve (${e.code ?? e.message}, asked ${asked}): give an IP address, or a name that resolver knows`);
    }
    if (ipRule(found)) throw new Error(`E2E_BROKER_ADDR ${addr} resolved to ${found}, which the gateway containers cannot use: give an IP address instead`);
    return found;
}

/**
 * A lookup for aliasAddress that asks `resolver` (a dns.promises.Resolver set
 * to the E2E_DNS servers) instead of this machine's resolver: the name's
 * first A record, else its first AAAA record. A name with neither rejects
 * with the AAAA query's error.
 * @param {{ resolve4: (name: string) => Promise<string[]>, resolve6: (name: string) => Promise<string[]> }} resolver
 */
export function resolverLookup(resolver) {
    return async (name) => {
        const found = await resolver.resolve4(name).catch(() => resolver.resolve6(name));
        return { address: found[0] };
    };
}

/**
 * The compose override that says how both gateway containers (`gateway` and
 * `direct`) find the broker: `host` mapped to `ip` when there is an alias
 * (extra_hosts, as docker/docker-compose.e2e.yaml does for
 * host.docker.internal), and `dns` as their resolvers when E2E_DNS names any.
 * JSON is YAML; every value has passed its rule, so none holds a quote, a
 * colon in the name, or a line break.
 */
export function resolutionOverride(host, ip, dns = []) {
    const service = { ...(ip ? { extra_hosts: [`${host}:${ip}`] } : {}), ...(dns.length ? { dns } : {}) };
    return `${JSON.stringify({ services: { gateway: service, direct: service } }, null, 2)}\n`;
}

const DETAILS_FILE_HEADER = [
    '# Broker details for ./scripts/dev.sh e2e (scripts/e2e.mjs). Git-ignored:',
    '# never commit it. One KEY=value per line; an E2E_* environment variable',
    '# overrides its line. The harness adds what it had to ask for, except the',
    '# passwords: set E2E_SEMP_PASSWORD and E2E_CLIENT_PASSWORD here yourself',
    '# to skip those prompts, and keep the file private.',
];

/**
 * The details file text with `additions` ({ ENV: value }) written in: an
 * existing empty `KEY=` line is filled, anything else is appended. A new file
 * (existing empty or absent) starts with the header. Line endings become LF.
 */
export function detailsFileText(existing, additions) {
    const lines = existing ? existing.replace(/\r?\n$/, '').split(/\r?\n/) : [...DETAILS_FILE_HEADER];
    for (const [key, value] of Object.entries(additions)) {
        const blank = lines.findIndex((l) => l.replace(/\s+/g, '') === `${key}=`);
        if (blank >= 0) lines[blank] = `${key}=${value}`;
        else lines.push(`${key}=${value}`);
    }
    return `${lines.join('\n')}\n`;
}

// --- cookies -----------------------------------------------------------------

export const SESSION_COOKIE = '__Host-smu-session';
export const SIGNIN_COOKIE = '__Host-smu-signin';

/** One Set-Cookie line as { name, value, attrs }, attribute names lower-cased; null when it has no name=value. */
export function parseSetCookie(line) {
    const [pair, ...rest] = String(line).split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) return null;
    const attrs = {};
    for (const part of rest) {
        const t = part.trim();
        if (!t) continue;
        const i = t.indexOf('=');
        if (i < 0) attrs[t.toLowerCase()] = true;
        else attrs[t.slice(0, i).trim().toLowerCase()] = t.slice(i + 1).trim();
    }
    return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), attrs };
}

/** A cookie jar for one client: an empty value or Max-Age=0 removes the cookie. */
export function createCookieJar() {
    const cookies = new Map();
    return {
        store(lines = []) {
            for (const line of lines) {
                const c = parseSetCookie(line);
                if (!c) continue;
                if (c.value === '' || c.attrs['max-age'] === '0') cookies.delete(c.name);
                else cookies.set(c.name, c.value);
            }
        },
        get: (name) => cookies.get(name),
        header: () => [...cookies].map(([n, v]) => `${n}=${v}`).join('; '),
    };
}

/**
 * What is wrong with one of the gateway's cookies in a response's Set-Cookie
 * lines; empty when it is right: exactly one cookie of that name with a value,
 * Secure, HttpOnly, the SameSite value wanted, Path=/, no Domain, and no
 * Max-Age or Expires (it lasts the browser session).
 */
function cookieProblems(lines, name, sameSite) {
    const found = lines.map(parseSetCookie).filter((c) => c && c.name === name);
    if (found.length !== 1) return [`want one ${name} cookie, got ${found.length}`];
    const { value, attrs } = found[0];
    const problems = [];
    if (!value) problems.push('empty value');
    if (attrs.secure !== true) problems.push('not Secure');
    if (attrs.httponly !== true) problems.push('not HttpOnly');
    if (String(attrs.samesite).toLowerCase() !== sameSite.toLowerCase()) problems.push(`SameSite=${attrs.samesite ?? '(absent)'}, want ${sameSite}`);
    if (attrs.path !== '/') problems.push(`Path=${attrs.path ?? '(absent)'}, want /`);
    if ('domain' in attrs) problems.push('has a Domain');
    if ('max-age' in attrs || 'expires' in attrs) problems.push('outlives the browser session (Max-Age or Expires)');
    return problems;
}

/** The session cookie: SameSite=Lax. */
export const sessionCookieProblems = (lines = []) => cookieProblems(lines, SESSION_COOKIE, 'Lax');

/** The sign-in ticket cookie of a half-finished sign-in (a code or a set-up is due): SameSite=Strict. */
export const signinCookieProblems = (lines = []) => cookieProblems(lines, SIGNIN_COOKIE, 'Strict');

// --- stores ------------------------------------------------------------------

const STORE_ROLES = { users: 1, connections: 2 };

/**
 * Why `buf` is not a sealed store file of `role` ('users' or 'connections');
 * empty when it is. The header is "SMUS", format version 1, then the role byte
 * (go-web-proxy/storecrypt.go).
 */
export function sealedHeaderProblem(buf, role) {
    if (!(role in STORE_ROLES)) throw new Error(`unknown store role: ${role}`);
    const want = Buffer.from([0x53, 0x4d, 0x55, 0x53, 0x01, STORE_ROLES[role]]);
    const got = buf.subarray(0, want.length);
    return got.equals(want) ? '' : `header ${got.toString('hex') || '(empty)'}, want ${want.toString('hex')}`;
}

// --- secrets -----------------------------------------------------------------

// Shorter values are left alone by default: masking a word like "admin" would
// mangle ordinary output, and every generated secret is longer. A secret the
// user gave is masked at any length (min: 1); the sweeps skip a short one,
// which would match ordinary text.
export const MIN_MASKED = 8;

/** `text` with every secret value replaced by [masked], longest first so an overlap is masked whole. */
export function maskSecrets(text, secrets, { min = MIN_MASKED } = {}) {
    const values = [...new Set(Object.values(secrets))]
        .filter((v) => typeof v === 'string' && v.length >= min)
        .sort((a, b) => b.length - a.length);
    let out = String(text);
    for (const v of values) out = out.split(v).join('[masked]');
    return out;
}

/**
 * Where a JSON text carries a forbidden key, or a string value equal to a
 * forbidden one, at any depth: ['key "pass"', 'value "host"'], each once.
 * @param {string} text
 * @param {{ keys?: string[], values?: string[] }} [forbidden]
 */
export function jsonFindings(text, { keys = [], values = [] } = {}) {
    const found = new Set();
    const walk = (v) => {
        if (typeof v === 'string') {
            if (values.includes(v)) found.add(`value ${JSON.stringify(v)}`);
        } else if (Array.isArray(v)) {
            v.forEach(walk);
        } else if (v && typeof v === 'object') {
            for (const [k, x] of Object.entries(v)) {
                if (keys.includes(k)) found.add(`key ${JSON.stringify(k)}`);
                walk(x);
            }
        }
    };
    walk(JSON.parse(text));
    return [...found];
}

/** The tokens that occur in `text`. */
export function findTokens(text, tokens) {
    const s = String(text);
    return tokens.filter((t) => t && s.includes(t));
}

/**
 * Every place a secret occurs in the recorded responses, as "<name> in the
 * <headers|body> of <label>", except where allow(record, name, where) says it
 * belongs. A record is { label, headers, body } with the headers as raw text.
 * @param {Array<{ label: string, headers?: string, body?: string }>} records
 * @param {Record<string, string | undefined>} secrets
 * @param {(record: { label: string, headers?: string, body?: string }, name: string, where: string) => boolean} [allow]
 */
export function sweepSecrets(records, secrets, allow = () => false) {
    const hits = [];
    for (const record of records) {
        for (const [name, value] of Object.entries(secrets)) {
            if (!value) continue;
            for (const where of ['headers', 'body']) {
                if (String(record[where] ?? '').includes(value) && !allow(record, name, where)) {
                    hits.push(`${name} in the ${where} of ${record.label}`);
                }
            }
        }
    }
    return hits;
}

// The audit trail's entry fields, in the order the gateway writes them
// (go-web-proxy/audit.go); the first six are always present.
const AUDIT_FIELDS = ['time', 'actor', 'client', 'action', 'target', 'outcome', 'code', 'changed', 'wrote', 'msg'];
const AUDIT_REQUIRED = ['time', 'actor', 'client', 'action', 'outcome', 'msg'];
const RFC3339_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

/**
 * The lines of an audit log as entries, and what is wrong with any of them:
 * not a JSON object, a field the gateway does not write, a field out of
 * order, a missing required field, a time that is not RFC 3339 UTC, an
 * outcome other than ok or refused.
 * @param {string} text
 * @returns {{ entries: Array<Record<string, any>>, problems: string[] }}
 */
export function parseAuditLog(text) {
    const entries = [];
    const problems = [];
    String(text).split('\n').forEach((line, i) => {
        if (!line.trim()) return;
        const at = `line ${i + 1}`;
        let e;
        try {
            e = JSON.parse(line);
        } catch {
            problems.push(`${at} is not JSON`);
            return;
        }
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
            problems.push(`${at} is not a JSON object`);
            return;
        }
        const keys = Object.keys(e);
        const unknown = keys.filter((k) => !AUDIT_FIELDS.includes(k));
        const missing = AUDIT_REQUIRED.filter((k) => !keys.includes(k));
        if (unknown.length) problems.push(`${at} has unknown field(s) ${unknown.join(', ')}`);
        if (missing.length) problems.push(`${at} lacks ${missing.join(', ')}`);
        const order = keys.filter((k) => AUDIT_FIELDS.includes(k)).map((k) => AUDIT_FIELDS.indexOf(k));
        if (order.some((v, j) => j > 0 && v < order[j - 1])) problems.push(`${at} has its fields out of order: ${keys.join(', ')}`);
        if (typeof e.time === 'string' && !RFC3339_UTC.test(e.time)) problems.push(`${at} has time ${e.time}, not RFC 3339 UTC`);
        if (keys.includes('outcome') && e.outcome !== 'ok' && e.outcome !== 'refused') problems.push(`${at} has outcome ${e.outcome}`);
        entries.push(e);
    });
    return { entries, problems };
}

/**
 * Whether an audit entry's `wrote` list names `file`: a store file with the
 * seq its commit gave it (a whole number from 1), or config.yaml, which has no
 * seq (its rev is a checksum) and so must carry none.
 * @param {Record<string, any>} entry
 * @param {string} file
 * @returns {boolean}
 */
export function wroteFile(entry, file) {
    return Array.isArray(entry.wrote) && entry.wrote.some((w) => w?.file === file
        && (file === 'config.yaml' ? w.seq === undefined : Number.isInteger(w.seq) && w.seq >= 1));
}

/**
 * What the e2e run must have left in the audit log: a refused sign-in with
 * code bad_credentials and an ok one for `user`, a settings.update naming each
 * of `settingsKeys`, and backup.export and backup.import entries, all ok; and
 * the files the changes wrote: the ok user.create of `user` wrote users.yaml
 * at a seq, an ok settings.update wrote config.yaml, and an ok backup.import
 * wrote users.yaml, connections.yaml and config.yaml. With `twoFactorUser`
 * (the user checks 24 to 27 enrolled and an administrator reset) it also
 * wants: an ok twofactor.enrol for that user and an ok user.twofactor.reset of
 * that user by an administrator, each having written users.yaml at a seq, and
 * a refused signin with code bad_code. With `tls` (checks 28 to 31) it wants an
 * ok tls.certificate.replace and an ok gateway.restart, each by admin, the
 * replace's message naming a subject and an expiry and holding no PEM text;
 * and, when `tls.trustFile` names the CA file the run deleted and added back,
 * an ok tls.trust.add and tls.trust.remove of that file.
 * @param {Array<Record<string, any>>} entries
 * @param {{ user: string, settingsKeys: string[], twoFactorUser?: string, tls?: { trustFile?: string } }} want
 * @returns {string[]} what is missing
 */
export function auditMissing(entries, { user, settingsKeys, twoFactorUser, tls: tlsChecks }) {
    const has = (pred) => entries.some(pred);
    const missing = [];
    // A refused sign-in has no actor (nobody signed in); its target is the account tried.
    if (!has((e) => e.action === 'signin' && e.outcome === 'refused' && e.code === 'bad_credentials' && e.actor === '' && e.target === user)) {
        missing.push(`a refused signin for ${user} with code bad_credentials`);
    }
    if (!has((e) => e.action === 'signin' && e.outcome === 'ok' && e.actor === user)) missing.push(`an ok signin for ${user}`);
    for (const key of settingsKeys) {
        if (!has((e) => e.action === 'settings.update' && e.outcome === 'ok' && Array.isArray(e.changed) && e.changed.includes(key))) {
            missing.push(`an ok settings.update naming ${key}`);
        }
    }
    for (const action of ['backup.export', 'backup.import']) {
        if (!has((e) => e.action === action && e.outcome === 'ok')) missing.push(`an ok ${action}`);
    }
    if (!has((e) => e.action === 'user.create' && e.outcome === 'ok' && e.target === user && wroteFile(e, 'users.yaml'))) {
        missing.push(`an ok user.create for ${user} that wrote users.yaml with a seq`);
    }
    if (!has((e) => e.action === 'settings.update' && e.outcome === 'ok' && wroteFile(e, 'config.yaml'))) {
        missing.push('an ok settings.update that wrote config.yaml');
    }
    if (!has((e) => e.action === 'backup.import' && e.outcome === 'ok'
        && ['users.yaml', 'connections.yaml', 'config.yaml'].every((f) => wroteFile(e, f)))) {
        missing.push('an ok backup.import that wrote users.yaml, connections.yaml and config.yaml');
    }
    if (twoFactorUser) {
        if (!has((e) => e.action === 'twofactor.enrol' && e.outcome === 'ok' && e.target === twoFactorUser && wroteFile(e, 'users.yaml'))) {
            missing.push(`an ok twofactor.enrol for ${twoFactorUser} that wrote users.yaml with a seq`);
        }
        if (!has((e) => e.action === 'user.twofactor.reset' && e.outcome === 'ok' && e.actor === 'admin' && e.target === twoFactorUser && wroteFile(e, 'users.yaml'))) {
            missing.push(`an ok user.twofactor.reset of ${twoFactorUser} by admin that wrote users.yaml with a seq`);
        }
        if (!has((e) => e.action === 'signin' && e.outcome === 'refused' && e.code === 'bad_code')) missing.push('a refused signin with code bad_code');
    }
    if (tlsChecks) {
        if (!has((e) => e.action === 'tls.certificate.replace' && e.outcome === 'ok' && e.actor === 'admin'
            && /\(subject .+, expires \d{4}-/.test(e.msg) && !/-----|PRIVATE KEY/.test(e.msg))) {
            missing.push('an ok tls.certificate.replace by admin whose message names the subject and the expiry and holds no key');
        }
        if (!has((e) => e.action === 'gateway.restart' && e.outcome === 'ok' && e.actor === 'admin')) missing.push('an ok gateway.restart by admin');
        if (tlsChecks.trustFile) {
            for (const action of ['tls.trust.add', 'tls.trust.remove']) {
                if (!has((e) => e.action === action && e.outcome === 'ok' && e.actor === 'admin' && e.target === tlsChecks.trustFile)) {
                    missing.push(`an ok ${action} of ${tlsChecks.trustFile} by admin`);
                }
            }
        }
    }
    return missing;
}

/**
 * The rev of one record in a list answer ({ users: [...] }, { connections: [...] }),
 * as the admin console reads it before a save.
 * @param {string} text the response body
 * @param {string} list the key that holds the array
 * @param {string} key the field that names a record ("username", "broker")
 * @param {string} name
 * @returns {number | null} null when the record is absent or carries no whole-number rev from 1
 */
export function listedRev(text, list, key, name) {
    let rows;
    try {
        rows = JSON.parse(text)?.[list];
    } catch {
        return null;
    }
    const row = Array.isArray(rows) ? rows.find((r) => r?.[key] === name) : undefined;
    return Number.isInteger(row?.rev) && row.rev >= 1 ? row.rev : null;
}

/**
 * What is wrong with an answer that should be a refusal: another status, another
 * error code, or (when `want` has a rev) another current rev in the body. Empty
 * when it is as wanted.
 * @param {{ status: number, body: string }} res
 * @param {{ status: number, error: string, rev?: number | string }} want
 * @returns {string}
 */
export function refusalProblem(res, want) {
    let body = null;
    try {
        body = JSON.parse(res.body);
    } catch {
        // not JSON: reported below with the text
    }
    const got = `${res.status} ${String(res.body).slice(0, 200)}`;
    if (res.status !== want.status || body?.error !== want.error) return `want ${want.status} ${want.error}, got ${got}`;
    if ('rev' in want && body.rev !== want.rev) return `want ${want.error} carrying rev ${want.rev}, got ${got}`;
    return '';
}

/**
 * The sections whose version differs between the basis a preview gave and the
 * basis the gateway names in a stale refusal.
 * @param {Record<string, unknown>} seen
 * @param {Record<string, unknown>} now
 * @returns {string[]} users, connections and/or settings
 */
export function basisMoved(seen, now) {
    return ['users', 'connections', 'settings'].filter((k) => seen?.[k] !== now?.[k]);
}

/**
 * One record of a list answer ({ users: [...] }, { connections: [...] }), as
 * the admin console reads it.
 * @param {string} text the response body
 * @param {string} list the key that holds the array
 * @param {string} key the field that names a record ("username", "broker")
 * @param {string} name
 * @returns {Record<string, any> | null} null when the record is absent or the answer is not a list
 */
export function listedRow(text, list, key, name) {
    let rows;
    try {
        rows = JSON.parse(text)?.[list];
    } catch {
        return null;
    }
    return (Array.isArray(rows) ? rows.find((r) => r?.[key] === name) : undefined) ?? null;
}

// --- two-factor sign-in --------------------------------------------------------
// TOTP as RFC 6238 gives it for the gateway: HMAC-SHA-1, 6 digits, 30 s steps,
// T0 = 0, the secret as unpadded upper-case base32. The gateway accepts the
// step now and one either side, and refuses a step at or below the last one it
// accepted for the user. The page readers hold to the ids the sign-in pages
// carry (go-web-proxy/pages/login.html).

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;

/** The bytes of an unpadded upper-case base32 text (RFC 4648). Throws on any other character. */
export function base32Decode(text) {
    let bits = 0;
    let acc = 0;
    const out = [];
    for (const ch of String(text)) {
        const v = BASE32.indexOf(ch);
        if (v < 0) throw new Error(`not base32 (A-Z 2-7): ${JSON.stringify(ch)}`);
        acc = (acc << 5) | v;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out.push((acc >>> bits) & 0xff);
            acc &= (1 << bits) - 1;
        }
    }
    return Buffer.from(out);
}

/** The 30-second step a time in milliseconds falls in. */
export const totpStep = (ms) => Math.floor(ms / 1000 / TOTP_STEP_SECONDS);

/** The 6-digit code of a base32 secret for a step number. */
export function totpCode(secret, step) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const o = h[h.length - 1] & 0x0f;
    const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(bin % 1_000_000).padStart(6, '0');
}

/** The code for a time in seconds since the epoch (the RFC's test vectors are given that way). */
export const totpAt = (secret, seconds) => totpCode(secret, Math.floor(seconds / TOTP_STEP_SECONDS));

/**
 * A code the gateway will accept now and has not accepted yet: the current
 * step, or the next one when the current is used up (steps at or below
 * `lastStep` are refused). null when even the next step is used up, so the
 * caller waits for the clock. A wait is at most one step.
 * @param {string} secret
 * @param {number} nowMs
 * @param {number} [lastStep] the last step the gateway accepted, -1 for none
 * @returns {{ code: string, step: number } | null}
 */
export function freshTotp(secret, nowMs, lastStep = -1) {
    const now = totpStep(nowMs);
    const step = Math.max(now, lastStep + 1);
    return step > now + 1 ? null : { code: totpCode(secret, step), step };
}

/** A 6-digit code that is none of the codes of the steps around now, so it is refused whatever the clock skew. */
export function wrongTotp(secret, nowMs) {
    const now = totpStep(nowMs);
    const near = new Set([-2, -1, 0, 1, 2].map((d) => totpCode(secret, now + d)));
    // Six candidates against at most five codes: one is always free.
    return ['000000', '000001', '000002', '000003', '000004', '000005'].find((code) => !near.has(code));
}

const TAG = (id, tagName) => new RegExp(`<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`);
const unescapeHtml = (t) => t.replace(/&(amp|lt|gt|quot|#34|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#34': '"', '#39': "'" })[e]);

/**
 * The secret an enrol page shows in <code id="two-factor-secret">: eight
 * groups of four base32 characters separated by single spaces, returned
 * without the spaces. null when the page has none or it is not in that shape.
 */
export function twoFactorSecretFromPage(html) {
    const m = /<code\b[^>]*\bid="two-factor-secret"[^>]*>([^<]*)<\/code>/.exec(String(html));
    const text = m ? unescapeHtml(m[1]).trim() : '';
    return /^[A-Z2-7]{4}( [A-Z2-7]{4}){7}$/.test(text) ? text.replace(/ /g, '') : null;
}

/** The <li> texts of the recovery page's <ol id="recovery-codes">; an empty list when the page has none. */
export function recoveryCodesFromPage(html) {
    const m = /<ol\b[^>]*\bid="recovery-codes"[^>]*>([\s\S]*?)<\/ol>/.exec(String(html));
    return m ? [...m[1].matchAll(/<li>([^<]*)<\/li>/g)].map((x) => unescapeHtml(x[1]).trim()) : [];
}

const RECOVERY_SHAPE = /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/;

/** Why a recovery code list is not what the gateway shows (ten distinct XXXX-XXXX-XXXX-XXXX codes), or ''. Never repeats a code. */
export function recoveryCodeProblems(codes) {
    if (codes.length !== 10) return `want 10 recovery codes, got ${codes.length}`;
    const bad = codes.filter((c) => !RECOVERY_SHAPE.test(c)).length;
    if (bad) return `${bad} of the recovery codes are not XXXX-XXXX-XXXX-XXXX`;
    return new Set(codes).size === codes.length ? '' : 'the recovery codes are not all different';
}

/** The href of the recovery page's <a id="two-factor-continue">; null when the page has no such link. */
export function continueLinkFromPage(html) {
    const tag = TAG('two-factor-continue', 'a').exec(String(html));
    const href = tag ? /\bhref="([^"]*)"/.exec(tag[0]) : null;
    return href ? unescapeHtml(href[1]) : null;
}
