/**
 * Provisioned connect -- the one sequence every provisioned connection runs:
 * the connections module's Provisioned panel (the primary connection) and
 * queue-copy's provisioned destination.
 *
 * A provisioned connection is two connections opened by one Connect: SEMP
 * (management) through the gateway's relay, and messaging (client) through
 * the SDK with a credential the gateway hands out. They succeed or fail
 * together:
 *
 *   1. SEMP first (skipped when the caller needs none, for example a Queue
 *      Copy destination on the primary's own broker).
 *   2. Messaging every time, so a failed Connect reports both reasons at once.
 *      The two exceptions: the gateway session ended (the caller signs out)
 *      and a target that is not provisioned (the messaging step would refuse
 *      the same way).
 *   3. Connected only when both are up. Otherwise the one that came up is
 *      closed again, and the outcome names each failure with a short reason
 *      for the card and the full text for the log and the notification bell.
 *
 * The caller owns the clients and its state: each step opens its connection
 * and HOLDS it, unannounced (no AppState write, no bus event), until the
 * outcome is known; the caller then announces both, or the sequence asks it
 * to drop what it held. The module is pure: no DOM, no AppState.
 */
import { errMessage } from '../utils';

export type ConnectPart = 'semp' | 'messaging';

/** The names the Direct form uses for the two connections. */
export const PART_LABEL: Readonly<Record<ConnectPart, string>> = {
    semp: 'SEMP (management)',
    messaging: 'Messaging (client)',
};

/**
 * What a step reports. `code` is the gateway's error code when the gateway
 * refused (`upstream_unavailable`, `rate_limited`, ...); `stop` ends the
 * sequence at once: the session ended, or the target is not provisioned.
 */
export type StepResult =
    | { ok: true }
    | { ok: false; reason: string; code?: string; timeout?: boolean; stop?: 'session-ended' | 'not-provisioned' };

export interface ProvisionedSteps {
    /** Open SEMP and hold it; omit when this connection needs no SEMP. */
    semp?: () => Promise<StepResult>;
    /** Open the messaging session and resolve once it is up or has failed; hold it. */
    messaging: () => Promise<StepResult>;
    /** Close the held SEMP: the connection as a whole failed. */
    dropSemp?: () => void;
    /** Close the held messaging session: the connection as a whole failed. */
    dropMessaging: () => void;
    /** Which connection is being opened, for the status line. */
    onStep?: (part: ConnectPart) => void;
}

/** One failed connection: `short` for the card, `detail` for the log and the bell. */
export interface PartFailure {
    part: ConnectPart;
    short: string;
    detail: string;
}

export type ConnectOutcome =
    | { ok: true }
    | {
        ok: false;
        /** The gateway session ended: the caller signs out, nothing is shown on the card. */
        sessionEnded: boolean;
        failures: PartFailure[];
        /** Connections that came up and were closed again because the other failed. */
        closed: ConnectPart[];
    };

/** The longest raw reason the card shows as it is; a longer one is left to the log. */
export const SHORT_REASON_MAX = 60;

/** The sequence. It never throws: a step that throws counts as that step's failure. */
export async function connectProvisioned(steps: ProvisionedSteps): Promise<ConnectOutcome> {
    const failures: PartFailure[] = [];
    let sempUp = false;
    if (steps.semp) {
        steps.onStep?.('semp');
        const r = await run(steps.semp);
        if (r.ok) {
            sempUp = true;
        } else {
            failures.push(failure('semp', r));
            if (r.stop) return { ok: false, sessionEnded: r.stop === 'session-ended', failures, closed: [] };
        }
    }
    steps.onStep?.('messaging');
    const m = await run(steps.messaging);
    const closed: ConnectPart[] = [];
    if (m.ok && (sempUp || !steps.semp)) return { ok: true };
    if (m.ok) {
        steps.dropMessaging();
        closed.push('messaging');
    } else {
        failures.push(failure('messaging', m));
    }
    if (sempUp) {
        steps.dropSemp?.();
        closed.push('semp');
    }
    return { ok: false, sessionEnded: !m.ok && m.stop === 'session-ended', failures, closed };
}

async function run(step: () => Promise<StepResult>): Promise<StepResult> {
    try {
        return await step();
    } catch (e) {
        return { ok: false, reason: errMessage(e), code: gatewayCodeOf(e) };
    }
}

/** The gateway's error code a refused dial carries (`managed-profile.ts` sets it), if any. */
export function gatewayCodeOf(e: unknown): string | undefined {
    const code = Object(e).code;
    return typeof code === 'string' ? code : undefined;
}

function failure(part: ConnectPart, r: Extract<StepResult, { ok: false }>): PartFailure {
    return { part, short: shortReason(part, r), detail: r.reason };
}

/**
 * The card's reason for a failed connection: a few plain words for the
 * gateway's codes and the usual network failures, the raw reason when it is
 * short, and a pointer to the log otherwise.
 */
export function shortReason(part: ConnectPart, r: Pick<Extract<StepResult, { ok: false }>, 'reason' | 'code' | 'timeout'>): string {
    switch (r.code) {
        case 'upstream_unavailable': return 'broker not reachable';
        case 'upstream_auth': return 'broker refused the gateway\'s account';
        case 'forbidden':
        case 'not_found': return 'not available to your account';
        case 'rate_limited': return 'too many attempts, wait a minute';
        case 'network': return 'gateway not reachable';
        case 'server_error':
        case 'bad_response': return 'the gateway could not complete it';
    }
    if (r.timeout) return part === 'semp' ? 'broker not reachable (timed out)' : 'timed out';
    if (r.reason && r.reason.length <= SHORT_REASON_MAX) return r.reason;
    return 'failed, details in the log';
}

/**
 * The card's lines for a failed outcome: one per failed connection, and one
 * per connection that came up and was closed again, so the reader sees which
 * side is at fault.
 */
export function outcomeLines(outcome: Extract<ConnectOutcome, { ok: false }>): string[] {
    const lines = outcome.failures.map(f => `${PART_LABEL[f.part]}: ${f.short}`);
    for (const part of outcome.closed) {
        const other = part === 'semp' ? 'messaging' : 'SEMP';
        lines.push(`${PART_LABEL[part]}: connected, closed because ${other} failed`);
    }
    return lines;
}

/** The full text of each failure, for the log and the notification bell. */
export function outcomeDetails(outcome: Extract<ConnectOutcome, { ok: false }>): string[] {
    return outcome.failures.map(f => `${PART_LABEL[f.part]}: ${f.detail}`);
}
