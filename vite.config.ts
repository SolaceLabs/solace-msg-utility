import { defineConfig, type PluginOption } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

const pkgVersion: string = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
).version;

/**
 * Inject every module template found on disk as a
 * `<template data-module-id="<id>">...</template>` block at the
 * `<!-- @module-templates -->` marker in the shell HTML.
 *
 * The disk scan is authoritative for "what's available to inject" — it never
 * fails on orphan directories. The active variant manifest in
 * `src/variants/_active.ts` (resolved at runtime by `src/registry.ts`) decides
 * which of these templates actually get installed by the kernel. A template
 * that's injected but not in the variant just sits inert in the DOM.
 *
 * Output is alphabetized for stable build diffs; runtime kernel lookups are
 * by id (querySelector), so order is cosmetic.
 */
function injectModuleTemplates(): PluginOption {
    return {
        name: 'inject-module-templates',
        transformIndexHtml(html) {
            const modulesDir = path.resolve(__dirname, 'src/modules');
            const ids = fs.readdirSync(modulesDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name)
                .filter(id => fs.existsSync(path.join(modulesDir, id, 'index.html')))
                .sort();
            const blocks = ids.map(id => {
                const content = fs.readFileSync(path.join(modulesDir, id, 'index.html'), 'utf-8');
                return `    <template data-module-id="${id}">\n${content}\n    </template>`;
            });
            return html.replace('<!-- @module-templates -->', blocks.join('\n\n'));
        }
    };
}

/**
 * Variant selection: when a non-empty `variant` is passed, redirect the
 * registry's `import { ACTIVE_MODULES } from './variants/_active'` to
 * `./variants/<variant>.ts`. The default re-export inside `_active.ts` (which
 * points at `./full`) handles the no-flag case so dev/prod builds Just Work.
 *
 * Driven from `defineConfig` via the `--variant` CLI flag — see `readCliFlag`.
 * The named variant file must exist under `src/variants/`.
 */
function variantRedirect(variant: string | undefined): PluginOption {
    return {
        name: 'variant-redirect',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!variant || !importer) return null;
            // Match the registry's exact import: `./variants/_active`. Avoid
            // catching arbitrary other paths with `_active` in them.
            const cleaned = source.replace(/\.[jt]s$/, '');
            if (!cleaned.endsWith('/variants/_active') && cleaned !== './variants/_active') return null;
            const variantsDir = path.resolve(__dirname, 'src/variants');
            const target = path.join(variantsDir, `${variant}.ts`);
            if (!fs.existsSync(target)) {
                throw new Error(
                    `[variant-redirect] --variant=${variant} requested but ` +
                    `${target} does not exist. Create the file or pick a different variant.`
                );
            }
            return this.resolve(target, importer, { skipSelf: true });
        }
    };
}

interface MockRedirect {
    from: string;
    to: string;
    /**
     * Optional substring the importer path must contain for the redirect to
     * apply. Use when `from` is a generic relative path (like `./service`)
     * shared by multiple modules — without scoping, the redirect would catch
     * the wrong importer and break unrelated modules.
     */
    importerContains?: string;
}

const MOCK_REDIRECTS: MockRedirect[] = [
    // Broker-side factories live in src/core/services/ (lifted in Stage B of the
    // connection-libraries-to-core refactor). Feature modules import them via the
    // relative path `../../core/services/<name>` — same depth for every module
    // under src/modules/<id>/, so one entry per factory covers all callers.
    { from: '../../core/services/solace-client', to: '../../core/services/solace-client-mock' },
    { from: '../../core/services/solace-publisher', to: '../../core/services/solace-publisher-mock' },
    { from: '../../core/services/semp-client', to: '../../core/services/semp-client-mock' },
    // SEMP discovery lifted to core/services/ in Stage C; queue-discovery's
    // wrapper now delegates to the core factory, so the mock-redirect
    // intercepts at the core level. The old queue-discovery-local
    // service-mock.ts was deleted in the same stage.
    { from: '../../core/services/semp-discovery', to: '../../core/services/semp-discovery-mock' },
    // Queue-copy's source-side path uses session.createQueueBrowser, which the
    // demo-bundle's mock Solace session does not expose. Two module-relative
    // redirects swap the verify + copy engines for canned implementations
    // that don't touch the SDK — the rest of the module (state, ui, modal
    // orchestration) runs unchanged.
    { from: './service-verify', to: './service-verify-mock' },
    { from: './service-copy', to: './service-copy-mock' },
    // Queue-subscription-explorer's service POSTs SEMP v1 RPC bodies which the
    // demo bundle has no mock for. Redirect the local `./service` import to a
    // sibling that yields canned rows. Scoped to this module so it doesn't
    // catch other modules (queue-discovery, queue-browser) that also import
    // a local `./service`.
    { from: './service', to: './service-mock', importerContains: 'queue-subscription-explorer' }
];

/**
 * In mock mode, redirect production service imports to their *-mock siblings.
 * Applied only when `mode === 'mock'`. Module source files stay untouched.
 */
function serviceMockRedirect(): PluginOption {
    return {
        name: 'service-mock-redirect',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!importer) return null;
            const clean = source.replace(/\.js$/, '');
            const match = MOCK_REDIRECTS.find(r =>
                r.from === clean &&
                (!r.importerContains || importer.includes(r.importerContains))
            );
            if (!match) return null;
            const ext = source.endsWith('.js') ? '.js' : '';
            return this.resolve(`${match.to}${ext}`, importer, { skipSelf: true });
        }
    };
}

/**
 * Rename the emitted `index.html` asset to a custom filename inside the bundle
 * so Vite writes `dist/<to>` directly — no post-build fs rename. Used by mock
 * mode (`mock.html`) and by the `VITE_OUTPUT_NAME` override. `enforce: 'post'`
 * is required so this runs after Vite's HTML plugin has added the asset.
 */
function renameHtmlAsset(from: string, to: string): PluginOption {
    return {
        name: 'rename-html-asset',
        enforce: 'post',
        generateBundle(_opts, bundle) {
            const asset = bundle[from];
            if (asset && asset.type === 'asset') {
                asset.fileName = to;
                bundle[to] = asset;
                delete bundle[from];
            }
        }
    };
}

/**
 * Read a build-input parameter forwarded by `scripts/vite-build.mjs`.
 *
 * Vite's CLI parser (CAC) rejects unknown options, so the wrapper strips our
 * custom flags from argv and stashes them in private env vars before spawning
 * vite. The user-facing surface is still `--variant=<name>` /
 * `--out-filename=<name>` on the npm script invocation.
 */
function readBuildInput(envKey: string): string | undefined {
    return process.env[envKey]?.trim() || undefined;
}

export default defineConfig(({ mode }) => {
    const isMock = mode === 'mock';
    // `--out-filename=<name>` overrides the emitted HTML filename. Bare name
    // (no extension) is allowed — `.html` is appended. Takes precedence over
    // the mock-mode default of `mock.html`.
    const rawOutputName = readBuildInput('__VITE_OUT_FILENAME');
    const outputName = rawOutputName
        ? (rawOutputName.endsWith('.html') ? rawOutputName : `${rawOutputName}.html`)
        : (isMock ? 'mock.html' : null);
    // `--variant=<name>` selects which manifest under `src/variants/` the
    // registry resolves at build time. Unset → the default re-export in
    // `_active.ts` wins (currently `./full`).
    const variant = readBuildInput('__VITE_VARIANT');
    // `--show-payload=false` ships the "no-payload" flavor of queue-browser (body
    // never decoded into state, payload DOM removed at install). Default 'true' is
    // the current behavior. Baked into `import.meta.env.VITE_SHOW_PAYLOAD` so the
    // module's `showPayload()` reads it at runtime. (Tests stub it via vi.stubEnv.)
    const showPayloadInput = readBuildInput('__VITE_SHOW_PAYLOAD');
    return {
        root: 'src',
        plugins: [
            variantRedirect(variant),
            isMock && serviceMockRedirect(),
            injectModuleTemplates(),
            viteSingleFile(),
            outputName && renameHtmlAsset('index.html', outputName)
        ].filter(Boolean) as PluginOption[],
        define: {
            __APP_VERSION__: JSON.stringify(pkgVersion),
            'import.meta.env.VITE_SHOW_PAYLOAD': JSON.stringify(showPayloadInput ?? 'true')
        },
        build: {
            target: 'esnext',
            outDir: '../dist',
            emptyOutDir: false,
            cssCodeSplit: false,
            rollupOptions: {
                // Vite auto-detects index.html in `root` (src) as the entry.
                output: {
                    manualChunks: undefined,
                    inlineDynamicImports: true
                }
            }
        }
    };
});
