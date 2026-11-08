// Pure helpers for scripts/e2e.mjs: throwaway TLS material, the broker details
// and their file, the session-cookie rules, the sealed-store header, and the
// secret sweep and masking. No network and no files, so
// tests/build/e2e-lib.test.ts covers them without Docker or a broker.
import { X509Certificate, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import net from 'node:net';

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
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octets = (buf) => tlv(0x04, buf);
const bitString = (buf, unusedBits = 0) => tlv(0x03, Buffer.from([unusedBits]), buf);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const NULL = Buffer.from([0x05, 0x00]);

/** An unsigned big-endian number as a DER INTEGER (a leading 0x00 keeps it positive). */
function integer(buf) {
    let b = buf;
    while (b.length > 1 && b[0] === 0x00 && b[1] < 0x80) b = b.subarray(1);
    if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
    return tlv(0x02, b);
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
const extension = (id, critical, value) => seq(oid(id), ...(critical ? [bool(true)] : []), octets(value));

function pem(label, der) {
    return `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
}

function certificate({ subject, issuer, publicKey, signingKey, ca, dns, ip, now, days }) {
    const serial = randomBytes(16);
    serial[0] = (serial[0] & 0x7f) | 0x40; // positive and never zero
    const exts = [
        extension('2.5.29.19', true, ca ? seq(bool(true)) : seq()),                   // basicConstraints
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

/** A self-signed RSA CA, valid from an hour before `now` for `days`. */
export function makeCA(cn, { now = new Date(), days = 7 } = {}) {
    const { publicKey, privateKey } = rsaKeyPair();
    const certPem = certificate({ subject: cn, issuer: cn, publicKey, signingKey: privateKey, ca: true, dns: [], ip: [], now, days });
    return { cn, certPem, privateKey };
}

/** A TLS server certificate signed by `ca`, with its PKCS#1 key, for the given names. */
export function issueCert(ca, { cn, dns = [], ip = [], now = new Date(), days = 7 }) {
    const { publicKey, privateKey } = rsaKeyPair();
    const certPem = certificate({ subject: cn, issuer: ca.cn, publicKey, signingKey: ca.privateKey, ca: false, dns, ip, now, days });
    return { certPem, keyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }) };
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

/** Go's Linux root bundles (crypto/x509/root_linux.go), in its order; the last is also macOS's. */
export const HOST_ROOT_FILES = [
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/ca-bundle.pem',
    '/etc/pki/tls/cacert.pem',
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
    '/etc/ssl/cert.pem',
];

/**
 * The host's standard root bundle, as Go on the host would load it: the first
 * of HOST_ROOT_FILES that `read` returns text for (null when it cannot), kept
 * verbatim. A host with none of them (Windows) gets `fallback`, Node's bundled
 * Mozilla roots. `count` is the number of certificates, for the run's output.
 */
export function hostRootBundle(read, fallback) {
    for (const from of HOST_ROOT_FILES) {
        const text = read(from);
        if (text != null) return { from, text, count: (text.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length };
    }
    return { from: "Node's bundled Mozilla roots (no system bundle on this host)", text: `${fallback.join('\n')}\n`, count: fallback.length };
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
        label: "broker host the gateway container dials; it must match the broker's TLS certificate (a broker on this machine: host.docker.internal)" },
    { key: 'brokerIp', env: 'E2E_BROKER_IP', fallback: '', optional: true, check: ipRule,
        label: 'address the gateway container maps E2E_BROKER_HOST to (a host alias), for a name it cannot resolve' },
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
        label: "1: the gateway skips verifying the broker's TLS certificate (SSL_INSECURE_SKIP_VERIFY, the e2e stack only)" },
    { key: 'browser', env: 'E2E_BROWSER', fallback: '1', optional: true, check: flagRule,
        label: '0: skip the browser checks B1-B8 and do not start the browser container' },
];

/**
 * The KEY=value lines of a details file as { values, lines }, keyed by the
 * env name. Blank lines and '#' comments are skipped, keys and values are
 * trimmed, and an empty value counts as unset. Throws on a line without '=',
 * an unknown key or a repeated one, naming the line but never its value.
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
 * names where each refused value came from.
 */
export function resolveDetails(env, file = { values: {}, lines: {} }, fileName = 'the details file') {
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
    return { values, missing, errors };
}

/**
 * Why E2E_BROKER_IP cannot alias this host, or '': an alias maps a name, so
 * the host must be one (the name in the broker's certificate), not an address.
 */
export function hostAliasProblem(host, ip) {
    return ip && net.isIP(host)
        ? `E2E_BROKER_IP needs E2E_BROKER_HOST to be a name in the broker's certificate, not an address: ${host}` : '';
}

/**
 * The compose override that maps `host` to `ip` inside the gateway container,
 * as docker/docker-compose.e2e.yaml's extra_hosts does for
 * host.docker.internal. JSON is YAML; both values have passed their rules, so
 * neither holds a quote, a colon in the name, or a line break.
 */
export function hostAliasOverride(host, ip) {
    return `${JSON.stringify({ services: { gateway: { extra_hosts: [`${host}:${ip}`] } } }, null, 2)}\n`;
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
 * What is wrong with the gateway's sign-in cookie in a response's Set-Cookie
 * lines; empty when it is right: exactly one __Host-smu-session with a value,
 * Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, and no Max-Age or Expires
 * (it lasts the browser session).
 */
export function sessionCookieProblems(lines = []) {
    const found = lines.map(parseSetCookie).filter((c) => c && c.name === SESSION_COOKIE);
    if (found.length !== 1) return [`want one ${SESSION_COOKIE} cookie, got ${found.length}`];
    const { value, attrs } = found[0];
    const problems = [];
    if (!value) problems.push('empty value');
    if (attrs.secure !== true) problems.push('not Secure');
    if (attrs.httponly !== true) problems.push('not HttpOnly');
    if (String(attrs.samesite).toLowerCase() !== 'lax') problems.push(`SameSite=${attrs.samesite ?? '(absent)'}, want Lax`);
    if (attrs.path !== '/') problems.push(`Path=${attrs.path ?? '(absent)'}, want /`);
    if ('domain' in attrs) problems.push('has a Domain');
    if ('max-age' in attrs || 'expires' in attrs) problems.push('outlives the browser session (Max-Age or Expires)');
    return problems;
}

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
