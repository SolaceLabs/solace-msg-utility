/**
 * Convenience for callers that want a stable "original message id" string to
 * include in the correlation key. Tries application message id first, then
 * guaranteed message id, falling back to '(no id)' so logs always have
 * something printable. Queue-copy-specific because the copy engine receives
 * raw SDK messages from the QueueBrowser MESSAGE event; queue-browser keeps
 * the message id on its cache wrapper and reads it directly.
 */
export function getOriginalIdHint(originalMsg: any): string {
    try {
        const appId = originalMsg.getApplicationMessageId?.();
        if (appId) return String(appId);
        const gmId = originalMsg.getGuaranteedMessageId?.();
        if (gmId) return String(gmId);
    /* v8 ignore start -- defensive catch around SDK getter calls; the mock's
     * getters never throw, production SDK could return malformed objects on
     * rare error paths. */
    } catch {
        /* fallthrough */
    }
    /* v8 ignore stop */
    return '(no id)';
}
