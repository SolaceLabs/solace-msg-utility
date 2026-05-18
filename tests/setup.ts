/**
 * Global test setup — mocks for browser APIs and external libraries.
 */
import { vi, beforeEach, afterEach } from 'vitest';

// ---- Global mocks ----

// Mock localStorage. Default implementations are captured separately so
// beforeEach can re-install them after a prior test may have called
// `mockReturnValue()` / `mockImplementation()` — `vi.clearAllMocks()` resets
// call history but does NOT reset implementations, so without this re-install
// a `mockReturnValue('OBF1:…')` from one test would leak into the next.
const store: Record<string, string> = {};
const localStorageDefaults = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null
};
const localStorageMock = {
    getItem: vi.fn(localStorageDefaults.getItem),
    setItem: vi.fn(localStorageDefaults.setItem),
    removeItem: vi.fn(localStorageDefaults.removeItem),
    clear: vi.fn(localStorageDefaults.clear),
    get length() { return Object.keys(store).length; },
    key: vi.fn(localStorageDefaults.key)
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true
});

// Mock fetch
(globalThis as any).fetch = vi.fn();

// Mock btoa (jsdom may not have it)
if (typeof globalThis.btoa === 'undefined') {
    globalThis.btoa = (s: string) => Buffer.from(s).toString('base64');
}
if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = (s: string) => Buffer.from(s, 'base64').toString();
}

// Mock URL.createObjectURL / revokeObjectURL (always override)
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Mock confirm/alert
globalThis.confirm = vi.fn(() => true);
globalThis.alert = vi.fn();

// Polyfill HTMLDialogElement imperative methods. jsdom (as of v22/v23) creates
// HTMLDialogElement instances — the `open` IDL attribute reflects the `open`
// content attribute correctly — but does NOT implement showModal/close/show.
// Calling them throws. We polyfill with attribute-based toggles so the module
// code paths and tests can assert on `dialog.open` without a real browser.
// The real browser adds focus-trap + top-layer rendering + Escape handling on
// top of these; jsdom gets none of that (nor do our tests need it).
if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal || HTMLDialogElement.prototype.showModal.toString().includes('not implemented')) {
        HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
            this.setAttribute('open', '');
        };
    }
    if (!HTMLDialogElement.prototype.show || HTMLDialogElement.prototype.show.toString().includes('not implemented')) {
        HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
            this.setAttribute('open', '');
        };
    }
    if (!HTMLDialogElement.prototype.close || HTMLDialogElement.prototype.close.toString().includes('not implemented')) {
        HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, returnValue?: string) {
            // Real browsers: .close() on a closed dialog is a no-op (no `close` event fires).
            if (!this.hasAttribute('open')) return;
            this.removeAttribute('open');
            if (returnValue !== undefined) (this as any).returnValue = returnValue;
            this.dispatchEvent(new Event('close'));
        };
    }
}

// ---- Solace SDK mock ----

function createSolaceMock() {
    return {
        SolclientFactoryProperties: vi.fn(function(this: any) { return this; }),
        SolclientFactoryProfiles: { version10: 'version10' },
        LogLevel: { WARN: 'WARN' },
        SolclientFactory: {
            init: vi.fn(),
            createSession: vi.fn(() => createSessionMock()),
            createMessage: vi.fn(() => createMessageMock()),
            createTopicDestination: vi.fn((name: string) => ({ name, type: 'topic' })),
            createDurableQueueDestination: vi.fn((name: string) => ({ name, type: 'queue' })),
        },
        SessionProperties: vi.fn(function(this: any) { return this; }),
        SessionEventCode: {
            UP_NOTICE: 'UP_NOTICE',
            CONNECT_FAILED_ERROR: 'CONNECT_FAILED_ERROR',
            DISCONNECTED: 'DISCONNECTED',
            MESSAGE: 'MESSAGE',
            ACKNOWLEDGED_MESSAGE: 'ACKNOWLEDGED_MESSAGE',
            REJECTED_MESSAGE_ERROR: 'REJECTED_MESSAGE_ERROR'
        },
        AuthenticationScheme: { BASIC: 'BASIC', OAUTH2: 'OAUTH2' },
        MessagePublisherAcknowledgeMode: { PER_MESSAGE: 'PER_MESSAGE' },
        QueueBrowserProperties: vi.fn(function(this: any) { return this; }),
        QueueBrowserEventName: {
            UP: 'UP',
            CONNECT_FAILED_ERROR: 'CONNECT_FAILED_ERROR',
            DOWN_ERROR: 'DOWN_ERROR',
            GM_DISABLED: 'GM_DISABLED',
            MESSAGE: 'MESSAGE'
        },
        QueueDescriptor: vi.fn(function(this: any, props: any) { Object.assign(this, props); }),
        QueueType: { QUEUE: 'QUEUE' },
        MessageDeliveryModeType: { PERSISTENT: 1, DIRECT: 0, NON_PERSISTENT: 2 },
        MessageType: { TEXT: 0, BINARY: 1, MAP: 2, STREAM: 3 },
        SDTFieldType: { STRING: 0, MAP: 1, STREAM: 2 },
        DestinationType: { TOPIC: 0, QUEUE: 1 }
    };
}

// Validates `event` against the known enum values on the current `window.solace`
// mock. Catches typo bugs where production code registers a bogus code (e.g.
// `'UP_NOTICE'` on a browser where the correct code is `'UP'`) — the real SDK
// would surface this; without validation the mock would silently accept it.
function validateEventCode(eventEnum: Record<string, string>, event: string, label: string) {
    const known = Object.values(eventEnum);
    if (!known.includes(event)) {
        throw new Error(`Unknown ${label} event code: ${event}. Valid codes: ${known.join(', ')}`);
    }
}

function createSessionMock() {
    const handlers: Record<string, Function> = {};
    return {
        on: vi.fn((event: string, handler: Function) => {
            validateEventCode((window as any).solace.SessionEventCode, event, 'session');
            handlers[event] = handler;
        }),
        // The real SDK exposes removeListener for cleaning up session-level event
        // handlers (used by the publisher's dispose() and by queue-browser's
        // session-switch teardown). Mirror it here so unit tests can assert on
        // detach calls without crashing on an undefined method.
        removeListener: vi.fn((event: string, _handler: Function) => {
            validateEventCode((window as any).solace.SessionEventCode, event, 'session');
            delete handlers[event];
        }),
        connect: vi.fn(),
        disconnect: vi.fn(),
        dispose: vi.fn(),
        send: vi.fn(),
        _handlers: handlers,
        createQueueBrowser: vi.fn(() => createBrowserMock())
    };
}

function createBrowserMock() {
    const handlers: Record<string, Function> = {};
    return {
        on: vi.fn((event: string, handler: Function) => {
            validateEventCode((window as any).solace.QueueBrowserEventName, event, 'browser');
            handlers[event] = handler;
        }),
        connect: vi.fn(),
        disconnect: vi.fn(),
        // start/stop are used by the copy engine for per-message backpressure:
        // after each MESSAGE event we stop() the browser, process the message
        // (clone + publish + await ACK), then start() to receive the next one.
        // This bounds memory at one in-flight message rather than letting the
        // SDK buffer accumulate during a slow publish path.
        start: vi.fn(),
        stop: vi.fn(),
        removeMessageFromQueue: vi.fn(),
        _handlers: handlers,
        _messageConsumer: { _permissions: 'READ_WRITE' }
    };
}

function createMessageMock() {
    const props: Record<string, any> = {};
    // All setters use .mockReturnThis() so `msg.setDestination(...).setBinaryAttachment(...)`
    // chaining works transparently. The real SDK returns `this` from setters; without
    // this, a future refactor that introduces chaining would throw
    // `TypeError: Cannot read properties of undefined` on the second call and
    // existing tests wouldn't catch it until production hit the bug.
    return {
        setDestination: vi.fn().mockReturnThis(),
        setApplicationMessageId: vi.fn().mockReturnThis(),
        setApplicationMessageType: vi.fn().mockReturnThis(),
        setAsReplyMessage: vi.fn().mockReturnThis(),
        setCorrelationId: vi.fn().mockReturnThis(),
        setDeliveryMode: vi.fn().mockReturnThis(),
        setCorrelationKey: vi.fn().mockReturnThis(),
        setDMQEligible: vi.fn().mockReturnThis(),
        setElidingEligible: vi.fn().mockReturnThis(),
        setGMExpiration: vi.fn().mockReturnThis(),
        setHttpContentEncoding: vi.fn().mockReturnThis(),
        setHttpContentType: vi.fn().mockReturnThis(),
        setPriority: vi.fn().mockReturnThis(),
        setReplyTo: vi.fn().mockReturnThis(),
        setSenderId: vi.fn().mockReturnThis(),
        setSenderTimestamp: vi.fn().mockReturnThis(),
        setSequenceNumber: vi.fn().mockReturnThis(),
        setTimeToLive: vi.fn().mockReturnThis(),
        setUserCos: vi.fn().mockReturnThis(),
        setUserData: vi.fn().mockReturnThis(),
        setUserPropertyMap: vi.fn().mockReturnThis(),
        setXmlMetadata: vi.fn().mockReturnThis(),
        setSdtContainer: vi.fn().mockReturnThis(),
        setXmlContent: vi.fn().mockReturnThis(),
        setBinaryAttachment: vi.fn().mockReturnThis(),
        setGuaranteedMessageId: vi.fn().mockReturnThis(),
        getGuaranteedMessageId: vi.fn(() => props.gmid),
        getType: vi.fn(() => 0),
        getBinaryAttachment: vi.fn(() => null),
        getSdtContainer: vi.fn(() => null),
        getXmlContent: vi.fn(() => ''),
        getSenderTimestamp: vi.fn(() => null),
        getDestination: vi.fn(() => ({ getName: () => 'test-dest', getType: () => 0 })),
        getApplicationMessageId: vi.fn(() => null),
        getCacheRequestId: vi.fn(() => null),
        getCorrelationId: vi.fn(() => null),
        getDeliveryCount: vi.fn(() => 0),
        getDeliveryMode: vi.fn(() => 1),
        getHttpContentEncoding: vi.fn(() => null),
        getHttpContentType: vi.fn(() => null),
        getPriority: vi.fn(() => null),
        getReplyTo: vi.fn(() => null),
        getSenderId: vi.fn(() => null),
        getSequenceNumber: vi.fn(() => null),
        getTimeToLive: vi.fn(() => null),
        getTopicSequenceNumber: vi.fn(() => null),
        getUserPropertyMap: vi.fn(() => null),
        getReplicationGroupMessageId: vi.fn(() => null),
        dump: vi.fn(() => 'raw dump'),
        smfHeader: { messageLength: 100 },
        _props: props
    };
}

// Export helpers for tests to use
export { createSolaceMock, createSessionMock, createBrowserMock, createMessageMock };

// Install solace mock by default
(window as any).solace = createSolaceMock();
(window as any).APP_CONFIG = { useMocks: false };

// Reset mocks between tests
beforeEach(() => {
    vi.clearAllMocks();
    // Re-install the default localStorage implementations — clearAllMocks only
    // clears call history, so any `mockReturnValue()`/`mockImplementation()` from
    // a prior test would otherwise persist and cross-contaminate.
    localStorageMock.getItem.mockImplementation(localStorageDefaults.getItem);
    localStorageMock.setItem.mockImplementation(localStorageDefaults.setItem);
    localStorageMock.removeItem.mockImplementation(localStorageDefaults.removeItem);
    localStorageMock.clear.mockImplementation(localStorageDefaults.clear);
    localStorageMock.key.mockImplementation(localStorageDefaults.key);
    localStorageMock.clear();

    // Same re-install pattern for the other global mocks — a test that calls
    // `confirm.mockReturnValue(false)` or `URL.createObjectURL.mockReturnValueOnce(null)`
    // would otherwise leak its override into the next test where a different
    // default is assumed.
    (globalThis.confirm as any).mockImplementation(() => true);
    (globalThis.alert as any).mockImplementation(() => {});
    (URL.createObjectURL as any).mockImplementation(() => 'blob:mock-url');
    (URL.revokeObjectURL as any).mockImplementation(() => {});
    (navigator.clipboard.writeText as any).mockResolvedValue(undefined);

    // Fresh Solace SDK mock every test — stale `_handlers` entries from a prior
    // test's `mockSession._handlers[UP_NOTICE] = …` assignments cannot fire in
    // the next test. Test files that instantiate their own mock in their own
    // `beforeEach` simply overwrite this default, so this is backwards-compatible.
    (window as any).solace = createSolaceMock();

    document.body.innerHTML = '';
});

afterEach(() => {
    vi.restoreAllMocks();
    // Always return to real timers so a test that calls `vi.useFakeTimers()`
    // but throws before its own `useRealTimers()` cleanup line cannot leak
    // fake timers into the next test (where setTimeout-based code would hang).
    // Idempotent: no-op when fake timers weren't in use.
    vi.useRealTimers();
});
