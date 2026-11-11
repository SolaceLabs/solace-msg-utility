import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSolaceSdk } from '../../src/mock-broker/sdk';
import { seed, getQueue } from '../../src/mock-broker/broker/store';
import { resetScenario, scenario } from '../../src/mock-broker/fixtures';
import { installMockServer } from '../../src/mock-broker/server';
import { refuseNetwork } from '../../src/mock-broker/network';
import { createSolacePublisher, type SolacePublisher } from '../../src/core/services/solace-publisher';
import { verifySource } from '../../src/modules/queue-copy/service-verify';
import { runCopyJob, PUBLISH_CONCURRENCY_HIGH } from '../../src/modules/queue-copy/service-copy';
import { createInitialState, type CopyJob, type CopyMode } from '../../src/modules/queue-copy/state';
import type { SempContext } from '../../src/core/types';

/**
 * The copy/move engine end to end against the demo broker: a session opened
 * through the demo SDK, the source verified through the demo's SEMP v1 (the
 * newest-id workaround included), then runCopyJob, with every message, ack,
 * pause and removal coming from the SDK itself rather than from the test.
 * Only the engine's public surface is driven: createInitialState, verifySource
 * and runCopyJob, as the modal drives them. The hand-driven unit tests are
 * tests/modules/queue-copy/service-copy.test.ts.
 */
const SEMP_BASE = 'https://broker.solace.com:943';

/** The context a connected SEMP session hands its callers (createServiceSemp's onConnected), for the demo host. */
const sempCtx: SempContext = { baseUrl: SEMP_BASE, fetch: (path, opts) => window.fetch(`${SEMP_BASE}${path}`, opts) };

let realFetch: typeof window.fetch;
let sdk: Record<string, any>;
let publishers: SolacePublisher[];

beforeEach(() => {
    resetScenario();
    scenario.latencyMs = 0;
    seed();
    realFetch = window.fetch;
    installMockServer({ passthrough: refuseNetwork });
    sdk = buildSolaceSdk();
    (window as any).solace = sdk;
    publishers = [];
    for (const level of ['log', 'info', 'debug', 'warn', 'error'] as const) {
        vi.spyOn(console, level).mockImplementation(() => {});
    }
});

afterEach(() => {
    publishers.forEach(p => p.dispose());
    window.fetch = realFetch;
});

const spooled = (vpn: string, queue: string) => getQueue(vpn, queue)!.messages;
const payloads = (vpn: string, queue: string) => spooled(vpn, queue).map(m => m.msg.getBinaryAttachment());

async function openSession(vpn: string): Promise<any> {
    const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: vpn });
    await new Promise<void>((resolve, reject) => {
        session.on(sdk.SessionEventCode.UP_NOTICE, () => resolve());
        session.on(sdk.SessionEventCode.CONNECT_FAILED_ERROR, (e: any) => reject(new Error(e.infoStr)));
        session.connect();
    });
    return session;
}

/** Verify the source as the modal does, then run the job to its end: what onComplete reported, and how often onProgress fired. */
async function run(session: any, opts: { vpn: string; from: string; to: string; mode: CopyMode }) {
    const state = createInitialState();
    state.sourceQueue = opts.from;
    state.dest = { type: 'queue', name: opts.to };
    state.mode = opts.mode;
    // Same broker, Same VPN (the initial form): the primary session publishes.
    const publisher = createSolacePublisher(session);
    publishers.push(publisher);
    state.primaryPublisher = publisher;

    const result = await verifySource({
        sempCtx, primarySession: session, vpn: opts.vpn, queue: opts.from, signal: new AbortController().signal,
    });
    state.verify = { inProgress: false, abort: null, result };

    const completed: CopyJob[] = [];
    const onProgress = vi.fn();
    await runCopyJob(state, session, { onProgress, onComplete: (job) => completed.push({ ...job }) });
    return { result, completed, onProgress };
}

describe('queue-copy engine against the demo broker', () => {
    it('copies every message in order and leaves the source as it was, pausing and resuming the source browser', async () => {
        const source = [...spooled('vpn-dev', 'Q/BULK')];
        const before = payloads('vpn-dev', 'Q/BULK');
        const destBefore = spooled('vpn-dev', 'dev-scratch').length;
        // More than the publish window, so backpressure stops and restarts the browser.
        expect(source.length).toBeGreaterThan(PUBLISH_CONCURRENCY_HIGH);

        const { result, completed, onProgress } = await run(await openSession('vpn-dev'),
            { vpn: 'vpn-dev', from: 'Q/BULK', to: 'dev-scratch', mode: 'copy' });

        expect(result).toMatchObject({
            sourceOk: true, via: 'semp', messageCount: source.length, accessType: 'read-write',
            oldestMsgId: String(source[0].id), newestMsgId: String(source[source.length - 1].id),
        });
        expect(completed).toEqual([expect.objectContaining({ status: 'completed', copied: source.length, total: source.length, lastError: null })]);
        expect(onProgress).toHaveBeenCalledTimes(source.length);
        expect(payloads('vpn-dev', 'Q/BULK')).toEqual(before);
        expect(payloads('vpn-dev', 'dev-scratch').slice(destBefore)).toEqual(before);
    });

    it('moves every message: the destination gains them in order and the source is left empty', async () => {
        const before = payloads('vpn-prod', 'Q/ORDER/PROCESS');
        const destBefore = spooled('vpn-prod', 'Q/ORDER/ARCHIVE').length;
        expect(before.length).toBeGreaterThan(0);

        const { completed } = await run(await openSession('vpn-prod'),
            { vpn: 'vpn-prod', from: 'Q/ORDER/PROCESS', to: 'Q/ORDER/ARCHIVE', mode: 'move' });

        expect(completed).toEqual([expect.objectContaining({ status: 'completed', copied: before.length, total: before.length })]);
        expect(spooled('vpn-prod', 'Q/ORDER/PROCESS')).toEqual([]);
        expect(payloads('vpn-prod', 'Q/ORDER/ARCHIVE').slice(destBefore)).toEqual(before);
    });

    it('stops a move at the broker\'s rejection, with its reason, and the source keeps every message', async () => {
        const before = payloads('vpn-prod', 'Q/ORDER/PROCESS');
        const destBefore = payloads('vpn-prod', 'Q/ORDER/ARCHIVE');
        const session = await openSession('vpn-prod');
        // The demo broker acks every publish. A broker that refuses one (a full
        // or shut destination) answers with REJECTED_MESSAGE_ERROR on the
        // session instead, carrying the correlation key, as solclient does.
        // Stand in for it at the session boundary only: keep the listeners the
        // publisher registers, and answer each send with that event.
        const rejectListeners: Array<(event: unknown) => void> = [];
        const on = session.on;
        session.on = (code: string, fn: (event: unknown) => void) => {
            if (code === sdk.SessionEventCode.REJECTED_MESSAGE_ERROR) rejectListeners.push(fn);
            return on(code, fn);
        };
        session.send = (msg: any) => {
            // Read where the demo session's own send reads it.
            const correlationKey = msg._fields.correlationKey;
            setTimeout(() => rejectListeners.forEach(fn => fn({ correlationKey, infoStr: 'Spool Over Quota' })), 1);
        };

        const { completed, onProgress } = await run(session,
            { vpn: 'vpn-prod', from: 'Q/ORDER/PROCESS', to: 'Q/ORDER/ARCHIVE', mode: 'move' });

        expect(rejectListeners).toHaveLength(1);
        expect(completed).toEqual([expect.objectContaining({ status: 'error', copied: 0, lastError: 'Spool Over Quota' })]);
        expect(onProgress).not.toHaveBeenCalled();
        expect(payloads('vpn-prod', 'Q/ORDER/PROCESS')).toEqual(before);
        expect(payloads('vpn-prod', 'Q/ORDER/ARCHIVE')).toEqual(destBefore);
    });
});
