/**
 * Integration test: onMessage → ingestMessage → filter → DOM
 *
 * Each layer is unit-tested in isolation elsewhere. This test fires a real SDK
 * message into the real service-events.onMessage, lets the real ingestMessage
 * apply the moving-window cap, lets the real shouldShowMessage evaluate active
 * filters, and asserts the DOM row list matches the expected filtered output.
 *
 * A regression in any of those layers — or in the wire between them — would be
 * caught here. Examples:
 *   - `onMessage` calls `ingestMessage` with the wrong queue key → no row appears
 *   - `shouldShowMessage` reads from stale `activeFilters` → wrong rows filtered
 *   - `ingestMessage` successfully updates state but `ui.addMessageRow` is never
 *     invoked because of a broken `state.currentQueue` comparison → invisible messages
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueBrowserModule } from '../../src/modules/queue-browser/module';
import { createServiceEvents } from '../../src/modules/queue-browser/service-events';
import { state, defaultActiveFilters } from '../../src/modules/queue-browser/state.js';
import { ui } from '../../src/modules/queue-browser/ui-core.js';
import { createEventBus } from '../../src/core/event-bus';
import { loadModuleDOM } from '../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../helpers/resetQueueBrowserState';
import type { AppContext, AppState } from '../../src/core/types';

function makeCtx(container: HTMLElement): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: true, selectedVpn: 'test-vpn',
        solaceConnection: null, sempCredentials: null, isSempConnected: false
    };
    return {
        container, appState, eventBus,
        setState: vi.fn((key: keyof AppState, value: any) => {
            (appState as any)[key] = value;
            eventBus.emit('app:state-change', { key, value });
        }),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: { useMocks: false }
    };
}

// Build a minimal Solace-looking message that onMessage's extraction logic will
// happily consume. The payload bytes come from `content` — that's what the
// content-filter actually matches against.
function makeSolaceMessage(content: string, guaranteedId: number) {
    const solace = (globalThis as any).solace;
    return {
        getType: () => solace.MessageType.TEXT,
        getBinaryAttachment: () => null,
        getSdtContainer: () => ({
            getType: () => solace.SDTFieldType.STRING,
            getValue: () => content
        }),
        getXmlContent: () => '',
        getSenderTimestamp: () => null,
        getGuaranteedMessageId: () => guaranteedId,
        getDestination: () => ({
            getName: () => 'test-queue',
            getType: () => solace.DestinationType.QUEUE
        }),
        getApplicationMessageId: () => null,
        getCacheRequestId: () => null,
        getCorrelationId: () => null,
        getDeliveryCount: () => 0,
        getDeliveryMode: () => 1,
        getHttpContentEncoding: () => null,
        getHttpContentType: () => null,
        getPriority: () => null,
        getReplyTo: () => null,
        getSenderId: () => null,
        getSequenceNumber: () => null,
        getTimeToLive: () => null,
        getTopicSequenceNumber: () => null,
        getUserPropertyMap: () => null,
        smfHeader: { messageLength: content.length }
    };
}

describe('Integration: message pipeline (onMessage → filter → DOM)', () => {
    let container: HTMLElement;
    let serviceEvents: ReturnType<typeof createServiceEvents>;

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        resetQueueBrowserState();

        container = loadModuleDOM('queue-browser');
        const ctx = makeCtx(container);
        await QueueBrowserModule.install(ctx);

        // Real serviceEvents — the install created its own, but we need a handle
        // to call onMessage directly (the install wires it via the service layer,
        // which requires a real Solace session we don't have). Creating a fresh
        // one is equivalent for this test because onMessage's behaviour depends
        // only on the shared `state` singleton and `ui` module, both of which
        // the installed module has already wired up.
        serviceEvents = createServiceEvents();

        // Prime the queue — ingestMessage short-circuits silently on an unknown
        // queue name (6.3.6 guard), so we have to create the store entry first.
        state.messageStore.set('test-queue', []);
        state.currentQueue = 'test-queue';
        state.allMessages = state.messageStore.get('test-queue')!;
    });

    it('content filter: only matching message renders a DOM row', () => {
        state.activeFilters = { ...defaultActiveFilters(), content: 'alpha' };
        // Re-read activeFilters into ui so the row-render code sees the filter.
        ui.renderList();

        serviceEvents.onMessage('test-queue', makeSolaceMessage('alpha payload', 1));
        serviceEvents.onMessage('test-queue', makeSolaceMessage('beta payload', 2));

        // Store has both — moving window is per-queue cap, unrelated to filter.
        expect(state.messageStore.get('test-queue')).toHaveLength(2);

        // But the DOM only shows the match. Rows are keyed by data-id on <tr>.
        const rows = container.querySelectorAll('#browser-msg-list tr[data-id]');
        expect(rows).toHaveLength(1);
        expect((rows[0] as HTMLElement).dataset.id).toBe('1');
    });

    it('filter cleared mid-stream: previously-hidden messages do not retroactively appear', () => {
        // This locks in an actual design choice — shouldShowMessage is evaluated
        // at arrival time, not at render time. A future refactor that makes
        // filtering retroactive would break this.
        state.activeFilters = { ...defaultActiveFilters(), content: 'alpha' };
        ui.renderList();

        serviceEvents.onMessage('test-queue', makeSolaceMessage('alpha one', 10));
        serviceEvents.onMessage('test-queue', makeSolaceMessage('beta two', 11));

        // Clear the filter — no re-render triggered, so the hidden 'beta' stays hidden.
        state.activeFilters = defaultActiveFilters();
        const rowsAfterClear = container.querySelectorAll('#browser-msg-list tr[data-id]');
        expect(rowsAfterClear).toHaveLength(1); // still just 'alpha'
    });

    it('msg for different queue: DOM untouched, but store still receives it', () => {
        state.messageStore.set('other-queue', []);

        const before = container.querySelectorAll('#browser-msg-list tr[data-id]').length;
        serviceEvents.onMessage('other-queue', makeSolaceMessage('anything', 99));

        // Store for the other queue grew by one…
        expect(state.messageStore.get('other-queue')).toHaveLength(1);
        // …but currentQueue is 'test-queue', so the DOM is untouched.
        const after = container.querySelectorAll('#browser-msg-list tr[data-id]').length;
        expect(after).toBe(before);
    });

    it('destination-type filter uses window.solace enum (previously guarded by if(window.solace))', () => {
        // Locks in the S3 cleanup: removing the `if (window.solace)` guard in
        // state.js shouldShowMessage means the enum is accessed directly, and
        // destination-type filtering still works end-to-end through onMessage.
        state.activeFilters = { ...defaultActiveFilters(), type: 'Queue' };
        ui.renderList();

        serviceEvents.onMessage('test-queue', makeSolaceMessage('matches-by-type', 50));

        const rows = container.querySelectorAll('#browser-msg-list tr[data-id]');
        expect(rows).toHaveLength(1); // Queue type matched, rendered.
    });
});
