import { state, ingestMessage, getMessages, shouldShowMessage } from './state.js';
import { ui } from './ui-core.js';
import { showToast } from '../../core/toast';
import { logger } from '../../core/logger';

declare const solace: any;

/**
 * Table-driven extraction of the Solace SDK's "standard" message properties.
 * Each entry is `[display-key, getter]`. The getter returns either the value to
 * store or `undefined` to skip; the caller wraps every invocation in a single
 * try/catch so any SDK getter that's missing or throws (common for older message
 * subtypes) is silently omitted rather than aborting the whole extraction.
 *
 * Preserves per-field truthiness rules from the pre-refactor version:
 *   - Priority returns 0 (valid priority) but skips `null`
 *   - Delivery Mode translates the numeric enum to a readable label
 *   - Everything else skips falsy values ('', 0, null, undefined)
 */
const STANDARD_PROPERTY_GETTERS: Array<[string, (m: any) => unknown]> = [
    ['App Msg Id', m => m.getApplicationMessageId() || undefined],
    ['Cache Id', m => m.getCacheRequestId() || undefined],
    ['Corr Id', m => m.getCorrelationId() || undefined],
    ['Delivery Count', m => m.getDeliveryCount() || undefined],
    ['Delivery Mode', m => {
        const dm = m.getDeliveryMode();
        return dm === 0 ? 'DIRECT' : dm === 1 ? 'PERSISTENT' : dm === 2 ? 'NON_PERSISTENT' : 'UNKNOWN';
    }],
    ['HTTP Encoding', m => m.getHttpContentEncoding() || undefined],
    ['HTTP Type', m => m.getHttpContentType() || undefined],
    ['Priority', m => {
        const p = m.getPriority();
        return p != null ? p : undefined;
    }],
    ['Reply To', m => m.getReplyTo()?.toString() || undefined],
    ['Sender Id', m => m.getSenderId() || undefined],
    ['SeqNumber', m => m.getSequenceNumber() || undefined],
    ['TTL', m => m.getTimeToLive() || undefined],
    ['TopicSeqNum', m => m.getTopicSequenceNumber() || undefined],
    // Boolean flags — getter returns `true` when set, `undefined` otherwise so the
    // ingest filter drops false flags before they reach msgProperties. createTag
    // then renders these as bare labels (no `= value`).
    ['AcknowledgeImmediately', m => m.isAcknowledgeImmediately() || undefined],
    ['DeliverToOne', m => m.isDeliverToOne() || undefined],
    ['DiscardIndication', m => m.isDiscardIndication() || undefined],
    ['DMQEligible', m => m.isDMQEligible() || undefined],
    ['ElidingEligible', m => m.isElidingEligible() || undefined],
    ['Redelivered', m => m.isRedelivered() || undefined],
    ['ReplyMessage', m => m.isReplyMessage() || undefined],
];

/**
 * Queue Browser service events.
 * Factory — no window.App references.
 * Uses wire() to receive a reference to service.disconnectBrowser (breaks circular dep).
 */
export function createServiceEvents() {
    let _disconnectBrowser: ((q: string) => void) | null = null;

    function wire(deps: { disconnectBrowser: (q: string) => void }) {
        _disconnectBrowser = deps.disconnectBrowser;
    }

    function onBrowserUp(queueName: string) {
        logger.info(`[${queueName}] Browser UP`);

        // Finalize Bind in UI
        ui.addQueueToDropdown(queueName);

        // Clear Input on success if matching
        const els = ui.getElements();
        if (els.inputBind.value.trim() === queueName) {
            els.inputBind.value = '';
        }

        if (state.currentQueue === queueName) {
            ui.showBrowserError(null);
        }

        // Confirm to the user that the bind succeeded. Fires for every entry path —
        // manual bind input, "Open in Browser" from Discovery, or any future caller
        // — because this is the single UP_NOTICE handler for the SDK's browser events.
        showToast(`Queue "${queueName}" bound`, 'ok');
    }

    function onConnectFailed(queueName: string, err: any) {
        logger.error(`[${queueName}] Connect Failed:`, err);

        // Show Inline Error for binding
        ui.showBindError(`Connection Failed: ${err.message || 'Unknown Error'}`);

        // If active view
        if (state.currentQueue === queueName) {
            ui.showBrowserError(`Connection Failed: ${err.message || 'Unknown Error'}`);
        }

        // Cleanup browser instance so it can be retried.
        // wire() is always called before any browser can connect, so _disconnectBrowser
        // is guaranteed non-null here. Throw to surface missing wire() calls early.
        if (!_disconnectBrowser) throw new Error('wire() not called before onConnectFailed');
        _disconnectBrowser(queueName);
    }

    function onBrowserDown(queueName: string, err: any) {
        logger.error(`[${queueName}] Browser Down:`, err);
        if (state.currentQueue === queueName) {
            ui.showBrowserError(`Browser connection error: ${err.message || err}`);
        }
    }

    function onGmDisabled(queueName: string) {
        logger.error(`[${queueName}] GM Disabled`);
        if (state.currentQueue === queueName) {
            ui.showBrowserError('Guaranteed Messaging is disabled on the broker.');
        }
    }

    function onMessage(queueName: string, msg: any) {
        let typeStr = 'Message';
        try {
            if (msg.getType() === solace.MessageType.TEXT) typeStr = 'Text';
            else if (msg.getType() === solace.MessageType.BINARY) typeStr = 'Binary';
            else if (msg.getType() === solace.MessageType.MAP) typeStr = 'Map';
            else if (msg.getType() === solace.MessageType.STREAM) typeStr = 'Stream';
        } catch (e) {
            logger.warn('Failed to determine message type', e);
        }

        // Safely extract content
        let contentStr = '';
        const attachment = msg.getBinaryAttachment();
        const sdtCnt = msg.getSdtContainer();
        if (sdtCnt !== null) {
            if (sdtCnt.getType() === solace.SDTFieldType.STRING) {
                contentStr = sdtCnt.getValue();
            } else if (sdtCnt.getType() === solace.SDTFieldType.MAP) {
                contentStr = '[SDT Map Data - Not Supported Yet]';
            } else if (sdtCnt.getType() === solace.SDTFieldType.STREAM) {
                contentStr = '[SDT Stream Data - Not Supported Yet]';
            } else {
                contentStr = '[SDT Unknown Data - Not Supported Yet]';
            }
        } else if (attachment) {
            if (typeof attachment === 'string') {
                contentStr = attachment;
            } else if (attachment instanceof Uint8Array || attachment instanceof ArrayBuffer) {
                try {
                    contentStr = new TextDecoder().decode(attachment);
                } catch (e) { contentStr = '[Binary Data Error]'; }
            } else {
                contentStr = '[Unknown Binary Data]';
            }
        } else {
            contentStr = msg.getXmlContent() || '';
        }

        // TIMESTAMP Handling - Sender Timestamp preference
        let dateStr = 'N/A';
        let dateMs: number | null = null;
        try {
            const ts = msg.getSenderTimestamp();
            if (ts) {
                const timeVal = (typeof ts.toNumber === 'function') ? ts.toNumber() : ts;
                dateMs = typeof timeVal === 'number' ? timeVal : null;
                const d = new Date(timeVal);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const dd = String(d.getDate()).padStart(2, '0');
                const mon = months[d.getMonth()];
                const yy = String(d.getFullYear()).slice(-2);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                dateStr = `${dd}-${mon}-${yy} ${hh}:${mm}:${ss}`;
            }
            else
                dateStr = '(No Timestamp)';
        } catch (e) {
            logger.warn('Failed to extract timestamp', e);
        }

        const m: any = {
            id: msg.getGuaranteedMessageId() ? msg.getGuaranteedMessageId().toString() : 'N/A',
            date: dateStr,
            dateMs,
            size: msg.smfHeader ? msg.smfHeader.messageLength : 0,
            type: typeStr,
            // Standard Properties
            msgProperties: (function () {
                const props: Record<string, any> = {};
                for (const [key, getter] of STANDARD_PROPERTY_GETTERS) {
                    try {
                        const val = getter(msg);
                        if (val != null) props[key] = val;
                    } catch {
                        // Standard getter unavailable on this message subtype — skip the field.
                    }
                }
                return props;
            })(),
            // User/Application Properties (formerly headers)
            appProperties: (function () {
                try {
                    const map = msg.getUserPropertyMap();
                    if (!map) return {};
                    const obj: Record<string, any> = {};
                    const keys = map.getKeys();
                    keys.forEach((key: string) => {
                        const field = map.getField(key);
                        if (field && typeof field.getValue === 'function') {
                            obj[key] = field.getValue();
                        } else {
                            obj[key] = field;
                        }
                    });
                    return obj;
                } catch (e) { return {}; }
            })(),
            content: contentStr,
            _originalMsg: msg // Store original for details
        };

        // Store in State — atomic ingest enforces the moving-window cap and keeps
        // displayedMessages + DOM in sync with the store in one synchronous pass.
        ingestMessage(queueName, m);

        // Check if this queue is currently active in UI
        if (state.currentQueue === queueName) {
            state.allMessages = getMessages(queueName);

            // Filter Check for Incoming Message
            if (shouldShowMessage(m)) {
                // If we are in a filtered view, manually add to displayed list
                if (state.displayedMessages !== state.allMessages) {
                    state.displayedMessages.push(m);
                }
                ui.addMessageRow(m);
            }
        }
    }

    return { wire, onBrowserUp, onConnectFailed, onBrowserDown, onGmDisabled, onMessage };
}
