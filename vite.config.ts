import { defineConfig, type PluginOption } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import { moduleRegistryPlugin, activeModuleIds } from './scripts/module-registry-plugin.mjs';

/**
 * The git tag is the single source of version truth — `scripts/dev.sh` derives
 * it (`git describe`, or `VERSION` exported from the tag ref in CI) and exports
 * `APP_VERSION`; the Dockerfile takes it as a build-arg because git is not
 * available inside the image build.
 *
 * The leading `v` is stripped because the kernel's startup line already prints
 * one — the same convention the image tags use. `0.0.0-dev` is a deliberately
 * implausible placeholder: a build that lost the injection should look wrong,
 * not merely out of date.
 */
const appVersion: string = (process.env.APP_VERSION ?? '0.0.0-dev').replace(/^v/, '');

/**
 * Inject the ACTIVE VARIANT's module templates as
 * `<template data-module-id="<id>">...</template>` blocks at the
 * `<!-- @module-templates -->` marker in the shell HTML.
 *
 * Scoped to the active variant (not every dir on disk) so a non-active module's
 * markup — e.g. the managed modules in a standard build — never leaks into the
 * shipped HTML. Mirrors the manifest-driven module registry: the variant `.ts`
 * is authoritative for both bundled code and injected templates.
 *
 * Output is alphabetized for stable build diffs; runtime kernel lookups are
 * by id (querySelector), so order is cosmetic.
 */
function injectModuleTemplates(variant: string | undefined): PluginOption {
    return {
        name: 'inject-module-templates',
        transformIndexHtml(html) {
            const modulesDir = path.resolve(__dirname, 'src/modules');
            const ids = activeModuleIds(__dirname, variant)
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
 * Admin variant CSS swap: the app statically imports `./css/main.css` from
 * `src/main.ts`. For the `admin` build, redirect that import to
 * `./css/main-admin.css` (which `@import`s main.css plus the admin module
 * stylesheets) so admin CSS ships only in solAdmin.html. The CSS-level
 * `@import './main.css'` inside main-admin.css is resolved by Vite's CSS
 * pipeline (not this resolver), so there's no redirect loop.
 */
function cssVariantRedirect(variant: string | undefined): PluginOption {
    return {
        name: 'css-variant-redirect',
        enforce: 'pre',
        resolveId(source, importer) {
            if (variant !== 'admin' || !importer) return null;
            const cleaned = source.replace(/\.css$/, '');
            if (!cleaned.endsWith('/css/main') && cleaned !== './css/main') return null;
            const target = path.resolve(__dirname, 'src/css/main-admin.css');
            return this.resolve(target, importer, { skipSelf: true });
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
    // ONE entry. `src/core/boot.ts` is a no-op seam that `src/main.ts` calls
    // before starting the kernel; in mock mode it resolves to the in-browser
    // broker instead, which installs `window.solace`, intercepts `fetch` for
    // SEMP / /hosted / /managed, and mounts the demo control panel.
    //
    // Everything downstream then runs the REAL code: solace-client, semp-client,
    // solace-publisher, semp-discovery, queue-copy's verify + copy engines and
    // the subscription parser all talk to the emulator exactly as they talk to a
    // broker. That is deliberate — the seven canned `*-mock` files this replaced
    // could each drift from the code they stood in for, and two of them had.
    { from: './core/boot', to: './mock-broker/boot' },
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
            moduleRegistryPlugin({ root: __dirname, variant }) as PluginOption,
            cssVariantRedirect(variant),
            isMock && serviceMockRedirect(),
            injectModuleTemplates(variant),
            viteSingleFile(),
            outputName && renameHtmlAsset('index.html', outputName)
        ].filter(Boolean) as PluginOption[],
        define: {
            __APP_VERSION__: JSON.stringify(appVersion),
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
