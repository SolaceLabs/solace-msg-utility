/**
 * The demo's HTTP layer: a `window.fetch` interceptor.
 *
 * One seam serves everything the app fetches — `/hosted`, `/managed/*`, SEMP v2
 * monitor endpoints and SEMP v1 RPCs — which is why `semp-client`,
 * `semp-discovery`, `service-verify`, `hosted.ts` and `managed-service` can all
 * run unmodified in the demo, URL building and pagination included.
 *
 * Anything the router does not recognise falls through to the real `fetch`, so
 * an unrelated request from the page is unaffected.
 *
 * Mock-only.
 */
import { delay, FAULT, scenario } from '../fixtures';
import { handleSempV2 } from './semp-v2';
import { handleSempV1 } from './semp-v1';
import { getConnectionsResponse, hostedResponse } from './managed';

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function xml(body: string): Response {
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/xml' } });
}

/**
 * Synthetic base for parsing request paths.
 *
 * Deliberately NOT `window.location.href`. Opened from disk the page origin is a
 * `file://` URL, and resolving `/hosted` against one is platform-dependent: on
 * Windows the URL spec preserves the drive letter, so
 * `new URL('/hosted', 'file:///C:/…/mock.html')` yields `file:///C:/hosted` and
 * a pathname of `/C:/hosted`. Routing on that made the demo miss `/hosted` and
 * `/managed/*` entirely and fall back to Direct-only.
 *
 * These requests are mocked outright — nothing is ever loaded from disk — so the
 * base only has to be *stable*. A fixed, non-resolvable one makes the routing
 * identical on every platform and for every way the demo is opened.
 */
const ROUTE_BASE = 'https://mock.invalid/';

/**
 * The path to route on. Absolute `file://` inputs would still carry a drive
 * segment, so strip one if present — belt and braces alongside `ROUTE_BASE`.
 */
export function routePath(url: URL): string {
    return url.pathname.replace(/^\/[A-Za-z]:/, '');
}

/** SEMP faults are sticky while armed, so the error UI can be inspected. */
function sempFault(): Response | null {
    if (scenario.fault === FAULT.SEMP_UNAUTHORIZED) {
        return new Response('Unauthorized', { status: 401 });
    }
    if (scenario.fault === FAULT.SEMP_ERROR) {
        return new Response('Internal error', { status: 500 });
    }
    return null;
}

/** Request bodies here are always SEMP v1 XML strings; anything else is not ours. */
function readBody(init?: RequestInit): string {
    return typeof init?.body === 'string' ? init.body : '';
}

async function handleManaged(path: string): Promise<Response> {
    await delay();
    if (path === '/managed/getConnections') {
        const profile = await getConnectionsResponse();
        // The real proxy answers an unknown user with an opaque 400.
        return profile ? json(profile) : new Response('Bad Request', { status: 400 });
    }
    if (path === '/managed/reload') return new Response(null, { status: 204 });
    return new Response('Bad Request', { status: 400 });
}

async function handleSemp(path: string, url: URL, init?: RequestInit): Promise<Response | null> {
    const isRpc = path.endsWith('/SEMP') && (init?.method ?? 'GET').toUpperCase() === 'POST';
    const isMonitor = path.includes('/SEMP/v2/monitor/');
    if (!isRpc && !isMonitor) return null;

    const fault = sempFault();
    if (fault) return fault;
    await delay();

    if (isRpc) return xml(handleSempV1(readBody(init)));
    return json(handleSempV2(url) ?? { data: [], meta: {} });
}

export function installMockServer(): void {
    const realFetch = window.fetch.bind(window);

    window.fetch = async function mockFetch(input: any, init?: RequestInit): Promise<Response> {
        const raw = typeof input === 'string' ? input : (input?.url ?? String(input));
        // Parsed against a fixed base, never the page origin — see ROUTE_BASE.
        const url = new URL(raw, ROUTE_BASE);
        const path = routePath(url);

        if (path === '/hosted') {
            await delay();
            return json(hostedResponse());
        }

        if (path.startsWith('/managed/')) return handleManaged(path);

        const semp = await handleSemp(path, url, init);
        if (semp) return semp;

        return realFetch(input, init);
    } as typeof window.fetch;
}
