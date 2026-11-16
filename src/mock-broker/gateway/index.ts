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
 * real one is `HttpOnly`, so no app code reads it either way. A half-finished
 * two-factor sign-in is a ticket (tickets.ts) held by a second cookie of the
 * same kind (`ticketCookie`), never a session. SMF sockets are
 * the SDK emulator's sessions, admitted by `sockets.gate` (which the managed
 * demo's boot hands to `setSocketGate`) and closed on revocation.
 *
 * A restart (`POST /managed/restart`) ends every session, ticket and socket;
 * the gateway is then unreachable (`fetch`
 * fails, as against a stopped process) for RESTART_PAUSE_MS, after which the
 * `onRestart` listeners run: the boot's land the page on the sign-in.
 *
 * Mock-only.
 */
import { delay } from '../fixtures';
import { BACKUP_ITER, createBackups, type BackupsState } from './backup';
import type { MockRoute } from '../server';
import { acceptedStep, hashRecovery, newRecoveryCodes, newSecret, twoFactorNeed } from './authenticator';
import { createRouter, type RouterFaults } from './router';
import type { Upstream } from './relay';
import { createSessions } from './sessions';
import { createSettings, type SettingsFaults } from './settings';
import { createSockets } from './sockets';
import { createStore, type GatewayStore } from './store';
import { createTls, type TlsFaults, type TlsState } from './tls';
import { createTickets, type Ticket } from './tickets';
import { createThrottle, throttledText, type ThrottleState } from './throttle';
import { PASSWORD_MAX, passwordOk } from './validate';
import type { GatewayRequest, GatewayResponse, GatewaySeed, GatewaySettings, UserTotp } from './types';
import type { Session } from './sessions';

/** Sent on every fake-gateway answer; `check-bundles.mjs` requires it in the demo bundle only. */
export const DEMO_GATEWAY_MARKER = 'smu-demo-gateway/1';

/** How long the restarted gateway stays unreachable, the page's wait before it returns to the sign-in. */
export const RESTART_PAUSE_MS = 1500;

export type GatewayFaults = RouterFaults & SettingsFaults & TlsFaults;

/** A sign-in page's answer: through (and whether the password must change first), or the error it shows. */
export type PageResult = { ok: true; mustChange: boolean } | { ok: false; error: string; signedOut?: boolean };

/**
 * A password sign-in's answer: a page result, or `step` when the password
 * passed but no session opens yet (a code is due, or two-factor must be set up first).
 */
export type SignInResult = PageResult | { ok: true; step: 'code' | 'enrol' };

/** The password step of setting two-factor up again: the new secret, or the error it shows. */
export type VerifyResult = { ok: true; secret: string } | { ok: false; error: string; signedOut?: boolean };

/** The last step of setting it up: the recovery codes to show once, or the error it shows. */
export type EnrolResult = { ok: true; mustChange: boolean; recovery: string[] } | { ok: false; error: string; signedOut?: boolean };

/** What `/login/two-factor` shows (showTwoFactor in pages.go): the enrol page, the set-up-again page, or a redirect to /login. */
export type TwoFactorPage =
    | { kind: 'enrol'; secret: string }
    | { kind: 'setup'; enrolled: boolean }
    | { kind: 'login' };

const SIGNIN_FAILED = 'Sign-in failed. Check the username and password.';
const BAD_CODE = 'The code is not correct.';
const BAD_VERIFY = 'The password or the code is not correct.';

/** Everything a reload must carry, as plain data. */
export interface GatewaySnapshot {
    store: ReturnType<GatewayStore['dump']>;
    sessions: [string, Session][];
    settings: GatewaySettings;
    /** The settings file's rev at the dump (a counter written out). */
    settingsRev: string;
    cookie: string | null;
    faults: GatewayFaults;
    throttle: ThrottleState;
    /** Absent in a snapshot from a build before Backup & Restore. */
    backups?: BackupsState;
    /** Absent in a snapshot from a build before two-factor sign-in. */
    tickets?: [string, Ticket][];
    ticketCookie?: string | null;
    /** The last step accepted per user (the replay rule). */
    lastSteps?: [string, number][];
    /** Absent in a snapshot from a build before the TLS console. */
    tls?: TlsState;
}

/** The headers an answer goes out with (the gateway contract compares them). */
export function responseHeaders(r: GatewayResponse): Record<string, string> {
    const headers: Record<string, string> = {
        'Cache-Control': 'no-store',
        'X-Demo-Gateway': DEMO_GATEWAY_MARKER,
        ...r.headers,
    };
    if (r.json !== undefined) headers['Content-Type'] = 'application/json';
    if (r.contentType) headers['Content-Type'] = r.contentType;
    return headers;
}

function toResponse(r: GatewayResponse): Response {
    let body: string | null = null;
    if (r.json !== undefined) {
        body = JSON.stringify(r.json);
    } else if (r.text !== undefined) {
        body = r.text;
    }
    return new Response(r.status === 204 ? null : body, { status: r.status, headers: responseHeaders(r) });
}

/**
 * `backupIter` is the PBKDF2 cost of a new backup key (the gateway's own by
 * default; tests pass a lower one), `now` the clock backups are named by, and
 * `upstream` a scripted broker behind the relay (the gateway contract's; the
 * demo broker answers without one).
 */
export function createGateway({ seed, backupIter = BACKUP_ITER, now = () => new Date(), upstream }: {
    seed: GatewaySeed; backupIter?: number; now?: () => Date; upstream?: Upstream;
}) {
    const faults: GatewayFaults = { relayUnreachable: false, dialRateLimited: false, changedOnDisk: false, unreadable: false, tlsReadOnly: false };
    const changeListeners: (() => void)[] = [];
    const store = createStore(seed, () => changeListeners.forEach(fn => fn()));
    const sessions = createSessions();
    const settings = createSettings(seed.settings, seed.client, () => faults);
    const backups = createBackups({ store, settings, sessions, iter: backupIter, now });
    const tls = createTls({ now, readOnly: () => faults.tlsReadOnly });
    const router = createRouter({
        store, sessions, settings, faults: () => faults, backupRoutes: backups.routes, tlsRoutes: tls.routes, restart, client: seed.client, upstream,
    });
    let cookie: string | null = null;
    let ticketCookie: string | null = null;
    /** Between a restart and the gateway being back: nothing answers. */
    let down = false;
    const restartListeners: (() => void)[] = [];
    /** The last TOTP step accepted per user: a step at or below it is a replay. */
    const lastStep = new Map<string, number>();
    const tickets = createTickets(() => now().getTime(), () => settings.current().login.twoFactorMinutes * 60_000);
    // A user-wide drop (a password change, a delete, an import, a reset) ends that user's tickets too.
    sessions.onDropUser(user => tickets.dropUser(user));
    const sockets = createSockets(store, sessions, () => cookie);
    changeListeners.push(() => sockets.recheck());
    const throttle = createThrottle(() => settings.current().login);

    /**
     * The gateway restarts in place: every session, ticket and socket ends, and nothing
     * answers until it is back, when the listeners run.
     */
    function restart(): void {
        sessions.dropAll();
        tickets.clear();
        sockets.closeAll();
        cookie = null;
        ticketCookie = null;
        down = true;
        setTimeout(() => {
            down = false;
            restartListeners.forEach(fn => fn());
        }, RESTART_PAUSE_MS);
    }

    const endTicket = (): void => {
        tickets.end(ticketCookie);
        ticketCookie = null;
    };

    /**
     * acceptCode (spendCode in pages.go): a code of six digits, once spaces and hyphens are taken
     * out ("123 456" as authenticator apps show it), is a TOTP code (a mock one here), checked
     * against the user's secret and the replay rule; anything else is tried as a recovery code,
     * which a match uses up. Nothing is recorded for a code that fails.
     */
    function acceptCode(user: string, totp: UserTotp, code: string): boolean {
        const digits = code.replace(/[ -]/g, '');
        if (!/^[0-9]{6}$/.test(digits)) return store.useRecovery(user, hashRecovery(code)) !== null;
        const step = acceptedStep(totp.secret, digits, now().getTime(), lastStep.get(user));
        if (step === null) return false;
        lastStep.set(user, step);
        return true;
    }

    /**
     * submitLogin (pages.go): the throttle before the password, the same
     * message for every failure, and a previous session in this browser ended.
     * When the password passes but the setting asks for more (twoFactorNeed),
     * no session opens: a ticket does, and the result names the step.
     */
    function signIn(username: string, password: string): SignInResult {
        const wait = throttle.wait(username);
        if (wait > 0) return { ok: false, error: throttledText(wait) };
        const u = store.findUser(username);
        if (!u || u.password !== password) {
            throttle.failed(username);
            return { ok: false, error: SIGNIN_FAILED };
        }
        endTicket();
        const need = twoFactorNeed(settings.current().login.twoFactor, u.admin, u.totp !== undefined);
        if (need !== 'none') {
            // The count is not cleared yet: the code or the enrolment does that.
            if (cookie) sessions.drop(cookie);
            cookie = null;
            ticketCookie = tickets.create({
                user: u.username, stage: need, password: u.password, mustChange: u.mustChangePassword, secret: need === 'enrol' ? newSecret() : '',
            });
            return { ok: true, step: need };
        }
        throttle.succeeded(username);
        if (cookie) sessions.drop(cookie);
        cookie = sessions.create(u.username, u.mustChangePassword);
        return { ok: true, mustChange: u.mustChangePassword };
    }

    /** `GET /login/code` has a ticket waiting for a code. */
    const codePending = (): boolean => tickets.get(ticketCookie)?.stage === 'code';

    /**
     * submitCode (pages.go): the sign-in throttle as for a password; a valid code or recovery code
     * opens the session (through the account check: one that changed meanwhile is refused as a
     * sign-in is) and ends the ticket. A wrong one counts a failure.
     */
    function submitCode(code: string): PageResult {
        const t = tickets.get(ticketCookie);
        if (!t || t.stage !== 'code') return { ok: false, error: '', signedOut: true };
        const wait = throttle.wait(t.user);
        if (wait > 0) return { ok: false, error: throttledText(wait) };
        const u = store.findUser(t.user);
        if (!u || u.password !== t.password || !u.totp) {
            endTicket();
            return { ok: false, error: SIGNIN_FAILED, signedOut: true };
        }
        if (!acceptCode(t.user, u.totp, code)) {
            throttle.failed(t.user);
            return { ok: false, error: BAD_CODE };
        }
        endTicket();
        throttle.succeeded(t.user);
        cookie = sessions.create(t.user, t.mustChange);
        return { ok: true, mustChange: t.mustChange };
    }

    /**
     * showTwoFactor (pages.go): an enrol ticket shows the enrol page; a signed-in user (not held
     * at the password page) the set-up-again page; anyone else is sent to /login.
     */
    function twoFactorPage(): TwoFactorPage {
        const t = tickets.get(ticketCookie);
        if (t?.stage === 'enrol') return { kind: 'enrol', secret: t.secret };
        const s = sessions.get(cookie);
        if (s && !s.mustChange) return { kind: 'setup', enrolled: store.totpOf(s.user) !== undefined };
        return { kind: 'login' };
    }

    /**
     * submitTwoFactor, step=verify (signed in): the password, and the code or a recovery code when
     * the user is enrolled, with the own-password change's throttle and one message for either
     * failure. A pass makes a `setup` ticket with a new secret.
     */
    function verifyTwoFactor(password: string, code: string): VerifyResult {
        const s = sessions.get(cookie);
        if (!s || s.mustChange) return { ok: false, error: '', signedOut: true };
        const wait = throttle.wait(s.user);
        if (wait > 0) return { ok: false, error: throttledText(wait) };
        const totp = store.totpOf(s.user);
        const good = store.findUser(s.user)?.password === password && (!totp || acceptCode(s.user, totp, code));
        if (!good) {
            throttle.failed(s.user);
            return { ok: false, error: BAD_VERIFY };
        }
        const secret = newSecret();
        endTicket();
        ticketCookie = tickets.create({ user: s.user, stage: 'setup', password, mustChange: false, secret });
        return { ok: true, secret };
    }

    /**
     * submitTwoFactor, step=confirm (an `enrol` or `setup` ticket): the code must be valid for the
     * ticket's secret (no replay rule: it is a new secret). A wrong one counts a failure and the
     * page shows the same secret again. A right one stores the secret with 10 new recovery codes
     * in one commit, opens the session (enrol), ends the user's other sessions and the ticket,
     * and hands the codes back to show once.
     */
    function confirmTwoFactor(code: string): EnrolResult {
        const t = tickets.get(ticketCookie);
        if (!t || t.stage === 'code') return { ok: false, error: '', signedOut: true };
        const wait = throttle.wait(t.user);
        if (wait > 0) return { ok: false, error: throttledText(wait) };
        if (acceptedStep(t.secret, code, now().getTime(), undefined) === null) {
            throttle.failed(t.user);
            return { ok: false, error: BAD_CODE };
        }
        const recovery = newRecoveryCodes();
        const stored = t.stage === 'setup' && sessions.get(cookie)?.user !== t.user
            ? 'not_found'
            : store.setTotp(t.user, { secret: t.secret, recovery: recovery.map(hashRecovery) }, t.password);
        if (stored !== 'ok') {
            endTicket();
            return { ok: false, error: SIGNIN_FAILED, signedOut: true };
        }
        if (t.stage === 'enrol') cookie = sessions.create(t.user, t.mustChange);
        lastStep.delete(t.user);   // a new secret starts its own history (forget in totp.go)
        throttle.succeeded(t.user);
        sessions.dropOthers(t.user, cookie);
        endTicket();
        return { ok: true, mustChange: t.mustChange, recovery };
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
        const least = settings.current().login.passwordMinLength;
        if (!passwordOk(next, least)) return { ok: false, error: `The new password must be ${least} to ${PASSWORD_MAX} characters.` };
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
        if (down) throw new TypeError('Failed to fetch');   // a stopped gateway: the connection is refused
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
        tls,
        faults,
        signIn,
        submitCode,
        codePending,
        twoFactorPage,
        verifyTwoFactor,
        confirmTwoFactor,
        changePassword,
        throttle,
        /** The page's session, if it holds a live one. */
        session: (): Session | null => sessions.get(cookie),
        /** The page's sign-in ticket, if it holds a live one. */
        ticket: (): Ticket | null => tickets.get(ticketCookie),
        tickets,
        /** The clock tickets, codes and backups are read by. */
        now,
        /**
         * Every secret the Demo controls' Authenticator lists: each enrolled account's, and each one
         * pending in a ticket (`pending`), so a visitor setting two-factor up has a code to type.
         */
        authenticators(): { user: string; secret: string; pending: boolean }[] {
            return [
                ...store.listTotp().map(a => ({ ...a, pending: false })),
                ...tickets.pending().map(a => ({ ...a, pending: true })),
            ];
        },
        snapshot(): GatewaySnapshot {
            return {
                store: store.dump(), sessions: sessions.dump(), settings: settings.dump(), settingsRev: settings.rev(),
                cookie, faults: { ...faults }, throttle: throttle.dump(), backups: backups.dump(),
                tickets: tickets.dump(), ticketCookie, lastSteps: Array.from(lastStep), tls: tls.dump(),
            };
        },
        restore(s: GatewaySnapshot): void {
            store.load(s.store);
            sessions.load(s.sessions);
            settings.load(s.settings, s.settingsRev);
            cookie = s.cookie;
            Object.assign(faults, s.faults);
            throttle.load(s.throttle);
            if (s.backups) backups.load(s.backups);
            tickets.load(s.tickets ?? []);
            ticketCookie = s.ticketCookie ?? null;
            lastStep.clear();
            for (const [user, step] of s.lastSteps ?? []) lastStep.set(user, step);
            if (s.tls) tls.load(s.tls);
        },
        /** Open a session, as a sign-in does; the caller decides whether the page holds it. */
        openSession: (user: string, mustChange: boolean): string => sessions.create(user, mustChange),
        cookie: (): string | null => cookie,
        setCookie(id: string | null): void {
            cookie = id;
        },
        /** The gateway came back after a restart (RESTART_PAUSE_MS later): the boot lands the page on the sign-in. */
        onRestart(fn: () => void): void {
            restartListeners.push(fn);
        },
        /** After every committed user or connection edit (store.onChange). */
        onStoreChange(fn: () => void): void {
            changeListeners.push(fn);
        },
    };
}

export type Gateway = ReturnType<typeof createGateway>;
