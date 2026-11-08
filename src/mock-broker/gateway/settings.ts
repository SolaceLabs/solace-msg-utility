/**
 * The fake gateway's config.yaml (go-web-proxy/settings.go, configfile.go,
 * live.go): what `GET /managed/settings` shows and what a `PUT` may change,
 * refused in the gateway's order with its reasons. Live keys apply at once
 * (connModes and defaultConn reach the next `/hosted`, modules the next
 * `/me`); restart-only keys are saved and reported as pending, and the path
 * keys change only "on the host", which the demo has none of.
 *
 * Not simulated: the access list is saved and shown but never enforced, so
 * the demo cannot lock its viewer out; `would_lock_out` still refuses a list
 * without the seed's client address.
 *
 * Mock-only.
 */
import { BadRequest, fieldOf } from './strict';
import { CATALOG, moduleIdsProblem, quote } from './validate';
import type { GatewaySettings, SettingsView } from './types';

type Kind = 'bool' | 'string' | 'int' | 'strings';
type Schema = { [key: string]: Kind | Schema };

/** fileConfig's JSON fields and their types. */
const SCHEMA: Schema = {
    hosted: 'bool', connModes: 'string', defaultConn: 'string', appDir: 'string',
    tls: { certFile: 'string', keyFile: 'string', trustDir: 'string', insecureSkipVerify: 'bool' },
    logLevel: 'string', usersFile: 'string', connectionsFile: 'string',
    access: { allow: 'strings', trustedProxies: 'strings' },
    session: { idleMinutes: 'int', absoluteMinutes: 'int' },
    login: { maxFailures: 'int', backoffSeconds: 'int', maxBackoffSeconds: 'int', unauthenticatedPerMinute: 'int' },
    modules: { offered: 'strings', userDefault: 'string' },
};

/** restartOnlyKeys (live.go), in order; `host` marks the path keys. */
const RESTART_ONLY: { key: string; host: boolean; value: (s: GatewaySettings) => unknown }[] = [
    { key: 'hosted', host: false, value: s => s.hosted },
    { key: 'appDir', host: true, value: s => s.appDir },
    { key: 'tls.certFile', host: true, value: s => s.tls.certFile },
    { key: 'tls.keyFile', host: true, value: s => s.tls.keyFile },
    { key: 'tls.trustDir', host: true, value: s => s.tls.trustDir },
    { key: 'tls.insecureSkipVerify', host: false, value: s => s.tls.insecureSkipVerify },
    { key: 'usersFile', host: true, value: s => s.usersFile },
    { key: 'connectionsFile', host: true, value: s => s.connectionsFile },
];

const clone = (s: GatewaySettings): GatewaySettings => JSON.parse(JSON.stringify(s));

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
        return `connModes=${quote(s.connModes)} (config.yaml; seeded by CONN_MODES) must be one of "direct", "provisioned", "both"`;
    }
    if (!['direct', 'provisioned'].includes(s.defaultConn)) {
        return `defaultConn=${quote(s.defaultConn)} (config.yaml; seeded by DEFAULT_CONN) must be one of "direct", "provisioned"`;
    }
    if (s.connModes !== 'direct' && !s.hosted) {
        return `connModes=${quote(s.connModes)} offers Provisioned sign-in but hosted is false (config.yaml; seeded by HOSTED), so the app cannot detect the gateway`;
    }
    return null;
}

/** toConfig plus fileConfigFromConfig: the file as the gateway would save it, or the first problem. */
function normalize(f: GatewaySettings): { ok: true; value: GatewaySettings } | { ok: false; reason: string } {
    const level = parseLogLevel(f.logLevel);
    if (!level) return { ok: false, reason: `key "logLevel" has invalid value ${quote(f.logLevel)}: must be one of debug, info, warn, error` };
    const allow = cidrList('access.allow', f.access.allow);
    if (!allow.ok) return allow;
    const trusted = cidrList('access.trustedProxies', f.access.trustedProxies);
    if (!trusted.ok) return trusted;
    const { idleMinutes: idle, absoluteMinutes: abs } = f.session;
    const sessionProblem = range('session.absoluteMinutes', abs, 1, 1440)
        ?? ((p => p && `${p} (session.absoluteMinutes is ${abs})`)(range('session.idleMinutes', idle, 1, abs)));
    if (sessionProblem) return { ok: false, reason: sessionProblem };
    const l = f.login;
    const loginProblem = range('login.maxFailures', l.maxFailures, 1, 1000)
        ?? range('login.maxBackoffSeconds', l.maxBackoffSeconds, 1, 86400)
        ?? range('login.unauthenticatedPerMinute', l.unauthenticatedPerMinute, 1, 10000)
        ?? ((p => p && `${p} (login.maxBackoffSeconds is ${l.maxBackoffSeconds})`)(range('login.backoffSeconds', l.backoffSeconds, 1, l.maxBackoffSeconds)));
    if (loginProblem) return { ok: false, reason: loginProblem };
    const modulesProblem = moduleIdsProblem('modules.offered', f.modules.offered)
        ?? (['all', 'none'].includes(f.modules.userDefault) ? null
            : `key "modules.userDefault" has invalid value ${quote(f.modules.userDefault)}: must be "all" or "none"`);
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
export interface Refusal { ok: false; status: number; error: string; field?: string; reason?: string }

export type SaveResult = { ok: true; restartRequired: string[] } | Refusal;

const UNREADABLE_REASON = 'The gateway cannot read config.yaml (demo: the control panel made it unreadable). '
    + 'Fix the file on the gateway host, then reload this page.';

export function createSettings(boot: GatewaySettings, client: string, faults: () => SettingsFaults) {
    const running = clone(boot);
    let saved = clone(boot);

    const pending = () => RESTART_ONLY.filter(k => k.value(running) !== k.value(saved)).map(k => k.key);

    return {
        /** The live file: what /hosted and /me read. */
        current(): GatewaySettings {
            return saved;
        },

        view(): { ok: true; view: SettingsView } | Refusal {
            if (faults().unreadable) return { ok: false, status: 500, error: 'config_unreadable', reason: UNREADABLE_REASON };
            return { ok: true, view: {
                settings: clone(saved),
                restartOnly: RESTART_ONLY.map(k => k.key),
                hostOnly: RESTART_ONLY.filter(k => k.host).map(k => k.key),
                pendingRestart: pending(),
                changedOnDisk: faults().changedOnDisk,
                catalog: [...CATALOG],
            } };
        },

        /** saveSettings, in its order. Throws BadRequest for a body the decoder refuses. */
        save(patch: unknown): SaveResult {
            const body = clone(saved);
            merge(body as unknown as Record<string, any>, patch, SCHEMA);
            for (const k of RESTART_ONLY) {
                if (k.host && k.value(body) !== k.value(saved)) {
                    return {
                        ok: false, status: 422, error: 'invalid', field: k.key,
                        reason: `${k.key} is a path, so it changes only in config.yaml on the gateway host, followed by a restart.`,
                    };
                }
            }
            const n = normalize(body);
            if (!n.ok) return { ok: false, status: 422, error: 'invalid', field: 'settings', reason: n.reason };
            // saveSettings (settings.go): Direct alone would end Provisioned mode,
            // and the console with it, at the next restart.
            if (n.value.connModes === 'direct') {
                return {
                    ok: false, status: 422, error: 'invalid', field: 'connModes',
                    reason: 'connModes "direct" would turn Provisioned mode off at the next restart, and this console with it. '
                        + 'To leave Provisioned mode, set connModes: direct in config.yaml on the gateway host and restart.',
                };
            }
            if (n.value.access.allow.length > 0 && !allowListAdmits(n.value.access.allow, client)) {
                return {
                    ok: false, status: 409, error: 'would_lock_out', field: 'access.allow',
                    reason: `This allow list would deny your own address (${client}). Add it, or a range that contains it.`,
                };
            }
            if (faults().unreadable) return { ok: false, status: 500, error: 'config_unreadable', reason: UNREADABLE_REASON };
            if (faults().changedOnDisk) return { ok: false, status: 409, error: 'config_changed_on_disk' };
            saved = n.value;
            return { ok: true, restartRequired: pending() };
        },

        dump(): GatewaySettings {
            return clone(saved);
        },
        load(s: GatewaySettings): void {
            saved = clone(s);
        },
    };
}

export type GatewaySettingsFile = ReturnType<typeof createSettings>;
