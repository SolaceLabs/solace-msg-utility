/**
 * The read-only SEMP relay (go-web-proxy/relay.go), answered by the demo
 * broker instead of a real one. Same refusals in the same order: the path,
 * the query, the read-only rule, then the broker; a broker that refuses the
 * stored credential is a `502 upstream_auth`, never a `401` (which would sign
 * the user out).
 *
 * Not simulated: the cross-site read check, the in-flight cap and the body cap.
 *
 * Mock-only.
 */
import { delay, FAULT, scenario } from '../fixtures';
import { handleSempV1 } from '../server/semp-v1';
import { handleSempV2 } from '../server/semp-v2';
import { hasControl, validBroker } from './validate';
import type { BrokerTarget } from './store';
import type { GatewayRequest, GatewayResponse } from './types';

export const RELAY_PREFIX = '/managed/relay/';

export interface RelayPath {
    broker: string;
    /** The escaped tail from `/SEMP` on, as it goes to the broker. */
    rawTail: string;
    v1: boolean;
}

/** safeSegment: not empty, no control character, no `\ % ;`, no empty, `.` or `..` part. */
function safeSegment(d: string): boolean {
    if (d === '' || hasControl(d) || /[\\%;]/.test(d)) return false;
    return d.split('/').every(p => p !== '' && p !== '.' && p !== '..');
}

/** parseRelayPath: the broker, then exactly `SEMP` or `SEMP/v2/...`. */
export function parseRelayPath(escaped: string): RelayPath | null {
    if (!escaped.startsWith(RELAY_PREFIX)) return null;
    const segs = escaped.slice(RELAY_PREFIX.length).split('/');
    const decoded: string[] = [];
    for (const s of segs) {
        let d: string;
        try {
            d = decodeURIComponent(s);
        } catch {
            return null;
        }
        if (!safeSegment(d)) return null;
        decoded.push(d);
    }
    if (!validBroker(decoded[0]) || decoded.length < 2 || decoded[1] !== 'SEMP') return null;
    const tail = decoded.slice(1);
    const v1 = tail.length === 1;
    if (!v1 && (tail.length < 3 || tail[1] !== 'v2')) return null;
    return { broker: decoded[0], rawTail: '/' + segs.slice(1).join('/'), v1 };
}

/** url.ParseQuery's refusals: a `;` separator or a bad escape. */
function queryOk(q: string): boolean {
    if (q.includes(';')) return false;
    try {
        q.split('&').forEach(p => decodeURIComponent(p.replace(/\+/g, ' ')));
        return true;
    } catch {
        return false;
    }
}

/** isShowRPC: one `<rpc>` root holding exactly one `<show>`, no namespace, no stray text. */
export function isShowRpc(body: string): boolean {
    if (/<!/.test(body.replace(/<!--[\s\S]*?-->/g, ''))) return false;   // a directive (DOCTYPE, CDATA)
    const doc = new DOMParser().parseFromString(body, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return false;
    const root = doc.documentElement;
    if (root.namespaceURI || root.localName !== 'rpc') return false;
    let commands = 0;
    for (const n of Array.from(root.childNodes)) {
        if (n.nodeType === Node.ELEMENT_NODE) {
            if ((n as Element).localName !== 'show') return false;
            commands++;
        } else if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '') {
            return false;
        }
    }
    return commands === 1 && Array.from(root.getElementsByTagName('*')).every(e => !e.namespaceURI);
}

const refuse = (status: number, error: string): GatewayResponse => ({ status, json: { error } });

/**
 * Answer one relayed request for a signed-in user. `target` finds the broker
 * the user may use (null: the same 404 as an unknown one); `unreachable` is the
 * control panel's fault.
 */
export async function relay(
    req: GatewayRequest,
    target: (broker: string) => BrokerTarget | null,
    unreachable: boolean,
): Promise<GatewayResponse> {
    const p = parseRelayPath(req.path);
    if (!p) return refuse(404, 'not_found');
    if (!queryOk(req.query)) return refuse(400, 'bad_request');
    const method = req.method.toUpperCase();
    if (p.v1 ? method !== 'POST' || !isShowRpc(req.body) : method !== 'GET' && method !== 'HEAD') {
        return refuse(403, 'read_only');
    }
    const t = target(p.broker);
    if (!t) return refuse(404, 'not_found');

    await delay();
    // What the broker would answer, mapped as the gateway maps it.
    if (unreachable) return refuse(502, 'upstream_unavailable');
    if (scenario.fault === FAULT.SEMP_UNAUTHORIZED) return refuse(502, 'upstream_auth');
    if (scenario.fault === FAULT.SEMP_ERROR) return { status: 500, text: 'Internal error', contentType: 'text/plain' };

    if (p.v1) return { status: 200, text: handleSempV1(req.body, p.broker), contentType: 'application/xml' };
    const url = new URL(`https://${t.host}:${t.port}${p.rawTail}${req.query ? `?${req.query}` : ''}`);
    const page = handleSempV2(url, p.broker) ?? { data: [], meta: {} };
    return method === 'HEAD' ? { status: 200, contentType: 'application/json' } : { status: 200, json: page };
}
