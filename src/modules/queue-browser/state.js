import { DEFAULT_MAX_MESSAGES_PER_QUEUE } from './constants.js';

/**
 * A stored message as service-events.ts's ingest builds it: `id`, `content`
 * (text, or a size placeholder when `binary`), `bytes` (payload flavor),
 * `type`, `dateMs`, `msgProperties`, `appProperties` and `_originalMsg` (the
 * SDK message). The shape is owned by that TypeScript ingest, so here it is
 * an open record rather than a second declaration that could drift.
 * @typedef {Record<string, any>} StoredMessage
 */

/**
 * Single source of truth for the activeFilters shape. Every reset site must
 * go through this factory so new fields can't be silently dropped by one of
 * three previously-divergent inline resets. `properties` is included in the
 * default so readers don't have to defensively `&& properties.length > 0`.
 */
export function defaultActiveFilters() {
    return {
        content: '',
        msgId: '',
        dest: '',
        type: 'ANY',
        msgType: 'ANY',
        properties: [],
        olderThanMs: null,
        newerThanMs: null,
        criteria: 'OR'
    };
}

/** @type {any} */
export const state = {
    browserInstances: new Map(), // queueName -> solace.QueueBrowser
    messageStore: new Map(),     // queueName -> Array<Message>
    currentQueue: '',
    currentQueuePermissions: null,
    allMessages: [],
    displayedMessages: [],
    forwardQueue: [], // Array of messages to forward
    activeFilters: defaultActiveFilters(),
    // Moving-window cap per queue. Updated on config:max-messages-changed.
    maxMessagesPerQueue: DEFAULT_MAX_MESSAGES_PER_QUEUE
};

// No default export needed in closure scope

/** @param {string} queueName */
export function getBrowser(queueName) {
    return state.browserInstances.get(queueName);
}

/**
 * @param {string} queueName
 * @param {any} browser the SDK's QueueBrowser (the SDK ships no types)
 */
export function setBrowser(queueName, browser) {
    state.browserInstances.set(queueName, browser);
}

/** @param {string} queueName */
export function deleteBrowser(queueName) {
    state.browserInstances.delete(queueName);
}

/** @param {string} queueName */
export function getMessages(queueName) {
    return state.messageStore.get(queueName);
}

/**
 * @param {string} queueName
 * @param {StoredMessage[]} messages
 */
export function setMessages(queueName, messages) {
    state.messageStore.set(queueName, messages);
}

/**
 * @param {string} queueName
 * @param {StoredMessage} message
 */
export function addMessage(queueName, message) {
    const store = state.messageStore.get(queueName);
    if (store) {
        store.push(message);
    }
}

// UI sync hook — set once by queue-browser/module.ts so state stays free of direct
// ui-core coupling. ingestMessage() is the single authoritative entry point for
// arriving messages and owns the full moving-window invariant atomically.
/** @type {((id: string) => void) | null} */
let _uiRemoveRow = null;
/** @param {((id: string) => void) | null} removeRow null unhooks it (test reset) */
export function wireIngestUi(removeRow) {
    _uiRemoveRow = removeRow;
}

/**
 * Atomic ingest: push a new message and drop the oldest if over the per-queue cap.
 * Keeps state.messageStore, state.displayedMessages, and the live DOM table in sync
 * in one synchronous pass so no intermediate state is observable between them.
 * Invoked from service-events.onMessage — must stay sync (no await) or the moving-
 * window invariant can interleave across arrivals.
 * @param {string} queueName
 * @param {StoredMessage} message
 */
export function ingestMessage(queueName, message) {
    const store = state.messageStore.get(queueName);
    if (!store) return;

    // Moving window: drop oldest when at cap. Cap is only changed between sessions
    // (setting editable while disconnected), so a single shift per arrival is enough.
    if (store.length >= state.maxMessagesPerQueue) {
        const dropped = store.shift();
        if (state.currentQueue === queueName) {
            // state.allMessages points at `store` by reference — the shift() above
            // already dropped it there. Only displayedMessages (filtered view) and
            // the DOM row need explicit cleanup.
            if (state.displayedMessages !== state.allMessages) {
                const idx = state.displayedMessages.indexOf(dropped);
                if (idx !== -1) state.displayedMessages.splice(idx, 1);
            }
            if (_uiRemoveRow) _uiRemoveRow(dropped.id);
        }
    }
    store.push(message);
}

export function clearStore() {
    state.messageStore.clear();
}

// Import from core/utils and re-export so existing imports from './state.js' keep working
import { matchString } from '../../core/utils';
export { matchString };

// Logic extracted from ui-events to be shared with service-events
/** @param {StoredMessage} msg */
export function shouldShowMessage(msg) {
    // Current Active Filters - DO NOT lower() here, let matchString handle casing
    const fContent = state.activeFilters.content;
    const fId = state.activeFilters.msgId;
    const fDest = state.activeFilters.dest;
    const fDestType = state.activeFilters.type;
    const fMsgType = state.activeFilters.msgType;
    const criteria = state.activeFilters.criteria;

    // Define Conditions: { active: boolean, match: boolean }
    const conditions = [];

    // 1. Content
    if (fContent) {
        // Use 'Contains' matching for content/body as per user request. A true binary
        // payload holds no text (its content is a size placeholder), so it never matches.
        //if (!fContent.includes('*')) {
        const match = !msg.binary && msg.content.toLowerCase().includes(fContent.toLowerCase());
        conditions.push({ active: true, match });
        //} else {
        // Fallback to matchString for wildcards
        //    conditions.push({ active: true, match: matchString(msg.content, fContent) });
        //}
    }

    // 2. ID
    if (fId) {
        conditions.push({ active: true, match: matchString(msg.id, fId) });
    }

    // 3. Message Type (Check State UI logic for values)
    if (fMsgType !== 'ANY') {
        conditions.push({ active: true, match: msg.type === fMsgType }); // Enum match
    }

    // 4. Destination (Composite)
    if (fDest || fDestType !== 'ANY') {
        let matchDest = true;

        // _originalMsg is set by service-events.onMessage for every broker-delivered
        // message; shouldShowMessage only runs on messages from that pipeline.
        // window.solace is a required SDK global loaded before module install
        // (untyped: the SDK ships no declarations).
        const sdk = /** @type {any} */ (window).solace;
        const dest = msg._originalMsg.getDestination();
        const msgDestName = dest ? dest.getName() : '';
        let msgDestType = '';
        if (dest) {
            const t = dest.getType();
            if (t === sdk.DestinationType.TOPIC) msgDestType = 'Topic';
            else if (t === sdk.DestinationType.QUEUE) msgDestType = 'Queue';
        }

        if (fDest && !matchString(msgDestName, fDest)) matchDest = false;
        if (fDestType !== 'ANY' && msgDestType !== fDestType) matchDest = false;

        conditions.push({ active: true, match: matchDest });
    }

    // 5. Properties (Multiple) — `properties` is always an array (see defaultActiveFilters)
    if (state.activeFilters.properties.length > 0) {
        state.activeFilters.properties.forEach((/** @type {{ key: string, value: string }} */ prop) => {
            const fKey = prop.key.trim();
            // Key is case-insensitive exact match
            const fKeyLower = fKey.toLowerCase();
            const fVal = prop.value;

            let matchProp = false;

            // Check Standard Properties. Ingest always sets msgProperties and
            // appProperties (at least `{}`).
            // Find matching key (case-insensitive)
            const foundStdKey = Object.keys(msg.msgProperties).find(k => k.toLowerCase() === fKeyLower);
            if (foundStdKey) {
                // Ingest stores only non-null values and keeps Priority 0, so
                // stringify as-is: '0' must stay matchable.
                const val = String(msg.msgProperties[foundStdKey]);
                if (matchString(val, fVal)) matchProp = true;
            }

            // Check App Properties
            if (!matchProp) {
                const foundKey = Object.keys(msg.appProperties).find(k => k.toLowerCase() === fKeyLower);
                if (foundKey) {
                    // User-property values may be 0 or false (keep) or null (an SDT null field).
                    const val = String(msg.appProperties[foundKey] ?? '');
                    if (matchString(val, fVal)) matchProp = true;
                }
            }

            conditions.push({ active: true, match: matchProp });
        });
    }

    // 6. Sender Timestamp Range (single combined condition; inclusive bounds).
    // Messages without a numeric dateMs are excluded when either bound is set.
    const fOlderMs = state.activeFilters.olderThanMs;
    const fNewerMs = state.activeFilters.newerThanMs;
    if (fOlderMs != null || fNewerMs != null) {
        let matchDate;
        if (typeof msg.dateMs !== 'number') {
            matchDate = false;
        } else {
            const olderOk = (fOlderMs == null) || (msg.dateMs <= fOlderMs);
            const newerOk = (fNewerMs == null) || (msg.dateMs >= fNewerMs);
            matchDate = olderOk && newerOk;
        }
        conditions.push({ active: true, match: matchDate });
    }

    // Evaluate
    if (conditions.length === 0) return true;
    else if (criteria === 'AND') {
        // All conditions must match. If NO filter is active, it's a pass.
        // Array only contains active conditions logic above if written differently
        // But here `conditions` only contains filters the user actually set.
        return conditions.every(c => c.match);
    } else {
        // OR: At least one active must match.
        return conditions.some(c => c.match);
    }
}
