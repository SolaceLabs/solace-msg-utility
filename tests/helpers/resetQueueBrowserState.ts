/**
 * Reset every field on the queue-browser `state` singleton to its initial value.
 *
 * `src/modules/queue-browser/state.js` exports a single shared object. Without
 * a centralised reset, each test file's `beforeEach` clears the fields that
 * test happens to touch — drift accumulates and a field set in test A can leak
 * into test B if test order changes. Use this helper everywhere instead of
 * hand-rolling a reset block per file.
 */
import { state, defaultActiveFilters } from '../../src/modules/queue-browser/state.js';
import { DEFAULT_MAX_MESSAGES_PER_QUEUE } from '../../src/modules/queue-browser/constants.js';

export function resetQueueBrowserState(): void {
    state.browserInstances.clear();
    state.messageStore.clear();
    state.currentQueue = '';
    state.currentQueuePermissions = null;
    state.allMessages = [];
    state.displayedMessages = [];
    state.forwardQueue = [];
    state.activeFilters = defaultActiveFilters();
    state.maxMessagesPerQueue = DEFAULT_MAX_MESSAGES_PER_QUEUE;
}
