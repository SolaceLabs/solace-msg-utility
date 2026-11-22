import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authenticatorSection } from '../../../src/mock-broker/controls/authenticator';
import { createGateway } from '../../../src/mock-broker/gateway';
import { mockCode, STEP_MS, stepOf } from '../../../src/mock-broker/gateway/authenticator';
import { demoSeed } from '../../../src/mock-broker/gateway/seed';

/**
 * The control panel's Authenticator: every account with a two-factor secret,
 * enrolled or pending in a sign-in ticket, with the code for the current
 * step and the seconds left, following the clock.
 */
let gw: ReturnType<typeof createGateway>;
let box: HTMLElement;
/** The start of a step, plus ten seconds: twenty are left in it. */
const T0 = Math.floor(Date.parse('2026-11-15T12:00:00Z') / STEP_MS) * STEP_MS + 10_000;

beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    gw = createGateway({ seed: demoSeed() });
    box = authenticatorSection(gw);
    document.body.appendChild(box);
});

afterEach(() => {
    vi.useRealTimers();
});

const rows = () => Array.from(box.querySelectorAll('.mockctl-account'), r => ({
    who: r.querySelector('.mockctl-key')!.textContent,
    code: r.querySelector('.mockctl-copy')!.textContent,
    left: r.querySelector('.mockctl-value')!.textContent,
}));
const setMode = (mode: string) => {
    expect(gw.settings.save({ login: { twoFactor: mode } }, gw.settings.rev()).ok).toBe(true);
};
const codeNow = (secret: string) => mockCode(secret, stepOf(Date.now()));

/** viewer has two-factor (a session left open); returns its secret. */
function enrolViewer(): string {
    setMode('mandatory');
    gw.signIn('viewer', 'demo-viewer-0001');
    const secret = gw.ticket()!.secret;
    expect(gw.confirmTwoFactor(codeNow(secret)).ok).toBe(true);
    return secret;
}

describe('mock-broker/controls/authenticator', () => {
    it('lists no account while nobody has a secret', () => {
        expect(rows()).toEqual([]);
        expect(box.textContent).toContain('No account has two-factor yet');
    });

    it('lists an enrolled account with the code for this step and the seconds left', () => {
        const secret = enrolViewer();
        box.dispatchEvent(new Event('pointerenter'));
        expect(rows()).toEqual([{ who: 'viewer', code: mockCode(secret, stepOf(T0)), left: '20 s' }]);
        expect(box.querySelector('.mockctl-copy')!.getAttribute('title')).toBe('Click to copy');
    });

    it('lists a secret pending in a ticket as setting up, so a visitor enrolling has a code to type', () => {
        const secret = enrolViewer();
        gw.signIn('operator', 'demo-operator-01');   // mandatory: an enrol ticket with a new secret
        const pending = gw.ticket()!.secret;
        box.dispatchEvent(new Event('pointerenter'));
        expect(rows().map(r => [r.who, r.code])).toEqual([
            ['viewer', mockCode(secret, stepOf(T0))],
            ['operator (setting up)', mockCode(pending, stepOf(T0))],
        ]);
    });

    it('counts the seconds down without rebuilding the list, and turns the codes when the step turns', () => {
        const secret = enrolViewer();
        box.dispatchEvent(new Event('pointerenter'));
        const code = box.querySelector('.mockctl-copy')!;

        vi.advanceTimersByTime(5000);
        expect(rows()[0].left).toBe('15 s');
        expect(box.querySelector('.mockctl-copy')).toBe(code);   // the same element: a copy in progress is not interrupted

        vi.advanceTimersByTime(15_000);   // the step turns
        expect(rows()).toEqual([{ who: 'viewer', code: mockCode(secret, stepOf(T0) + 1), left: '30 s' }]);
        expect(rows()[0].code).not.toBe(mockCode(secret, stepOf(T0)));
    });

    it('picks up an account that gets a secret, on the next tick', () => {
        expect(rows()).toEqual([]);
        enrolViewer();
        vi.advanceTimersByTime(1000);
        expect(rows().map(r => r.who)).toEqual(['viewer']);
    });

    it('does not refresh while it is off the page', () => {
        box.remove();
        enrolViewer();
        vi.advanceTimersByTime(3000);
        expect(rows()).toEqual([]);
        document.body.appendChild(box);
        vi.advanceTimersByTime(1000);
        expect(rows().map(r => r.who)).toEqual(['viewer']);
    });
});
