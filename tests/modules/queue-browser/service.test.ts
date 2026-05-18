import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createService } from '../../../src/modules/queue-browser/service';
import { state } from '../../../src/modules/queue-browser/state.js';
import { ui } from '../../../src/modules/queue-browser/ui-core.js';
import { initTable } from '../../../src/modules/queue-browser/ui-table';
import { createEventBus } from '../../../src/core/event-bus';
import { createSolaceMock, createSessionMock, createBrowserMock, createMessageMock } from '../../setup';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
import type { AppContext, AppState } from '../../../src/core/types';

function createTestContext(overrides: Partial<AppContext> = {}): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false
    };
    return {
        container: document.createElement('div'),
        appState,
        eventBus,
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: { useMocks: false },
        ...overrides
    };
}

function setupBrowserDOM() {
    const container = loadModuleDOM('queue-browser');
    ui.initElements(container);
}

/**
 * Build a session that exposes both the ACK-listener surface the publisher
 * needs at construction (`session.on` / `session.removeListener` / `_handlers`)
 * AND lets us control which Browser instance is returned to createBrowser.
 * Replaces the historical inline `{ createQueueBrowser: vi.fn() }` shape —
 * those minimal objects no longer satisfy the publisher's session contract.
 */
function sessionWithBrowser(browser: any = createBrowserMock()) {
    const session = createSessionMock();
    (session.createQueueBrowser as any).mockReturnValue(browser);
    return { session, browser };
}

/** Drive the most-recent publish through ACK on the given session. */
function ackLast(session: any) {
    const setKey = (session.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
    const lastKey = setKey?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
    (session as any)._handlers.ACKNOWLEDGED_MESSAGE({ correlationKey: { Solace_Msg_Utility_Seq_Num: lastKey } });
}

describe('queue-browser/service', () => {
    let ctx: AppContext;
    let serviceEvents: any;
    let solaceMock: any;

    beforeEach(() => {
        solaceMock = createSolaceMock();
        (window as any).solace = solaceMock;
        ctx = createTestContext();
        serviceEvents = {
            onBrowserUp: vi.fn(),
            onConnectFailed: vi.fn(),
            onBrowserDown: vi.fn(),
            onGmDisabled: vi.fn(),
            onMessage: vi.fn(),
        };

        resetQueueBrowserState();

        setupBrowserDOM();
        initTable(ctx.eventBus);
    });

    describe('session lifecycle via EventBus', () => {
        it('captures session from client:connected', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            // Now createBrowser should work
            const result = service.createBrowser('test-queue');
            expect(result.ok).toBe(true);
        });

        it('clears session on client:disconnected', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });
            ctx.eventBus.emit('client:disconnected');

            const result = service.createBrowser('test-queue');
            expect(result.ok).toBe(false);
            expect(result.error).toContain('No active Solace session');
        });

        it('disposes the prior publisher when client:connected fires with a fresh session', () => {
            // After a VPN switch the connections module re-emits client:connected with
            // a new session object. The service must dispose its publisher before
            // creating a new one so listeners detach from the old session.
            const service = createService(ctx, serviceEvents);
            const first = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session: first.session });
            const second = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session: second.session });

            // removeListener on the first session was invoked for both event codes
            // by the publisher's dispose() path.
            const removed = (first.session.removeListener as any).mock.calls.map((c: any[]) => c[0]);
            expect(removed).toContain('ACKNOWLEDGED_MESSAGE');
            expect(removed).toContain('REJECTED_MESSAGE_ERROR');
            // createBrowser still works on the new session.
            expect(service.createBrowser('q').ok).toBe(true);
        });
    });

    describe('createBrowser()', () => {
        it('returns error when no session', () => {
            const service = createService(ctx, serviceEvents);
            const result = service.createBrowser('test-queue');
            expect(result.ok).toBe(false);
        });

        it('creates browser successfully', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const result = service.createBrowser('test-queue');
            expect(result.ok).toBe(true);
            expect(state.browserInstances.has('test-queue')).toBe(true);
            expect(state.messageStore.has('test-queue')).toBe(true);
        });

        it('enforces MAX_BROWSER_BINDINGS limit', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            service.createBrowser('q2');
            service.createBrowser('q3');
            const result = service.createBrowser('q4');

            expect(result.ok).toBe(false);
            expect(result.error).toContain('Limit');
        });

        it('attaches event listeners to browser', () => {
            const service = createService(ctx, serviceEvents);
            const { session, browser } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('test-queue');

            expect(browser.on).toHaveBeenCalledWith('UP', expect.any(Function));
            expect(browser.on).toHaveBeenCalledWith('CONNECT_FAILED_ERROR', expect.any(Function));
            expect(browser.on).toHaveBeenCalledWith('DOWN_ERROR', expect.any(Function));
            expect(browser.on).toHaveBeenCalledWith('GM_DISABLED', expect.any(Function));
            expect(browser.on).toHaveBeenCalledWith('MESSAGE', expect.any(Function));
        });

        it('cleans up on synchronous connect error', () => {
            const service = createService(ctx, serviceEvents);
            const browser = createBrowserMock();
            browser.connect.mockImplementation(() => { throw new Error('INVALID_OPERATION'); });
            const { session } = sessionWithBrowser(browser);
            ctx.eventBus.emit('client:connected', { session });

            const result = service.createBrowser('test-queue');

            expect(result.ok).toBe(false);
            expect(result.error).toContain('INVALID_OPERATION');
            expect(state.browserInstances.has('test-queue')).toBe(false);
            expect(state.messageStore.has('test-queue')).toBe(false);
        });

        it('does not reinitialize message store if already exists', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            state.messageStore.set('test-queue', [{ id: 'existing' }]);
            service.createBrowser('test-queue');

            expect(state.messageStore.get('test-queue')!.length).toBe(1);
        });
    });

    describe('disconnectBrowser()', () => {
        it('disconnects and cleans up browser', () => {
            const service = createService(ctx, serviceEvents);
            const { session, browser } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('test-queue');
            service.disconnectBrowser('test-queue');

            expect(browser.disconnect).toHaveBeenCalled();
            expect(state.browserInstances.has('test-queue')).toBe(false);
            expect(state.messageStore.has('test-queue')).toBe(false);
        });

        it('handles disconnect error gracefully — browser still removed from state', () => {
            const service = createService(ctx, serviceEvents);
            const browser = createBrowserMock();
            browser.disconnect.mockImplementation(() => { throw new Error('already disconnected'); });
            const { session } = sessionWithBrowser(browser);
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('test-queue');
            expect(state.browserInstances.has('test-queue')).toBe(true);
            expect(() => service.disconnectBrowser('test-queue')).not.toThrow();
            expect(state.browserInstances.has('test-queue')).toBe(false);
            expect(state.messageStore.has('test-queue')).toBe(false);
        });

        it('handles nonexistent queue gracefully — state untouched', () => {
            const service = createService(ctx, serviceEvents);
            const sizeBefore = state.browserInstances.size;
            expect(() => service.disconnectBrowser('nonexistent')).not.toThrow();
            expect(state.browserInstances.size).toBe(sizeBefore);
        });
    });

    describe('disconnectAll()', () => {
        it('disconnects all browsers', () => {
            const service = createService(ctx, serviceEvents);
            const b1 = createBrowserMock();
            const b2 = createBrowserMock();
            const session = createSessionMock();
            (session.createQueueBrowser as any)
                .mockReturnValueOnce(b1)
                .mockReturnValueOnce(b2);
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            service.createBrowser('q2');
            service.disconnectAll();

            expect(b1.disconnect).toHaveBeenCalled();
            expect(b2.disconnect).toHaveBeenCalled();
            expect(state.browserInstances.size).toBe(0);
            expect(state.messageStore.size).toBe(0);
        });

        it('handles disconnect errors in disconnectAll — all state cleared, error logged', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const service = createService(ctx, serviceEvents);
            const b1 = createBrowserMock();
            b1.disconnect.mockImplementation(() => { throw new Error('err'); });
            const { session } = sessionWithBrowser(b1);
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            expect(() => service.disconnectAll()).not.toThrow();
            expect(state.browserInstances.size).toBe(0);
            expect(state.messageStore.size).toBe(0);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('q1'),
                expect.any(Error)
            );
            warnSpy.mockRestore();
        });
    });

    describe('forwardMessage()', () => {
        function makeOriginal(overrides: Partial<Record<string, () => any>> = {}) {
            // Use the shared message-mock so getters/setters are typed and
            // mockable in tests. Overrides let individual tests rig specific
            // getter return values.
            const m: any = createMessageMock();
            for (const [key, fn] of Object.entries(overrides)) {
                (m as any)[key] = vi.fn(fn);
            }
            return { id: 'msg-1', _originalMsg: m };
        }

        it('forwards a message to a topic destination, with PERSISTENT delivery + correlation key from the UI', async () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const original = makeOriginal({
                getApplicationMessageId: () => 'app-1',
                getXmlContent: () => 'xml content',
            });

            const sendPromise = service.forwardMessage(original, 'dest/topic', 'Topic', 'seq-1');
            // session.send fires synchronously inside publisher.send; capture
            // the cloned message that hit the wire.
            const sentMsg = (session.send as any).mock.calls[0][0];
            expect(solaceMock.SolclientFactory.createTopicDestination).toHaveBeenCalledWith('dest/topic');
            expect(sentMsg.setDestination).toHaveBeenCalledTimes(1);
            expect(sentMsg.setCorrelationKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    Solace_Msg_Utility_Seq_Num: 'seq-1',
                    Original_Msg_ID: 'msg-1',
                })
            );
            expect(sentMsg.setDeliveryMode).toHaveBeenCalledWith(solaceMock.MessageDeliveryModeType.PERSISTENT);

            // Resolve via session ACK so the returned promise settles cleanly.
            ackLast(session);
            await expect(sendPromise).resolves.toEqual({ ok: true });
        });

        it('forwards to a queue destination, unwrapping `_originalMsg` and propagating the SDT container into the cloned message', async () => {
            // The forwardMessage adapter's contract is: pass `originalMsg._originalMsg`
            // (the raw SDK message) to publisher.send, NOT the queue-browser cache
            // wrapper. A regression that handed the wrapper through would break
            // the clone's getter chain at publisher level — every safeSet call
            // sees `typeof originalMsg[getter] !== 'function'` and skips. This
            // test asserts both the destination factory AND that the SDT
            // payload from `_originalMsg.getSdtContainer()` survived the
            // unwrap-clone-send pipeline.
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const sdtPayload = { type: 'sdt' };
            const original = makeOriginal({ getSdtContainer: () => sdtPayload });
            const p = service.forwardMessage(original, 'dest-queue', 'Queue', 'seq-2');
            expect(solaceMock.SolclientFactory.createDurableQueueDestination).toHaveBeenCalledWith('dest-queue');

            // Capture the cloned message off session.send and verify it carried
            // the SDT payload from the underlying _originalMsg, not the wrapper.
            const sentMsg = (session.send as any).mock.calls[0][0];
            expect(sentMsg.setSdtContainer).toHaveBeenCalledWith(sdtPayload);
            // Correlation key carries the caller-supplied seq AND the wrapper's `id`.
            expect(sentMsg.setCorrelationKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    Solace_Msg_Utility_Seq_Num: 'seq-2',
                    Original_Msg_ID: 'msg-1',
                }),
            );
            // PERSISTENT delivery is force-set by the publisher's clone path —
            // mirrors the topic test's assertion; ensures the queue path
            // didn't accidentally take a different branch.
            expect(sentMsg.setDeliveryMode).toHaveBeenCalledWith(solaceMock.MessageDeliveryModeType.PERSISTENT);

            ackLast(session);
            await p;
        });

        it('copies binary attachment when no SDT or XML, with PERSISTENT delivery and the right correlation key', async () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const binary = new Uint8Array([1, 2, 3]);
            const original = makeOriginal({
                // Force null on the higher-priority paths so the cloner
                // falls all the way through to setBinaryAttachment.
                getXmlContent: () => null,
                getBinaryAttachment: () => binary,
            });
            const p = service.forwardMessage(original, 'dest', 'Topic', 'seq-3');

            const sentMsg = (session.send as any).mock.calls[0][0];
            // The Binary path actually fired (proves the SDT → XML → Binary
            // chain ran to its third branch). A regression that flipped the
            // content-priority order would call setSdtContainer or
            // setXmlContent with the wrong getter.
            expect(sentMsg.setSdtContainer).not.toHaveBeenCalled();
            expect(sentMsg.setXmlContent).not.toHaveBeenCalled();
            expect(sentMsg.setBinaryAttachment).toHaveBeenCalledWith(binary);
            expect(sentMsg.setCorrelationKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    Solace_Msg_Utility_Seq_Num: 'seq-3',
                    Original_Msg_ID: 'msg-1',
                }),
            );
            expect(sentMsg.setDeliveryMode).toHaveBeenCalledWith(solaceMock.MessageDeliveryModeType.PERSISTENT);

            ackLast(session);
            await p;
        });

        it('throws when no session', async () => {
            const service = createService(ctx, serviceEvents);
            await expect(service.forwardMessage({ _originalMsg: {} } as any, 'dest', 'Topic', 'seq'))
                .rejects.toThrow('Not connected');
        });

        it('resolves {ok:false} when the cloned send throws synchronously', async () => {
            // The publisher catches sync send failures and resolves the promise
            // rather than re-throwing — the modal flow stays uniform: status
            // updates always come from the .then handler in handleForwardSend.
            const session = createSessionMock();
            (session.send as any).mockImplementation(() => { throw new Error('send failed'); });
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());
            const service = createService(ctx, serviceEvents);
            ctx.eventBus.emit('client:connected', { session });

            const original = makeOriginal();
            const result = await service.forwardMessage(original, 'dest', 'Topic', 'seq');
            expect(result).toEqual({ ok: false, error: 'send failed' });
        });

        it('safeSet skips setters whose getter returns null/undefined', async () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            // All getters default to null in createMessageMock — perfect for this case.
            const original = makeOriginal();
            const p = service.forwardMessage(original, 'test-topic', 'Topic', 'cv-null');
            const sent = (session.send as any).mock.calls[0][0];

            // Setters for null-returning getters are skipped.
            expect(sent.setApplicationMessageId).not.toHaveBeenCalled();
            expect(sent.setCorrelationId).not.toHaveBeenCalled();
            expect(sent.setPriority).not.toHaveBeenCalled();
            expect(sent.setSenderId).not.toHaveBeenCalled();
            expect(sent.setTimeToLive).not.toHaveBeenCalled();
            // Unconditional setters still fire.
            expect(sent.setDestination).toHaveBeenCalledTimes(1);
            expect(sent.setCorrelationKey).toHaveBeenCalledTimes(1);
            expect(sent.setDeliveryMode).toHaveBeenCalledTimes(1);

            ackLast(session);
            await p;
        });

        it('handles property getter that throws — the cloner swallows the error and keeps going', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const original = makeOriginal({
                getApplicationMessageId: () => { throw new Error('getter fail'); },
                getSdtContainer: () => { throw new Error('sdt fail'); },
                getXmlContent: () => { throw new Error('xml fail'); },
                getBinaryAttachment: () => { throw new Error('bin fail'); },
            });

            const p = service.forwardMessage(original, 'dest', 'Topic', 'seq');
            expect(session.send).toHaveBeenCalled();
            // Cloner's safeSet catch path warns, doesn't throw.
            expect(warnSpy).toHaveBeenCalled();
            ackLast(session);
            await p;
            warnSpy.mockRestore();
        });
    });

    describe('hasInFlightForward()', () => {
        it('reports true while a publish is awaiting ACK, false after settlement', async () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const p = service.forwardMessage({ id: 'm', _originalMsg: createMessageMock() }, 'dest', 'Topic', 'pending-cv');
            expect(service.hasInFlightForward('pending-cv')).toBe(true);
            expect(service.hasInFlightForward('other-cv')).toBe(false);
            ackLast(session);
            await p;
            expect(service.hasInFlightForward('pending-cv')).toBe(false);
        });

        it('returns false when no publisher exists yet (no session connected)', () => {
            const service = createService(ctx, serviceEvents);
            expect(service.hasInFlightForward('anything')).toBe(false);
        });
    });

    describe('deleteMessages()', () => {
        it('returns ok:true with count:0 for empty input', () => {
            const service = createService(ctx, serviceEvents);
            expect(service.deleteMessages('q', []).ok).toBe(true);
            expect(service.deleteMessages('q', null as any).ok).toBe(true);
            expect(service.deleteMessages('', []).ok).toBe(true);
        });

        it('returns error when no session', () => {
            const service = createService(ctx, serviceEvents);
            const result = service.deleteMessages('q', ['1']);
            expect(result.ok).toBe(false);
            expect(result.error).toContain('No active session');
        });

        it('returns error when no browser for queue', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            const result = service.deleteMessages('nonexistent', ['1']);
            expect(result.ok).toBe(false);
            expect(result.error).toContain('Browser not active');
        });

        it('returns error when browser present but messageStore entry absent (concurrent disconnect)', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            state.browserInstances.set('partial-q', { _mock: true } as any);
            state.allMessages = [{ id: 'stale' }] as any;

            const result = service.deleteMessages('partial-q', ['1']);

            expect(result.ok).toBe(false);
            expect(result.error).toContain('Message store');
            expect(state.messageStore.has('partial-q')).toBe(false);
        });

        it('deletes messages and updates state', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            state.allMessages = [{ id: '1' }, { id: '2' }, { id: '3' }];
            state.displayedMessages = [{ id: '1' }, { id: '2' }, { id: '3' }];
            state.currentQueue = 'q1';

            const result = service.deleteMessages('q1', ['1', '2']);

            expect(result.ok).toBe(true);
            expect(result.count).toBe(2);
            expect(state.allMessages.length).toBe(1);
            expect(state.displayedMessages.length).toBe(1);
        });

        it('handles removeMessageFromQueue error for individual messages', () => {
            const service = createService(ctx, serviceEvents);
            const browser = createBrowserMock();
            browser.removeMessageFromQueue.mockImplementation(() => { throw new Error('remove failed'); });
            const { session } = sessionWithBrowser(browser);
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            state.allMessages = [{ id: '1' }];
            state.displayedMessages = [{ id: '1' }];

            const result = service.deleteMessages('q1', ['1']);
            expect(result.ok).toBe(false);
            expect(result.count).toBe(0);
        });

        it('handles message prepare error', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            state.allMessages = [{ id: 'bad' }];
            state.displayedMessages = [{ id: 'bad' }];

            solaceMock.SolclientFactory.createMessage.mockImplementation(() => { throw new Error('create failed'); });

            const result = service.deleteMessages('q1', ['bad']);
            expect(result.ok).toBe(false);
        });

        it('sorts message IDs numerically', () => {
            const service = createService(ctx, serviceEvents);
            const { session } = sessionWithBrowser();
            ctx.eventBus.emit('client:connected', { session });

            service.createBrowser('q1');
            state.allMessages = [{ id: '10' }, { id: '2' }, { id: '1' }];
            state.displayedMessages = [...state.allMessages];

            const order: string[] = [];
            const origCreateMsg = solaceMock.SolclientFactory.createMessage;
            solaceMock.SolclientFactory.createMessage = vi.fn(() => {
                const msg = origCreateMsg();
                msg.setGuaranteedMessageId = vi.fn((id: number) => { order.push(id.toString()); });
                return msg;
            });

            service.deleteMessages('q1', ['10', '2', '1']);
            expect(order).toEqual(['1', '2', '10']);
        });
    });
});
