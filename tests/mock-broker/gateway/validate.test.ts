// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validUrlPath } from '../../../src/mock-broker/gateway/validate';

/**
 * A connection's URL path (go-web-proxy/store.go validURLPath): the table
 * go-web-proxy/store_test.go > "TestStore_URLPath" holds the gateway to. What
 * a save and a Message VPN lookup answer for a refused path is pinned for both
 * gateways by the contract (tests/mock-broker/gateway/contract.test.ts, the
 * cases "connections: a URL path is kept on its part, and one the gateway
 * cannot join into a URL is refused" and "relay: a connection's URL path
 * stands in front of the path asked for").
 */
describe('mock-broker/gateway/validate -- a connection\'s URL path', () => {
    it.each([
        '', '/broker1', '/a/b-c/d_e.f~g', '/...', `/${'a'.repeat(254)}`,
    ])('takes %j', path => {
        expect(validUrlPath(path)).toBe(true);
    });

    it.each([
        'broker1', '/', '/broker1/', '//broker1', '/a//b',
        '/a/../b', '/./a', '/a/..',
        '/a b', '/a%2Fb', '/a?x=1', '/a#b', '/a;b', '/a\\b', '/a\u0007',
        `/${'a'.repeat(255)}`,
    ])('refuses %j', path => {
        expect(validUrlPath(path)).toBe(false);
    });
});
