import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot, scanText, scanDocs, main } from '../../scripts/check-docs-secrecy.mjs';

/** The real repo root, from this file's own location (tests/build/). */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Clean stand-ins for the three real targets. */
const CLEAN = { 'docs/guide.md': 'Clean.\n', 'README.md': 'Clean.\n', 'CLAUDE.md': 'Clean.\n' };

const made: string[] = [];
afterEach(() => {
    made.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

/** A throwaway root holding `files` (root-relative path -> contents). */
function fixture(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-secrecy-'));
    made.push(root);
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
}

describe('check-docs-secrecy -- repoRoot', () => {
    it('resolves the real repo root from its own location, whatever the working directory', () => {
        // The old root sliced the URL pathname, which on Linux resolved against cwd.
        const cwd = vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());
        const root = repoRoot();
        cwd.mockRestore();
        expect(path.isAbsolute(root)).toBe(true);
        expect(path.relative(REPO, root)).toBe('');
    });

    it('finds README.md, CLAUDE.md and the docs tree from that root', () => {
        const { files } = scanDocs(repoRoot());
        expect(files).toEqual(expect.arrayContaining(['README.md', 'CLAUDE.md']));
        expect(files.some(f => f.startsWith('docs/'))).toBe(true);
    });
});

describe('check-docs-secrecy -- scanText', () => {
    it('flags a forbidden term as file:line and rule id, never the prose', () => {
        expect(scanText('docs/ops.md', 'Intro\r\nChecksums use md5 here.\r\n'))
            .toEqual(['docs/ops.md:2  [digest-family]']);
    });

    it('passes clean text, including TLS and base64 wording', () => {
        expect(scanText('README.md', 'The gateway terminates TLS.\nValues travel as base64.\n')).toEqual([]);
    });

    it('skips an allow-listed certificate fingerprint line', () => {
        expect(scanText('docs/deployment.md', 'Pin the SHA-256 fingerprint of the server certificate.')).toEqual([]);
    });
});

describe('check-docs-secrecy -- scanDocs', () => {
    it('walks target trees for .md only and reports root-relative / paths', () => {
        const root = fixture({
            'README.md': 'Clean.\n',
            'docs/guide.md': 'Clean.\n',
            'docs/deep/ops.md': 'One\nTwo\nChecksums use md5.\n',
            'docs/notes.txt': 'md5\n',
        });
        const { files, violations } = scanDocs(root, ['docs', 'README.md']);
        expect([...files].sort()).toEqual(['README.md', 'docs/deep/ops.md', 'docs/guide.md']);
        expect(violations).toEqual(['docs/deep/ops.md:3  [digest-family]']);
    });

    it('fails loud when one configured target is missing even though the others exist', () => {
        const root = fixture({ 'docs/guide.md': 'Clean.\n' });
        expect(() => scanDocs(root, ['docs', 'README.md'])).toThrow(/"README\.md" not found under .*ENOENT/);
    });

    it('fails loud when the targets hold no markdown at all', () => {
        const root = fixture({ 'docs/notes.txt': 'Clean.\n' });
        expect(() => scanDocs(root, ['docs'])).toThrow(/scanned 0 markdown files/);
    });
});

describe('check-docs-secrecy -- main', () => {
    it('fails with file:line and rule id only, never the offending prose', () => {
        const root = fixture({ ...CLEAN, 'docs/ops.md': 'Intro\nChecksums use md5 here.\n' });
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(main(root)).toBe(1);
        const out = error.mock.calls.flat().join('\n');
        expect(out).toMatch(/^Documentation secrecy check FAILED: 1 line\(s\)/);
        expect(out).toContain('\n  docs/ops.md:2  [digest-family]');
        expect(out).not.toContain('Checksums');
    });

    it('passes and reports how many files it read', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(main(fixture(CLEAN))).toBe(0);
        expect(log).toHaveBeenCalledWith('Documentation secrecy check passed (3 files).');
    });

    it('fails with one ERROR line under a wrong root instead of passing on 0 files', () => {
        const root = path.join(fixture(CLEAN), 'not-the-repo');
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(main(root)).toBe(1);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toMatch(/^Documentation secrecy check ERROR: "docs" not found under .*ENOENT/);
        expect(log).not.toHaveBeenCalled();
    });
});
