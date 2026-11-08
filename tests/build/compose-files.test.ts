import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The compose files that run the gateway image: the two ready-made
 * deployments (docker/compose.gateway.yaml, docker/compose.provisioned.yaml)
 * and the local stack `dev.sh image` and `up` use (docker/docker-compose.yaml).
 * Each states its container posture rather than inheriting Docker's defaults,
 * and nothing widens it. Read as text, like tests/build/e2e-lib.test.ts reads
 * the e2e stack: there is no YAML parser in the toolchain.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const service = (text: string, name: string) =>
    text.match(new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n)*)`, 'm'))?.[1] ?? '';
const count = (text: string, part: string) => text.split(part).length - 1;

const POSTURE = [
    '    user: "65532:65532"', '    privileged: false', '    read_only: true',
    '    cap_drop:\n      - ALL', '    security_opt:\n      - no-new-privileges:true',
];
const WIDENING = /^ {4}(?:ipc|pid|network_mode|cap_add|devices|privileged: true|userns_mode)\b/m;

const SERVICES: [string, string][] = [
    ['docker/compose.gateway.yaml', 'gateway'],
    ['docker/compose.provisioned.yaml', 'gateway'],
    ['docker/docker-compose.yaml', 'gateway'],
    ['docker/docker-compose.yaml', 'provisioned'],
];

describe('compose files -- posture', () => {
    it.each(SERVICES)('%s (%s) runs non-root, read-only, with no capability or new privilege', (file, name) => {
        const block = service(read(file), name);
        expect(block, `the ${name} service`).not.toBe('');
        for (const line of POSTURE) expect(count(block, line), line).toBe(1);
        expect(block).not.toMatch(WIDENING);
        // Writable only where the gateway writes: the TLS material and its data.
        expect(block).toMatch(/^ {6}- [\w-]+:\/tls$/m);
        expect(block).toMatch(/^ {6}- [\w-]+:\/data$/m);
    });
});

describe('compose files -- the ready-made deployments', () => {
    const IMAGE = '    image: ghcr.io/solacelabs/solace-msg-utility:${SMU_VERSION:?set SMU_VERSION to a release, e.g. 3.6.0}';

    it.each(['docker/compose.gateway.yaml', 'docker/compose.provisioned.yaml'])('%s pins a release the deployer names, never latest', (file) => {
        const text = read(file);
        expect(count(text, IMAGE)).toBe(1);
        expect(text).not.toMatch(/:latest\b/);
    });

    it('Gateway mode is the default: no CONN_MODES, no HOSTED', () => {
        expect(read('docker/compose.gateway.yaml')).not.toMatch(/^\s*(?:CONN_MODES|HOSTED):/m);
    });

    it('Provisioned mode takes the admin password from a secret file, never from the environment', () => {
        const text = read('docker/compose.provisioned.yaml');
        expect(service(text, 'gateway')).toContain('      CONN_MODES: provisioned\n');
        expect(text).toContain('      ADMIN_PASSWORD_FILE: /run/secrets/admin-password\n');
        expect(text).toContain('    secrets:\n      - source: admin-password\n        target: /run/secrets/admin-password\n');
        expect(text).toContain('secrets:\n  admin-password:\n    file: ./admin-password\n');
        expect(text).not.toMatch(/^\s*ADMIN_PASSWORD:/m);
    });
});
