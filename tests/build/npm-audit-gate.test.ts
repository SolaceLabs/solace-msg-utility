import { describe, it, expect, vi } from 'vitest';
import { classify } from '../../scripts/npm-audit-gate.mjs';

const BRACES = {
    source: 1101234,
    name: 'braces',
    title: 'braces vulnerable to stack-exhaustion denial of service through deeply nested patterns',
    url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
    severity: 'high',
    range: '<=3.0.3',
};

/** An `npm audit --json` v2 report: braces reached through micromatch. */
function report(advisory: Record<string, unknown> = BRACES) {
    return {
        auditReportVersion: 2,
        vulnerabilities: {
            braces: { name: 'braces', severity: advisory.severity, via: [advisory] as unknown[] },
            micromatch: { name: 'micromatch', severity: advisory.severity, via: ['braces'] as unknown[] },
        },
    };
}

describe('npm-audit-gate -- classify', () => {
    it('is fatal when a release outside the advisory range exists', () => {
        const lookup = vi.fn(() => false);
        const { fatal, unfixable } = classify(report(), lookup);
        expect(fatal.map(a => a.name)).toEqual(['braces']);
        expect(unfixable).toEqual([]);
        expect(lookup).toHaveBeenCalledWith('braces', '<=3.0.3');
    });

    it('warns instead when the latest release is still inside the range', () => {
        const { fatal, unfixable } = classify(report(), () => true);
        expect(fatal).toEqual([]);
        expect(unfixable).toEqual([{
            name: 'braces', range: '<=3.0.3', severity: 'high', title: BRACES.title, url: BRACES.url,
        }]);
    });

    it('ignores advisories below high, matching --audit-level=high', () => {
        const lookup = vi.fn(() => false);
        expect(classify(report({ ...BRACES, severity: 'moderate' }), lookup)).toEqual({ fatal: [], unfixable: [] });
        expect(lookup).not.toHaveBeenCalled();
    });

    it('counts an advisory reached through two packages once', () => {
        const r = report();
        r.vulnerabilities.micromatch.via = [BRACES];
        const lookup = vi.fn(() => false);
        expect(classify(r, lookup).fatal).toHaveLength(1);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('passes a clean report', () => {
        expect(classify({ auditReportVersion: 2, vulnerabilities: {} }, () => false))
            .toEqual({ fatal: [], unfixable: [] });
    });

    it('fails loud on an npm audit error report', () => {
        const r = { error: { code: 'ENOAUDIT', summary: 'Your configured registry does not support audit requests.' } };
        expect(() => classify(r, () => false)).toThrow(/ENOAUDIT.*registry access/);
    });

    it('fails loud on output that is not an audit v2 report', () => {
        expect(() => classify({ advisories: {} }, () => false)).toThrow(/no "vulnerabilities" object/);
    });

    it('rejects a package name that could read as an npm flag and never looks it up', () => {
        const lookup = vi.fn(() => false);
        expect(() => classify(report({ ...BRACES, name: '--registry=http://evil' }), lookup))
            .toThrow(/unexpected package name or range/);
        expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects a range carrying characters outside semver grammar', () => {
        const lookup = vi.fn(() => false);
        expect(() => classify(report({ ...BRACES, range: '<=3.0.3 && calc' }), lookup))
            .toThrow(/unexpected package name or range/);
        expect(lookup).not.toHaveBeenCalled();
    });
});
