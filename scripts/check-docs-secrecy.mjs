/**
 * Documentation secrecy check.
 *
 * The credential transform in `src/core/encode.ts` is undocumented by policy:
 * docs may say a value is "packed" / "unpacked" with the deployment's "site
 * seed", and may describe the *posture* (just-in-time unpack, non-extractable
 * key, plaintext never stored), but must never describe the construction.
 *
 * WHAT THIS IS: a guard against *accidental documentation* — a contributor
 * explaining the mechanism in an architecture doc because it seemed helpful.
 * WHAT THIS IS NOT: a secret-scanner or a security boundary. The denylist
 * below is itself in the repo, the source is in the repo, and anyone reading
 * the bundle can see what it does. It buys tidiness of disclosure, nothing more.
 *
 * Failures print FILE:LINE and the rule that tripped — never the surrounding
 * prose, so a CI log never becomes the leak the check exists to prevent.
 *
 * A missing target, or a scan that finds no markdown at all, is an ERROR, never
 * a pass: the check once resolved a wrong root on Linux and "passed" having
 * read 0 files.
 *
 * No `#!` line, on purpose: tests import this file, and Vite's SSR transform
 * only recognises an LF-terminated hashbang (see scripts/npm-audit-gate.mjs).
 *
 * Usage: npm run check:docs (any working directory: the root comes from this file's location)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Files and trees to scan, relative to the repo root. Directories are walked for `.md` only. Every entry must exist. */
const TARGETS = ['docs', 'README.md', 'CLAUDE.md'];

/**
 * Terms that identify a cryptographic primitive or construction. Deliberately
 * broad: a wide net across the whole family reveals nothing about which member
 * is in use, whereas a narrow list would point straight at it.
 *
 * Word-boundary matched, case-insensitive. Anything that has a legitimate,
 * non-algorithmic use in these docs (TLS, HTTPS, "the proxy does zero crypto",
 * base64 as a wire encoding, "plaintext" in the threat model) stays OFF the list.
 */
const RULES = [
    { id: 'cipher-family', re: /\b(aes|aes-?(gcm|cbc|ctr|ecb)|chacha ?20|poly1305|salsa20|blowfish|3?des|rc4)\b/i },
    { id: 'digest-family', re: /\b(md5|sha-?(1|224|256|384|512)|blake2b?|keccak)\b/i },
    { id: 'mac-family', re: /\b(hmac|cmac|gmac|poly-?mac)\b/i },
    { id: 'kdf-family', re: /\b(pbkdf2|hkdf|scrypt|bcrypt|argon2|key derivation|derived key|derive[sd]? (a |the )?key)\b/i },
    { id: 'construction', re: /\b(block cipher|stream cipher|keystream|one-?time pad|mode of operation|pkcs\s?#?\d|padding scheme)\b/i },
    { id: 'parameters', re: /\b(nonce|initialisation vector|initialization vector|\biv\b|auth(entication)? tag|ciphertext|salted|\bsalt\b)\b/i },
    { id: 'bitwise', re: /\b(xor(ed|ing)?|bitwise (and|or|not)|rotate left|rotate right)\b/i },
];

/**
 * Contexts where naming an algorithm is operationally necessary and says
 * nothing about the credential transform: a TLS certificate fingerprint an
 * operator must pin, and a container image pinned by digest. Checked first —
 * a line matching one of these is skipped entirely.
 */
const ALLOWED = [
    /sha-?256 fingerprint/i,
    /\bsha256:[0-9a-f]{8,}/i,
];

/**
 * The repo root: this file lives in `<root>/scripts/`. `fileURLToPath`, never
 * `new URL(...).pathname` — slicing that path's leading `/` (meant to drop the
 * one before a Windows drive letter) left a cwd-relative root on Linux.
 */
export function repoRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/** Recursively collect markdown files under a target path. A missing target throws. */
function collect(root, target) {
    const abs = path.join(root, target);
    let st;
    try {
        st = statSync(abs);
    } catch (err) {
        throw new Error(
            `"${target}" not found under ${root} (${err.code}). Every TARGETS entry in ` +
            'scripts/check-docs-secrecy.mjs must exist — update the list if the file moved.',
            { cause: err },
        );
    }
    if (st.isFile()) return abs.endsWith('.md') ? [abs] : [];
    return readdirSync(abs).flatMap(entry => collect(root, path.join(target, entry)));
}

/**
 * Check one file's text. One `rel:line  [rule-id]` per hit — never the line itself.
 *
 * @param {string} rel   repo-relative path, as reported
 * @param {string} text  file contents
 * @returns {string[]}
 */
export function scanText(rel, text) {
    const violations = [];
    text.split(/\r?\n/).forEach((line, i) => {
        if (ALLOWED.some(re => re.test(line))) return;
        for (const rule of RULES) {
            if (rule.re.test(line)) violations.push(`${rel}:${i + 1}  [${rule.id}]`);
        }
    });
    return violations;
}

/**
 * Check every markdown file under `targets`.
 *
 * @param {string} root  directory the targets are relative to
 * @param {string[]} [targets]
 * @returns {{ files: string[], violations: string[] }}  files repo-relative, `/`-separated
 */
export function scanDocs(root, targets = TARGETS) {
    const files = targets
        .flatMap(target => collect(root, target))
        .map(file => path.relative(root, file).replace(/\\/g, '/'));
    if (!files.length) {
        throw new Error(
            `scanned 0 markdown files under ${root} (targets: ${targets.join(', ')}) — a pass on ` +
            'nothing proves nothing. Check TARGETS in scripts/check-docs-secrecy.mjs.',
        );
    }
    const violations = files.flatMap(rel => scanText(rel, readFileSync(path.join(root, rel), 'utf-8')));
    return { files, violations };
}

/**
 * The CLI: scan, report, and return the exit code. Never throws — a scan error
 * (missing target, empty scan, unreadable file) is one ERROR line and a failure.
 *
 * @param {string} [root]
 * @returns {0 | 1}
 */
export function main(root = repoRoot()) {
    let result;
    try {
        result = scanDocs(root);
    } catch (err) {
        console.error(`Documentation secrecy check ERROR: ${err.message}`);
        return 1;
    }
    const { files, violations } = result;
    if (violations.length) {
        console.error(
            `Documentation secrecy check FAILED: ${violations.length} line(s) describe a cryptographic\n` +
            'construction. The credential transform is undocumented by policy — say what a value IS\n' +
            '("packed with the deployment site seed") and what the posture guarantees, never how.\n',
        );
        violations.forEach(v => console.error(`  ${v}`));
        return 1;
    }
    console.log(`Documentation secrecy check passed (${files.length} files).`);
    return 0;
}

// Basename, not full-path, comparison (as in npm-audit-gate.mjs): a drive-letter
// case or symlink mismatch on Windows must never make the check skip itself and pass.
if (process.argv[1] && path.basename(process.argv[1]) === path.basename(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
