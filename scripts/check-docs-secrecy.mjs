#!/usr/bin/env node
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
 * Usage: node scripts/check-docs-secrecy.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');

/** Files and trees to scan. Directories are walked for `.md` only. */
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

/** Recursively collect markdown files under a target path. */
function collect(target) {
    const abs = path.join(ROOT, target);
    let st;
    try {
        st = statSync(abs);
    } catch {
        // A target that isn't there yet is not a failure — the check is about
        // what the docs SAY, not about which of them exist.
        return [];
    }
    if (st.isFile()) return abs.endsWith('.md') ? [abs] : [];
    return readdirSync(abs).flatMap(entry => collect(path.join(target, entry)));
}

const files = TARGETS.flatMap(collect);
const violations = [];

for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    readFileSync(file, 'utf-8').split(/\r?\n/).forEach((line, i) => {
        if (ALLOWED.some(re => re.test(line))) return;
        for (const rule of RULES) {
            if (rule.re.test(line)) violations.push(`${rel}:${i + 1}  [${rule.id}]`);
        }
    });
}

if (violations.length) {
    console.error(
        `Documentation secrecy check FAILED: ${violations.length} line(s) describe a cryptographic\n` +
        'construction. The credential transform is undocumented by policy — say what a value IS\n' +
        '("packed with the deployment site seed") and what the posture guarantees, never how.\n',
    );
    violations.forEach(v => console.error(`  ${v}`));
    process.exit(1);
}

console.log(`Documentation secrecy check passed (${files.length} files).`);
