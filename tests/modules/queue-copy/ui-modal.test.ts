import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openCopyModal, cancelCopyModal, evaluateStartGate, destinationRefusal } from '../../../src/modules/queue-copy/ui-modal';
import { cacheElements } from '../../../src/modules/queue-copy/ui';
import { createInitialState } from '../../../src/modules/queue-copy/state';
import { ACCUMULATE_IDLE_MS } from '../../../src/modules/queue-copy/service-verify';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createSessionMock, createBrowserMock } from '../../setup';
import type { SourceAccess } from '../../../src/modules/queue-copy/ui-modal';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';
import { createManagedSessionStore } from '../../../src/core/services/managed-session-store';
import type { CopyJob, VerifyResult } from '../../../src/modules/queue-copy/state';

// Derive the structured sempCredentials fields from a baseUrl shorthand so
// fixture lines stay readable: `sempCreds('https://broker:1943/SEMP/v2')`.
function sempCreds(baseUrl: string, user = 'u', pass = 'p'): NonNullable<AppState['sempCredentials']> {
    const u = new URL(baseUrl);
    return {
        user, pass, baseUrl,
        protocol: u.protocol.replace(/:$/, ''),
        host: u.hostname,
        port: u.port,
        urlPath: u.pathname === '/' ? '' : u.pathname,
    };
}

function makeCtx(overrides: Partial<AppContext['appState']> = {}): AppContext {
    return {
        container: document.createElement('div'),
        appState: {
            activeModuleId: null,
            isConnected: true,
            selectedVpn: 'vpn1',
            solaceConnection: null,
            sempCredentials: null,
            isSempConnected: false,
            ...overrides,
        },
        eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), hold: vi.fn(), release: vi.fn() },
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        managedStore: createManagedSessionStore(),
        copyToClipboard: vi.fn(),
        config: {},
    };
}

/** Direct mode: no managed session, so every gate degrades to allow-all. */
const DIRECT: SourceAccess = { session: null, broker: '', vpn: '' };

/** A managed session with explicit operate/read-only globs. */
function managed(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false, username: 'u', token: 't', broker: 'b1', vpns: [],
        operate: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'ops.*' }],
        readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'ro.*' }],
        ...over,
    };
}
/** Managed access for a given source queue on b1/vpn1. */
const mAccess = (over: Partial<ManagedSession> = {}): SourceAccess =>
    ({ session: managed(over), broker: 'b1', vpn: 'vpn1' });

function verifyResult(opts: Partial<VerifyResult> = {}): VerifyResult {
    return {
        sourceOk: true, via: 'semp', errors: [],
        messageVpn: null, messageCount: 5,
        spoolUsageBytes: null, quotaBytes: null, maxMessageSize: null,
        oldestMsgId: null, newestMsgId: null, accessType: 'read-write', owner: null,
        ...opts,
    };
}

function job(over: Partial<CopyJob> = {}): CopyJob {
    return {
        total: 5,
        copied: 0,
        cancelRequested: false,
        lastError: null,
        status: 'running',
        ...over,
    };
}

describe('queue-copy/ui-modal', () => {
    let container: HTMLElement;
    let els: ReturnType<typeof cacheElements>;

    beforeEach(() => {
        container = loadModuleDOM('queue-copy');
        els = cacheElements(container);
    });

    describe('openCopyModal', () => {
        it('renders initial state and short-circuits when no primary session', () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'src-q';
            state.dest = { type: 'queue', name: 'dst' };

            openCopyModal(ctx, els, state, () => null);

            expect(els.modal.hasAttribute('open')).toBe(true);
            expect(els.modalTitle.textContent).toBe('Confirm Queue Copy');
            expect(els.modalSourceName.textContent).toBe('src-q');
            expect(els.modalSourceStatus.textContent).toBe('Not Found');
            expect(state.verify?.inProgress).toBe(false);
            expect(els.btnModalStart.disabled).toBe(true);
        });

        it('source/dest summary uses primary broker + selected VPN by default', () => {
            const ctx = makeCtx({
                sempCredentials: sempCreds('https://broker.example:1943/SEMP/v2'),
                isSempConnected: true,
            });
            const state = createInitialState();
            state.sourceQueue = 's';
            state.dest = { type: 'queue', name: 'dst' };

            openCopyModal(ctx, els, state, () => null);

            expect(els.modalSourceBroker.textContent).toBe('broker.example:1943');
            expect(els.modalSourceVpn.textContent).toBe('vpn1');
            expect(els.modalDestBroker.textContent).toBe('broker.example:1943');
            expect(els.modalDestVpn.textContent).toBe('vpn1');
        });

        it('falls back to placeholders when there is no primary SEMP / selected VPN', () => {
            const ctx = makeCtx({ selectedVpn: null });
            const state = createInitialState();
            state.sourceQueue = 's';
            state.dest = { type: 'queue', name: 'dst' };

            openCopyModal(ctx, els, state, () => null);

            expect(els.modalSourceBroker.textContent).toBe('(primary broker)');
            expect(els.modalSourceVpn.textContent).toBe('(primary VPN)');
            expect(els.modalDestVpn.textContent).toBe('(primary VPN)');
        });


        it('cross-broker dest summary uses destForm.host and destForm.solace.vpn', () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 's';
            state.dest = { type: 'topic', name: 'orders/new' };
            state.destForm.sameBroker = false;
            state.destForm.sameVpn = false;
            state.destForm.host = 'broker.x';
            state.destForm.solace.vpn = 'crossVpn';
            state.mode = 'move';

            openCopyModal(ctx, els, state, () => null);

            expect(els.modalDestBroker.textContent).toBe('broker.x');
            expect(els.modalDestVpn.textContent).toBe('crossVpn');
            expect(els.modalDestType.textContent).toBe('Topic');
            expect(els.modalDestName.textContent).toBe('orders/new');
            expect(els.btnModalStart.textContent).toBe('Move');
        });

        it('cross-broker dest summary with empty host/vpn shows "(not set)"', () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 's';
            state.destForm.sameBroker = false;
            state.destForm.sameVpn = false;

            openCopyModal(ctx, els, state, () => null);

            expect(els.modalDestBroker.textContent).toBe('(not set)');
            expect(els.modalDestVpn.textContent).toBe('(not set)');
            expect(els.modalDestName.textContent).toBe('(not set)');
        });

        it('runs verification + renders Found via QueueBrowser on success (no SEMP)', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();  // no SEMP
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            (browser as any)._handlers.UP();
            // Deliver one MESSAGE so messageCount > 0 — empty-queue gate would
            // otherwise keep Start disabled.
            (browser as any)._handlers.MESSAGE({
                getGuaranteedMessageId: () => 100, smfHeader: { messageLength: 100 },
            });
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            expect(state.verify?.inProgress).toBe(false);
            expect(els.modalSourceStatus.textContent).toBe('Found via QueueBrowser');
            expect(els.btnModalStart.disabled).toBe(false);
            vi.useRealTimers();
        });

        it('live progress updates in the modal during accumulation', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            (browser as any)._handlers.UP();
            (browser as any)._handlers.MESSAGE({ smfHeader: { messageLength: 100 } });
            (browser as any)._handlers.MESSAGE({ smfHeader: { messageLength: 200 } });
            expect(els.modalSourceCount.textContent).toContain('2');
            expect(els.modalSourceCount.textContent).toContain('loading');

            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(els.modalSourceCount.textContent).toBe('2');
            vi.useRealTimers();
        });

        it('progress updates ignored after the modal is closed mid-flight', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            (browser as any)._handlers.UP();
            state.verify = null;
            (browser as any)._handlers.MESSAGE({ smfHeader: { messageLength: 100 } });
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(state.verify).toBeNull();
            vi.useRealTimers();
        });

        it('verify result ignored if modal was closed (state.verify=null)', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            state.verify = null;
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(state.verify).toBeNull();
            vi.useRealTimers();
        });
    });

    describe('evaluateStartGate', () => {
        // Direct unit tests for the gate — independent of the modal's
        // verify-fire-then-render orchestration.
        it('verify failure → Start disabled, both banners hidden', () => {
            const state = createInitialState();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ sourceOk: false, errors: ['no perms'] }),
            };
            els.btnModalStart.disabled = false;
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
        });

        it('empty queue → Start disabled, empty-queue banner shown', () => {
            const state = createInitialState();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 0 }),
            };
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(false);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
        });

        it('move on read-only → Start disabled, read-only banner shown', () => {
            const state = createInitialState();
            state.mode = 'move';
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, accessType: 'read-only' }),
            };
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(false);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
        });

        it('copy on read-only → Start ENABLED, no banners (copy does not need consume)', () => {
            const state = createInitialState();
            state.mode = 'copy';
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, accessType: 'read-only' }),
            };
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(false);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
        });

        it('toggling mode from copy → move on read-only re-disables Start; toggling back re-enables', () => {
            const state = createInitialState();
            state.mode = 'copy';
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, accessType: 'read-only' }),
            };
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(false);

            state.mode = 'move';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(false);

            state.mode = 'copy';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(false);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
        });

        it('null accessType is permissive — Start enabled for both modes', () => {
            const state = createInitialState();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, accessType: null }),
            };
            state.mode = 'copy';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(false);
            state.mode = 'move';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(false);
        });

        it('no verify result yet → Start disabled, banners hidden', () => {
            const state = createInitialState();
            state.verify = null;
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);
        });

        it('no-access blocks BOTH copy and move → Start disabled, no-access banner shown', () => {
            const state = createInitialState();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, accessType: 'no-access' }),
            };
            state.mode = 'copy';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(false);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(true);

            state.mode = 'move';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(false);
        });

        it('toggling from no-access to read-write (e.g. user re-verifies after permission change) clears no-access banner', () => {
            const state = createInitialState();
            state.verify = {
                inProgress: false, abort: null,
                result: verifyResult({ messageCount: 5, accessType: 'no-access' }),
            };
            evaluateStartGate(els, state, DIRECT);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(false);

            state.verify.result!.accessType = 'read-write';
            evaluateStartGate(els, state, DIRECT);
            expect(els.btnModalStart.disabled).toBe(false);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);
        });
    });

    describe('SEMP-path owner override', () => {
        // SEMP RPC reports raw queue metadata (owner + others-permission)
        // but doesn't evaluate it against the client. The modal lifts
        // accessType to 'read-write' when the client user matches the
        // queue owner, regardless of what others-permission says.
        it('client user matches owner → accessType lifted to read-write (move allowed even if others-permission is No-Access)', async () => {
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'semp',
                    messageCount: 5,
                    accessType: 'no-access',
                    owner: 'alice',
                }));

            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'admin'),
                solaceConnection: {
                    host: 'b', protocol: 'wss', port: '443', urlPath: '',
                    vpn: 'default', user: 'alice', pass: 'p',
                },
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // Owner override fires: result.accessType becomes 'read-write'.
            expect(state.verify!.result!.accessType).toBe('read-write');
            // Gate enables Start in move mode despite the original no-access.
            expect(els.btnModalStart.disabled).toBe(false);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(true);

            verifySpy.mockRestore();
        });

        it('client user does NOT match owner → accessType stays as reported (move blocked when read-only)', async () => {
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'semp',
                    messageCount: 5,
                    accessType: 'read-only',
                    owner: 'bob',
                }));

            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'admin'),
                solaceConnection: {
                    host: 'b', protocol: 'wss', port: '443', urlPath: '',
                    vpn: 'default', user: 'alice', pass: 'p',
                },
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // No override — accessType stays 'read-only'.
            expect(state.verify!.result!.accessType).toBe('read-only');
            // Gate blocks Start in move mode; readonly banner shown.
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(false);

            verifySpy.mockRestore();
        });

        it('empty owner + non-empty client user → no override (strings differ)', async () => {
            // Server-created queues report <owner></owner> (empty string).
            // A client authenticated as 'alice' does NOT own that queue.
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'semp',
                    messageCount: 5,
                    accessType: 'read-only',
                    owner: '',
                }));

            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'admin'),
                solaceConnection: {
                    host: 'b', protocol: 'wss', port: '443', urlPath: '',
                    vpn: 'default', user: 'alice', pass: 'p',
                },
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // No override — '' !== 'alice'. accessType stays 'read-only'.
            expect(state.verify!.result!.accessType).toBe('read-only');
            expect(els.btnModalStart.disabled).toBe(true);
            expect(els.modalSourceReadonly.classList.contains('hidden')).toBe(false);

            verifySpy.mockRestore();
        });

        it('empty owner + empty client user → override fires (strict equals, both empty)', async () => {
            // Edge case: an unauthenticated client (empty username) against
            // a server-created queue (empty owner). Strict equals says they
            // match; the override fires. Whether this scenario is reachable
            // in practice depends on broker configuration — the engine just
            // applies the rule as specified.
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'semp',
                    messageCount: 5,
                    accessType: 'no-access',
                    owner: '',
                }));

            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'admin'),
                solaceConnection: null,  // → clientUser becomes ''
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // '' === '' → override fires; no-access lifted to read-write.
            expect(state.verify!.result!.accessType).toBe('read-write');
            expect(els.btnModalStart.disabled).toBe(false);
            expect(els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);

            verifySpy.mockRestore();
        });

        it('null owner (e.g. SEMP <owner> element missing) → no override', async () => {
            // Defensive case: SEMP response lacked the <owner> element.
            // result.owner is null. The override condition guards against
            // null specifically so the equals check never runs.
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'semp',
                    messageCount: 5,
                    accessType: 'read-only',
                    owner: null,
                }));

            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'admin'),
                solaceConnection: null,  // clientUser=''
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // Owner is null → guard short-circuits; no override.
            expect(state.verify!.result!.accessType).toBe('read-only');
            expect(els.btnModalStart.disabled).toBe(true);

            verifySpy.mockRestore();
        });

        it('QB-fallback path (owner=null) does NOT trigger override even when client user is set', async () => {
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'queue-browser',
                    messageCount: 5,
                    accessType: 'read-only',
                    owner: null, // QB-fallback doesn't surface owner
                }));

            const ctx = makeCtx({
                solaceConnection: {
                    host: 'b', protocol: 'wss', port: '443', urlPath: '',
                    vpn: 'default', user: 'alice', pass: 'p',
                },
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // No override — QB-fallback's accessType is from the SDK and is
            // already client-perspective. Stays 'read-only'.
            expect(state.verify!.result!.accessType).toBe('read-only');
            expect(els.btnModalStart.disabled).toBe(true);

            verifySpy.mockRestore();
        });

        it('owner override fires when prior accessType is null (SEMP could not determine it)', async () => {
            // Edge case: SEMP returned an owner but couldn't determine
            // accessType (e.g. a partial response or a queue state where
            // others-permission was missing). The owner-match override
            // still fires and lifts accessType to 'read-write'. Covers the
            // `prior ?? 'null'` branch of the override log line.
            const verifyMod = await import('../../../src/modules/queue-copy/service-verify');
            const verifySpy = vi.spyOn(verifyMod, 'verifySource')
                .mockResolvedValue(verifyResult({
                    via: 'semp',
                    messageCount: 5,
                    accessType: null,
                    owner: 'alice',
                }));

            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'admin'),
                solaceConnection: {
                    host: 'b', protocol: 'wss', port: '443', urlPath: '',
                    vpn: 'default', user: 'alice', pass: 'p',
                },
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // 'alice' === 'alice' → override fires; null lifted to read-write.
            expect(state.verify!.result!.accessType).toBe('read-write');
            expect(els.btnModalStart.disabled).toBe(false);

            verifySpy.mockRestore();
        });
    });

    describe('in-modal Refresh button', () => {
        it('starts disabled+visible during the initial verify probe; enables after success', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            expect(els.btnModalSourceRefresh.disabled).toBe(true);
            expect(els.btnModalSourceRefresh.classList.contains('hidden')).toBe(false);

            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(els.btnModalSourceRefresh.disabled).toBe(false);
            vi.useRealTimers();
        });

        it('clicking Refresh aborts the in-flight verify and fires a fresh one', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser1 = createBrowserMock();
            const browser2 = createBrowserMock();
            (session.createQueueBrowser as any)
                .mockReturnValueOnce(browser1)
                .mockReturnValueOnce(browser2);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            (browser1 as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(els.btnModalSourceRefresh.disabled).toBe(false);
            const firstAbort = state.verify!.abort!;

            els.btnModalSourceRefresh.click();
            await Promise.resolve();
            expect(firstAbort.signal.aborted).toBe(true);
            expect(state.verify!.inProgress).toBe(true);
            expect(els.btnModalSourceRefresh.disabled).toBe(true);
            expect(els.modalSourceCount.textContent).toBe('—');
            expect(els.modalSourceStatus.textContent).toBe('Checking…');

            (browser2 as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(els.btnModalSourceRefresh.disabled).toBe(false);
            expect((session.createQueueBrowser as any).mock.calls.length).toBe(2);
            vi.useRealTimers();
        });

        it('is enabled even after a failed verify (so the user can retry)', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            (browser as any)._handlers.CONNECT_FAILED_ERROR({ infoStr: 'denied' });
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(els.modalSourceStatus.textContent).toBe('Not Found');
            expect(els.btnModalSourceRefresh.disabled).toBe(false);
            vi.useRealTimers();
        });

        it('is hidden once the run phase begins (Copy/Move clicked)', async () => {
            vi.useFakeTimers();
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const { createSolacePublisher } = await import('../../../src/core/services/solace-publisher');
            state.primaryPublisher = createSolacePublisher(session);

            openCopyModal(ctx, els, state, () => session);
            await Promise.resolve();
            (browser as any)._handlers.UP();
            // Deliver one msg → messageCount=1, accessType=READ_WRITE default.
            (browser as any)._handlers.MESSAGE({
                getGuaranteedMessageId: () => 100, smfHeader: { messageLength: 100 },
            });
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            expect(els.btnModalSourceRefresh.disabled).toBe(false);
            expect(els.btnModalStart.disabled).toBe(false);

            els.btnModalStart.click();
            await Promise.resolve();
            expect(els.btnModalSourceRefresh.classList.contains('hidden')).toBe(true);
            expect(els.btnModalSourceRefresh.disabled).toBe(true);
            vi.useRealTimers();
        });
    });

    describe('modal Start (Copy/Move)', () => {
        it('clicking Start drives the run phase; onComplete re-enables the form', async () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const { createSolacePublisher } = await import('../../../src/core/services/solace-publisher');
            state.primaryPublisher = createSolacePublisher(session);

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 5; i++) await Promise.resolve();

            // Force verify result so the engine has a definite total.
            // total=0 → fast-path: engine completes via microtask without
            // binding a browser.
            state.verify!.result = verifyResult({ messageCount: 0 });
            state.verify!.inProgress = false;

            els.btnModalStart.disabled = false;
            els.btnModalStart.click();

            expect(els.sourceInput.disabled).toBe(true);
            expect(els.modalTitle.textContent).toBe('Copying…');

            for (let i = 0; i < 10; i++) await Promise.resolve();
            // total=0 fast-path completes cleanly.
            expect(els.sourceInput.disabled).toBe(false);
            expect(state.job!.status).toBe('completed');
        });

        it('Start does nothing when primary session is null', async () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };

            const session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(createBrowserMock());
            let session2: any = session;
            openCopyModal(ctx, els, state, () => session2);
            for (let i = 0; i < 5; i++) await Promise.resolve();
            session2 = null;
            els.btnModalStart.disabled = false;
            els.btnModalStart.click();
            // No throw; setFormDisabled(true) was never called.
            expect(els.sourceInput.disabled).toBe(false);
        });

        it('source-drift surfaces via renderRunError (engine reports status=error)', async () => {
            const ctx = makeCtx({
                isSempConnected: true,
                sempCredentials: sempCreds('https://b:1943/SEMP/v2', 'a'),
            });
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const { createSolacePublisher } = await import('../../../src/core/services/solace-publisher');
            state.primaryPublisher = createSolacePublisher(session);

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 5; i++) await Promise.resolve();
            state.verify!.result = verifyResult({
                messageCount: 5, oldestMsgId: '100', newestMsgId: '104',
            });
            state.verify!.inProgress = false;

            els.btnModalStart.disabled = false;
            els.btnModalStart.click();
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await Promise.resolve();
            // First message reports id 999 — recorded oldest is 100 → drift.
            (browser as any)._handlers.MESSAGE({ getGuaranteedMessageId: () => 999, smfHeader: {} });
            for (let i = 0; i < 10; i++) await Promise.resolve();

            expect(els.modalRunError.classList.contains('hidden')).toBe(false);
            expect(els.modalRunError.textContent).toContain('did not match recorded oldest');
            expect(state.job!.status).toBe('error');
        });

        it('publish reject during run surfaces broker reason via renderRunError', async () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const { createSolacePublisher } = await import('../../../src/core/services/solace-publisher');
            state.primaryPublisher = createSolacePublisher(session);

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 5; i++) await Promise.resolve();
            state.verify!.result = verifyResult({
                messageCount: 5, oldestMsgId: '100', newestMsgId: '104',
            });
            state.verify!.inProgress = false;

            els.btnModalStart.disabled = false;
            els.btnModalStart.click();
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await Promise.resolve();
            (browser as any)._handlers.MESSAGE({ getGuaranteedMessageId: () => 100, smfHeader: {} });
            await Promise.resolve();
            const setKey = (session.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
            const lastKey = setKey?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
            (session as any)._handlers.REJECTED_MESSAGE_ERROR({
                correlationKey: { Solace_Msg_Utility_Seq_Num: lastKey }, infoStr: 'broker said no',
            });
            for (let i = 0; i < 30; i++) await Promise.resolve();

            expect(els.modalRunError.classList.contains('hidden')).toBe(false);
            expect(els.modalRunError.textContent).toContain('broker said no');
            expect(state.job!.status).toBe('error');
        });

        it('onProgress is coalesced via requestAnimationFrame — multiple ACKs schedule ONE paint', async () => {
            // Direct regression for the user-reported bug where the progress
            // bar jumped straight to 100% instead of incrementing live. Fix
            // (ui-modal.ts handleModalStart): N rapid onProgress calls in one
            // microtask burst update `latestJob` but schedule exactly ONE
            // requestAnimationFrame; the rAF callback flushes the latest
            // state. This test stubs rAF to capture callbacks WITHOUT running
            // them, fires 2 successful publish ACKs back-to-back, then asserts
            // only ONE rAF was scheduled and that running it paints the
            // LATEST copied value (not an intermediate one).
            //
            // newestMsgId is set well above the IDs we fire so the engine
            // does NOT reach reached-max during the test — that would trigger
            // onComplete, which renders synchronously and would mask the
            // rAF-only paint we're verifying.
            const rafCallbacks: Array<() => void> = [];
            const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
                rafCallbacks.push(cb as () => void);
                return rafCallbacks.length;
            });

            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const { createSolacePublisher } = await import('../../../src/core/services/solace-publisher');
            state.primaryPublisher = createSolacePublisher(session);

            openCopyModal(ctx, els, state, () => session);
            for (let i = 0; i < 5; i++) await Promise.resolve();
            // Big total + a max far above what we'll fire keeps the engine in
            // its running state for the whole test (no reached-max stop, no
            // onComplete-driven synchronous render).
            state.verify!.result = verifyResult({
                messageCount: 10, oldestMsgId: '100', newestMsgId: '999',
            });
            state.verify!.inProgress = false;
            els.btnModalStart.disabled = false;
            els.btnModalStart.click();
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await Promise.resolve();

            // Sanity: nothing painted yet — progressText carries the initial
            // "0 / 10" from renderRunPhase.
            expect(els.progressText.textContent).toBe('0 / 10');

            // Fire MESSAGE 1 + ACK; engine resumes through onProgress(copied=1).
            (browser as any)._handlers.MESSAGE({ getGuaranteedMessageId: () => 100, smfHeader: {} });
            for (let i = 0; i < 5; i++) await Promise.resolve();
            const setKey1 = (session.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
            const key1 = setKey1?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
            (session as any)._handlers.ACKNOWLEDGED_MESSAGE({ correlationKey: { Solace_Msg_Utility_Seq_Num: key1 } });
            for (let i = 0; i < 5; i++) await Promise.resolve();

            // First onProgress scheduled exactly one rAF. The DOM has NOT
            // been painted yet because we captured the callback without
            // running it — pendingPaint is still true.
            expect(rafSpy).toHaveBeenCalledTimes(1);
            expect(rafCallbacks).toHaveLength(1);
            expect(els.progressText.textContent).toBe('0 / 10');

            // Fire MESSAGE 2 + ACK BEFORE running the pending rAF callback.
            // This is the coalesce case: the second onProgress sees
            // pendingPaint===true, just updates `latestJob`, and returns
            // WITHOUT scheduling another rAF.
            (browser as any)._handlers.MESSAGE({ getGuaranteedMessageId: () => 101, smfHeader: {} });
            for (let i = 0; i < 5; i++) await Promise.resolve();
            const setKey2 = (session.send as any).mock.calls.at(-1)?.[0]?.setCorrelationKey;
            const key2 = setKey2?.mock?.calls?.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num;
            (session as any)._handlers.ACKNOWLEDGED_MESSAGE({ correlationKey: { Solace_Msg_Utility_Seq_Num: key2 } });
            for (let i = 0; i < 5; i++) await Promise.resolve();

            // Still only ONE rAF queued — the coalesce held.
            expect(rafSpy).toHaveBeenCalledTimes(1);
            expect(rafCallbacks).toHaveLength(1);
            // And the DOM is STILL "0 / 10" because the captured rAF has
            // not run.
            expect(els.progressText.textContent).toBe('0 / 10');

            // Run the captured rAF. The paint must reflect the LATEST job
            // (copied=2), not the intermediate copied=1 value.
            rafCallbacks[0]();
            expect(els.progressText.textContent).toBe('2 / 10');

            // Cleanup: cancel the still-running engine so its idle timer
            // does not outlive the test.
            state.job!.cancelRequested = true;
            (browser as any)._handlers.MESSAGE({ getGuaranteedMessageId: () => 102, smfHeader: {} });
            for (let i = 0; i < 10; i++) await Promise.resolve();
            rafSpy.mockRestore();
        });

        it('Move mode shows "Move" button label and "Moving…" run title', async () => {
            const ctx = makeCtx();
            const state = createInitialState();
            state.sourceQueue = 'q';
            state.dest = { type: 'queue', name: 'd' };
            state.mode = 'move';
            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);

            openCopyModal(ctx, els, state, () => session);
            expect(els.btnModalStart.textContent).toBe('Move');

            state.verify!.result = verifyResult({ messageCount: 0 });
            state.verify!.inProgress = false;
            els.btnModalStart.disabled = false;
            els.btnModalStart.click();
            expect(els.modalTitle.textContent).toBe('Moving…');
        });
    });

    describe('cancelCopyModal', () => {
        it('verifying phase: aborts and closes', () => {
            const state = createInitialState();
            const abort = new AbortController();
            const abortSpy = vi.spyOn(abort, 'abort');
            state.verify = { inProgress: true, abort, result: null };
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(abortSpy).toHaveBeenCalled();
            expect(state.verify).toBeNull();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('verifying with null abort is safe', () => {
            const state = createInitialState();
            state.verify = { inProgress: true, abort: null, result: null };
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(state.verify).toBeNull();
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('running: sets cancelRequested, leaves modal open', () => {
            const state = createInitialState();
            state.job = job({ total: 5, copied: 2, status: 'running' });
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(state.job.cancelRequested).toBe(true);
            expect(els.modal.hasAttribute('open')).toBe(true);
        });

        it('completed job: closes modal', () => {
            const state = createInitialState();
            state.job = job({ total: 5, copied: 5, status: 'completed' });
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('errored job: closes modal', () => {
            const state = createInitialState();
            state.job = job({ total: 5, copied: 1, status: 'error', lastError: 'broken' });
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('cancelled job: closes modal', () => {
            const state = createInitialState();
            state.job = job({ total: 5, copied: 1, status: 'cancelled', cancelRequested: true });
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('second cancel click while still running closes the modal (user wants out)', () => {
            // First click set cancelRequested=true; a second click is the
            // user telling us they no longer want to wait for the engine to
            // drain in-flight publishes. Close the modal — the engine still
            // completes in the background and onComplete becomes a no-op on
            // the now-closed modal.
            const state = createInitialState();
            state.job = job({ total: 5, copied: 1, cancelRequested: true, status: 'running' });
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(els.modal.hasAttribute('open')).toBe(false);
        });

        it('idle (no verify, no job): closes modal', () => {
            const state = createInitialState();
            els.modal.showModal();
            cancelCopyModal(els, state);
            expect(els.modal.hasAttribute('open')).toBe(false);
        });
    });
});

/**
 * Entitlement gates. Direct mode (no managed session) must be byte-for-byte
 * unchanged — every existing assertion above already runs through `DIRECT` to
 * prove that. These cover the managed intersection, the source gate that keeps
 * verify from probing an unentitled queue, and the destination gate that is the
 * last check before anything is published.
 */
describe('queue-copy/ui-modal — entitlement gates', () => {
    let els: ReturnType<typeof cacheElements>;

    beforeEach(() => {
        const container = loadModuleDOM('queue-copy');
        document.body.appendChild(container);
        els = cacheElements(container);
    });

    /** State with a verify result already in place for the given source queue. */
    function stateFor(sourceQueue: string, accessType: VerifyResult['accessType'], mode: 'copy' | 'move' = 'move') {
        const state = createInitialState();
        state.sourceQueue = sourceQueue;
        state.mode = mode;
        state.verify = { inProgress: false, abort: null, result: verifyResult({ accessType }) };
        return state;
    }
    const startEnabled = () => !els.btnModalStart.disabled;
    const readOnlyBanner = () => !els.modalSourceReadonly.classList.contains('hidden');
    const noAccessBanner = () => !els.modalSourceNoAccess.classList.contains('hidden');

    describe('effectiveAccess — RBAC may only ever downgrade', () => {
        it('broker read-write + RBAC read-only => move refused, copy allowed', () => {
            // 'ro.x' matches the read-only glob but not the operate glob.
            evaluateStartGate(els, stateFor('ro.x', 'read-write', 'move'), mAccess());
            expect(startEnabled()).toBe(false);
            expect(readOnlyBanner()).toBe(true);

            evaluateStartGate(els, stateFor('ro.x', 'read-write', 'copy'), mAccess());
            expect(startEnabled()).toBe(true);
        });

        it('broker reports null (permissive) + RBAC read-only => move still refused', () => {
            // The residual hole: an unknown broker verdict must not defeat RBAC.
            evaluateStartGate(els, stateFor('ro.x', null, 'move'), mAccess());
            expect(startEnabled()).toBe(false);
            expect(readOnlyBanner()).toBe(true);
        });

        it('broker read-only + RBAC operate => move still refused (broker wins; RBAC never upgrades)', () => {
            evaluateStartGate(els, stateFor('ops.x', 'read-only', 'move'), mAccess());
            expect(startEnabled()).toBe(false);
            expect(readOnlyBanner()).toBe(true);
        });

        it('RBAC operate + broker read-write => move allowed', () => {
            evaluateStartGate(els, stateFor('ops.x', 'read-write', 'move'), mAccess());
            expect(startEnabled()).toBe(true);
        });

        it('no-access is preserved, never softened to read-only by an RBAC downgrade', () => {
            evaluateStartGate(els, stateFor('ro.x', 'no-access', 'copy'), mAccess());
            expect(startEnabled()).toBe(false);
            expect(noAccessBanner()).toBe(true);
            expect(readOnlyBanner()).toBe(false);
        });

        it('source visibility revoked while the modal was open => no-access, both operations blocked', () => {
            // 'gone' matches neither glob, so it is not visible at all.
            evaluateStartGate(els, stateFor('gone', 'read-write', 'copy'), mAccess());
            expect(startEnabled()).toBe(false);
            expect(noAccessBanner()).toBe(true);
        });

        it('empty queue still wins over any access verdict', () => {
            const state = stateFor('ro.x', 'read-write', 'move');
            state.verify!.result!.messageCount = 0;
            evaluateStartGate(els, state, mAccess());
            expect(startEnabled()).toBe(false);
            expect(els.modalSourceEmpty.classList.contains('hidden')).toBe(false);
            expect(readOnlyBanner()).toBe(false);
        });
    });

    describe('source gate — verify never probes an unentitled queue', () => {
        function openFor(sourceQueue: string, managedSession: ManagedSession | null) {
            const state = createInitialState();
            state.sourceQueue = sourceQueue;
            state.dest = { type: 'queue', name: 'ops.dest' };
            const ctx = makeCtx({
                selectedVpn: 'vpn1',
                sempCredentials: sempCreds('https://broker:1943/SEMP/v2'),
                isSempConnected: true,
                managed: managedSession ?? undefined,
            });
            const session = createSessionMock();
            openCopyModal(ctx, els, state, () => session);
            return { state, ctx, session };
        }

        it('refuses an unentitled source and never spawns the probe', () => {
            const { state, ctx } = openFor('gone', managed());
            expect(state.verify!.result!.sourceOk).toBe(false);
            expect(state.verify!.result!.errors[0]).toMatch(/not entitled to queue "gone"/);
            expect(els.btnModalStart.disabled).toBe(true);
            // The SEMP probe reaches the broker through sempFetch — never fired.
            expect(ctx.sempFetch).not.toHaveBeenCalled();
        });

        it('lets an entitled source through to the probe', () => {
            // Inverse of the refusal case: the probe reaches the broker, and no
            // refusal result was synthesized (verify is still in flight).
            const { state, ctx } = openFor('ops.x', managed());
            expect(ctx.sempFetch).toHaveBeenCalled();
            expect(state.verify!.result).toBeNull();
        });

        it('direct mode never refuses', () => {
            const { state, ctx } = openFor('anything-at-all', null);
            expect(ctx.sempFetch).toHaveBeenCalled();
            expect(state.verify!.result).toBeNull();
        });
    });

    describe('destination gate — last check before publishing', () => {
        /** A managed session publishing through the primary connection. */
        function provisionedState(destType: 'queue' | 'topic', destName: string) {
            const state = createInitialState();
            state.sourceQueue = 'ops.src';
            state.mode = 'copy';
            state.dest = { type: destType, name: destName };
            state.destForm.sameBroker = true;
            state.destForm.sameVpn = true;
            return state;
        }

        // The gate is pure, so the matrix is asserted directly — that keeps the
        // real copy engine out of these cases entirely.
        it('refuses a queue destination the user cannot write to', () => {
            expect(destinationRefusal(provisionedState('queue', 'ro.dest'), mAccess()))
                .toMatch(/not entitled to write to queue "ro.dest"/);
        });

        it('refuses a topic destination outright — entitlements are per queue', () => {
            expect(destinationRefusal(provisionedState('topic', 'some/topic'), mAccess()))
                .toMatch(/Topic destinations are unavailable with managed credentials/);
        });

        it('allows a queue destination the user may write to', () => {
            expect(destinationRefusal(provisionedState('queue', 'ops.dest'), mAccess())).toBeNull();
        });

        it('does not apply to a manual-credential destination (the documented bypass)', () => {
            const state = provisionedState('topic', 'some/topic');
            state.destForm.sameBroker = false;   // manual credentials
            state.destForm.sameVpn = false;
            expect(destinationRefusal(state, mAccess())).toBeNull();
        });

        it('does not apply in direct mode', () => {
            expect(destinationRefusal(provisionedState('topic', 'some/topic'), DIRECT)).toBeNull();
        });

        // Wiring: the Start handler must consult the gate and surface its reason
        // instead of starting a run. A refused gate returns before the run path
        // touches the verify result, so this is safe to drive through a click.
        it('is wired into Start — a refused run renders the reason and never starts', () => {
            const state = provisionedState('topic', 'some/topic');
            const ctx = makeCtx({ selectedVpn: 'vpn1', managed: managed() });
            openCopyModal(ctx, els, state, () => createSessionMock());
            els.btnModalStart.disabled = false;
            els.btnModalStart.click();
            expect(els.modalRunError.textContent).toMatch(/Topic destinations/);
        });
    });
});
