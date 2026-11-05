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
 * real one is `HttpOnly`, so no app code reads it either way. SMF sockets are
 * the SDK emulator's sessions, admitted by `sockets.gate` (which the managed
 * demo's boot hands to `setSocketGate`) and closed on revocation.
 *
 * Mock-only.
 */
import { delay } from '../fixtures';
import type { MockRoute } from '../server';
import { createRouter, type RouterFaults } from './router';
import { createSessions } from './sessions';
import { createSettings, type SettingsFaults } from './settings';
import { createSockets } from './sockets';
import { createStore, type GatewayStore } from './store';
import { createThrottle, throttledText, type ThrottleState } from './throttle';
import { PASSWORD_MAX, PASSWORD_MIN, passwordOk } from './validate';
import type { GatewayRequest, GatewayResponse, GatewaySeed, GatewaySettings } from './types';
import type { Session } from './sessions';

/** Sent on every fake-gateway answer; `check-bundles.mjs` requires it in the demo bundle only. */
export const DEMO_GATEWAY_MARKER = 'smu-demo-gateway/1';

export type GatewayFaults = RouterFaults & SettingsFaults;

/** A sign-in page's answer: through (and whether the password must change first), or the error it shows. */
export type PageResult = { ok: true; mustChange: boolean } | { ok: false; error: string; signedOut?: boolean };

/** Everything a reload must carry, as plain data. */
export interface GatewaySnapshot {
    store: ReturnType<GatewayStore['dump']>;
    sessions: [string, Session][];
    settings: GatewaySettings;
    cookie: string | null;
    faults: GatewayFaults;
    throttle: ThrottleState;
}

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
    const sockets = createSockets(store, sessions, () => cookie);
    changeListeners.push(() => sockets.recheck());
    const throttle = createThrottle(() => settings.current().login);

    /**
     * submitLogin (pages.go): the throttle before the password, the same
     * message for every failure, and a previous session in this browser ended.
     */
    function signIn(username: string, password: string): PageResult {
        const wait = throttle.wait(username);
        if (wait > 0) return { ok: false, error: throttledText(wait) };
        const u = store.findUser(username);
        if (!u || u.password !== password) {
            throttle.failed(username);
            return { ok: false, error: 'Sign-in failed. Check the username and password.' };
        }
        throttle.succeeded(username);
        if (cookie) sessions.drop(cookie);
        cookie = sessions.create(u.username, u.mustChangePassword);
        return { ok: true, mustChange: u.mustChangePassword };
    }

    /**
     * submitPassword (pages.go): the user's own change. A wrong current
     * password counts as a failed sign-in; a success ends every session of the
     * user and this browser gets a fresh one.
     */
    function changePassword(current: string, next: string, confirm: string): PageResult {
        const s = sessions.get(cookie);
        if (!s) return { ok: false, error: '', signedOut: true };
        const wait = throttle.wait(s.user);
        if (wait > 0) return { ok: false, error: throttledText(wait) };
        if (store.findUser(s.user)?.password !== current) {
            throttle.failed(s.user);
            return { ok: false, error: 'The current password is not correct.' };
        }
        if (next !== confirm) return { ok: false, error: 'The new passwords do not match.' };
        if (!passwordOk(next)) return { ok: false, error: `The new password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.` };
        if (next === current) return { ok: false, error: 'The new password must differ from the current one.' };
        store.setPassword(s.user, next);
        throttle.succeeded(s.user);
        sessions.dropUser(s.user);
        cookie = sessions.create(s.user, false);
        return { ok: true, mustChange: false };
    }

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
        sockets,
        faults,
        signIn,
        changePassword,
        throttle,
        /** The page's session, if it holds a live one. */
        session: (): Session | null => sessions.get(cookie),
        snapshot(): GatewaySnapshot {
            return {
                store: store.dump(), sessions: sessions.dump(), settings: settings.dump(),
                cookie, faults: { ...faults }, throttle: throttle.dump(),
            };
        },
        restore(s: GatewaySnapshot): void {
            store.load(s.store);
            sessions.load(s.sessions);
            settings.load(s.settings);
            cookie = s.cookie;
            Object.assign(faults, s.faults);
            throttle.load(s.throttle);
        },
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
