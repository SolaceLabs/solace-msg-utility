import { defineConfig, type PluginOption } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import { moduleRegistryPlugin, activeModuleIds, activeModuleEntries, readModuleTemplate, variantNeedsVendorScripts, stripVendorBlocks } from './scripts/module-registry-plugin.mjs';

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
 * markup never leaks into the shipped HTML, and entry-aware: a module the
 * variant maps through `MODULE_ENTRIES` gets its entry template (e.g. the
 * connections module's `index.managed.html` in the managed build), composed by
 * `readModuleTemplate` exactly as the tests' `loadModuleDOM` composes it.
 * Mirrors the manifest-driven module registry: the variant `.ts` is
 * authoritative for both bundled code and injected templates.
 *
 * Output is alphabetized for stable build diffs; runtime kernel lookups are
 * by id (querySelector), so order is cosmetic.
 *
 * A variant manifest that exports `NEEDS_VENDOR_SCRIPTS = false` (the admin
 * variant) also loses the shell's `@vendor` blocks: the Solace SDK and JSZip
 * loaders and the library banner.
 */
function injectModuleTemplates(variant: string | undefined): PluginOption {
    return {
        name: 'inject-module-templates',
        transformIndexHtml(html) {
            const entries = activeModuleEntries(__dirname, variant);
            const blocks = activeModuleIds(__dirname, variant)
                .sort()
                .map(id => ({ id, content: readModuleTemplate(__dirname, id, entries[id]) }))
                .filter(({ content }) => content !== null)
                .map(({ id, content }) => `    <template data-module-id="${id}">\n${content}\n    </template>`);
            const composed = html.replace('<!-- @module-templates -->', blocks.join('\n\n'));
            // A variant that declares NEEDS_VENDOR_SCRIPTS = false ships no SDK / JSZip loader or banner.
            return variantNeedsVendorScripts(__dirname, variant) ? composed : stripVendorBlocks(composed);
        }
    };
}

/**
 * Variant selection: when a non-empty `variant` is passed, redirect the
 * registry's `import { ACTIVE_MODULES } from './variants/_active'` to
 * `./variants/<variant>.ts`. The default re-export inside `_active.ts` (which
 * points at `./standard`) handles the no-flag case so dev/prod builds Just Work.
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

interface DemoRedirect {
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

/**
 * The demo boot each variant gets in demo mode; any other variant gets
 * `./mock-broker/boot` (demo.html). The managed demo has its own so that its
 * fake gateway and network block never reach demo.html, and demo.html's
 * fall-through to the real `fetch` never reaches the managed demo.
 */
const DEMO_BOOTS: Record<string, string> = {
    'managed-demo': './mock-broker/boot.managed',
};

function demoRedirects(variant: string | undefined): DemoRedirect[] {
    return [
        // ONE entry. `src/core/boot.ts` is a no-op seam that `src/main.ts` calls
        // before starting the kernel; in demo mode it resolves to the in-browser
        // broker instead, which installs `window.solace`, intercepts `fetch` for
        // SEMP and /hosted (and, in the managed demo, the gateway), and mounts
        // the demo control panel.
        //
        // Everything downstream then runs the REAL code: solace-client, semp-client,
        // solace-publisher, semp-discovery, queue-copy's verify + copy engines and
        // the subscription parser all talk to the emulator exactly as they talk to a
        // broker. That is deliberate — the seven canned `*-mock` files this replaced
        // could each drift from the code they stood in for, and two of them had.
        { from: './core/boot', to: (variant && DEMO_BOOTS[variant]) || './mock-broker/boot' },
    ];
}

/**
 * In demo mode, redirect the boot seam to the demo's. Applied only when
 * `mode === 'demo'`. Module source files stay untouched.
 */
function serviceDemoRedirect(redirects: DemoRedirect[]): PluginOption {
    return {
        name: 'service-demo-redirect',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!importer) return null;
            const clean = source.replace(/\.js$/, '');
            const match = redirects.find(r =>
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
 * mode (`demo.html`) and by the `VITE_OUTPUT_NAME` override. `enforce: 'post'`
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
    const isDemo = mode === 'demo';
    // `--out-filename=<name>` overrides the emitted HTML filename. Bare name
    // (no extension) is allowed — `.html` is appended. Takes precedence over
    // the demo-mode default of `demo.html`.
    const rawOutputName = readBuildInput('__VITE_OUT_FILENAME');
    const outputName = rawOutputName
        ? (rawOutputName.endsWith('.html') ? rawOutputName : `${rawOutputName}.html`)
        : (isDemo ? 'demo.html' : null);
    // `--variant=<name>` selects which manifest under `src/variants/` the
    // registry resolves at build time. Unset → the default re-export in
    // `_active.ts` wins (currently `./standard`).
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
            // Also imports each active module's styles.css, so CSS follows
            // the variant manifest like the code and the templates do.
            moduleRegistryPlugin({ root: __dirname, variant }) as PluginOption,
            isDemo && serviceDemoRedirect(demoRedirects(variant)),
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
