import { state, setBrowser, deleteBrowser } from './state.js';
import { ui } from './ui-core.js';
import { MAX_BROWSER_BINDINGS } from './constants.js';
import { createSolacePublisher, type SolacePublisher, type SendResult } from '../../core/services/solace-publisher';
import { solaceErrorText } from '../../core/utils';
import { logger } from '../../core/logger';
import type { AppContext } from '../../core/types';

declare const solace: any;

/**
 * Outcome of a delete. The broker does not confirm a removal, so `requested`
 * counts the removals sent, not the messages gone. `failed` counts the ones
 * that could not be requested; `error` is the first reason. `ok` is true when
 * none failed.
 */
export interface DeleteResult {
    ok: boolean;
    requested: number;
    failed: number;
    error?: string;
}

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
            return { ok: false, error: `Error creating queue browser: ${solaceErrorText(e, 'Unknown error')}` };
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

    function deleteMessages(queueName: string, msgIds: string[]): DeleteResult {
        if (!queueName || !msgIds || msgIds.length === 0) {
            return { ok: true, requested: 0, failed: 0 };
        }

        if (!session) {
            return { ok: false, requested: 0, failed: msgIds.length, error: 'No active session.' };
        }

        const browser = state.browserInstances.get(queueName);
        if (!browser) {
            logger.error('No active browser found for queue', queueName);
            return { ok: false, requested: 0, failed: msgIds.length, error: 'Browser not active for this queue.' };
        }

        // `browserInstances` and `messageStore` are populated together by createBrowser
        // and cleared together by disconnectBrowser, but a concurrent disconnect can
        // remove the store between the browser-check above and the state write-back
        // below. Bail early instead of letting the final set() silently install a
        // stale array under a key the rest of the module has already abandoned.
        const store = state.messageStore.get(queueName);
        if (!store) {
            logger.error('No message store found for queue', queueName);
            return { ok: false, requested: 0, failed: msgIds.length, error: 'Message store not available for this queue.' };
        }

        logger.info(`[Delete] Starting removal of ${msgIds.length} messages from ${queueName}`);

        // 1. The stored messages to remove, oldest first: the order the browser
        //    delivered them. An id no longer in the store (the moving window dropped
        //    it while the user confirmed) cannot be acked.
        const wanted = new Set(msgIds);
        const targets = store.filter((m: any) => wanted.has(m.id));
        let failed = msgIds.length - targets.length;
        let reason: string | undefined = failed > 0 ? 'No longer in the message list' : undefined;

        // 2. Ack each one by the SDK's own 64-bit id object (a Long), never a JS
        //    Number: at or above 2^32 the SDK's ack encoder mangles a Number, so the
        //    ack would name a message that does not exist.
        const removedIds = new Set<string>();
        targets.forEach((target: any) => {
            try {
                const msg = solace.SolclientFactory.createMessage();
                msg.setGuaranteedMessageId(target._originalMsg.getGuaranteedMessageId());
                browser.removeMessageFromQueue(msg);

                // Update UI immediately per row
                ui.removeMessageRow(target.id);
                removedIds.add(target.id);
                logger.debug(`[Delete] Requested removal of ${target.id}`);
            } catch (e) {
                logger.error(`[Delete] Removal request failed for ${target.id} on ${queueName}`, e);
                failed++;
                reason ??= solaceErrorText(e, 'Unknown error');
            }
        });

        // 3. Final State Update
        if (removedIds.size > 0) {
            state.allMessages = state.allMessages.filter((m: any) => !removedIds.has(m.id));
            state.displayedMessages = state.displayedMessages.filter((m: any) => !removedIds.has(m.id));
            state.messageStore.set(queueName, state.allMessages);
            ui.updateCounts();
        }

        return { ok: failed === 0, requested: removedIds.size, failed, error: reason };
    }

    return { createBrowser, disconnectBrowser, disconnectAll, forwardMessage, hasInFlightForward, deleteMessages };
}
