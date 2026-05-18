import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

const pkgVersion: string = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
).version;

export default defineConfig({
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
                // queue-browser ships its own canned-data mock; queue-discovery's
                // mock was deleted in Stage C in favor of the core mock below.
                // queue-copy keeps split mocks for the verify + copy engines so
                // the build:mock demo runs without an SDK-level QueueBrowser mock.
                'src/modules/**/service-mock.ts',
                'src/modules/**/service-verify-mock.ts',
                'src/modules/**/service-copy-mock.ts',
                // Broker-side service factories + SEMP discovery lifted to
                // core/services/ in Stages B + C. Mocks are only exercised by
                // `build:mock` at runtime, not by unit tests.
                'src/core/services/**/*-mock.ts'
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
