import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * `./scripts/dev.sh mock` (npm run test:mock): tests/mock-broker/ with
 * coverage measured over src/mock-broker/, the demo tree behind demo.html and
 * provisioned-demo.html that vitest.config.ts leaves out of the 100% gate.
 * Reported, not gated: no thresholds. Its own directory, so a `mock` run never
 * wipes the report `cov` wrote to coverage/.
 */
export default defineConfig({
    ...base,
    test: {
        ...base.test,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            reportsDirectory: 'coverage/mock-broker',
            include: ['src/mock-broker/**/*.ts']
        }
    }
});
