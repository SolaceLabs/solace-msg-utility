/**
 * The fake gateway's TLS console (go-web-proxy: `GET /managed/tls`, the
 * certificate check and replace, and the trusted-CA add and delete): the
 * gateway's certificate and the broker CA files, held in memory, behind the
 * same statuses, codes and shapes. Every change applies at once, as in the
 * gateway (a certificate swap, a CA rebuilt into the trust pool), so none of
 * it waits for a restart.
 *
 * The demo cannot read X.509. It accepts PEM that is well formed (the armour
 * lines, and base64 that decodes) and describes each certificate with fixed
 * values for what it cannot read (DEMO_SUBJECT as subject and issuer, no
 * names, valid from the moment it was added for one year, self-signed, not
 * expired) and a real SHA-256 of the decoded bytes. A key is any single
 * PRIVATE KEY block and the pair is taken to match. The key is read to be
 * checked and never kept, echoed or named in an answer.
 *
 * The files are writable unless the Demo controls say otherwise
 * (`tlsReadOnly`, a read-only mount of /tls): the writes then answer
 * `409 tls_read_only` and both `...Writable` flags are false. Checks run in
 * the order body, input (422), writability (409), then the file (409 exists,
 * 404 not_found). A failed write (`500 tls_write_failed`) is not simulated:
 * the demo has no disk to fail.
 *
 * Mock-only.
 */
import { object, parseBody, string } from './strict';
import type { Session } from './sessions';
import type { GatewayRequest, GatewayResponse } from './types';

/** What the page describes a certificate with (`<cert>` in the gateway's API). */
export interface CertInfo {
    subject: string;
    issuer: string;
    names: string[];
    notBefore: string;
    notAfter: string;
    sha256: string;
    selfSigned: boolean;
    expired: boolean;
}

/** A file in the trust directory; `problem` says why it gave no certificate ('' when it did). */
export interface TrustFile { name: string; certificates: CertInfo[]; problem: string }

/** `GET /managed/tls`, and the answer of the trust writes. */
export interface TlsView {
    certificate: CertInfo;
    certificateWritable: boolean;
    trustWritable: boolean;
    trust: TrustFile[];
}

/** What a reload must carry. */
export interface TlsState { certificate: CertInfo; trust: TrustFile[] }

/** The control panel's switch. */
export interface TlsFaults {
    /** The certificate and trust files are on a read-only mount. */
    tlsReadOnly: boolean;
}

/** The subject and issuer of every certificate the demo describes. */
export const DEMO_SUBJECT = 'CN=demo certificate';

/** The bytes the starting certificate stands for, and their SHA-256 (as `sha256sum` prints it, upper case, joined by `:`). */
export const START_CERTIFICATE_BYTES = 'smu demo gateway certificate';
const START_SHA256 = '15:75:C2:31:33:7C:6A:36:FF:2B:38:0C:DA:4A:83:78:D5:BE:A3:D9:FA:D1:F2:21:98:DD:4D:1A:CE:58:21:42';

/** What a CA added without a name is called: derived from the subject's common name, which is always DEMO_SUBJECT's here. */
const DERIVED_NAME = 'demo-certificate.crt';

/** A trust file's name the console writes: no path, a .crt or .pem extension. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(crt|pem)$/;

/** A name the listing can show, which a delete takes: one path element ending in .crt or .pem, any case. */
const LISTED = (name: string): boolean => /\.(crt|pem)$/i.test(name) && !/[/\\\0]/.test(name);

// The refusals in the gateway's own words (go-web-proxy/tls.go), which the contract goldens hold.
const NAME_RULE = 'Use letters, digits, dots, dashes and underscores, start with a letter or digit, end in .crt or .pem, '
    + 'and keep the name before the extension to 64 characters.';
const DELETE_RULE = 'Name one .crt or .pem file directly in the trust directory.';
const NO_CERTIFICATE = 'No certificate was found. Send the PEM text, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.';
const KEY_AS_CERTIFICATE = 'A private key was found. A private key never belongs here: send only the certificate.';
const AFTER_CERTIFICATES = 'There is text after the last certificate block. Send only certificate blocks.';
const ENCRYPTED_KEY = 'The key is encrypted. Send it without a passphrase (openssl pkey -in key.pem -out plain.pem).';
const TWO_KEYS = 'More than one private key was found. Send exactly one.';
const NO_KEY = 'No private key was found. Send the PEM text, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----.';
const AFTER_KEY = 'There is text after the key block. Send only the key.';

const ok = (json: unknown): GatewayResponse => ({ status: 200, json });
const error = (status: number, code: string): GatewayResponse => ({ status, json: { error: code } });
const invalid = (field: string, reason: string): GatewayResponse => ({ status: 422, json: { error: 'invalid', field, reason } });

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const rfc3339 = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const yearLater = (d: Date): Date => {
    const x = new Date(d);
    x.setUTCFullYear(x.getUTCFullYear() + 1);
    return x;
};

interface PemBlock { label: string; der: Uint8Array<ArrayBuffer> }

/** PEM bytes from base64 (line breaks allowed); null when it does not decode or holds nothing. */
function decode(body: string): Uint8Array<ArrayBuffer> | null {
    try {
        const bin = atob(body.replace(/\s+/g, ''));
        return bin.length > 0 ? Uint8Array.from(bin, c => c.charCodeAt(0)) : null;
    } catch {
        return null;
    }
}

/**
 * The PEM blocks of a text in order, read as the gateway's pem.Decode reads
 * them: text before or between blocks is passed over, a block whose body is
 * not base64 counts as such text, and `rest` is what follows the last block.
 */
export function parsePem(text: string): { blocks: PemBlock[]; rest: string } {
    const block = /-----BEGIN ([A-Z0-9 ]+)-----\r?\n([A-Za-z0-9+/=\r\n]*?)\r?\n?-----END \1-----/g;
    const blocks: PemBlock[] = [];
    let end = 0;
    for (let m = block.exec(text); m; m = block.exec(text)) {
        const der = decode(m[2]);
        if (der) {
            blocks.push({ label: m[1], der });
            end = block.lastIndex;
        }
    }
    return { blocks, rest: text.slice(end) };
}

/** The certificate blocks of a text, or why it is refused (the gateway's parseCertificatePEM). */
function readCertificates(text: string): PemBlock[] | string {
    const { blocks, rest } = parsePem(text);
    const other = blocks.find(b => b.label !== 'CERTIFICATE');
    if (other) {
        return other.label.endsWith('PRIVATE KEY') ? KEY_AS_CERTIFICATE : `A ${JSON.stringify(other.label)} block was found. Only CERTIFICATE blocks are accepted.`;
    }
    if (blocks.length === 0) return NO_CERTIFICATE;
    return rest.trim() === '' ? blocks : AFTER_CERTIFICATES;
}

/** Why a text is not exactly one private key, or '' (the gateway's parseKeyPEM; an EC PARAMETERS block is passed over). */
function keyProblem(text: string): string {
    const { blocks, rest } = parsePem(text);
    let found = false;
    for (const b of blocks.filter(x => x.label !== 'EC PARAMETERS')) {
        if (b.label.includes('ENCRYPTED')) return ENCRYPTED_KEY;
        if (!b.label.endsWith('PRIVATE KEY')) return `A ${JSON.stringify(b.label)} block was found. Only the private key belongs here.`;
        if (found) return TWO_KEYS;
        found = true;
    }
    if (!found) return NO_KEY;
    return rest.trim() === '' ? '' : AFTER_KEY;
}

async function fingerprint(der: Uint8Array<ArrayBuffer>): Promise<string> {
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
    return Array.from(sum, b => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
}

/** A certificate as the page describes it; `at` is when it was added. */
async function certInfo(der: Uint8Array<ArrayBuffer>, at: Date): Promise<CertInfo> {
    return {
        subject: DEMO_SUBJECT, issuer: DEMO_SUBJECT, names: [],
        notBefore: rfc3339(at), notAfter: rfc3339(yearLater(at)),
        sha256: await fingerprint(der), selfSigned: true, expired: false,
    };
}

type Route = [string, string, (req: GatewayRequest, s: Session, sid: string, params: string[]) => GatewayResponse | Promise<GatewayResponse>];

/** `now` stamps what is added; `readOnly` is the control panel's switch. */
export function createTls({ now, readOnly }: { now: () => Date; readOnly: () => boolean }) {
    const start = now();
    let certificate: CertInfo = {
        subject: DEMO_SUBJECT, issuer: DEMO_SUBJECT, names: [],
        notBefore: rfc3339(start), notAfter: rfc3339(yearLater(start)),
        sha256: START_SHA256, selfSigned: true, expired: false,
    };
    let trust: TrustFile[] = [];

    const view = (): TlsView => ({
        certificate: clone(certificate), certificateWritable: !readOnly(), trustWritable: !readOnly(), trust: clone(trust),
    });

    /** The body of the check and the replace: the leaf's bytes, or the refusal. */
    function pair(body: string): { leaf: Uint8Array<ArrayBuffer> } | GatewayResponse {
        const b = object(parseBody(body), ['certificate', 'key']);
        const certs = readCertificates(string(b.certificate));
        if (typeof certs === 'string') return invalid('certificate', certs);
        const problem = keyProblem(string(b.key));
        if (problem) return invalid('key', problem);
        return { leaf: certs[0].der };
    }

    const get: Route[2] = () => ok(view());

    const check: Route[2] = async req => {
        const p = pair(req.body);
        if ('status' in p) return p;
        return ok({ certificate: await certInfo(p.leaf, now()) });
    };

    const replace: Route[2] = async req => {
        const p = pair(req.body);
        if ('status' in p) return p;
        const info = await certInfo(p.leaf, now());
        if (readOnly()) return error(409, 'tls_read_only');
        certificate = info;
        return ok({ certificate: clone(info) });
    };

    const addTrust: Route[2] = async req => {
        const b = object(parseBody(req.body), ['name', 'certificate']);
        const certs = readCertificates(string(b.certificate));
        if (typeof certs === 'string') return invalid('certificate', certs);
        const given = string(b.name);
        if (given !== '' && !NAME.test(given)) return invalid('name', NAME_RULE);
        const at = now();
        const certificates = await Promise.all(certs.map(c => certInfo(c.der, at)));
        if (readOnly()) return error(409, 'tls_read_only');
        const name = given === '' ? DERIVED_NAME : given;
        if (trust.some(f => f.name === name)) return error(409, 'exists');
        trust = [...trust, { name, certificates, problem: '' }].sort((a, c) => (a.name < c.name ? -1 : 1));
        return ok(view());
    };

    const removeTrust: Route[2] = (_req, _s, _sid, [name]) => {
        if (!LISTED(name)) return invalid('name', DELETE_RULE);
        if (readOnly()) return error(409, 'tls_read_only');
        if (!trust.some(f => f.name === name)) return error(404, 'not_found');
        trust = trust.filter(f => f.name !== name);
        return ok(view());
    };

    const routes: Route[] = [
        ['GET', '/managed/tls', get],
        ['POST', '/managed/tls/certificate/check', check],
        ['PUT', '/managed/tls/certificate', replace],
        ['POST', '/managed/tls/trust', addTrust],
        ['DELETE', '/managed/tls/trust/{}', removeTrust],
    ];

    return {
        routes,
        view,
        dump: (): TlsState => clone({ certificate, trust }),
        load(s: TlsState): void {
            certificate = clone(s.certificate);
            trust = clone(s.trust);
        },
    };
}

export type GatewayTls = ReturnType<typeof createTls>;
