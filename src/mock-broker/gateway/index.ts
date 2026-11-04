/**
 * The managed demo's fake gateway: what go-web-proxy serves under `/managed/*`
 * and `/hosted`, in the browser, over fake users, connections and settings
 * and the demo broker. The app's real managed code talks to it through
 * `fetch`, as it talks to the gateway.
 *
 * It is held to the gateway's contract (go-web-proxy/testdata/contract/):
 * tests/mock-broker/gateway/contract.test.ts runs the same cases against it
 * that go-web-proxy/contract_test.go runs against the gateway.
 *
 * The page's session cookie is the gateway's own state here (`cookie`): the
 * real one is `HttpOnly`, so no app code reads it either way.
 *
 * Mock-only.
 */
import { delay } from '../fixtures';
import type { MockRoute } from '../server';
import { createRouter, type RouterFaults } from './router';
import { createSessions } from './sessions';
import { createSettings, type SettingsFaults } from './settings';
import { createStore } from './store';
import type { GatewayRequest, GatewayResponse, GatewaySeed } from './types';

/** Sent on every fake-gateway answer; `check-bundles.mjs` requires it in the demo bundle only. */
export const DEMO_GATEWAY_MARKER = 'smu-demo-gateway/1';

export type GatewayFaults = RouterFaults & SettingsFaults;

function toResponse(r: GatewayResponse): Response {
    const headers: Record<string, string> = {
        'Cache-Control': 'no-store',
        'X-Demo-Gateway': DEMO_GATEWAY_MARKER,
        ...r.headers,
    };
    let body: string | null = null;
    if (r.json !== undefined) {
        body = JSON.stringify(r.json);
        headers['Content-Type'] = 'application/json';
    } else if (r.text !== undefined) {
        body = r.text;
    }
    if (r.contentType) headers['Content-Type'] = r.contentType;
    return new Response(r.status === 204 ? null : body, { status: r.status, headers });
}

export function createGateway({ seed }: { seed: GatewaySeed }) {
    const faults: GatewayFaults = { relayUnreachable: false, dialRateLimited: false, changedOnDisk: false, unreadable: false };
    const changeListeners: (() => void)[] = [];
    const store = createStore(seed, () => changeListeners.forEach(fn => fn()));
    const sessions = createSessions();
    const settings = createSettings(seed.settings, seed.client, () => faults);
    const router = createRouter({ store, sessions, settings, faults: () => faults });
    let cookie: string | null = null;

    /** `/hosted`, with the live connection modes. */
    function hosted(): GatewayResponse {
        const s = settings.current();
        return { status: 200, json: { hosted: true, connModes: s.connModes, defaultConn: s.defaultConn } };
    }

    /** The `installMockServer` route: `/hosted` and `/managed/*`, with the page's cookie. */
    const route: MockRoute = async (path, url, init) => {
        if (path !== '/hosted' && !path.startsWith('/managed/')) return null;
        await delay();
        if (path === '/hosted') return toResponse(hosted());
        const req: GatewayRequest = {
            method: (init?.method ?? 'GET').toUpperCase(),
            path,
            query: url.search.replace(/^\?/, ''),
            body: typeof init?.body === 'string' ? init.body : '',
            session: cookie,
        };
        const res = await router.handle(req);
        // Logout clears the cookie (clearSessionCookie).
        if (req.path === '/managed/logout' && res.status === 204) cookie = null;
        return toResponse(res);
    };

    return {
        route,
        handle: router.handle,
        store,
        sessions,
        settings,
        faults,
        /** Open a session, as a sign-in does; the caller decides whether the page holds it. */
        openSession: (user: string, mustChange: boolean): string => sessions.create(user, mustChange),
        cookie: (): string | null => cookie,
        setCookie(id: string | null): void {
            cookie = id;
        },
        /** After every committed user or connection edit (store.onChange). */
        onStoreChange(fn: () => void): void {
            changeListeners.push(fn);
        },
    };
}

export type Gateway = ReturnType<typeof createGateway>;
