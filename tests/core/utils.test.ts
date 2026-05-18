import { describe, it, expect } from 'vitest';
import { formatBytes, generateUuid, matchString, isValidHost, isValidPort, normalizeUrlPath, escapeHtml, escapeXml, topicsIntersect, topicFilterMatches } from '../../src/core/utils';

describe('core/utils', () => {

    describe('formatBytes()', () => {
        it('formats common sizes', () => {
            expect(formatBytes(0)).toBe('0 B');
            expect(formatBytes(500)).toBe('500 B');
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1048576)).toBe('1 MB');
            expect(formatBytes(1073741824)).toBe('1 GB');
            expect(formatBytes(1099511627776)).toBe('1 TB');
        });

        it('handles NaN / non-numeric input', () => {
            expect(formatBytes(NaN)).toBe('0 B');
            expect(formatBytes('not a number')).toBe('0 B');
        });

        it('respects decimals parameter', () => {
            expect(formatBytes(1536, 1)).toBe('1.5 KB');
        });
    });

    describe('generateUuid()', () => {
        it('returns a v4-shaped UUID string', () => {
            const uuid = generateUuid();
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('produces unique values', () => {
            const a = generateUuid();
            const b = generateUuid();
            expect(a).not.toBe(b);
        });
    });

    describe('matchString()', () => {
        it('returns true for empty / null pattern', () => {
            expect(matchString('anything', '')).toBe(true);
            expect(matchString('anything', null)).toBe(true);
        });

        it('performs case-insensitive exact match', () => {
            expect(matchString('Hello', 'hello')).toBe(true);
            expect(matchString('Hello', 'HELLO')).toBe(true);
            expect(matchString('Hello', 'world')).toBe(false);
        });

        it('supports wildcard (*) matching', () => {
            expect(matchString('Hello World', '*World')).toBe(true);
            expect(matchString('Hello World', 'Hello*')).toBe(true);
            expect(matchString('Hello World', '*lo Wo*')).toBe(true);
            expect(matchString('Hello World', '*xyz*')).toBe(false);
        });

        it('escapes regex special characters', () => {
            expect(matchString('test.value', 'test.*')).toBe(true);
            expect(matchString('test[1]', 'test*')).toBe(true);
        });
    });

    describe('isValidHost()', () => {
        it('accepts valid hostnames and IPs', () => {
            expect(isValidHost('broker.example.com')).toBeTruthy();
            expect(isValidHost('localhost')).toBeTruthy();
            expect(isValidHost('192.168.1.1')).toBeTruthy();
            expect(isValidHost('0.0.0.0')).toBeTruthy();
            expect(isValidHost('255.255.255.255')).toBeTruthy();
        });

        it('rejects invalid values', () => {
            expect(isValidHost('')).toBeFalsy();
            expect(isValidHost(null)).toBeFalsy();
            expect(isValidHost('http://broker')).toBeFalsy();
        });

        it('rejects IPv4 addresses with out-of-range octets', () => {
            expect(isValidHost('999.999.999.999')).toBeFalsy();
            expect(isValidHost('256.0.0.1')).toBeFalsy();
            expect(isValidHost('1.2.3.256')).toBeFalsy();
            expect(isValidHost('192.168.1.300')).toBeFalsy();
        });
    });

    describe('isValidPort()', () => {
        it('accepts valid ports', () => {
            expect(isValidPort('8080')).toBe(true);
            expect(isValidPort('1')).toBe(true);
            expect(isValidPort('65535')).toBe(true);
        });

        it('rejects invalid ports', () => {
            expect(isValidPort('0')).toBe(false);
            expect(isValidPort('-1')).toBe(false);
            expect(isValidPort('65536')).toBe(false);
            expect(isValidPort('abc')).toBe(false);
            expect(isValidPort('')).toBe(false);
        });

        it('rejects non-integer-only strings', () => {
            // Previously these slipped through because parseInt accepts leading digits.
            expect(isValidPort('8080abc')).toBe(false);
            expect(isValidPort('12.5')).toBe(false);
            expect(isValidPort(' 8080 ')).toBe(false);
            expect(isValidPort('+8080')).toBe(false);
        });
    });

    describe('normalizeUrlPath()', () => {
        it('returns empty string for empty/whitespace/nullish input', () => {
            expect(normalizeUrlPath('')).toBe('');
            expect(normalizeUrlPath('   ')).toBe('');
            expect(normalizeUrlPath(null)).toBe('');
            expect(normalizeUrlPath(undefined)).toBe('');
        });

        it('prepends a leading slash when missing', () => {
            expect(normalizeUrlPath('api')).toBe('/api');
            expect(normalizeUrlPath('foo/bar')).toBe('/foo/bar');
        });

        it('keeps an existing leading slash', () => {
            expect(normalizeUrlPath('/api')).toBe('/api');
        });

        it('strips trailing slashes', () => {
            expect(normalizeUrlPath('/api/')).toBe('/api');
            expect(normalizeUrlPath('api///')).toBe('/api');
        });

        it('trims surrounding whitespace', () => {
            expect(normalizeUrlPath('  /api  ')).toBe('/api');
        });
    });

    describe('escapeHtml()', () => {
        it('escapes all five HTML entities', () => {
            expect(escapeHtml('&')).toBe('&amp;');
            expect(escapeHtml('<')).toBe('&lt;');
            expect(escapeHtml('>')).toBe('&gt;');
            expect(escapeHtml('"')).toBe('&quot;');
            expect(escapeHtml("'")).toBe('&#39;');
        });

        it('escapes combined characters', () => {
            expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });

        it('returns safe strings unchanged', () => {
            expect(escapeHtml('hello world')).toBe('hello world');
            expect(escapeHtml('msg_10234')).toBe('msg_10234');
        });

        it('handles empty and falsy input', () => {
            expect(escapeHtml('')).toBe('');
            expect(escapeHtml(null as any)).toBe('');
            expect(escapeHtml(undefined as any)).toBe('');
        });
    });

    describe('escapeXml()', () => {
        it('escapes the five XML predefined entities', () => {
            expect(escapeXml('&')).toBe('&amp;');
            expect(escapeXml('<')).toBe('&lt;');
            expect(escapeXml('>')).toBe('&gt;');
            expect(escapeXml('"')).toBe('&quot;');
            // XML uses &apos; for the apostrophe (not &#39; like HTML).
            expect(escapeXml("'")).toBe('&apos;');
        });

        it('escapes a queue name containing every special char', () => {
            expect(escapeXml(`a&b<c>d"e'f`)).toBe(`a&amp;b&lt;c&gt;d&quot;e&apos;f`);
        });

        it('returns plain strings unchanged', () => {
            expect(escapeXml('queue/01')).toBe('queue/01');
            expect(escapeXml('')).toBe('');
        });
    });

    describe('topicsIntersect()', () => {
        it('two literal topics intersect iff equal', () => {
            expect(topicsIntersect('orders/new', 'orders/new')).toBe(true);
            expect(topicsIntersect('orders/new', 'orders/old')).toBe(false);
            // Topic levels are case-sensitive on the broker.
            expect(topicsIntersect('A', 'a')).toBe(false);
        });

        it('* wildcard matches a single level on the literal side', () => {
            expect(topicsIntersect('orders/new', 'orders/*')).toBe(true);
            expect(topicsIntersect('orders/*', 'orders/new')).toBe(true);
            expect(topicsIntersect('a/*/c', 'a/b/c')).toBe(true);
            // * does NOT cross level boundaries.
            expect(topicsIntersect('a/*', 'a/b/c')).toBe(false);
        });

        it('> wildcard swallows one or more remaining levels', () => {
            expect(topicsIntersect('orders/>', 'orders/new')).toBe(true);
            expect(topicsIntersect('orders/>', 'orders/new/details/v2')).toBe(true);
            // > requires at least one trailing level on the other side.
            expect(topicsIntersect('orders/>', 'orders')).toBe(false);
            // >-on-both-sides intersects only if the preceding literal prefix agrees.
            expect(topicsIntersect('a/>', 'a/>')).toBe(true);
            expect(topicsIntersect('a/>', 'b/>')).toBe(false);
        });

        it('mismatched level counts without > do not intersect', () => {
            expect(topicsIntersect('a/b', 'a/b/c')).toBe(false);
            expect(topicsIntersect('a/b/c', 'a/b')).toBe(false);
        });

        it('empty input is treated as a single empty level (split semantics)', () => {
            // The module-level filter callers short-circuit on empty filter input
            // before reaching topicsIntersect; this case documents the helper's
            // behaviour for completeness.
            expect(topicsIntersect('', '')).toBe(true);
            expect(topicsIntersect('', '*')).toBe(true); // * matches one level (incl. empty)
            expect(topicsIntersect('', 'a')).toBe(false);
        });

        it('combines * and > correctly', () => {
            expect(topicsIntersect('orders/*/v1', 'orders/new/v1')).toBe(true);
            expect(topicsIntersect('orders/*/v1', 'orders/new/v2')).toBe(false);
            expect(topicsIntersect('orders/*', 'orders/>')).toBe(true);
        });

        it('* inside a level acts as zero-or-more characters (prefix/suffix/both)', () => {
            // The user-visible bug: `B*/*` should match `BULKQ/TEST` because
            // `B*` (B followed by anything) matches the `BULKQ` level.
            expect(topicsIntersect('B*/*', 'BULKQ/TEST')).toBe(true);
            // Pure prefix wildcard.
            expect(topicsIntersect('B*', 'BULKQ')).toBe(true);
            expect(topicsIntersect('B*', 'XULKQ')).toBe(false);
            // Pure suffix wildcard.
            expect(topicsIntersect('*Q', 'BULKQ')).toBe(true);
            expect(topicsIntersect('*X', 'BULKQ')).toBe(false);
            // Wildcard in the middle.
            expect(topicsIntersect('B*Q', 'BULKQ')).toBe(true);
            expect(topicsIntersect('B*Z', 'BULKQ')).toBe(false);
            // Multiple wildcards in one level.
            expect(topicsIntersect('B*L*Q', 'BULKQ')).toBe(true);
            // Two within-level patterns intersect when they could share a string.
            expect(topicsIntersect('B*', '*Q')).toBe(true);  // strings starting B and ending Q (e.g. "BQ", "BULKQ")
            expect(topicsIntersect('B*', '*BC')).toBe(true); // "BBC"
            expect(topicsIntersect('B*', 'X*')).toBe(false); // can't start with both B and X
        });

        it('memoizes recursion when both sides have multiple `*`s', () => {
            // levelsIntersect uses an O(|a|·|b|) memoized two-pointer match.
            // The memo cache-hit branch (`if (cached !== undefined) return
            // cached`) only fires when a FALSE result is computed first and
            // then revisited via a different recursion path — TRUE results
            // short-circuit the OR before re-entry. Pattern below is
            // levelsIntersect('a*x', 'a*y'): the literal 'x' vs 'y' diverges,
            // forcing rec(2,2) to compute false, store it, then rec(1,2)'s
            // first OR branch revisits rec(2,2) and hits the cache.
            expect(topicsIntersect('a*x', 'a*y')).toBe(false);
            // Companion success cases (no cache hit but exercise the matcher
            // on multi-* patterns; also serves as the perf canary).
            expect(topicsIntersect('**', '**')).toBe(true);
            expect(topicsIntersect('a*b*c', 'a*b*c')).toBe(true);
        });

        it('within-level * matches an empty suffix (zero chars)', () => {
            // `B*` matches the literal `B` because `*` is zero-or-more.
            expect(topicsIntersect('B*', 'B')).toBe(true);
            // `*B` matches `B` for the same reason.
            expect(topicsIntersect('*B', 'B')).toBe(true);
            // `*` alone matches the empty string... but in Solace topics,
            // levels can't actually be empty (the broker would reject it).
            // The helper still returns true on an empty level since the
            // language theoretically intersects.
            expect(topicsIntersect('*', '')).toBe(true);
        });

        it('within-level wildcards combine with > terminal wildcard', () => {
            // `B*/>` = "first level starts with B, then any 1+ trailing levels".
            expect(topicsIntersect('B*/>', 'BULKQ/x')).toBe(true);
            expect(topicsIntersect('B*/>', 'BULKQ/x/y/z')).toBe(true);
            expect(topicsIntersect('B*/>', 'BULKQ')).toBe(false); // no trailing levels
            expect(topicsIntersect('B*/>', 'XYZ/a')).toBe(false); // first-level prefix wrong
        });

        it('within-level wildcards across multiple levels chain correctly', () => {
            expect(topicsIntersect('B*/T*', 'BULKQ/TEST')).toBe(true);
            expect(topicsIntersect('B*/T*', 'BULKQ/REAL')).toBe(false);
            // Each `*` is local to its own level; one level's wildcard can't
            // bleed into the next.
            expect(topicsIntersect('B*', 'BULKQ/TEST')).toBe(false); // level-count mismatch
        });

        it('within-level matching is case-sensitive (Solace topics are case-sensitive)', () => {
            expect(topicsIntersect('B*', 'bulkq')).toBe(false);
            expect(topicsIntersect('b*', 'BULKQ')).toBe(false);
            expect(topicsIntersect('B*Q', 'BulkQ')).toBe(true); // exact-case literal segments still match
        });

        it('handles many wildcards without exponential blowup (memoized matcher)', () => {
            // 10 wildcards per side. A naive recursion would be O(2^20);
            // memoization keeps it O(|a|·|b|). Run it to prove no perceptible
            // delay — pass condition is "test completes" + correct boolean.
            const a = '*'.repeat(10) + 'X' + '*'.repeat(10);
            const b = '*'.repeat(10) + 'Y' + '*'.repeat(10);
            // Both patterns require an X and a Y respectively — any string
            // containing both intersects (e.g. "XY"), so they overlap.
            expect(topicsIntersect(a, b)).toBe(true);
        });
    });

    describe('topicFilterMatches() — asymmetric user-vs-stored', () => {
        it('user input treats * as wildcard ANYWHERE in a level', () => {
            // The user-reported case + family.
            expect(topicFilterMatches('B*/*', 'BULKQ/TEST')).toBe(true);     // trailing-* in user
            expect(topicFilterMatches('*Q/T*', 'BULKQ/TEST')).toBe(true);    // leading-* in user
            expect(topicFilterMatches('B*Q/T*T', 'BULKQ/TEST')).toBe(true);  // middle-* in user
            expect(topicFilterMatches('B*L*Q/*', 'BULKQ/TEST')).toBe(true);  // multiple-* per level
        });

        it('stored * is a wildcard ONLY at the last position of its level', () => {
            // `foo*` — `*` is the last char of its only level → it's a wildcard,
            // matching `foo`, `foobar`, `foo` + anything.
            expect(topicFilterMatches('foo', 'foo*')).toBe(true);
            expect(topicFilterMatches('foobar', 'foo*')).toBe(true);
            // `*` (whole level) — same rule, position 0 IS the last position.
            expect(topicFilterMatches('anything', '*')).toBe(true);
            // `foo*bar` — `*` is in the middle of its only level → it's a
            // literal character. The user's literal `foobar` does NOT match.
            expect(topicFilterMatches('foobar', 'foo*bar')).toBe(false);
            // `*foo` — `*` is at position 0 but NOT at the last position
            // (last is index 3 = 'o') → it's literal. The user's literal
            // `xfoo` does NOT match (stored requires literal `*` then `foo`).
            expect(topicFilterMatches('xfoo', '*foo')).toBe(false);
            expect(topicFilterMatches('*foo', '*foo')).toBe(true); // user's literal * matches stored literal *
        });

        it('user wildcards can still match stored literal *', () => {
            // Stored `foo*bar` has a literal `*` in the middle. User typing
            // `foo*bar` with their own `*` (which means "any char") in the
            // same position matches because user `*` matches the literal `*`.
            expect(topicFilterMatches('foo*bar', 'foo*bar')).toBe(true);
            // User `foo?bar` would also match if the lang supported `?`, but
            // it doesn't — so user `*` (zero-or-more) is the only hammer.
            // User `fooXbar` matches stored `foo*bar` because user's literal
            // `X` doesn't equal stored's literal `*`. So no match.
            expect(topicFilterMatches('fooXbar', 'foo*bar')).toBe(false);
        });

        it('mixed: user middle-wildcards interact with stored trailing-wildcards', () => {
            // Stored `B*/T*` — both `*`s are trailing within their levels →
            // both wildcards. Stored matches anything starting with B in
            // level 1 and anything starting with T in level 2.
            expect(topicFilterMatches('BULK/TEST', 'B*/T*')).toBe(true);
            // User `B*/*` against stored `B*/T*` — user middle wildcard
            // intersects with stored trailing wildcard.
            expect(topicFilterMatches('B*/*', 'B*/T*')).toBe(true);
        });

        it('> on stored side keeps its multi-level semantics', () => {
            expect(topicFilterMatches('foo/bar/baz', 'foo/>')).toBe(true);
            expect(topicFilterMatches('foo', 'foo/>')).toBe(false);
        });

        it('case sensitivity preserved (Solace topics are case-sensitive)', () => {
            expect(topicFilterMatches('B*', 'bulkq')).toBe(false);
            expect(topicFilterMatches('b*', 'BULKQ')).toBe(false);
        });
    });
});
