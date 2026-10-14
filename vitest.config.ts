import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { moduleRegistryPlugin } from './scripts/module-registry-plugin.mjs';

const pkgVersion: string = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
).version;

export default defineConfig({
    // Resolve `virtual:module-registry` (imported by src/registry.ts) under tests
    // too. With no __VITE_VARIANT, the plugin defaults to the `standard` variant.
    plugins: [moduleRegistryPlugin({ root: __dirname })],
    define: {
        __APP_VERSION__: JSON.stringify(pkgVersion)
    },
    test: {
        globals: true,
        environment: 'jsdom',
        cache: false,
        reporter: process.stdout.isTTY ? 'default' : 'verbose',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: [
                'text',                                        // stdout — full per-file table
                'text-summary',                                // stdout — totals only
                ['text', { file: 'coverage.txt' }],            // file: coverage/coverage.txt — full per-file table
                ['text-summary', { file: 'summary.txt' }],     // file: coverage/summary.txt — totals only
                'html',                                        // dir: coverage/ + coverage/src/... — navigable HTML drilldown
                'lcovonly'                                     // file: coverage/lcov.info — no duplicate HTML tree (use 'lcov' if you want both)
            ],
            reportsDirectory: 'coverage',
            include: ['src/**/*.ts', 'src/**/*.js'],
            exclude: [
                'src/css/**',
                'src/index.html',
                'src/modules/queue-browser/constants.js',
                // The in-browser demo broker. Mock-only: the redirect that reaches
                // it is registered only when mode === 'mock', so it never enters a
                // production bundle. Its fidelity contracts are covered by
                // tests/mock-broker/ rather than held to the 100% gate.
                'src/mock-broker/**'
            ],
            thresholds: {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100
            }
        },
        setupFiles: ['tests/setup.ts']
    },
    resolve: {
        alias: {
            '@core': '/src/core',
            '@modules': '/src/modules'
        }
    }
});
