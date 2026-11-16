// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { mockCode, stepOf, STEP_MS, hashRecovery, SECRET_RULE, HASH_RULE } from '../../../src/mock-broker/gateway/authenticator';
import { TICKET_TTL_MS } from '../../../src/mock-broker/gateway/tickets';
import { settingsFromBackup } from '../../../src/mock-broker/gateway/settings';
import { demoSeed } from '../../../src/mock-broker/gateway/seed';
import { contractSeed } from './helpers';

/**
 * Two-factor sign-in in the fake gateway: the rule per mode, the code and
 * enrol steps and their tickets, the replay and throttle rules, recovery
 * codes, setting it up again, the administrator's reset, the rev rule and the
 * setting itself. Every refusal is held to leave the store and the sessions
 * as they were. The pages that show these steps are in pages.test.ts; the
 * contract's JSON cases are in contract.test.ts.
 */
const PW = { admin: 'demo-admin-0001', operator: 'demo-operator-01', viewer: 'demo-viewer-0001', newadmin: 'demo-change-me-01' };
const THROTTLED = /^Too many attempts\. Try again in \d+ seconds\.$/;

let clock: number;
let gw: ReturnType<typeof createGateway>;

beforeEach(() => {
    clock = Date.UTC(2026, 10, 15, 12, 0, 0);
    gw = createGateway({ seed: demoSeed(), now: () => new Date(clock) });
});

const setMode = (mode: string) => {
    expect(gw.settings.save({ login: { twoFactor: mode } }, gw.settings.rev()).ok).toBe(true);
};
const codeNow = (secret: string, step = 0) => mockCode(secret, stepOf(clock) + step);
/** A six-digit code that is not valid for the secret in any step the gateway accepts. */
const badCode = (secret: string) => ['000000', '111111'].find(c => ![-1, 0, 1].map(d => codeNow(secret, d)).includes(c))!;
const signOut = () => {
    gw.sessions.drop(gw.cookie()!);
    gw.setCookie(null);
};
const sessionsOf = (user: string) => gw.sessions.dump().filter(([, s]) => s.user === user).length;
const userRow = (name: string) => gw.store.listUsers().find(u => u.username === name)!;
const seq = () => gw.store.seqs().users;

/** Sign `user` in under `mandatory` and set two-factor up: signed in at the end, with the secret and the ten codes. */
function enrol(user: keyof typeof PW, mode = 'mandatory') {
    setMode(mode);
    expect(gw.signIn(user, PW[user])).toEqual({ ok: true, step: 'enrol' });
    const secret = gw.ticket()!.secret;
    const r = gw.confirmTwoFactor(codeNow(secret));
    if (!r.ok) throw new Error(r.error);
    return { secret, recovery: r.recovery };
}

/** An enrolled user, signed out, under `optional`. */
function enrolled(user: keyof typeof PW) {
    const e = enrol(user);
    signOut();
    setMode('optional');
    return e;
}

describe('mock-broker/gateway two-factor -- who is asked', () => {
    it('optional asks for a code only of whoever is enrolled', () => {
        setMode('optional');
        expect(gw.signIn('admin', PW.admin)).toEqual({ ok: true, mustChange: false });
        const { secret } = enrolled('viewer');
        expect(secret).toMatch(SECRET_RULE);
        expect(gw.signIn('viewer', PW.viewer)).toEqual({ ok: true, step: 'code' });
        expect(gw.ticket()).toMatchObject({ user: 'viewer', stage: 'code', secret: '' });
    });

    it('admins sends an administrator without two-factor to set it up, and leaves everyone else alone', () => {
        setMode('admins');
        expect(gw.signIn('viewer', PW.viewer)).toEqual({ ok: true, mustChange: false });
        expect(gw.signIn('admin', PW.admin)).toEqual({ ok: true, step: 'enrol' });
        expect(gw.ticket()).toMatchObject({ user: 'admin', stage: 'enrol' });
        expect(gw.ticket()!.secret).toMatch(SECRET_RULE);
    });

    it('mandatory sends everyone without two-factor to set it up', () => {
        setMode('mandatory');
        expect(gw.signIn('viewer', PW.viewer)).toEqual({ ok: true, step: 'enrol' });
        expect(gw.signIn('operator', PW.operator)).toEqual({ ok: true, step: 'enrol' });
    });

    it('opens no session while a step is due, ends this browser\'s previous one and the previous ticket', () => {
        setMode('mandatory');
        expect(gw.signIn('admin', PW.admin)).toEqual({ ok: true, step: 'enrol' });
        const first = gw.cookie();
        expect([first, gw.session(), sessionsOf('admin')]).toEqual([null, null, 0]);

        enrol('operator');
        const live = gw.cookie()!;
        expect(gw.sessions.get(live)).not.toBeNull();
        expect(gw.signIn('operator', PW.operator)).toEqual({ ok: true, step: 'code' });
        expect([gw.cookie(), gw.sessions.get(live)]).toEqual([null, null]);
        expect(gw.codePending()).toBe(true);
    });

    it('ends a standing ticket at the next password sign-in, so a stale step cannot be finished', () => {
        setMode('mandatory');
        gw.signIn('admin', PW.admin);
        setMode('optional');
        expect(gw.signIn('viewer', PW.viewer)).toEqual({ ok: true, mustChange: false });
        expect(gw.ticket()).toBeNull();
        expect(gw.confirmTwoFactor('123456')).toEqual({ ok: false, error: '', signedOut: true });
    });

    it('does not clear the failure count at the password step: the code step finishes the count', () => {
        const { secret } = enrolled('viewer');
        for (let i = 0; i < 4; i++) expect(gw.signIn('viewer', 'wrong-password').ok).toBe(false);
        expect(gw.signIn('viewer', PW.viewer)).toEqual({ ok: true, step: 'code' });
        expect(gw.submitCode(badCode(secret))).toEqual({ ok: false, error: 'The code is not correct.' });   // the fifth failure
        expect(gw.signIn('viewer', PW.viewer)).toMatchObject({ ok: false });
    });
});

describe('mock-broker/gateway two-factor -- the code step', () => {
    it('signs in with a valid code: a session, the ticket gone, the failure count cleared', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(badCode(secret)).ok).toBe(false);
        expect(gw.submitCode(codeNow(secret))).toEqual({ ok: true, mustChange: false });
        expect(gw.session()).toEqual({ user: 'viewer', mustChange: false });
        expect(gw.ticket()).toBeNull();
        expect(gw.codePending()).toBe(false);
        signOut();
        for (let i = 0; i < 4; i++) gw.signIn('viewer', 'wrong-password');
        expect(gw.signIn('viewer', PW.viewer)).toMatchObject({ ok: true });   // 4 of 5: not locked, so the count began again
    });

    it('refuses a wrong code with a failure counted, and opens nothing', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(badCode(secret))).toEqual({ ok: false, error: 'The code is not correct.' });
        expect(gw.session()).toBeNull();
        expect(sessionsOf('viewer')).toBe(0);
        expect(gw.codePending()).toBe(true);   // the form comes again
    });

    it('accepts only the steps around now: a code two steps off, either way, is refused', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(codeNow(secret, -2)).ok).toBe(false);
        expect(gw.submitCode(codeNow(secret, 2)).ok).toBe(false);
        expect(gw.submitCode(codeNow(secret, 1)).ok).toBe(true);
    });

    it('refuses a code used before, and takes the next step\'s', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(codeNow(secret)).ok).toBe(true);
        signOut();

        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(codeNow(secret))).toEqual({ ok: false, error: 'The code is not correct.' });
        clock += STEP_MS;   // the code of the step before is still in the window, and still a replay
        expect(gw.submitCode(codeNow(secret, -1)).ok).toBe(false);
        expect(gw.submitCode(codeNow(secret)).ok).toBe(true);
    });

    it('blocks the right code while the throttle holds, with the wait named', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        for (let i = 0; i < 5; i++) gw.submitCode(badCode(secret));
        const r = gw.submitCode(codeNow(secret));
        expect(r.ok).toBe(false);
        expect(!r.ok && r.error).toMatch(THROTTLED);
        expect(gw.session()).toBeNull();
    });

    it('opens a forced password change after the code, as the sign-in does', () => {
        setMode('mandatory');
        gw.signIn('newadmin', PW.newadmin);
        const secret = gw.ticket()!.secret;
        expect(gw.confirmTwoFactor(codeNow(secret))).toMatchObject({ ok: true, mustChange: true });
        expect(gw.session()).toEqual({ user: 'newadmin', mustChange: true });
        signOut();
        gw.signIn('newadmin', PW.newadmin);
        expect(gw.submitCode(codeNow(secret))).toEqual({ ok: true, mustChange: true });
        expect(gw.session()).toEqual({ user: 'newadmin', mustChange: true });
    });

    it('sends a browser with no code ticket back to the sign-in', () => {
        expect(gw.codePending()).toBe(false);
        expect(gw.submitCode('123456')).toEqual({ ok: false, error: '', signedOut: true });
        setMode('mandatory');
        gw.signIn('viewer', PW.viewer);   // an enrol ticket is not a code ticket
        expect(gw.codePending()).toBe(false);
        expect(gw.submitCode('123456')).toEqual({ ok: false, error: '', signedOut: true });
    });

    it('lets a ticket go ten minutes after it was made', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        clock += TICKET_TTL_MS + 1;
        expect(gw.codePending()).toBe(false);
        expect(gw.submitCode(codeNow(secret))).toEqual({ ok: false, error: '', signedOut: true });
        expect(gw.session()).toBeNull();
    });

    it.each([
        ['changed the password', () => gw.store.setPassword('viewer', 'another-password-1')],
        ['was deleted', () => gw.store.deleteUser('viewer')],
        ['lost two-factor', () => gw.store.clearTotp('viewer')],
    ])('refuses a code, however right, when the account %s meanwhile', (_what, change) => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        change();
        expect(gw.submitCode(codeNow(secret))).toEqual({ ok: false, error: 'Sign-in failed. Check the username and password.', signedOut: true });
        expect(gw.session()).toBeNull();
        expect(gw.codePending()).toBe(false);
    });
});

describe('mock-broker/gateway two-factor -- recovery codes', () => {
    it('stores ten hashes, never the codes, and shows the codes once', () => {
        const { recovery } = enrol('viewer');
        expect(recovery).toHaveLength(10);
        const stored = gw.store.totpOf('viewer')!.recovery;
        expect(stored).toEqual(recovery.map(hashRecovery));
        expect(stored.every(h => HASH_RULE.test(h))).toBe(true);
        expect(JSON.stringify(gw.store.dump())).not.toContain(recovery[0]);
    });

    it('signs in with a recovery code once, in any case and with or without hyphens, and not twice', () => {
        const { recovery } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        const spaced = recovery[0].toLowerCase().replace(/-/g, ' ');
        expect(gw.submitCode(spaced)).toEqual({ ok: true, mustChange: false });
        expect(gw.store.totpOf('viewer')!.recovery).toHaveLength(9);
        signOut();

        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(recovery[0])).toEqual({ ok: false, error: 'The code is not correct.' });
        expect(gw.submitCode(recovery[1])).toEqual({ ok: true, mustChange: false });
    });

    it('treats exactly six digits as a TOTP code and anything else as a recovery code, so a wrong one of either is refused', () => {
        enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        for (const code of ['', '12345', '1234567', 'AAAA-BBBB-CCCC-DDDD']) {
            expect(gw.submitCode(code)).toEqual({ ok: false, error: 'The code is not correct.' });
        }
        expect(gw.store.totpOf('viewer')!.recovery).toHaveLength(10);
    });
});

describe('mock-broker/gateway two-factor -- setting it up', () => {
    it('keeps a wrong code out: the secret shown again, a failure counted, nothing stored or opened', () => {
        setMode('mandatory');
        gw.signIn('viewer', PW.viewer);
        const secret = gw.ticket()!.secret;
        const before = seq();
        expect(gw.confirmTwoFactor(badCode(secret))).toEqual({ ok: false, error: 'The code is not correct.' });
        expect(gw.store.totpOf('viewer')).toBeUndefined();
        expect([seq(), gw.session(), gw.ticket()!.secret]).toEqual([before, null, secret]);
    });

    it('blocks the right code while the throttle holds', () => {
        setMode('mandatory');
        gw.signIn('viewer', PW.viewer);
        const secret = gw.ticket()!.secret;
        for (let i = 0; i < 5; i++) gw.confirmTwoFactor(badCode(secret));
        const r = gw.confirmTwoFactor(codeNow(secret));
        expect(!r.ok && r.error).toMatch(THROTTLED);
        expect(gw.store.totpOf('viewer')).toBeUndefined();
    });

    it('stores the secret and ten recovery codes in one commit, opens the session and ends the other sessions', () => {
        const other = gw.openSession('viewer', false);
        const r = enrol('viewer');
        expect(r.recovery).toHaveLength(10);
        expect(gw.store.totpOf('viewer')).toEqual({ secret: r.secret, recovery: r.recovery.map(hashRecovery) });
        expect(gw.session()).toEqual({ user: 'viewer', mustChange: false });
        expect(gw.sessions.get(other)).toBeNull();
        expect(sessionsOf('viewer')).toBe(1);
        expect(gw.ticket()).toBeNull();
    });

    it('does not bring the code that confirmed it back as a sign-in replay: the new secret starts its own history', () => {
        const { secret } = enrol('viewer');
        signOut();
        setMode('optional');
        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(codeNow(secret)).ok).toBe(true);
    });

    it('sends a browser with no enrol ticket, or only a code ticket, back to the sign-in', () => {
        expect(gw.confirmTwoFactor('123456')).toEqual({ ok: false, error: '', signedOut: true });
        enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        expect(gw.confirmTwoFactor('123456')).toEqual({ ok: false, error: '', signedOut: true });
    });

    it('refuses to store it when the password changed meanwhile', () => {
        setMode('mandatory');
        gw.signIn('viewer', PW.viewer);
        const secret = gw.ticket()!.secret;
        gw.store.setPassword('viewer', 'another-password-1');
        expect(gw.confirmTwoFactor(codeNow(secret))).toEqual({ ok: false, error: 'Sign-in failed. Check the username and password.', signedOut: true });
        expect(gw.store.totpOf('viewer')).toBeUndefined();
        expect([gw.session(), gw.ticket()]).toEqual([null, null]);
    });
});

describe('mock-broker/gateway two-factor -- setting it up again', () => {
    /** Signed in as the user, with two-factor already set up: its first secret and codes. */
    function signedInEnrolled() {
        const e = enrol('viewer');
        setMode('optional');
        return e;
    }

    it('shows what /login/two-factor shows to each browser', () => {
        expect(gw.twoFactorPage()).toEqual({ kind: 'login' });
        setMode('optional');
        gw.signIn('viewer', PW.viewer);
        expect(gw.twoFactorPage()).toEqual({ kind: 'setup', enrolled: false });
        setMode('mandatory');
        signOut();
        gw.signIn('operator', PW.operator);
        expect(gw.twoFactorPage()).toEqual({ kind: 'enrol', secret: gw.ticket()!.secret });
        gw.confirmTwoFactor(codeNow(gw.ticket()!.secret));
        expect(gw.twoFactorPage()).toEqual({ kind: 'setup', enrolled: true });
    });

    it('holds a session at the password page out of the setup', () => {
        setMode('optional');
        gw.signIn('newadmin', PW.newadmin);
        expect(gw.twoFactorPage()).toEqual({ kind: 'login' });
    });

    it('lets a user with none start with the password alone', () => {
        setMode('optional');
        gw.signIn('viewer', PW.viewer);
        expect(gw.verifyTwoFactor('wrong-password', '')).toEqual({ ok: false, error: 'The password or the code is not correct.' });
        const r = gw.verifyTwoFactor(PW.viewer, '');
        expect(r.ok && r.secret).toMatch(SECRET_RULE);
        expect(gw.ticket()).toMatchObject({ user: 'viewer', stage: 'setup' });
        expect(gw.store.totpOf('viewer')).toBeUndefined();   // nothing is stored until the code confirms
    });

    it('asks an enrolled user for a code too, with one message for either failure and nothing used by a wrong password', () => {
        const { secret } = signedInEnrolled();
        const message = { ok: false, error: 'The password or the code is not correct.' };
        expect(gw.verifyTwoFactor(PW.viewer, badCode(secret))).toEqual(message);
        expect(gw.verifyTwoFactor('wrong-password', codeNow(secret))).toEqual(message);
        expect(gw.verifyTwoFactor(PW.viewer, codeNow(secret)).ok).toBe(true);   // the code was not used up by the wrong password
    });

    it('takes a recovery code in place of the code, and uses it up', () => {
        const { recovery } = signedInEnrolled();
        expect(gw.verifyTwoFactor(PW.viewer, recovery[3]).ok).toBe(true);
        expect(gw.store.totpOf('viewer')!.recovery).toHaveLength(9);
        expect(gw.verifyTwoFactor(PW.viewer, recovery[3]).ok).toBe(false);
    });

    it('applies the replay rule to the code it takes', () => {
        const { secret } = signedInEnrolled();
        expect(gw.verifyTwoFactor(PW.viewer, codeNow(secret)).ok).toBe(true);
        expect(gw.verifyTwoFactor(PW.viewer, codeNow(secret)).ok).toBe(false);
    });

    it('blocks with the own-password throttle', () => {
        setMode('optional');
        gw.signIn('viewer', PW.viewer);
        for (let i = 0; i < 5; i++) gw.verifyTwoFactor('wrong-password', '');
        const r = gw.verifyTwoFactor(PW.viewer, '');
        expect(!r.ok && r.error).toMatch(THROTTLED);
    });

    it('sends a signed-out browser, or one held at the password page, back to the sign-in', () => {
        expect(gw.verifyTwoFactor(PW.viewer, '')).toEqual({ ok: false, error: '', signedOut: true });
        gw.signIn('newadmin', PW.newadmin);
        expect(gw.verifyTwoFactor(PW.newadmin, '')).toEqual({ ok: false, error: '', signedOut: true });
    });

    it('replaces the secret and every recovery code in one commit, ends the other sessions and keeps the rev', () => {
        const first = signedInEnrolled();
        const rev = userRow('viewer').rev;
        const before = seq();
        const other = gw.openSession('viewer', false);
        const v = gw.verifyTwoFactor(PW.viewer, codeNow(first.secret));
        if (!v.ok) throw new Error(v.error);
        expect(gw.store.totpOf('viewer')!.secret).toBe(first.secret);   // the old one stands until the new one is confirmed

        const done = gw.confirmTwoFactor(codeNow(v.secret));
        if (!done.ok) throw new Error(done.error);
        expect(gw.store.totpOf('viewer')).toEqual({ secret: v.secret, recovery: done.recovery.map(hashRecovery) });
        expect([userRow('viewer').rev, seq()]).toEqual([rev, before + 1]);
        expect(gw.sessions.get(other)).toBeNull();
        expect(gw.session()).toEqual({ user: 'viewer', mustChange: false });

        // The old secret and the old codes are dead; the new ones sign in.
        signOut();
        gw.signIn('viewer', PW.viewer);
        expect(gw.submitCode(first.recovery[0]).ok).toBe(false);
        expect(gw.submitCode(codeNow(first.secret, 1)).ok).toBe(false);
        expect(gw.submitCode(done.recovery[0]).ok).toBe(true);
    });

    it('stores nothing when the browser signed out before the code, or the password changed', () => {
        const first = signedInEnrolled();
        const v = gw.verifyTwoFactor(PW.viewer, codeNow(first.secret));
        if (!v.ok) throw new Error(v.error);
        signOut();
        expect(gw.confirmTwoFactor(codeNow(v.secret))).toEqual({ ok: false, error: 'Sign-in failed. Check the username and password.', signedOut: true });
        expect(gw.store.totpOf('viewer')!.secret).toBe(first.secret);

        gw.setCookie(gw.openSession('viewer', false));
        clock += STEP_MS;
        const again = gw.verifyTwoFactor(PW.viewer, codeNow(first.secret));
        if (!again.ok) throw new Error(again.error);
        gw.store.setPassword('viewer', 'another-password-1');
        expect(gw.confirmTwoFactor(codeNow(again.secret)).ok).toBe(false);
        expect(gw.store.totpOf('viewer')!.secret).toBe(first.secret);
    });
});

describe('mock-broker/gateway two-factor -- the rev rule and the store', () => {
    it('moves the rev at enrolment and at reset, and only the seq for setting up again and for a used recovery code', () => {
        const r0 = userRow('viewer').rev;
        const s0 = seq();
        const first = enrol('viewer');
        const r1 = userRow('viewer').rev;
        expect([r1 > r0, seq()]).toEqual([true, s0 + 1]);
        expect(userRow('viewer').twoFactor).toBe(true);

        setMode('optional');
        const v = gw.verifyTwoFactor(PW.viewer, codeNow(first.secret));
        if (!v.ok) throw new Error(v.error);
        const again = gw.confirmTwoFactor(codeNow(v.secret));
        if (!again.ok) throw new Error(again.error);
        expect([userRow('viewer').rev, seq()]).toEqual([r1, s0 + 2]);

        signOut();
        gw.signIn('viewer', PW.viewer);
        gw.submitCode(again.recovery[0]);
        expect([userRow('viewer').rev, seq()]).toEqual([r1, s0 + 3]);

        const reset = gw.store.clearTotp('viewer');
        expect(reset).toEqual({ rev: s0 + 4, removed: true });
        expect([userRow('viewer').rev, userRow('viewer').twoFactor]).toEqual([s0 + 4, false]);
    });

    it('refuses to set it up for a missing user or a changed password, and uses no recovery code that is not there', () => {
        const totp = { secret: 'A'.repeat(32), recovery: ['0'.repeat(64)] };
        expect(gw.store.setTotp('nobody', totp, 'x')).toBe('not_found');
        expect(gw.store.setTotp('viewer', totp, 'not-the-password')).toBe('account_changed');
        expect(gw.store.totpOf('viewer')).toBeUndefined();

        expect(gw.store.useRecovery('nobody', totp.recovery[0])).toBeNull();
        expect(gw.store.useRecovery('viewer', totp.recovery[0])).toBeNull();   // no two-factor
        expect(gw.store.setTotp('viewer', totp, PW.viewer)).toBe('ok');
        expect(gw.store.useRecovery('viewer', '1'.repeat(64))).toBeNull();   // not one of its codes
        expect(gw.store.useRecovery('viewer', totp.recovery[0])).toBe(0);
    });

    it('resets nobody for an unknown user, and nothing for a user without two-factor', () => {
        const rev = userRow('viewer').rev;
        const s0 = seq();
        expect(gw.store.clearTotp('nobody')).toBeNull();
        expect(gw.store.clearTotp('viewer')).toEqual({ rev, removed: false });
        expect(seq()).toBe(s0);
    });

    it('copies the record when the store is dumped, loaded or replaced, so a change in one place is not seen in another', () => {
        enrol('viewer');
        const dump = gw.store.dump();
        dump.users.find(u => u.username === 'viewer')!.totp!.recovery.length = 0;
        expect(gw.store.totpOf('viewer')!.recovery).toHaveLength(10);

        gw.store.load(gw.store.dump());
        expect(gw.store.totpOf('viewer')).toBeDefined();

        const users = gw.store.dump().users;
        gw.store.replaceUsers(users);
        users.find(u => u.username === 'viewer')!.totp!.recovery.length = 0;
        expect(gw.store.totpOf('viewer')!.recovery).toHaveLength(10);
        expect(gw.store.listTotp()).toEqual([{ user: 'viewer', secret: gw.store.totpOf('viewer')!.secret }]);
    });

    it('keeps the stored two-factor through an administrator\'s save, and gives a new user none', () => {
        enrol('viewer');
        const rev = userRow('viewer').rev;
        const r = gw.store.upsertUser({ username: 'viewer', admin: false, operate: [], readOnly: [], modules: null }, '', rev);
        expect(r).toMatchObject({ ok: true });
        expect(gw.store.totpOf('viewer')).toBeDefined();
        expect(userRow('viewer').twoFactor).toBe(true);
        gw.store.upsertUser({ username: 'fresh', admin: false, operate: [], readOnly: [], modules: null }, 'fresh-password-1', 0);
        expect(gw.store.totpOf('fresh')).toBeUndefined();
    });
});

describe('mock-broker/gateway two-factor -- the managed API', () => {
    const call = (method: string, path: string, session: string | null, body?: unknown) =>
        gw.handle({ method, path, query: '', body: body === undefined ? '' : JSON.stringify(body), session });
    let admin: string;
    beforeEach(() => {
        admin = gw.openSession('admin', false);
    });

    it('lists a twoFactor flag per user, and tells the caller the setting and whether it is enrolled', async () => {
        const before: any = (await call('GET', '/managed/users', admin)).json;
        expect(before.users.map((u: any) => u.twoFactor)).toEqual([false, false, false, false]);
        enrol('viewer');
        const after: any = (await call('GET', '/managed/users', admin)).json;
        expect(after.users.map((u: any) => [u.username, u.twoFactor]).filter((r: any) => r[1])).toEqual([['viewer', true]]);

        const me: any = (await call('GET', '/managed/me', gw.cookie())).json;
        expect(me.twoFactor).toEqual({ mode: 'mandatory', enrolled: true });
        const other: any = (await call('GET', '/managed/me', admin)).json;
        expect(other.twoFactor).toEqual({ mode: 'mandatory', enrolled: false });
    });

    it('resets two-factor for an administrator: the rev moves, the user\'s sessions and tickets end', async () => {
        enrol('viewer');
        const other = gw.openSession('viewer', false);
        gw.signIn('viewer', PW.viewer);   // a code ticket, no session
        expect(gw.codePending()).toBe(true);
        const before = userRow('viewer').rev;

        const res = await call('DELETE', '/managed/users/viewer/totp', admin);
        expect(res).toEqual({ status: 200, json: { rev: userRow('viewer').rev } });
        expect(userRow('viewer').rev).toBeGreaterThan(before);
        expect(userRow('viewer').twoFactor).toBe(false);
        expect([gw.sessions.get(other), gw.codePending()]).toEqual([null, false]);
    });

    it('answers a reset of a user with none with the same rev, and leaves their session and the seq alone', async () => {
        const viewer = gw.openSession('viewer', false);
        const rev = userRow('viewer').rev;
        const s0 = seq();
        expect(await call('DELETE', '/managed/users/viewer/totp', admin)).toEqual({ status: 200, json: { rev } });
        expect([seq(), gw.sessions.get(viewer)]).toEqual([s0, { user: 'viewer', mustChange: false }]);
    });

    it('refuses a reset of an unknown user, and by anyone who is not an administrator or signed in', async () => {
        enrol('viewer');
        expect(await call('DELETE', '/managed/users/nobody/totp', admin)).toEqual({ status: 404, json: { error: 'not_found' } });
        expect(await call('DELETE', '/managed/users/viewer/totp', gw.openSession('operator', false))).toEqual({ status: 403, json: { error: 'forbidden' } });
        expect(await call('DELETE', '/managed/users/viewer/totp', null)).toEqual({ status: 401, json: { error: 'unauthenticated' } });
        expect(gw.store.totpOf('viewer')).toBeDefined();
    });

    it('does not take a reset by any other method or path', async () => {
        expect((await call('GET', '/managed/users/viewer/totp', admin)).status).toBe(404);
        expect((await call('POST', '/managed/users/viewer/totp', admin)).status).toBe(404);
    });

    it('never carries or clears two-factor in an administrator\'s save: the body names no such field', async () => {
        enrol('viewer');
        const base = { password: '', admin: false, operate: [], readOnly: [], modules: null, rev: userRow('viewer').rev };
        expect((await call('PUT', '/managed/users/viewer', admin, { ...base, twoFactor: false })).status).toBe(400);
        expect((await call('PUT', '/managed/users/viewer', admin, { ...base, totp: { secret: 'A'.repeat(32), recovery: [] } })).status).toBe(400);
        expect(gw.store.totpOf('viewer')).toBeDefined();
        expect((await call('PUT', '/managed/users/viewer', admin, base)).status).toBe(200);
        expect(gw.store.totpOf('viewer')).toBeDefined();
    });
});

describe('mock-broker/gateway two-factor -- the setting', () => {
    const call = (method: string, body?: unknown) =>
        gw.handle({ method, path: '/managed/settings', query: '', body: body === undefined ? '' : JSON.stringify(body), session: gw.openSession('admin', false) });

    it('is optional in the seed and in a file, backup or snapshot that has no such key', () => {
        expect(demoSeed().settings.login.twoFactor).toBe('optional');
        const old = contractSeed();
        delete (old.settings.login as Partial<typeof old.settings.login>).twoFactor;
        const fromSeed = createGateway({ seed: old });
        expect(fromSeed.settings.current().login.twoFactor).toBe('optional');

        const snap = fromSeed.snapshot();
        delete (snap.settings.login as Partial<typeof snap.settings.login>).twoFactor;
        const restored = createGateway({ seed: contractSeed() });
        expect(restored.settings.save({ login: { twoFactor: 'mandatory' } }, restored.settings.rev()).ok).toBe(true);
        restored.restore(snap);
        expect(restored.settings.current().login.twoFactor).toBe('optional');

        expect(settingsFromBackup({ login: { maxFailures: 3 } }).login.twoFactor).toBe('optional');
        expect(settingsFromBackup({ login: { twoFactor: 'admins' } }).login.twoFactor).toBe('admins');
    });

    it('is shown by GET and saved by PUT for each of its three values, live', async () => {
        for (const mode of ['admins', 'mandatory', 'optional']) {
            const rev = gw.settings.rev();
            expect((await call('PUT', { login: { twoFactor: mode }, rev })).status).toBe(200);
            const view: any = (await call('GET')).json;
            expect(view.settings.login.twoFactor).toBe(mode);
            expect(view.pendingRestart).toEqual([]);
            expect(gw.settings.current().login).toMatchObject({ twoFactor: mode, maxFailures: 5 });
        }
    });

    it('refuses any other value with 422, the key named, and leaves the file as it was', async () => {
        const rev = gw.settings.rev();
        for (const bad of ['', 'Optional', 'off', 'on', 'required']) {
            const res: any = await call('PUT', { login: { twoFactor: bad }, rev });
            expect([res.status, res.json.error, res.json.field]).toEqual([422, 'invalid', 'login.twoFactor']);
            expect(res.json.reason).toBe(`key "login.twoFactor" has invalid value "${bad}": must be "optional", "admins" or "mandatory"`);
        }
        expect(gw.settings.current().login.twoFactor).toBe('optional');
        expect(gw.settings.rev()).toBe(rev);
        expect((await call('PUT', { login: { twoFactor: true }, rev })).status).toBe(400);
    });
});

describe('mock-broker/gateway two-factor -- a reload', () => {
    it('carries a standing ticket, so the code page survives it', () => {
        enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        const next = createGateway({ seed: demoSeed(), now: () => new Date(clock) });
        next.restore(JSON.parse(JSON.stringify(gw.snapshot())));
        expect(next.codePending()).toBe(true);
        expect(next.ticket()).toMatchObject({ user: 'viewer', stage: 'code' });
    });

    it('carries the last accepted step, so a code cannot be replayed across it', () => {
        const { secret } = enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        const code = codeNow(secret);
        expect(gw.submitCode(code).ok).toBe(true);
        signOut();

        const next = createGateway({ seed: demoSeed(), now: () => new Date(clock) });
        next.restore(JSON.parse(JSON.stringify(gw.snapshot())));
        next.signIn('viewer', PW.viewer);
        expect(next.submitCode(code)).toEqual({ ok: false, error: 'The code is not correct.' });
    });

    it('starts without tickets or steps from a snapshot that has none', () => {
        enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        const snap = JSON.parse(JSON.stringify(gw.snapshot()));
        delete snap.tickets;
        delete snap.ticketCookie;
        delete snap.lastSteps;
        const next = createGateway({ seed: demoSeed() });
        next.restore(snap);
        expect([next.codePending(), next.ticket()]).toEqual([false, null]);
    });

    it('lists what the Authenticator shows: each enrolled secret and each one pending in a ticket', () => {
        expect(gw.authenticators()).toEqual([]);
        const { secret } = enrol('viewer');
        signOut();
        gw.signIn('operator', PW.operator);   // mandatory: a pending enrol secret
        expect(gw.authenticators()).toEqual([
            { user: 'viewer', secret, pending: false },
            { user: 'operator', secret: gw.ticket()!.secret, pending: true },
        ]);
    });

    it('ends a user\'s tickets with their sessions, on any user-wide drop', () => {
        enrolled('viewer');
        gw.signIn('viewer', PW.viewer);
        gw.sessions.dropUser('viewer');
        expect(gw.codePending()).toBe(false);
    });
});
