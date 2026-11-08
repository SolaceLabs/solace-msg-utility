import { describe, it, expect } from 'vitest';
import { coerceConnConfig, resolveConnTabs, DEFAULT_CONN_CONFIG } from '../../../src/core/connections/conn-modes';

describe('core/connections/conn-modes — resolveConnTabs', () => {
    it('null config (non-hosted / static) → Direct only', () => {
        expect(resolveConnTabs(null)).toEqual(['direct']);
    });

    it("connModes 'direct' → ['direct']", () => {
        expect(resolveConnTabs({ connModes: 'direct', defaultConn: 'direct' })).toEqual(['direct']);
        // defaultConn is irrelevant for a single-mode config.
        expect(resolveConnTabs({ connModes: 'direct', defaultConn: 'provisioned' })).toEqual(['direct']);
    });

    it("connModes 'provisioned' -> ['provisioned'] (entitlements binding, no Direct escape)", () => {
        expect(resolveConnTabs({ connModes: 'provisioned', defaultConn: 'direct' })).toEqual(['provisioned']);
    });

    it("connModes 'both' orders by defaultConn", () => {
        expect(resolveConnTabs({ connModes: 'both', defaultConn: 'direct' })).toEqual(['direct', 'provisioned']);
        expect(resolveConnTabs({ connModes: 'both', defaultConn: 'provisioned' })).toEqual(['provisioned', 'direct']);
    });
});

describe('core/connections/conn-modes — coerceConnConfig', () => {
    it('keeps a valid config', () => {
        expect(coerceConnConfig({ hosted: true, connModes: 'both', defaultConn: 'provisioned' }))
            .toEqual({ connModes: 'both', defaultConn: 'provisioned' });
    });

    it('falls back invalid/missing fields to the Direct-only default', () => {
        expect(coerceConnConfig({ connModes: 'nope', defaultConn: 'nope' })).toEqual(DEFAULT_CONN_CONFIG);
        // The retired value is no longer a mode: Direct only.
        expect(coerceConnConfig({ connModes: 'managed', defaultConn: 'managed' })).toEqual(DEFAULT_CONN_CONFIG);
        expect(coerceConnConfig({ connModes: 'provisioned' })).toEqual({ connModes: 'provisioned', defaultConn: 'direct' });
        expect(coerceConnConfig({})).toEqual(DEFAULT_CONN_CONFIG);
    });

    it('tolerates non-object input (null, number, string)', () => {
        expect(coerceConnConfig(null)).toEqual(DEFAULT_CONN_CONFIG);
        expect(coerceConnConfig(42)).toEqual(DEFAULT_CONN_CONFIG);
        expect(coerceConnConfig('both')).toEqual(DEFAULT_CONN_CONFIG);
    });
});
