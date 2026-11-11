/**
 * Convenience for callers that want a stable "original message id" string to
 * include in the correlation key. Tries application message id first, then
 * guaranteed message id, falling back to '(no id)' so logs always have
 * something printable. Queue-copy-specific because the copy engine receives
 * raw SDK messages from the QueueBrowser MESSAGE event; queue-browser keeps
 * the message id on its cache wrapper and reads it directly.
 */
export function getOriginalIdHint(originalMsg: any): string {
    const appId = originalMsg.getApplicationMessageId?.();
    if (appId) return String(appId);
    const gmId = originalMsg.getGuaranteedMessageId?.();
    if (gmId) return String(gmId);
    return '(no id)';
}

/** Prefixes the SDK reserves; it refuses any destination name starting with one. */
const RESERVED_PREFIXES = ['#P2P/QUE/', '#P2P/QTMP/'];

/**
 * Why the SDK would refuse `name` as a publish destination of `type`, or null
 * when it accepts it. Mirrors the checks createDurableQueueDestination and
 * createTopicDestination run (DestinationUtil.validateAndEncode): the encoded
 * name, with the SDK's `#P2P/QUE/` prefix for a queue, is at most 250 bytes; a
 * `/` never starts or ends it or follows another `/`; a `*` only ends a level;
 * no reserved prefix. Checked in the form so a mistyped name never reaches a
 * run, where every publish would fail on it.
 */
export function destNameProblem(type: 'queue' | 'topic', name: string): string | null {
    const max = 250 - (type === 'queue' ? RESERVED_PREFIXES[0].length : 0);
    if (new TextEncoder().encode(name).length > max) {
        return `Too long: at most ${max} bytes.`;
    }
    for (let i = 0; i < name.length; i++) {
        const c = name.charAt(i);
        if (c === '/' && (i === 0 || i === name.length - 1 || name.charAt(i - 1) === '/')) {
            return `Empty level at character ${i + 1}: a "/" cannot start or end the name, or follow another "/".`;
        }
        if (c === '*' && i < name.length - 1 && name.charAt(i + 1) !== '/') {
            return `"*" at character ${i + 1} may only end a level.`;
        }
    }
    const reserved = RESERVED_PREFIXES.find((p) => name.startsWith(p));
    return reserved ? `"${reserved}" is a reserved prefix.` : null;
}
