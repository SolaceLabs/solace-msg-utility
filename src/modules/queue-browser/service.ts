import { state, setBrowser, deleteBrowser } from './state.js';
import { ui } from './ui-core.js';
import { MAX_BROWSER_BINDINGS } from './constants.js';
import { createSolacePublisher, type SolacePublisher, type SendResult } from '../../core/services/solace-publisher';
import { logger } from '../../core/logger';
import type { AppContext } from '../../core/types';

declare const solace: any;

/**
 * Queue Browser service.
 * Factory receives AppContext — no window.App references.
 * Session is obtained via EventBus 'client:connected' event.
 */
export function createService(ctx: AppContext, serviceEvents: any) {
    let session: any = null;
    let publisher: SolacePublisher | null = null;

    // Listen for session via EventBus. The publisher's lifecycle tracks the
    // session: created on connect, disposed on disconnect or session-switch
    // (after a VPN change `client:connected` re-fires with a fresh session).
    ctx.eventBus.on('client:connected', (payload) => {
        publisher?.dispose('Session replaced');
        session = payload.session;
        publisher = createSolacePublisher(session);
    });
    ctx.eventBus.on('client:disconnected', () => {
        publisher?.dispose('Client disconnected.');
        publisher = null;
        session = null;
    });

    function createBrowser(queueName: string): { ok: boolean; error?: string } {
        if (!session) {
            return { ok: false, error: 'No active Solace session.' };
        }

        try {
            logger.info(`Creating Queue Browser for [${queueName}]...`);

            // Init Store
            if (!state.messageStore.has(queueName)) {
                state.messageStore.set(queueName, []);
            }

            // Binding limit check
            if (state.browserInstances.size >= MAX_BROWSER_BINDINGS) {
                logger.warn('[Limit] Max queue bindings reached.');
                return { ok: false, error: `Connection Limit Reached: You can only bind to ${MAX_BROWSER_BINDINGS} queues at a time.` };
            }

            const browserProps = new solace.QueueBrowserProperties();
            browserProps.queueDescriptor = new solace.QueueDescriptor({ name: queueName, type: solace.QueueType.QUEUE });
            browserProps.transportAcknowledgeTimeoutInMsecs = 1000;

            const browser = session.createQueueBrowser(browserProps);

            // Store Instance
            setBrowser(queueName, browser);

            // Event Listeners
            /* v8 ignore start -- callbacks registered but invoked by Solace SDK; each is exercised directly in `tests/modules/queue-browser/service-events.test.ts` under the onBrowserUp() / onConnectFailed() / onBrowserDown() / onGmDisabled() / onMessage() describe blocks */
            browser.on(solace.QueueBrowserEventName.UP, () => serviceEvents.onBrowserUp(queueName));
            browser.on(solace.QueueBrowserEventName.CONNECT_FAILED_ERROR, (err: any) => serviceEvents.onConnectFailed(queueName, err));
            browser.on(solace.QueueBrowserEventName.DOWN_ERROR, (err: any) => serviceEvents.onBrowserDown(queueName, err));
            browser.on(solace.QueueBrowserEventName.GM_DISABLED, () => serviceEvents.onGmDisabled(queueName));
            browser.on(solace.QueueBrowserEventName.MESSAGE, (msg: any) => serviceEvents.onMessage(queueName, msg));
            /* v8 ignore stop */

            // Connect
            browser.connect();

            return { ok: true };

        } catch (e: any) {
            logger.error('Failed to create browser', e);
            // Clean up state so the queue can be retried
            deleteBrowser(queueName);
            state.messageStore.delete(queueName);
            return { ok: false, error: `Error creating queue browser: ${e.message}` };
        }
    }

    function disconnectBrowser(queueName: string) {
        const browser = state.browserInstances.get(queueName);
        if (browser) {
            logger.info(`Disconnecting browser for [${queueName}]...`);
            try {
                browser.disconnect();
            } catch (e) {
                logger.error('Error disconnecting browser', e);
            }
            deleteBrowser(queueName);
        }
        state.messageStore.delete(queueName);
    }

    function disconnectAll() {
        logger.info('[Browser] Global Client Disconnect - Cleaning up browsers...');
        state.browserInstances.forEach((browser: any, queueName: string) => {
            try {
                browser.disconnect();
            } catch (e) {
                // Browser may already be down because the parent session is gone.
                logger.warn(`[queue-browser] browser.disconnect() for "${queueName}" during global cleanup:`, e);
            }
        });
        state.browserInstances.clear();
        state.messageStore.clear();
    }

    /**
     * Forward `originalMsg` to (`destName`, `destType`) and return the publish
     * promise. The caller-supplied `correlationValue` becomes the message's
     * correlation key, so the UI's per-item id matches what the broker echoes
     * back. Resolves with `{ ok: true }` on ACK, `{ ok: false, error }` on
     * REJECT/timeout/sync-send failure — never rejects.
     */
    async function forwardMessage(
        originalMsg: any,
        destName: string,
        destType: string,
        correlationValue: string,
    ): Promise<SendResult> {
        if (!publisher) throw new Error('Not connected to Solace.');
        return publisher.send(
            originalMsg._originalMsg,
            { type: destType === 'Topic' ? 'topic' : 'queue', name: destName },
            // `originalMsg.id` is set in `service-events.ts:172` to either
            // `getGuaranteedMessageId().toString()` or the literal 'N/A',
            // so it's always a string — no nullish coalescing needed.
            { correlationKey: correlationValue, originalIdHint: String(originalMsg.id) },
        );
    }

    /** True iff a forward with this correlation value is still awaiting an ACK. */
    function hasInFlightForward(correlationValue: string): boolean {
        return publisher?.isPending(correlationValue) ?? false;
    }

    function deleteMessages(queueName: string, msgIds: string[]): { ok: boolean; count: number; error?: string } {
        if (!queueName || !msgIds || msgIds.length === 0) {
            return { ok: true, count: 0 };
        }

        if (!session) {
            return { ok: false, count: 0, error: 'No active session.' };
        }

        const browser = state.browserInstances.get(queueName);
        if (!browser) {
            logger.error('No active browser found for queue', queueName);
            return { ok: false, count: 0, error: 'Delete failed: Browser not active for this queue.' };
        }

        // `browserInstances` and `messageStore` are populated together by createBrowser
        // and cleared together by disconnectBrowser, but a concurrent disconnect can
        // remove the store between the browser-check above and the state write-back
        // below. Bail early instead of letting the final set() silently install a
        // stale array under a key the rest of the module has already abandoned.
        if (!state.messageStore.has(queueName)) {
            logger.error('No message store found for queue', queueName);
            return { ok: false, count: 0, error: 'Delete failed: Message store not available for this queue.' };
        }

        logger.info(`[Delete] Starting removal of ${msgIds.length} messages from ${queueName}`);

        // 1. Sort IDs (Smallest to Largest)
        const sortedIds = msgIds.map(id => Number(id)).sort((a, b) => a - b);

        // 2. Loop through sorted IDs and Remove
        const removedIds = new Set<string>();

        sortedIds.forEach(id => {
            const idStr = id.toString();
            try {
                const msg = solace.SolclientFactory.createMessage();
                msg.setGuaranteedMessageId(id);

                try {
                    browser.removeMessageFromQueue(msg);

                    // Update UI immediately per row
                    ui.removeMessageRow(idStr);
                    removedIds.add(idStr);
                    logger.debug(`[Delete] Triggered remove for ${idStr}`);
                } catch (ex) {
                    logger.error(`[Delete] Remove API call failed for ${idStr}`, ex);
                }

            } catch (err) {
                logger.error(`[Delete] Failed to prepare msg ${idStr}`, err);
            }
        });

        // 3. Final State Update
        if (removedIds.size > 0) {
            state.allMessages = state.allMessages.filter((m: any) => !removedIds.has(m.id));
            state.displayedMessages = state.displayedMessages.filter((m: any) => !removedIds.has(m.id));
            state.messageStore.set(queueName, state.allMessages);
            ui.updateCounts();
        }

        return {
            ok: removedIds.size > 0,
            count: removedIds.size,
            error: removedIds.size === 0 ? 'No messages were deleted. Check console for errors.' : undefined
        };
    }

    return { createBrowser, disconnectBrowser, disconnectAll, forwardMessage, hasInFlightForward, deleteMessages };
}
