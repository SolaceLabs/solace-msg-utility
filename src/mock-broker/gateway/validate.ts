/**
 * The checks the gateway makes before it saves a user or a connection, with
 * its exact reasons. Each mirrors the Go function named beside it;
 * go-web-proxy/testdata/contract/validation.json holds vectors both sides run
 * (tests/mock-broker/gateway/contract.test.ts, go-web-proxy/contract_test.go).
 *
 * Mock-only.
 */
import type { ConnRec } from './types';

/** moduleCatalog() in configfile.go. */
export const CATALOG = ['queue-browser', 'queue-copy', 'queue-subscription-explorer'];

const USERNAME = /^[A-Za-z0-9._@-]{1,64}$/;
const BROKER = /^[A-Za-z0-9._-]{1,64}$/;
export const USERNAME_RULE = 'must be 1 to 64 characters from A-Z a-z 0-9 . _ @ -, not only dots';
export const BROKER_RULE = 'must be 1 to 64 characters from A-Z a-z 0-9 . _ -, not only dots';
const HOST = /^[A-Za-z0-9_]([A-Za-z0-9_.-]{0,251}[A-Za-z0-9_])?$/;
const HOST_RULE = 'must be a host name (A-Z a-z 0-9 . _ -) or an IP address, without scheme or port';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Go's %q for the plain strings these messages quote. */
export function quote(s: string): string {
    return JSON.stringify(s);
}

/** validName: the pattern, and more than dots (the router cleans those away). */
function validName(re: RegExp, name: string): boolean {
    return re.test(name) && name.replace(/^\.+|\.+$/g, '') !== '';
}

export const validUsername = (name: string): boolean => validName(USERNAME, name);
export const validBroker = (name: string): boolean => validName(BROKER, name);

/** hasControl: a C0 control character or DEL. */
export function hasControl(s: string): boolean {
    return /[\u0000-\u001f\u007f]/.test(s);
}

function isIPv4(s: string): boolean {
    const parts = s.split('.');
    return parts.length === 4 && parts.every(p => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255);
}

function isIPv6(s: string): boolean {
    if (s.includes('%')) return false;                 // a zone: net.ParseIP refuses it
    const halves = s.split('::');
    if (halves.length > 2) return false;
    const groups = (h: string) => (h === '' ? [] : h.split(':'));
    const head = groups(halves[0]);
    const tail = halves.length === 2 ? groups(halves[1]) : [];
    const all = [...head, ...tail];
    let width = all.length;
    // A trailing dotted quad stands for two groups.
    const last = all[all.length - 1];
    if (last !== undefined && last.includes('.')) {
        if (!isIPv4(last)) return false;
        all.pop();
        width += 1;
    }
    if (!all.every(g => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
    return halves.length === 2 ? width <= 7 : width === 8;
}

/** validHost: net.ParseIP or the host-name pattern. */
export function validHost(h: string): boolean {
    return isIPv4(h) || isIPv6(h) || HOST.test(h);
}

/** validatePort: blank, or digits only within 1 to 65535. */
export function portProblem(p: string): string | null {
    if (p === '') return null;
    const n = Number(p);
    return /^[0-9]+$/.test(p) && n >= 1 && n <= 65535 ? null : `${quote(p)} is not a port (1 to 65535)`;
}

/** checkPasswordPolicy, counted in runes. */
export function passwordOk(pw: string): boolean {
    const n = [...pw].length;
    return n >= PASSWORD_MIN && n <= PASSWORD_MAX;
}

/** checkModuleIDs: ids from the catalog, none twice. */
export function moduleIdsProblem(key: string, ids: string[]): string | null {
    for (let i = 0; i < ids.length; i++) {
        const at = `${key}[${i}]`;
        if (!CATALOG.includes(ids[i])) {
            return `key ${quote(at)} has invalid value ${quote(ids[i])}: must be one of ${CATALOG.join(', ')}`;
        }
        if (ids.indexOf(ids[i]) < i) return `key ${quote(at)} has invalid value ${quote(ids[i])}: listed twice`;
    }
    return null;
}

/** validateConn, in the gateway's order. */
export function connectionProblem(c: ConnRec): string | null {
    const b = quote(c.broker);
    if (!validBroker(c.broker)) return `broker ${b} ${BROKER_RULE}`;
    for (const [key, port] of [['semp.port', c.semp.port], ['client.port', c.client.port]] as const) {
        const p = portProblem(port);
        if (p) return `broker ${b}: ${key} ${p}`;
    }
    const seen = new Set<string>();
    for (const v of c.client.msgVpns) {
        if (v.name === '') return `broker ${b}: a message VPN has no name`;
        if (seen.has(v.name)) return `broker ${b}: message VPN ${quote(v.name)} appears more than once`;
        seen.add(v.name);
    }
    if (!validHost(c.hostname)) return `broker ${b}: hostname ${quote(c.hostname)} ${HOST_RULE}`;
    if (c.semp.username !== '' && c.semp.port === '') {
        return `broker ${b}: semp.port is required when a SEMP username is set`;
    }
    if (c.client.msgVpns.length > 0 && c.client.port === '') {
        return `broker ${b}: client.port is required when message VPNs are listed`;
    }
    if (c.semp.username.includes(':') || hasControl(c.semp.username) || hasControl(c.semp.password)) {
        return `broker ${b}: the SEMP username and password must not contain control characters, and the username no ':'`;
    }
    for (const v of c.client.msgVpns) {
        if (hasControl(v.name) || hasControl(v.username) || hasControl(v.password)) {
            return `broker ${b}: message VPN ${quote(v.name)}: the name, username and password must not contain control characters`;
        }
    }
    return null;
}
