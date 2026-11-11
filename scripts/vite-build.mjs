#!/usr/bin/env node
/**
 * Vite build wrapper.
 *
 * Vite's CLI parser (CAC) rejects unknown options, so `--variant=<name>` and
 * `--out-filename=<name>` can't be passed directly. This wrapper strips them
 * from argv before spawning vite, and forwards them to `vite.config.ts` via
 * private env vars (`__VITE_VARIANT`, `__VITE_OUT_FILENAME`).
 *
 * Usage:
 *   node scripts/vite-build.mjs [--variant=<name>] [--out-filename=<name>] [vite args...]
 *
 * Examples:
 *   node scripts/vite-build.mjs --variant=min --out-filename=min.html
 *   node scripts/vite-build.mjs --variant=admin --out-filename=solAdmin.html
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
// Vite's `exports` map doesn't expose `./bin/vite.js`, so resolve via its
// package.json's `bin.vite` field instead. Works on every platform without
// the `.cmd` shim and avoids `shell: true` (DEP0190).
const vitePkgPath = require.resolve('vite/package.json');
const vitePkg = JSON.parse(readFileSync(vitePkgPath, 'utf-8'));
const viteBin = path.join(path.dirname(vitePkgPath), vitePkg.bin.vite);

const CUSTOM_FLAGS = {
    'variant': '__VITE_VARIANT',
    'out-filename': '__VITE_OUT_FILENAME',
    'show-payload': '__VITE_SHOW_PAYLOAD'
};

const argv = process.argv.slice(2);
const passthrough = [];
const env = { ...process.env };

for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let consumed = false;
    for (const [flag, envKey] of Object.entries(CUSTOM_FLAGS)) {
        if (arg === `--${flag}`) {
            env[envKey] = argv[++i] ?? '';
            consumed = true;
            break;
        }
        if (arg.startsWith(`--${flag}=`)) {
            env[envKey] = arg.slice(flag.length + 3);
            consumed = true;
            break;
        }
    }
    if (!consumed) passthrough.push(arg);
}

// Invoke vite's JS entry directly with the current Node binary — avoids the
// platform-specific .cmd shim and the `shell: true` deprecation (DEP0190).
const child = spawn(process.execPath, [viteBin, 'build', ...passthrough], {
    stdio: 'inherit',
    env
});
// A child killed by a signal (the OOM killer, Ctrl-C) ends with code null and
// the signal's name: that is a failed build, never exit 0, or the `&&` chain in
// package.json's `build` carries on and check:bundles inspects whatever an
// earlier run left in dist/ (emptyOutDir is off).
child.on('exit', (code, signal) => {
    if (signal) console.error(`vite build was killed by ${signal}`);
    process.exit(signal ? 1 : (code ?? 1));
});
// A spawn that never starts (EACCES, a missing binary) is an 'error' event and
// no 'exit'.
child.on('error', (err) => {
    console.error(`vite build could not start: ${err.message}`);
    process.exit(1);
});
