import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEmitter } from '../../src/mock-broker/emitter';
import { buildSolaceSdk } from '../../src/mock-broker/sdk';
import { seed, getQueue } from '../../src/mock-broker/broker/store';
import { FAULT, QUEUE_STATE, resetScenario, scenario } from '../../src/mock-broker/fixtures';
import { MOCK_SUBCODE } from '../../src/mock-broker/sdk/errors';

/**
 * The demo broker is excluded from the coverage percentage like every other
 * mock, but it is NOT untested: these cover the specific ways a plausible-looking
 * fake breaks the real app silently rather than loudly. Each describe maps to one
 * hazard identified when the emulator was designed.
 */
beforeEach(() => {
    resetScenario();
    scenario.latencyMs = 0;   // keep the suite fast; timing is asserted by ordering, not clocks
    seed();
});

describe('mock-broker/emitter — dispatch order', () => {
    it('calls listeners synchronously, in registration order', () => {
        // The managed panel registers its UP handler before queue-browser's and
        // writes _permissions from inside it. Reordering or deferring here would
        // silently disable RBAC enforcement in the demo.
        const emitter = createEmitter();
        const order: string[] = [];
        emitter.on('UP', () => order.push('rbac'));
        emitter.on('UP', () => order.push('queue-browser'));

        emitter.emit('UP');

        expect(order).toEqual(['rbac', 'queue-browser']);
    });

    it('lets a handler unsubscribe itself without skipping its neighbour', () => {
        // The publisher's dispose path removes its own listeners; a naive
        // in-place splice while iterating would drop the next handler.
        const emitter = createEmitter();
        const seen: string[] = [];
        const first = () => { seen.push('first'); emitter.removeListener('E', first); };
        emitter.on('E', first);
        emitter.on('E', () => seen.push('second'));

        emitter.emit('E');

        expect(seen).toEqual(['first', 'second']);
    });
});

describe('mock-broker/sdk — session', () => {
    function connectedSession() {
        const sdk = buildSolaceSdk();
        const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: 'vpn-prod' });
        return { sdk, session };
    }

    it('exposes createQueueBrowser as a reassignable own property', () => {
        // The managed panel replaces this method on the live session to wrap it
        // with the entitlement check. A prototype/class method would make that
        // patch a silent no-op and disable RBAC with no error anywhere.
        const { session } = connectedSession();
        expect(Object.prototype.hasOwnProperty.call(session, 'createQueueBrowser')).toBe(true);

        const original = session.createQueueBrowser.bind(session);
        let patched = false;
        session.createQueueBrowser = (props: any) => { patched = true; return original(props); };
        session.createQueueBrowser({ queueDescriptor: { name: 'Q/ORDER/NEW' } });

        expect(patched).toBe(true);
    });

    it('reports UP for the known host and CONNECT_FAILED for anything else', async () => {
        const { sdk, session } = connectedSession();
        const up = vi.fn();
        session.on(sdk.SessionEventCode.UP_NOTICE, up);
        session.connect();
        await vi.waitFor(() => expect(up).toHaveBeenCalled());

        const other = sdk.SolclientFactory.createSession({ url: 'wss://nope.example.com', vpnName: 'default' });
        const failed = vi.fn();
        other.on(sdk.SessionEventCode.CONNECT_FAILED_ERROR, failed);
        other.connect();
        await vi.waitFor(() => expect(failed).toHaveBeenCalled());

        // The other shape: solace-client.ts:185 forwards sessionEvent.infoStr with
        // no fallback, so a Session failure carries infoStr and NOT message.
        const event = failed.mock.calls[0][0];
        expect(event.infoStr).toBeTruthy();
        expect(event.message).toBeUndefined();
    });

    it('arms a one-shot connect failure that does not wedge the demo', async () => {
        const { sdk, session } = connectedSession();
        scenario.fault = FAULT.CONNECT_FAILS;
        const failed = vi.fn();
        session.on(sdk.SessionEventCode.CONNECT_FAILED_ERROR, failed);
        session.connect();
        await vi.waitFor(() => expect(failed).toHaveBeenCalled());
        expect(scenario.fault).toBe(FAULT.NONE);

        const retry = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: 'default' });
        const up = vi.fn();
        retry.on(sdk.SessionEventCode.UP_NOTICE, up);
        retry.connect();
        await vi.waitFor(() => expect(up).toHaveBeenCalled());
    });
});

describe('mock-broker/sdk — publish acknowledgement', () => {
    it('acks through the session event with the correlation key nested verbatim', async () => {
        // solace-publisher demultiplexes acks by
        // event.correlationKey.Solace_Msg_Utility_Seq_Num. Any other shape leaves
        // every publish hanging until the 30s timeout.
        const sdk = buildSolaceSdk();
        const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: 'vpn-prod' });
        const acks: any[] = [];
        session.on(sdk.SessionEventCode.ACKNOWLEDGED_MESSAGE, (e: any) => acks.push(e));

        const msg = sdk.SolclientFactory.createMessage();
        msg.setDestination(sdk.SolclientFactory.createDurableQueueDestination('Q/ORDER/ARCHIVE'));
        msg.setBinaryAttachment('hello');
        msg.setCorrelationKey({ Solace_Msg_Utility_Seq_Num: 'seq-1', Original_Msg_ID: '7' });
        session.send(msg);

        await vi.waitFor(() => expect(acks).toHaveLength(1));
        expect(acks[0].correlationKey.Solace_Msg_Utility_Seq_Num).toBe('seq-1');
        expect(acks[0].correlationKey.Original_Msg_ID).toBe('7');
    });

    it('a published message really lands in the destination queue', async () => {
        const sdk = buildSolaceSdk();
        const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: 'vpn-prod' });
        const before = getQueue('vpn-prod', 'Q/ORDER/ARCHIVE')!.messages.length;

        const msg = sdk.SolclientFactory.createMessage();
        msg.setDestination(sdk.SolclientFactory.createDurableQueueDestination('Q/ORDER/ARCHIVE'));
        msg.setBinaryAttachment('payload-under-test');
        msg.setCorrelationKey({ Solace_Msg_Utility_Seq_Num: 's' });
        session.send(msg);

        const after = getQueue('vpn-prod', 'Q/ORDER/ARCHIVE')!;
        expect(after.messages).toHaveLength(before + 1);
        expect(after.messages[after.messages.length - 1].msg.getBinaryAttachment()).toBe('payload-under-test');
    });

    it('fans a topic publish out to every subscribed queue', async () => {
        const sdk = buildSolaceSdk();
        const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: 'vpn-prod' });
        const before = getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages.length;

        const msg = sdk.SolclientFactory.createMessage();
        msg.setDestination(sdk.SolclientFactory.createTopicDestination('orders/new/uk'));
        msg.setBinaryAttachment('fanned-out');
        msg.setCorrelationKey({ Solace_Msg_Utility_Seq_Num: 't' });
        session.send(msg);

        // Q/ORDER/NEW subscribes to orders/new/> so it must receive it.
        expect(getQueue('vpn-prod', 'Q/ORDER/NEW')!.messages).toHaveLength(before + 1);
    });
});

describe('mock-broker/sdk — queue browser', () => {
    function browserFor(vpn: string, queue: string) {
        const sdk = buildSolaceSdk();
        const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: vpn });
        const browser = session.createQueueBrowser({ queueDescriptor: { name: queue, type: sdk.QueueType.QUEUE } });
        return { sdk, browser };
    }

    it('exposes _messageConsumer._permissions before UP fires', async () => {
        // The managed panel writes this from inside its own UP handler, so it
        // must already exist by then — and the read-only fixture must report it.
        const { sdk, browser } = browserFor('vpn-prod', 'Q/LOGS/AUDIT');
        let permissionsAtUp: string | undefined;
        browser.on(sdk.QueueBrowserEventName.UP, () => { permissionsAtUp = browser._messageConsumer._permissions; });

        expect(browser._messageConsumer._permissions).toBe('READ_ONLY');
        browser.connect();
        await vi.waitFor(() => expect(permissionsAtUp).toBe('READ_ONLY'));
    });

    it('delivers messages one at a time in spool-id order', async () => {
        // The copy engine's drift detection and max-consumed logic assume the
        // broker delivers in spool order.
        const { sdk, browser } = browserFor('default', 'test-queue-2');
        const ids: number[] = [];
        browser.on(sdk.QueueBrowserEventName.MESSAGE, (m: any) => ids.push(Number(m.getGuaranteedMessageId().toString())));
        browser.connect();

        await vi.waitFor(() => expect(ids.length).toBe(getQueue('default', 'test-queue-2')!.messages.length));
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('stop() suspends delivery and start() resumes it', async () => {
        // These are the copy engine's backpressure control; no-ops here would
        // let the publish queue grow without bound on the bulk queue.
        const { sdk, browser } = browserFor('vpn-dev', 'Q/BULK');
        let count = 0;
        browser.on(sdk.QueueBrowserEventName.MESSAGE, () => {
            count++;
            if (count === 3) browser.stop();
        });
        browser.connect();

        await vi.waitFor(() => expect(count).toBe(3));
        const settled = count;
        await new Promise(r => setTimeout(r, 30));
        expect(count).toBe(settled);          // genuinely suspended

        browser.start();
        await vi.waitFor(() => expect(count).toBeGreaterThan(settled));
    });

    it('refuses to bind a denied queue through CONNECT_FAILED_ERROR', async () => {
        const { sdk, browser } = browserFor('vpn-prod', 'Q/DENIED');
        const failed = vi.fn();
        const up = vi.fn();
        browser.on(sdk.QueueBrowserEventName.CONNECT_FAILED_ERROR, failed);
        browser.on(sdk.QueueBrowserEventName.UP, up);
        browser.connect();

        await vi.waitFor(() => expect(failed).toHaveBeenCalled());
        expect(up).not.toHaveBeenCalled();
    });

    it('fails with an OperationError shape — message, no infoStr', async () => {
        // Verified against dist/solclient.js: the consumer FSM asserts
        // `instanceof OperationError` before emitting CONNECT_FAILED_ERROR, and
        // QueueBrowser forwards it verbatim. OperationError extends Error, so the
        // reason is on `.message`; it has no infoStr at all.
        //
        // The emulator must NOT also set infoStr. It used to, and that hid a real
        // defect: queue-copy read infoStr here and silently showed generic text
        // against a live broker while the demo looked correct.
        const { sdk, browser } = browserFor('vpn-prod', 'Q/DENIED');
        let event: any;
        browser.on(sdk.QueueBrowserEventName.CONNECT_FAILED_ERROR, (e: any) => { event = e; });
        browser.connect();
        await vi.waitFor(() => expect(event).toBeDefined());

        expect(event).toBeInstanceOf(Error);
        expect(event.message).toMatch(/Permission Denied/);
        expect(event.infoStr).toBeUndefined();
        expect(event.subcode).toBe(MOCK_SUBCODE.PERMISSION_DENIED);
    });

    it('names the queue when it does not exist', async () => {
        const { sdk, browser } = browserFor('vpn-prod', 'no-such-queue');
        let event: any;
        browser.on(sdk.QueueBrowserEventName.CONNECT_FAILED_ERROR, (e: any) => { event = e; });
        browser.connect();
        await vi.waitFor(() => expect(event).toBeDefined());

        expect(event.message).toMatch(/Unknown Queue/);
        expect(event.message).toContain('no-such-queue');
        expect(event.infoStr).toBeUndefined();
    });

    it('removeMessageFromQueue actually removes it, so the depth drops', async () => {
        const { sdk, browser } = browserFor('vpn-prod', 'Q/ORDER/PROCESS');
        const before = getQueue('vpn-prod', 'Q/ORDER/PROCESS')!.messages.length;
        const target = getQueue('vpn-prod', 'Q/ORDER/PROCESS')!.messages[0];

        const vessel = sdk.SolclientFactory.createMessage();
        vessel.setGuaranteedMessageId(String(target.id));
        browser.removeMessageFromQueue(vessel);

        const after = getQueue('vpn-prod', 'Q/ORDER/PROCESS')!;
        expect(after.messages).toHaveLength(before - 1);
        expect(after.messages.some(m => m.id === target.id)).toBe(false);
    });

    it('reports an empty queue as bindable with nothing to deliver', async () => {
        const { sdk, browser } = browserFor('default', 'Q/EMPTY');
        const up = vi.fn();
        const message = vi.fn();
        browser.on(sdk.QueueBrowserEventName.UP, up);
        browser.on(sdk.QueueBrowserEventName.MESSAGE, message);
        browser.connect();

        await vi.waitFor(() => expect(up).toHaveBeenCalled());
        await new Promise(r => setTimeout(r, 20));
        expect(message).not.toHaveBeenCalled();
    });
});

describe('mock-broker/sdk — enums', () => {
    it('exposes SessionEventCode as a plain enumerable object', () => {
        // solace-client.ts iterates it with Object.entries to attach debug
        // listeners; a Proxy or non-enumerable object would break that loop.
        const sdk = buildSolaceSdk();
        const entries = Object.entries(sdk.SessionEventCode);
        expect(entries.length).toBeGreaterThan(6);
        expect(sdk.SessionEventCode.UP_NOTICE).toBe('UP_NOTICE');
        expect(sdk.MessageDeliveryModeType.PERSISTENT).toBe(1);
        expect(sdk.QueueBrowserEventName.MESSAGE).toBe('MESSAGE');
    });

    it('reports a version above the shell floor', () => {
        expect(buildSolaceSdk().Version.version).toBe('10.99.0-mock');
    });
});

describe('mock-broker/sdk — message', () => {
    it('round-trips values a forwarded message carries', () => {
        const sdk = buildSolaceSdk();
        const msg = sdk.SolclientFactory.createMessage();
        msg.setBinaryAttachment('body').setApplicationMessageId('app-1').setPriority(4);

        expect(msg.getBinaryAttachment()).toBe('body');
        expect(msg.getApplicationMessageId()).toBe('app-1');
        expect(msg.getPriority()).toBe(4);
        // smfHeader.messageLength is read as a raw property; without it every
        // message sizes as 0 bytes in the UI.
        expect(msg.smfHeader.messageLength).toBeGreaterThan(0);
    });

    it('leaves getSdtContainer null so the publisher falls through to the binary attachment', () => {
        const sdk = buildSolaceSdk();
        expect(sdk.SolclientFactory.createMessage().getSdtContainer()).toBeNull();
    });
});

describe('mock-broker — queue state levers', () => {
    it('honours a runtime switch to read-only on the next bind', async () => {
        const sdk = buildSolaceSdk();
        const session = sdk.SolclientFactory.createSession({ url: 'wss://broker.solace.com', vpnName: 'default' });
        expect(session.createQueueBrowser({ queueDescriptor: { name: 'test-queue-1' } })
            ._messageConsumer._permissions).toBe('READ_WRITE');

        scenario.queueState.set('default/test-queue-1', QUEUE_STATE.READ_ONLY);

        expect(session.createQueueBrowser({ queueDescriptor: { name: 'test-queue-1' } })
            ._messageConsumer._permissions).toBe('READ_ONLY');
    });
});
