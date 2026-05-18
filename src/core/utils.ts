/**
 * Shared pure utility functions.
 * No DOM or module-state dependencies — safe to use anywhere.
 */

/**
 * Format a byte count into a human-readable string (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number | string, decimals = 2): string {
    let b = Number(bytes);
    if (b === 0 || isNaN(b)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1000 && i < sizes.length - 1) {
        b /= k;
        i++;
    }
    return parseFloat(b.toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Generate a v4-style UUID string.
 */
export function generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Wildcard pattern match (case-insensitive).
 * Supports `*` as a wildcard character. Returns exact match when no `*` present.
 *
 * Wildcard patterns compile to a `RegExp` — cached by pattern string so the same
 * filter applied across many messages only pays the compile cost once.
 */
const matchStringRegexCache = new Map<string, RegExp>();

export function matchString(text: string, pattern: string | null): boolean {
    if (!pattern) return true;

    if (pattern.includes('*')) {
        let regex = matchStringRegexCache.get(pattern);
        if (!regex) {
            const escapeRegex = (str: string) => str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
            const regexStr = '^' + pattern.split('*').map(escapeRegex).join('.*') + '$';
            regex = new RegExp(regexStr, 'i');
            matchStringRegexCache.set(pattern, regex);
        }
        return regex.test(text);
    }

    return text.toLowerCase() === pattern.toLowerCase();
}

/**
 * Escape HTML special characters to prevent XSS when interpolating into innerHTML.
 */
export function escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape XML special characters for safe inclusion in element text or attribute
 * values. Five entities only — `&`, `<`, `>`, `"`, `'` — matching the XML 1.0
 * predefined set. Use when constructing SEMP v1 RPC bodies (or any other XML
 * payload built by string concatenation).
 */
export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Solace topic intersection. Returns true iff the two topic patterns describe
 * overlapping topic-sets — i.e. there is at least one concrete topic that
 * matches both. Either side may contain wildcards:
 *   - `*` as an entire level, or at any position within a level, matches
 *     zero-or-more characters within that level.
 *   - `>` as an entire level matches one or more remaining levels (terminal).
 *
 * Both sides being literal collapses to case-sensitive equality, since topic
 * names are case-sensitive on the broker.
 *
 * This symmetric form treats `*` as wildcard *wherever* it appears on either
 * side — useful for testing flexibility vs flexibility. For matching a user's
 * search input against a stored Solace subscription, use `topicFilterMatches`
 * — on the stored side, Solace only treats `*` as a wildcard at the last
 * character of a level, and elsewhere it's a literal character. The wrapper
 * normalizes the stored side before intersecting.
 *
 * Edge cases: empty input on either side has zero levels. Callers typically
 * treat empty input as "no filter" before invoking; empty-vs-non-empty cases
 * are still defined here for completeness.
 */
export function topicsIntersect(a: string, b: string): boolean {
    const la = a.split('/');
    const lb = b.split('/');
    return matchTopicLevels(la, lb, 0, 0);
}

/**
 * Asymmetric topic match for user-filter-vs-stored-subscription. The filter
 * (`userInput`) can use `*` as a wildcard anywhere — leading, middle, or
 * trailing in a level. The stored topic follows Solace's stricter rule:
 * `*` is a wildcard only when it's the *last* character of a level (including
 * a level that is `*` alone); anywhere else it's a literal character.
 *
 * Implementation: normalize the stored topic so non-terminal `*`s become a
 * NUL sentinel that the symmetric matcher treats as any other literal
 * character; the remaining (terminal or whole-level) `*`s keep their
 * wildcard semantics. Then the existing `topicsIntersect` machinery runs.
 *
 * @example
 *   topicFilterMatches('B*​/*', 'BULKQ/TEST')   // true  — user wildcard vs literal
 *   topicFilterMatches('foo', 'foo*')            // true  — stored trailing `*` is a wildcard
 *   topicFilterMatches('foo*bar', 'foo*bar')     // true  — stored middle `*` is literal,
 *                                                //         user middle `*` matches it
 *   topicFilterMatches('foobar', 'foo*bar')      // false — stored middle `*` is a literal
 *                                                //         char that `foobar` doesn't contain
 */
export function topicFilterMatches(userInput: string, storedTopic: string): boolean {
    return topicsIntersect(userInput, normalizeStoredTopic(storedTopic));
}

/**
 * Internal stand-in for a literal `*` in a stored level. Solace topic strings
 * cannot contain a NUL character (the broker rejects them), so the sentinel
 * can never collide with real input. Built via `String.fromCharCode(0)` so
 * the source stays plain ASCII — embedding a literal NUL byte in source code
 * is fragile across editors, VCS, and build tools.
 */
const LITERAL_STAR_SENTINEL = String.fromCharCode(0);

function normalizeStoredTopic(topic: string): string {
    return topic.split('/').map(normalizeStoredLevel).join('/');
}

function normalizeStoredLevel(level: string): string {
    // Solace rule: `*` is a wildcard only at the last character of a level.
    // A level that is exactly `*` therefore IS a wildcard (position 0 is also
    // the last position). Any earlier `*` is a literal character that we swap
    // out so the level-intersection matcher doesn't misread it as a wildcard.
    const lastIdx = level.length - 1;
    if (lastIdx < 1) return level; // '' or single char — nothing to rewrite
    let out = '';
    for (let i = 0; i < level.length; i++) {
        const ch = level[i];
        out += (ch === '*' && i !== lastIdx) ? LITERAL_STAR_SENTINEL : ch;
    }
    return out;
}

function matchTopicLevels(a: string[], b: string[], i: number, j: number): boolean {
    while (i < a.length && j < b.length) {
        const ta = a[i];
        const tb = b[j];
        // `>` is terminal greedy: it matches one or more remaining levels on
        // the other side. Solace requires `>` only as the last level; we treat
        // any `>` as terminal for robustness. Both sides must have ≥1 level
        // remaining (`>` itself counts as 1 level on its side).
        if (ta === '>' || tb === '>') return (a.length - i) >= 1 && (b.length - j) >= 1;
        // Within-level intersection. `*` is the single-character (zero-or-more
        // chars) wildcard *inside* a level, so `B*` matches `BULKQ`, `*Q`
        // matches `BULKQ`, and `*` alone matches any level. The level patterns
        // intersect iff their concrete-string sets overlap.
        if (!levelsIntersect(ta, tb)) return false;
        i++;
        j++;
    }
    // Both fully consumed → the topic-sets overlap.
    return i === a.length && j === b.length;
}

/**
 * True iff the two single-level patterns describe overlapping concrete-string
 * sets. Each pattern may contain any number of `*` characters; `*` matches
 * zero or more arbitrary characters within the level. Topic names are
 * case-sensitive on the broker.
 *
 * Implemented as a memoized two-pointer match — O(|a|·|b|) worst case, which
 * is comfortably bounded for typical Solace level strings (<60 chars).
 */
function levelsIntersect(a: string, b: string): boolean {
    const memo = new Map<number, boolean>();
    const stride = b.length + 1;
    function rec(i: number, j: number): boolean {
        const key = i * stride + j;
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        let result: boolean;
        if (i === a.length && j === b.length) {
            result = true;
        } else if (i === a.length) {
            // Remaining b must be all `*`s to also match the empty string.
            result = true;
            for (let p = j; p < b.length; p++) if (b[p] !== '*') { result = false; break; }
        } else if (j === b.length) {
            result = true;
            for (let p = i; p < a.length; p++) if (a[p] !== '*') { result = false; break; }
        } else if (a[i] === '*') {
            // `*` either matches zero chars (advance over `*` only) or
            // consumes one char from b (advance b, keep `*` for next round).
            result = rec(i + 1, j) || rec(i, j + 1);
        } else if (b[j] === '*') {
            result = rec(i, j + 1) || rec(i + 1, j);
        } else if (a[i] !== b[j]) {
            result = false;
        } else {
            result = rec(i + 1, j + 1);
        }
        memo.set(key, result);
        return result;
    }
    return rec(0, 0);
}

/**
 * Validate a hostname or IPv4 address.
 */
export function isValidHost(val: string | null): boolean {
    if (!val) return false;
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const m = val.match(ipv4);
    if (m) return m.slice(1).every(o => { const n = +o; return n >= 0 && n <= 255; });
    return /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(val);
}

/**
 * Validate a port number (1–65535). Strict: rejects "8080abc", "12.5", " 80 "
 * — only an integer-only string is accepted.
 */
export function isValidPort(val: string): boolean {
    if (!/^\d+$/.test(val)) return false;
    const p = parseInt(val, 10);
    return p > 0 && p <= 65535;
}

/**
 * Normalise an optional URL path so it can be safely appended to
 * `protocol://host:port`. Returns `''` for empty/whitespace input,
 * else ensures a leading `/` and strips trailing `/`.
 */
export function normalizeUrlPath(val: string | null | undefined): string {
    const trimmed = (val ?? '').trim();
    if (!trimmed) return '';
    const withLeading = trimmed.startsWith('/') ? trimmed : '/' + trimmed;
    return withLeading.replace(/\/+$/, '');
}
