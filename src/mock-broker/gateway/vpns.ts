/**
 * The Message VPN lookup of the connection form (go-web-proxy/vpns.go):
 * `POST /managed/connections/vpns` answers the names of the Message VPNs a
 * broker holds, read over SEMP v2 with the SEMP details the form sends. Same
 * refusals in the same order: the address and the account as a save checks
 * them, then the password (a blank one stands for the stored one, and only
 * for the saved connection the body names while its hostname, scheme, port,
 * URL path and username are the stored ones), then the broker. A broker that cannot be
 * reached or answers anything but a list is a `502 upstream_unavailable`; one
 * that refuses the account is a `502 upstream_auth`.
 *
 * When a test scripts the broker (`upstream`, the gateway contract does), its
 * answers are read page by page as vpns.go reads them, under the URL path the
 * body names. Otherwise the demo broker answers: it holds only the brokers of
 * the saved connections, so the address must be a saved connection's hostname
 * and the account that connection's. It has no proxy in front of it, so it
 * answers whatever the URL path is.
 *
 * Not simulated: the in-flight cap, the lookup's time limit and the body cap
 * of a page. Not mirrored: an answer that is JSON but not a msgVpns page (the
 * gateway refuses a value of another type; here it is a page without names).
 *
 * Mock-only.
 */
import { delay, FAULT, scenario } from '../fixtures';
import { handleSempV2 } from '../server/semp-v2';
import { sempUsernameOk } from '../../core/utils';
import { hasControl, HOST_RULE, portProblem, quote, schemeOk, SEMP_SCHEMES, SEMP_USER_RULE, URL_PATH_RULE, validHost, validUrlPath } from './validate';
import type { Upstream } from './relay';
import type { BrokerTarget, GatewayStore } from './store';
import type { GatewayResponse } from './types';

/** vpnLookupNeedsPassword: the reason a lookup without a password gets when no stored one applies. */
const VPN_LOOKUP_NEEDS_PASSWORD =
    'Type the SEMP password. The stored one is used only for a saved connection whose hostname, scheme, port, URL path and username are unchanged.';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
/** The broker's own limit on a Message VPN name. */
const MAX_NAME = 32;

/** vpnLookupJSON: the body, every field a string. */
export interface VpnLookupBody {
    broker: string;
    hostname: string;
    semp: { scheme: string; port: string; urlPath: string; user: string; pass: string };
}

const refuse = (status: number, error: string): GatewayResponse => ({ status, json: { error } });
const invalid = (field: string, reason: string): GatewayResponse => ({ status: 422, json: { error: 'invalid', field, reason } });

/** lookupTarget: the broker a lookup names and the credential to use there, or its 422. */
function lookupTarget(b: VpnLookupBody, store: GatewayStore): BrokerTarget | GatewayResponse {
    const [tls, plain] = SEMP_SCHEMES;
    if (!validHost(b.hostname)) return invalid('hostname', `hostname ${quote(b.hostname)} ${HOST_RULE}`);
    if (!schemeOk(b.semp.scheme, tls, plain)) {
        return invalid('semp.scheme', `semp.scheme ${quote(b.semp.scheme)} must be ${quote(tls)} or ${quote(plain)}`);
    }
    if (b.semp.port === '') return invalid('semp.port', 'A SEMP port is required to read the Message VPNs.');
    const port = portProblem(b.semp.port);
    if (port) return invalid('semp.port', `semp.port ${port}`);
    const path = b.semp.urlPath;
    if (!validUrlPath(path)) return invalid('semp.urlPath', `semp.urlPath ${quote(path)} ${URL_PATH_RULE}`);
    if (b.semp.user === '') return invalid('semp.user', 'A SEMP username is required to read the Message VPNs.');
    if (!sempUsernameOk(b.semp.user)) return invalid('semp.user', `The SEMP username ${SEMP_USER_RULE}.`);
    if (hasControl(b.semp.pass)) return invalid('semp.pass', 'The SEMP password must not contain control characters.');
    const scheme = b.semp.scheme || tls;
    let pass = b.semp.pass;
    if (pass === '') {
        const stored = store.sempOf(b.broker);
        if (!stored || stored.host !== b.hostname || stored.scheme !== scheme || stored.port !== b.semp.port || stored.path !== path
            || stored.user !== b.semp.user) {
            return invalid('semp.pass', VPN_LOOKUP_NEEDS_PASSWORD);
        }
        pass = stored.pass;
    }
    return { scheme, host: b.hostname, port: b.semp.port, path, user: b.semp.user, pass };
}

/** nextCursor: of a broker's nextPageUri only the cursor is used, never its address or path. */
function nextCursor(nextPageUri: unknown): string {
    try {
        return new URL(String(nextPageUri), 'http://lookup.invalid').searchParams.get('cursor') ?? '';
    } catch {
        return '';
    }
}

interface Page { names: unknown[]; cursor: string }

/** One page of a msgVpns answer: its names and the cursor of the next page, or null for an answer that is not JSON. */
function readPage(body: string): Page | null {
    try {
        const doc = JSON.parse(body) as { data?: { msgVpnName?: unknown }[]; meta?: { paging?: { nextPageUri?: unknown } } };
        return { names: (doc.data ?? []).map(d => d.msgVpnName), cursor: nextCursor(doc.meta?.paging?.nextPageUri ?? '') };
    } catch {
        return null;
    }
}

/** net.JoinHostPort: an IPv6 address goes in brackets. */
const hostPort = (t: BrokerTarget): string => (t.host.includes(':') ? `[${t.host}]:${t.port}` : `${t.host}:${t.port}`);

/**
 * Answer one lookup for an administrator. `unreachable` is the control
 * panel's fault; `upstream` is the broker a test scripts.
 */
export async function lookupVpns(body: VpnLookupBody, store: GatewayStore, unreachable: boolean, upstream?: Upstream): Promise<GatewayResponse> {
    const t = lookupTarget(body, store);
    if ('status' in t) return t;

    // The demo broker at this address: the one a saved connection names there.
    const broker = store.listConnections().find(c => c.hostname === t.host)?.broker ?? '';
    if (!upstream) {
        await delay();
        // What the demo broker would answer, mapped as the gateway maps it.
        const account = store.sempOf(broker);
        if (unreachable || !account || scenario.fault === FAULT.SEMP_ERROR) return refuse(502, 'upstream_unavailable');
        if (scenario.fault === FAULT.SEMP_UNAUTHORIZED || account.user !== t.user || account.pass !== t.pass) return refuse(502, 'upstream_auth');
    }

    const seen = new Set<string>();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
        // url.Values.Encode: the keys in order.
        const query = new URLSearchParams({ count: String(PAGE_SIZE) });
        if (cursor) query.set('cursor', cursor);
        query.set('select', 'msgVpnName');
        const asked = `/SEMP/v2/monitor/msgVpns?${query.toString()}`;
        let got: Page | null;
        if (upstream) {
            const a = upstream({ method: 'GET', url: `${t.scheme}://${hostPort(t)}${t.path}${asked}`, body: '' });
            if (a.error !== undefined) return refuse(502, 'upstream_unavailable');
            if (a.status === 401 || a.status === 403 || a.status === 407) return refuse(502, 'upstream_auth');
            got = a.status === 200 ? readPage(a.body ?? '') : null;
        } else {
            got = readPage(JSON.stringify(handleSempV2(new URL(`${t.scheme}://${hostPort(t)}${asked}`), broker)));
        }
        if (!got) return refuse(502, 'upstream_unavailable');
        for (const n of got.names) {
            if (typeof n === 'string' && n !== '' && n.length <= MAX_NAME && !hasControl(n)) seen.add(n);
        }
        cursor = got.cursor;
        if (cursor === '') break;
    }
    return { status: 200, json: { vpns: [...seen].sort() } };
}
