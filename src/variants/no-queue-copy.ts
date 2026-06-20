/**
 * No-Queue-Copy variant — every module except Queue Copy.
 *
 * Same as `full`, with `queue-copy` omitted so the Copy/Move-between-queues
 * module is never installed. See architecture.md → "Module registration —
 * variant manifests".
 */
export const ACTIVE_MODULES: Record<string, number> = {
    'connections': 100,
    'queue-browser': 80,
    'queue-subscription-explorer': 45,
};
