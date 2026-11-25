/**
 * The fake gateway's config.yaml (go-web-proxy/settings.go, configfile.go,
 * live.go): what `GET /managed/settings` shows and what a `PUT` may change,
 * refused in the gateway's order with its reasons. Live keys apply at once
 * (connModes and defaultConn reach the next `/hosted`, modules the next
 * `/me`; audit.stdout, audit.access and audit.onFailure the next audit event,
 * which the demo does not write and cannot fail to write: the keys are saved
 * and shown only; the login keys at the next sign-in or password change,
 * login.twoFactorMinutes at the next ticket check and
 * login.unauthenticatedPerMinute at the next request without a session;
 * tls.insecureSkipVerify and tls.standardRoots at once, as the gateway's trust holder takes them;
 * session.connectsPerMinute at the next dial or SMF socket). Nothing a save
 * writes waits for a restart. A seed, snapshot or backup without a key reads
 * it as its default. The TLS paths are environment variables, not keys: a
 * seed, snapshot or backup that still holds them is read and they are
 * dropped, and a save that names one is a bad request, as for any unknown key.
 *
 * The file has one `rev`, an opaque string that changes on every save (here
 * a counter written out; the gateway's is a checksum of the file). A save
 * must carry the rev it read: a missing or empty one is `400 rev_required`,
 * another one `409 stale` with the current rev. The disk check (unreadable,
 * changed on disk) comes before the rev, and the rev before the rules about
 * the new content (422, would_lock_out).
 *
 * Not simulated: the access list is saved and shown but never enforced, so
 * the demo cannot lock its viewer out; `would_lock_out` still refuses a list
 * without the seed's client address.
 *
 * Mock-only.
 */
import { BadRequest, fieldOf, string } from './strict';
import { isTwoFactorMode } from './authenticator';
import { CATALOG, moduleIdsProblem, PASSWORD_MAX, PASSWORD_MIN, quote } from './validate';
import type { GatewaySettings, SettingsView } from './types';

/** `GET /managed/settings`: the view and the file's rev. */
export type SettingsViewRev = SettingsView & { rev: string };

type Kind = 'bool' | 'string' | 'int' | 'strings';
type Schema = { [key: string]: Kind | Schema };

/** fileConfig's JSON fields and their types. */
const SCHEMA: Schema = {
    hosted: 'bool', connModes: 'string', defaultConn: 'string',
    tls: { insecureSkipVerify: 'bool', standardRoots: 'bool' },
    logLevel: 'string',
    access: { allow: 'strings', trustedProxies: 'strings' },
    session: { idleMinutes: 'int', absoluteMinutes: 'int', connectsPerMinute: 'int' },
    login: {
        maxFailures: 'int', perClient: 'bool', clientMaxFailures: 'int', resetMinutes: 'int', backoffSeconds: 'int',
        maxBackoffSeconds: 'int', unauthenticatedPerMinute: 'int', passwordMinLength: 'int', twoFactorMinutes: 'int', twoFactor: 'string',
    },
    modules: { offered: 'strings', userDefault: 'string' },
    audit: { stdout: 'bool', access: 'bool', onFailure: 'string' },
};

/** The tls path keys a config.yaml may hold. The paths come from environment variables, so a file that holds one is read and the key dropped. */
const REMOVED_TLS_KEYS = ['certFile', 'keyFile', 'trustDir'];

const clone = (s: GatewaySettings): GatewaySettings => JSON.parse(JSON.stringify(s));

/**
 * A PUT body split into its top-level `rev` (matched without regard to case,
 * a later key winning, as everywhere) and the settings keys. A rev that is
 * absent or null is '' (no rev); one that is not a string is a bad request,
 * as the decoder refuses it.
 */
export function splitRev(body: unknown): { patch: unknown; rev: string } {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return { patch: body, rev: '' };
    let rev = '';
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (fieldOf(k, ['rev']) === 'rev') rev = string(v);
        else patch[k] = v;
    }
    return { patch, rev };
}

/** A PUT body decoded onto the saved file: unknown or mistyped fields are a bad request. */
function merge(target: Record<string, any>, patch: unknown, schema: Schema): void {
    if (patch === null) return;
    if (typeof patch !== 'object' || Array.isArray(patch)) throw new BadRequest('want an object');
    for (const [key, v] of Object.entries(patch)) {
        const k = fieldOf(key, Object.keys(schema));
        if (k === undefined) throw new BadRequest(`unknown field ${key}`);
        const kind = schema[k];
        if (typeof kind === 'object') {
            merge(target[k], v, kind);
            continue;
        }
        if (v === null) {
            if (kind === 'strings') target[k] = [];          // a nil slice; null leaves the rest as they are
            continue;
        }
        const ok = kind === 'bool' ? typeof v === 'boolean'
            : kind === 'string' ? typeof v === 'string'
                : kind === 'int' ? typeof v === 'number' && Number.isInteger(v)
                    : Array.isArray(v) && v.every(x => typeof x === 'string');
        if (!ok) throw new BadRequest(`field ${k} has the wrong type`);
        target[k] = Array.isArray(v) ? [...v] : v;
    }
}

/** defaultFileConfig: the built-in defaults, what the gateway decodes a backup's settings onto (a key the backup lacks reads as its default). */
const DEFAULTS: GatewaySettings = {
    hosted: true, connModes: 'direct', defaultConn: 'direct',
    tls: { insecureSkipVerify: false, standardRoots: true },
    logLevel: 'warn',
    access: { allow: [], trustedProxies: [] },
    session: { idleMinutes: 10, absoluteMinutes: 30, connectsPerMinute: 20 },
    login: {
        maxFailures: 5, perClient: true, clientMaxFailures: 10, resetMinutes: 15, backoffSeconds: 30, maxBackoffSeconds: 900,
        unauthenticatedPerMinute: 60, passwordMinLength: 12, twoFactorMinutes: 10, twoFactor: 'optional',
    },
    modules: { offered: [...CATALOG], userDefault: 'all' },
    audit: { stdout: false, access: false, onFailure: 'continue' },
};

/** A backup's `tls` object without the keys that left the file; anything that is not an object is left for the decoder to refuse. */
const withoutRemovedTls = (v: unknown): unknown =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).filter(([t]) => fieldOf(t, REMOVED_TLS_KEYS) === undefined))
        : v;

/**
 * A backup's settings as the gateway's strict decoder reads them: onto the
 * default file, unknown or mistyped keys refused (BadRequest). The file's own
 * `version`, the `appDir`, `usersFile` and `connectionsFile` keys and the
 * `tls.certFile`, `tls.keyFile` and `tls.trustDir` keys a backup may hold
 * are not settings: accepted and ignored.
 */
export function settingsFromBackup(raw: unknown): GatewaySettings {
    const out = clone(DEFAULTS);
    const rest = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw)
            .filter(([k]) => !['version', 'appDir', 'usersFile', 'connectionsFile'].includes(k))
            .map(([k, v]): [string, unknown] => [k, fieldOf(k, ['tls']) === 'tls' ? withoutRemovedTls(v) : v]))
        : raw;
    merge(out as unknown as Record<string, any>, rest ?? null, SCHEMA);
    return out;
}

function parseLogLevel(s: string): string | null {
    const l = s.toLowerCase();
    return ['debug', 'info', 'warn', 'error'].includes(l) ? l : null;
}

/** The eight 16-bit groups of an IPv6 address; null when it is not one. */
function ipv6Groups(addr: string): number[] | null {
    const dot = addr.indexOf('.');
    if (dot >= 0 && addr.lastIndexOf(':') > dot) return null;   // a dotted quad only at the end
    const halves = addr.split('::');
    if (halves.length > 2) return null;
    const part = (h: string): number[] | null => {
        const out: number[] = [];
        for (const g of h === '' ? [] : h.split(':')) {
            if (g.includes('.')) {
                const q = g.split('.');
                if (q.length !== 4 || !q.every(p => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255)) return null;
                out.push(Number(q[0]) * 256 + Number(q[1]), Number(q[2]) * 256 + Number(q[3]));
            } else if (/^[0-9A-Fa-f]{1,4}$/.test(g)) {
                out.push(parseInt(g, 16));
            } else {
                return null;
            }
        }
        return out;
    };
    const head = part(halves[0]);
    const tail = halves.length === 2 ? part(halves[1]) : [];
    if (!head || !tail) return null;
    const width = head.length + tail.length;
    if (halves.length === 1) return width === 8 ? head : null;
    return width <= 7 ? [...head, ...Array<number>(8 - width).fill(0), ...tail] : null;
}

/** Addr.String() for IPv6: lower-case hex, the first longest run of two or more zero groups as `::`. */
function ipv6String(g: number[]): string {
    let zs = -1;
    let ze = -1;
    for (let i = 0; i < 8; i++) {
        let j = i;
        while (j < 8 && g[j] === 0) j++;
        if (j - i >= 2 && j - i > ze - zs) [zs, ze] = [i, j];
    }
    let out = '';
    for (let i = 0; i < 8; i++) {
        if (i === zs) {
            out += '::';
            i = ze;
            if (i >= 8) break;
        } else if (i > 0) {
            out += ':';
        }
        out += g[i].toString(16);
    }
    return out;
}

/**
 * netip.ParsePrefix, then Masked(), in its order: the address, then the bits
 * (no sign, no leading zero), then the range. A malformed address is refused
 * with one generic reason where ParseAddr names the exact fault.
 */
function parseCidr(s: string): { ok: true; value: string } | { ok: false; reason: string } {
    const t = s.trim();
    const slash = t.lastIndexOf('/');
    const bad = (why: string) => ({ ok: false as const, reason: why });
    if (slash < 0) return bad(`no '/'`);
    const addr = t.slice(0, slash);
    const bits = t.slice(slash + 1);
    const v4 = addr.split('.');
    const isV4 = v4.length === 4 && v4.every(p => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255);
    const v6 = isV4 ? null : ipv6Groups(addr);
    if (!isV4 && !v6) return bad(`ParseAddr(${quote(addr)}): unable to parse IP`);
    if (!/^(0|[1-9][0-9]{0,17})$/.test(bits)) return bad(`bad bits after slash: ${quote(bits)}`);
    const n = Number(bits);
    if (n > (isV4 ? 32 : 128)) return bad(`prefix length out of range`);
    if (v6) {
        if (v6.slice(0, 5).every(x => x === 0) && v6[5] === 0xffff) return { ok: false, reason: 'use the IPv4 form' };
        const masked = v6.map((x, i) => {
            const keep = Math.min(Math.max(n - 16 * i, 0), 16);
            return keep === 0 ? 0 : x & (0xffff << (16 - keep)) & 0xffff;
        });
        return { ok: true, value: `${ipv6String(masked)}/${n}` };
    }
    const num = v4.reduce((a, p) => a * 256 + Number(p), 0);
    const masked = n === 0 ? 0 : Math.floor(num / 2 ** (32 - n)) * 2 ** (32 - n);
    const out = [24, 16, 8, 0].map(sh => Math.floor(masked / 2 ** sh) % 256).join('.');
    return { ok: true, value: `${out}/${n}` };
}

function cidrList(key: string, list: string[]): { ok: true; value: string[] } | { ok: false; reason: string } {
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
        const r = parseCidr(list[i]);
        if (!r.ok) {
            const at = `${key}[${i}]`;
            return {
                ok: false,
                reason: r.reason === 'use the IPv4 form'
                    ? `key ${quote(at)} has invalid value ${quote(list[i])}: use the IPv4 form`
                    : `key ${quote(at)} has invalid value ${quote(list[i])}: want CIDR such as 10.0.0.0/8 or 192.0.2.7/32 (netip.ParsePrefix(${quote(list[i].trim())}): ${r.reason})`,
            };
        }
        out.push(r.value);
    }
    return { ok: true, value: out };
}

function range(key: string, v: number, lo: number, hi: number): string | null {
    return v < lo || v > hi ? `key ${quote(key)} has invalid value ${quote(String(v))}: must be ${lo} to ${hi}` : null;
}

/** validateConnModes (main.go). */
export function connModesProblem(s: { connModes: string; defaultConn: string; hosted: boolean }): string | null {
    if (!['direct', 'provisioned', 'both'].includes(s.connModes)) {
        return `connModes=${quote(s.connModes)} (config.yaml; seeded by SMU_CONN_MODES) must be one of "direct", "provisioned", "both"`;
    }
    if (!['direct', 'provisioned'].includes(s.defaultConn)) {
        return `defaultConn=${quote(s.defaultConn)} (config.yaml; seeded by SMU_DEFAULT_CONN) must be one of "direct", "provisioned"`;
    }
    if (s.connModes !== 'direct' && !s.hosted) {
        return `connModes=${quote(s.connModes)} offers Provisioned sign-in but hosted is false (config.yaml; seeded by SMU_HOSTED), so the app cannot detect the gateway`;
    }
    return null;
}

/** toConfig plus fileConfigFromConfig: the file as the gateway would save it, or the first problem. */
function normalize(f: GatewaySettings): { ok: true; value: GatewaySettings } | { ok: false; reason: string; field?: string } {
    // First and named by its own field, as checkSettings does: the settings page marks the select it came from.
    if (!isTwoFactorMode(f.login.twoFactor)) {
        return {
            ok: false, field: 'login.twoFactor',
            reason: `key "login.twoFactor" has invalid value ${quote(f.login.twoFactor)}: must be "optional", "admins" or "mandatory"`,
        };
    }
    const level = parseLogLevel(f.logLevel);
    if (!level) return { ok: false, reason: `key "logLevel" has invalid value ${quote(f.logLevel)}: must be one of debug, info, warn, error` };
    const allow = cidrList('access.allow', f.access.allow);
    if (!allow.ok) return allow;
    const trusted = cidrList('access.trustedProxies', f.access.trustedProxies);
    if (!trusted.ok) return trusted;
    const { idleMinutes: idle, absoluteMinutes: abs } = f.session;
    const sessionProblem = range('session.absoluteMinutes', abs, 1, 1440)
        ?? ((p => p && `${p} (session.absoluteMinutes is ${abs})`)(range('session.idleMinutes', idle, 1, abs)))
        ?? range('session.connectsPerMinute', f.session.connectsPerMinute, 1, 1000);
    if (sessionProblem) return { ok: false, reason: sessionProblem };
    const l = f.login;
    const loginProblem = range('login.maxFailures', l.maxFailures, 1, 1000)
        ?? range('login.clientMaxFailures', l.clientMaxFailures, 1, 1000)
        ?? range('login.resetMinutes', l.resetMinutes, 1, 1440)
        ?? range('login.maxBackoffSeconds', l.maxBackoffSeconds, 1, 86400)
        ?? range('login.unauthenticatedPerMinute', l.unauthenticatedPerMinute, 1, 10000)
        ?? range('login.passwordMinLength', l.passwordMinLength, PASSWORD_MIN, PASSWORD_MAX)
        ?? ((p => p && `${p} (login.maxBackoffSeconds is ${l.maxBackoffSeconds})`)(range('login.backoffSeconds', l.backoffSeconds, 1, l.maxBackoffSeconds)))
        ?? range('login.twoFactorMinutes', l.twoFactorMinutes, 1, 60);
    if (loginProblem) return { ok: false, reason: loginProblem };
    const modulesProblem = moduleIdsProblem('modules.offered', f.modules.offered)
        ?? (['all', 'none'].includes(f.modules.userDefault) ? null
            : `key "modules.userDefault" has invalid value ${quote(f.modules.userDefault)}: must be "all" or "none"`)
        ?? (['continue', 'refuse'].includes(f.audit.onFailure) ? null
            : `key "audit.onFailure" has invalid value ${quote(f.audit.onFailure)}: must be "continue" or "refuse"`);
    if (modulesProblem) return { ok: false, reason: modulesProblem };
    const value: GatewaySettings = {
        ...clone(f),
        connModes: f.connModes.toLowerCase(),
        defaultConn: f.defaultConn.toLowerCase(),
        logLevel: level,
        access: { allow: allow.value, trustedProxies: trusted.value },
        modules: { offered: CATALOG.filter(id => f.modules.offered.includes(id)), userDefault: f.modules.userDefault },
    };
    const modes = connModesProblem(value);
    return modes ? { ok: false, reason: modes } : { ok: true, value };
}

/** prefixContains for an IPv4 client against the saved (masked) IPv4 prefixes. */
function allowListAdmits(allow: string[], client: string): boolean {
    const num = (ip: string) => ip.split('.').reduce((a, p) => a * 256 + Number(p), 0);
    if (client.split('.').length !== 4) return false;
    return allow.some(p => {
        const [addr, bits] = p.split('/');
        if (addr.split('.').length !== 4) return false;
        const size = 2 ** (32 - Number(bits));
        return Math.floor(num(client) / size) === Math.floor(num(addr) / size);
    });
}

/** The file faults the control panel can arm. */
export interface SettingsFaults {
    /** A hand edit on the host the gateway has not loaded. */
    changedOnDisk: boolean;
    /** The file cannot be read. */
    unreadable: boolean;
}

/** A refusal: the status and the gateway's error body. */
export interface Refusal { ok: false; status: number; error: string; field?: string; reason?: string; rev?: string }

/** A refusal's JSON body: the code and whichever of field, reason and rev it has. */
export function refusalBody(r: Refusal): Record<string, string> {
    return { error: r.error, ...(r.field ? { field: r.field } : {}), ...(r.reason ? { reason: r.reason } : {}), ...(r.rev ? { rev: r.rev } : {}) };
}

export type SaveResult = { ok: true; rev: string } | Refusal;

const UNREADABLE_REASON = 'The gateway cannot read config.yaml (demo: the control panel made it unreadable). '
    + 'The cause is on the gateway host; once the gateway can read the file again, reload this page.';

/**
 * A file's settings with the keys it may lack (an older seed, backup or snapshot):
 * the session, login and audit keys and tls.standardRoots, the defaults'; and without the keys it may
 * still hold (the three TLS paths).
 */
const fileDefaults = (s: GatewaySettings): GatewaySettings => {
    const c = clone(s);
    c.session = { ...DEFAULTS.session, ...c.session };
    c.audit = { ...DEFAULTS.audit, ...c.audit };
    c.login = { ...DEFAULTS.login, ...c.login };
    c.tls = { insecureSkipVerify: c.tls.insecureSkipVerify, standardRoots: c.tls.standardRoots ?? DEFAULTS.tls.standardRoots };
    return c;
};

export function createSettings(boot: GatewaySettings, client: string, faults: () => SettingsFaults) {
    let saved = fileDefaults(boot);
    let revN = 1;

    /** The refusals of a file that cannot be read or was edited by hand, which come before the rev. */
    const diskRefusal = (): Refusal | null => {
        if (faults().unreadable) return { ok: false, status: 500, error: 'config_unreadable', reason: UNREADABLE_REASON };
        if (faults().changedOnDisk) return { ok: false, status: 409, error: 'config_changed_on_disk' };
        return null;
    };

    return {
        /** The live file: what /hosted and /me read. */
        current(): GatewaySettings {
            return saved;
        },

        /** The file's rev: what a save must carry, and what an import's basis holds. */
        rev(): string {
            return String(revN);
        },

        diskRefusal,

        view(): { ok: true; view: SettingsViewRev } | Refusal {
            if (faults().unreadable) return { ok: false, status: 500, error: 'config_unreadable', reason: UNREADABLE_REASON };
            return { ok: true, view: {
                rev: String(revN),
                settings: clone(saved),
                changedOnDisk: faults().changedOnDisk,
                catalog: [...CATALOG],
            } };
        },

        /** saveSettings, in its order. Throws BadRequest for a body the decoder refuses. `rev` is the one the save carried ('' for none). */
        save(patch: unknown, rev: string): SaveResult {
            const body = clone(saved);
            merge(body as unknown as Record<string, any>, patch, SCHEMA);
            if (rev === '') return { ok: false, status: 400, error: 'rev_required' };
            const disk = diskRefusal();
            if (disk) return disk;
            if (rev !== String(revN)) return { ok: false, status: 409, error: 'stale', rev: String(revN) };
            const n = normalize(body);
            if (!n.ok) return { ok: false, status: 422, error: 'invalid', field: n.field ?? 'settings', reason: n.reason };
            // saveSettings (settings.go): Direct alone would end Provisioned mode,
            // and the console with it, at the next restart.
            if (n.value.connModes === 'direct') {
                return {
                    ok: false, status: 422, error: 'invalid', field: 'connModes',
                    reason: 'connModes "direct" would turn Provisioned mode off at the next restart, and this console with it. '
                        + 'To leave Provisioned mode, remove config.yaml from the gateway\'s data volume and start the gateway with SMU_CONN_MODES=direct, '
                        + 'so that it seeds its settings again.',
                };
            }
            if (n.value.access.allow.length > 0 && !allowListAdmits(n.value.access.allow, client)) {
                return {
                    ok: false, status: 409, error: 'would_lock_out', field: 'access.allow',
                    reason: `This allow list would deny your own address (${client}). Add it, or a range that contains it.`,
                };
            }
            saved = n.value;
            revN += 1;
            return { ok: true, rev: String(revN) };
        },

        dump(): GatewaySettings {
            return clone(saved);
        },
        /** `rev` is the file's rev at the dump. */
        load(s: GatewaySettings, rev: string): void {
            saved = fileDefaults(s);
            revN = Number(rev);
        },
    };
}

export type GatewaySettingsFile = ReturnType<typeof createSettings>;
