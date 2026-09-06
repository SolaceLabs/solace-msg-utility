import { describe, it, expect } from 'vitest';
import { coerceConnConfig, resolveConnTabs, DEFAULT_CONN_CONFIG } from '../../../src/core/connections/conn-modes';

describe('core/connections/conn-modes — resolveConnTabs', () => {
    it('null config (non-hosted / static) → Direct only', () => {
        expect(resolveConnTabs(null)).toEqual(['direct']);
    });

    it("connModes 'direct' → ['direct']", () => {
        expect(resolveConnTabs({ connModes: 'direct', defaultConn: 'direct' })).toEqual(['direct']);
        // defaultConn is irrelevant for a single-mode config.
        expect(resolveConnTabs({ connModes: 'direct', defaultConn: 'managed' })).toEqual(['direct']);
    });

    it("connModes 'managed' → ['managed'] (RBAC-enforced, no Direct escape)", () => {
        expect(resolveConnTabs({ connModes: 'managed', defaultConn: 'direct' })).toEqual(['managed']);
    });

    it("connModes 'both' orders by defaultConn", () => {
        expect(resolveConnTabs({ connModes: 'both', defaultConn: 'direct' })).toEqual(['direct', 'managed']);
        expect(resolveConnTabs({ connModes: 'both', defaultConn: 'managed' })).toEqual(['managed', 'direct']);
    });
});

describe('core/connections/conn-modes — coerceConnConfig', () => {
    it('keeps a valid config', () => {
        expect(coerceConnConfig({ hosted: true, connModes: 'both', defaultConn: 'managed' }))
            .toEqual({ connModes: 'both', defaultConn: 'managed' });
    });

    it('falls back invalid/missing fields to the Direct-only default', () => {
        expect(coerceConnConfig({ connModes: 'nope', defaultConn: 'nope' })).toEqual(DEFAULT_CONN_CONFIG);
        expect(coerceConnConfig({ connModes: 'managed' })).toEqual({ connModes: 'managed', defaultConn: 'direct' });
        expect(coerceConnConfig({})).toEqual(DEFAULT_CONN_CONFIG);
    });

    it('tolerates non-object input (null, number, string)', () => {
        expect(coerceConnConfig(null)).toEqual(DEFAULT_CONN_CONFIG);
        expect(coerceConnConfig(42)).toEqual(DEFAULT_CONN_CONFIG);
        expect(coerceConnConfig('both')).toEqual(DEFAULT_CONN_CONFIG);
    });
});
