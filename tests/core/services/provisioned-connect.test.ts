// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
    connectProvisioned, gatewayCodeOf, outcomeDetails, outcomeLines, PART_LABEL, shortReason, SHORT_REASON_MAX,
    type ConnectOutcome, type ConnectPart, type ProvisionedSteps, type StepResult,
} from '../../../src/core/services/provisioned-connect';

/**
 * The sequence is pure: each test drives it with stub steps and reads the
 * outcome plus the order of the calls. The panels that run it are covered in
 * tests/modules/connections/managed-panel.test.ts.
 */
type Failed = Extract<ConnectOutcome, { ok: false }>;

const up = (): Promise<StepResult> => Promise.resolve({ ok: true });
const down = (extra: Partial<Extract<StepResult, { ok: false }>> = {}): Promise<StepResult> =>
    Promise.resolve({ ok: false, reason: 'refused', ...extra });

/** Steps that record every call in `log`, in order. */
function makeSteps(
    semp: (() => Promise<StepResult>) | undefined,
    messaging: () => Promise<StepResult>,
    log: string[] = [],
): ProvisionedSteps {
    return {
        ...(semp ? { semp: vi.fn(async () => { log.push('semp'); return semp(); }) } : {}),
        messaging: vi.fn(async () => { log.push('messaging'); return messaging(); }),
        dropSemp: vi.fn(() => { log.push('dropSemp'); }),
        dropMessaging: vi.fn(() => { log.push('dropMessaging'); }),
        onStep: vi.fn((part: ConnectPart) => { log.push(`step:${part}`); }),
    };
}

describe('core/services/provisioned-connect -- connectProvisioned', () => {
    it('is connected when both are up, announcing SEMP then messaging and dropping nothing', async () => {
        const log: string[] = [];
        const steps = makeSteps(up, up, log);
        expect(await connectProvisioned(steps)).toEqual({ ok: true });
        expect(log).toEqual(['step:semp', 'semp', 'step:messaging', 'messaging']);
        expect(steps.dropSemp).not.toHaveBeenCalled();
        expect(steps.dropMessaging).not.toHaveBeenCalled();
    });

    it('with no SEMP step runs messaging alone and never names the SEMP step', async () => {
        const log: string[] = [];
        const steps = makeSteps(undefined, up, log);
        expect(await connectProvisioned(steps)).toEqual({ ok: true });
        expect(log).toEqual(['step:messaging', 'messaging']);
    });

    it('with no SEMP step, a failed messaging step fails alone and drops nothing', async () => {
        const steps = makeSteps(undefined, () => down({ reason: 'bad creds' }));
        const outcome = await connectProvisioned(steps) as Failed;
        expect(outcome).toEqual({
            ok: false, sessionEnded: false, closed: [],
            failures: [{ part: 'messaging', short: 'bad creds', detail: 'bad creds' }],
        });
        expect(steps.dropSemp).not.toHaveBeenCalled();
        expect(steps.dropMessaging).not.toHaveBeenCalled();
    });

    it('a failed SEMP with messaging up still tries messaging, then drops the messaging session and lists it closed', async () => {
        const log: string[] = [];
        const steps = makeSteps(() => down({ reason: 'broker down', code: 'upstream_unavailable' }), up, log);
        const outcome = await connectProvisioned(steps) as Failed;
        expect(log).toEqual(['step:semp', 'semp', 'step:messaging', 'messaging', 'dropMessaging']);
        expect(outcome).toEqual({
            ok: false, sessionEnded: false, closed: ['messaging'],
            failures: [{ part: 'semp', short: 'broker not reachable', detail: 'broker down' }],
        });
        expect(steps.dropSemp).not.toHaveBeenCalled();
    });

    it('SEMP up with messaging failed drops SEMP, lists it closed and keeps the messaging reason', async () => {
        const log: string[] = [];
        const steps = makeSteps(up, () => down({ reason: 'Login Failure', timeout: false }), log);
        const outcome = await connectProvisioned(steps) as Failed;
        expect(log).toEqual(['step:semp', 'semp', 'step:messaging', 'messaging', 'dropSemp']);
        expect(outcome).toEqual({
            ok: false, sessionEnded: false, closed: ['semp'],
            failures: [{ part: 'messaging', short: 'Login Failure', detail: 'Login Failure' }],
        });
        expect(steps.dropMessaging).not.toHaveBeenCalled();
    });

    it('SEMP up with messaging failed and no dropSemp hook still lists SEMP closed', async () => {
        const steps = makeSteps(up, () => down());
        delete steps.dropSemp;
        const outcome = await connectProvisioned(steps) as Failed;
        expect(outcome.closed).toEqual(['semp']);
    });

    it('both failed reports both reasons, SEMP first, and drops nothing', async () => {
        const steps = makeSteps(
            () => down({ reason: 'semp refused', code: 'upstream_auth' }),
            () => down({ reason: 'x'.repeat(SHORT_REASON_MAX + 1), timeout: true }),
        );
        const outcome = await connectProvisioned(steps) as Failed;
        expect(outcome.closed).toEqual([]);
        expect(outcome.sessionEnded).toBe(false);
        expect(outcome.failures.map(f => [f.part, f.short])).toEqual([
            ['semp', 'broker refused the gateway\'s account'],
            ['messaging', 'timed out'],
        ]);
        expect(steps.dropSemp).not.toHaveBeenCalled();
        expect(steps.dropMessaging).not.toHaveBeenCalled();
    });

    it.each([
        ['session-ended', true],
        ['not-provisioned', false],
    ] as const)('a SEMP stop "%s" skips messaging, drops nothing and reports sessionEnded %s', async (stop, sessionEnded) => {
        const log: string[] = [];
        const steps = makeSteps(() => down({ reason: 'ended', stop }), up, log);
        const outcome = await connectProvisioned(steps);
        expect(outcome).toEqual({
            ok: false, sessionEnded, closed: [],
            failures: [{ part: 'semp', short: 'ended', detail: 'ended' }],
        });
        expect(log).toEqual(['step:semp', 'semp']);
        expect(steps.messaging).not.toHaveBeenCalled();
        expect(steps.dropSemp).not.toHaveBeenCalled();
        expect(steps.dropMessaging).not.toHaveBeenCalled();
    });

    it('a messaging stop "session-ended" after SEMP came up drops SEMP and reports the session ended', async () => {
        const steps = makeSteps(up, () => down({ reason: 'ended', stop: 'session-ended' }));
        const outcome = await connectProvisioned(steps) as Failed;
        expect(outcome.sessionEnded).toBe(true);
        expect(outcome.closed).toEqual(['semp']);
        expect(steps.dropSemp).toHaveBeenCalledTimes(1);
    });

    it('a messaging stop "not-provisioned" is not a session end', async () => {
        const steps = makeSteps(undefined, () => down({ reason: 'no', stop: 'not-provisioned' }));
        const outcome = await connectProvisioned(steps) as Failed;
        expect(outcome.sessionEnded).toBe(false);
    });

    it('a failed SEMP that did not stop does not hide a session end that messaging reports', async () => {
        const steps = makeSteps(() => down({ reason: 'semp' }), () => down({ reason: 'ended', stop: 'session-ended' }));
        const outcome = await connectProvisioned(steps) as Failed;
        expect(outcome.sessionEnded).toBe(true);
        expect(outcome.failures.map(f => f.part)).toEqual(['semp', 'messaging']);
    });

    describe('a step that throws counts as that step failing', () => {
        it('reads the message and the string code of an error a dial refused with', async () => {
            const refused = Object.assign(new Error('gateway refused'), { code: 'upstream_unavailable' });
            const steps = makeSteps(() => { throw refused; }, up);
            const outcome = await connectProvisioned(steps) as Failed;
            expect(outcome.failures).toEqual([{ part: 'semp', short: 'broker not reachable', detail: 'gateway refused' }]);
            expect(outcome.closed).toEqual(['messaging']);
            expect(steps.dropMessaging).toHaveBeenCalledTimes(1);
        });

        it('a rejected messaging step with no code falls back to the reason text and drops SEMP', async () => {
            const steps = makeSteps(up, () => Promise.reject(new Error('socket closed')));
            const outcome = await connectProvisioned(steps) as Failed;
            expect(outcome.failures).toEqual([{ part: 'messaging', short: 'socket closed', detail: 'socket closed' }]);
            expect(outcome.closed).toEqual(['semp']);
        });

        it('a non-string code is ignored and a thrown non-Error becomes its string', async () => {
            const steps = makeSteps(undefined, () => Promise.reject(Object.assign(new Error('odd'), { code: 502 })));
            expect((await connectProvisioned(steps) as Failed).failures[0].short).toBe('odd');
            const plain = makeSteps(undefined, () => Promise.reject('plain text'));
            expect((await connectProvisioned(plain) as Failed).failures[0].detail).toBe('plain text');
        });

        it('a thrown null or undefined still yields a failure instead of escaping', async () => {
            const steps = makeSteps(undefined, () => Promise.reject(undefined));
            const outcome = await connectProvisioned(steps) as Failed;
            expect(outcome.failures).toEqual([{ part: 'messaging', short: 'undefined', detail: 'undefined' }]);
        });
    });

    it('onStep is optional', async () => {
        const steps = makeSteps(up, up);
        delete steps.onStep;
        expect(await connectProvisioned(steps)).toEqual({ ok: true });
    });
});

describe('core/services/provisioned-connect -- gatewayCodeOf', () => {
    it('returns a string code and nothing else', () => {
        expect(gatewayCodeOf(Object.assign(new Error('x'), { code: 'rate_limited' }))).toBe('rate_limited');
        expect(gatewayCodeOf({ code: 429 })).toBeUndefined();
        expect(gatewayCodeOf(new Error('x'))).toBeUndefined();
        expect(gatewayCodeOf('text')).toBeUndefined();
        expect(gatewayCodeOf(null)).toBeUndefined();
        expect(gatewayCodeOf(undefined)).toBeUndefined();
    });
});

describe('core/services/provisioned-connect -- shortReason', () => {
    it.each([
        ['upstream_unavailable', 'broker not reachable'],
        ['upstream_auth', 'broker refused the gateway\'s account'],
        ['forbidden', 'not available to your account'],
        ['not_found', 'not available to your account'],
        ['rate_limited', 'too many attempts, wait a minute'],
        ['network', 'gateway not reachable'],
        ['timeout', 'gateway did not answer in time'],
        ['server_error', 'the gateway could not complete it'],
        ['bad_response', 'the gateway could not complete it'],
    ])('the gateway code %s reads as "%s" for both halves, whatever the raw reason', (code, text) => {
        for (const part of ['semp', 'messaging'] as const) {
            expect(shortReason(part, { reason: 'a raw reason', code })).toBe(text);
        }
    });

    it('a gateway code wins over a timeout flag', () => {
        expect(shortReason('semp', { reason: 'r', code: 'network', timeout: true })).toBe('gateway not reachable');
    });

    it('a timeout reads per half', () => {
        expect(shortReason('semp', { reason: 'r', timeout: true })).toBe('broker not reachable (timed out)');
        expect(shortReason('messaging', { reason: 'r', timeout: true })).toBe('timed out');
    });

    it('an unknown code falls through to the raw reason', () => {
        expect(shortReason('semp', { reason: 'odd', code: 'brand_new' })).toBe('odd');
    });

    it('a raw reason up to the limit is shown as it is, one character over is left to the log', () => {
        const edge = 'a'.repeat(SHORT_REASON_MAX);
        expect(SHORT_REASON_MAX).toBe(60);
        expect(shortReason('messaging', { reason: edge })).toBe(edge);
        expect(shortReason('messaging', { reason: '' })).toBe('failed, details in the log');
        expect(shortReason('messaging', { reason: edge + 'a' })).toBe('failed, details in the log');
        expect(shortReason('semp', { reason: edge + 'a', timeout: false })).toBe('failed, details in the log');
    });
});

describe('core/services/provisioned-connect -- outcomeLines and outcomeDetails', () => {
    it('names the halves as the Direct form does', () => {
        expect(PART_LABEL).toEqual({ semp: 'SEMP (management)', messaging: 'Messaging (client)' });
    });

    it('lists one line per failure, short reasons on the card and full texts for the log', () => {
        const outcome: Failed = {
            ok: false, sessionEnded: false, closed: [],
            failures: [
                { part: 'semp', short: 'broker not reachable', detail: 'broker b1 is not reachable: connection refused' },
                { part: 'messaging', short: 'timed out', detail: 'no answer within 30 s' },
            ],
        };
        expect(outcomeLines(outcome)).toEqual([
            'SEMP (management): broker not reachable',
            'Messaging (client): timed out',
        ]);
        expect(outcomeDetails(outcome)).toEqual([
            'SEMP (management): broker b1 is not reachable: connection refused',
            'Messaging (client): no answer within 30 s',
        ]);
    });

    it('adds a line for each half that came up and was closed, naming the other as the cause', () => {
        const messagingFailed: Failed = {
            ok: false, sessionEnded: false, closed: ['semp'],
            failures: [{ part: 'messaging', short: 'Login Failure', detail: 'Login Failure (detail)' }],
        };
        expect(outcomeLines(messagingFailed)).toEqual([
            'Messaging (client): Login Failure',
            'SEMP (management): connected, closed because messaging failed',
        ]);
        const sempFailed: Failed = {
            ok: false, sessionEnded: false, closed: ['messaging'],
            failures: [{ part: 'semp', short: 'broker not reachable', detail: 'raw' }],
        };
        expect(outcomeLines(sempFailed)).toEqual([
            'SEMP (management): broker not reachable',
            'Messaging (client): connected, closed because SEMP failed',
        ]);
        // A closed half is not a failure: the log and the bell list only the real ones.
        expect(outcomeDetails(messagingFailed)).toEqual(['Messaging (client): Login Failure (detail)']);
        expect(outcomeDetails(sempFailed)).toEqual(['SEMP (management): raw']);
    });

    it('end to end: a failed SEMP with messaging up reads as two lines and one detail', async () => {
        const outcome = await connectProvisioned(makeSteps(
            () => down({ reason: 'x'.repeat(80), code: 'forbidden' }), up,
        )) as Failed;
        expect(outcomeLines(outcome)).toEqual([
            'SEMP (management): not available to your account',
            'Messaging (client): connected, closed because SEMP failed',
        ]);
        expect(outcomeDetails(outcome)).toEqual([`SEMP (management): ${'x'.repeat(80)}`]);
    });
});
