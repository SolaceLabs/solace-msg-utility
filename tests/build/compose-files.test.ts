import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIDENING, count, securityOpt, serviceBlock as service, writableMounts } from '../helpers/compose';

/**
 * The compose files that run the gateway image: the two ready-made
 * deployments (docker/compose.gateway.yaml, docker/compose.provisioned.yaml),
 * the local stack `dev.sh image` and `up` use (docker/docker-compose.yaml) and
 * the e2e stack's Provisioned gateway (docker/docker-compose.e2e.yaml).
 * Each states its container posture rather than inheriting Docker's defaults,
 * and nothing widens it. Read as text (tests/helpers/compose.ts), like
 * tests/build/e2e-lib.test.ts reads the rest of the e2e stack: there is no
 * YAML parser in the toolchain.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

const POSTURE = [
    '    user: "65532:65532"', '    privileged: false', '    read_only: true',
    '    cap_drop:\n      - ALL', '    security_opt:\n      - no-new-privileges=true',
];

// [file, service, its writable mounts]. Writable only where the gateway
// writes: /tls (the self-signed certificate, unless the TLS material is
// mounted read-only, as in the e2e stack), /data, and Provisioned mode's /backup.
const SERVICES: [string, string, string[]][] = [
    ['docker/compose.gateway.yaml', 'gateway', ['tls:/tls', 'data:/data']],
    ['docker/compose.provisioned.yaml', 'gateway', ['tls:/tls', 'data:/data', './backup:/backup']],
    ['docker/docker-compose.yaml', 'gateway', ['gateway-tls:/tls', 'gateway-data:/data']],
    ['docker/docker-compose.yaml', 'provisioned', ['provisioned-tls:/tls', 'provisioned-data:/data', 'provisioned-backup:/backup']],
    ['docker/docker-compose.e2e.yaml', 'gateway', ['data:/data', 'backup:/backup']],
];

describe('compose files -- posture', () => {
    it.each(SERVICES)('%s (%s) runs non-root, read-only, with no capability or new privilege', (file, name, writable) => {
        const block = service(read(file), name);
        expect(block, `the ${name} service`).not.toBe('');
        for (const line of POSTURE) expect(count(block, line), line).toBe(1);
        expect(block).not.toMatch(WIDENING);
        expect(securityOpt(block), 'security_opt holds no-new-privileges and nothing else').toBe('      - no-new-privileges=true\n');
        expect(writableMounts(block)).toEqual(writable);
    });
});

// The text reader itself: what it must catch for the posture rows above to mean anything.
describe('compose files -- reading a service', () => {
    const SAFE = [
        '    user: "65532:65532"', '    security_opt:', '      - no-new-privileges=true', '    volumes:',
        '      - data:/data', '      - ./certs:/tls:ro',
    ];
    const compose = (...lines: string[]) => `services:\n  gateway:\n${lines.join('\n')}\n\nvolumes:\n  data:\n`;

    it('reads past a comment indented less than the keys, so a key after it is still checked', () => {
        const block = service(compose(...SAFE, '  # an aside, two spaces in', '    cap_add:', '      - NET_ADMIN'), 'gateway');
        expect(block).toMatch(WIDENING);
    });

    it('ends at the next service, even when a shallow comment introduces it', () => {
        const text = compose(...SAFE, '  # the next service', '  other:', '    privileged: true');
        expect(service(text, 'gateway')).not.toMatch(WIDENING);
        expect(service(text, 'other')).toMatch(WIDENING);
    });

    it.each([
        ['a kernel parameter', '    sysctls:\n      net.core.somaxconn: 1024'],
        ['an unconfined seccomp profile', '    security_opt:\n      - seccomp:unconfined'],
        ['an unconfined AppArmor profile', '    security_opt:\n      - apparmor=unconfined'],
        ['unmasked system paths', '    security_opt:\n      - systempaths=unconfined'],
        ['SELinux labelling off', '    security_opt:\n      - label:disable'],
        ["the host's UTS namespace", '    uts: host'],
        ['a cgroup namespace', '    cgroup: host'],
        ['a parent cgroup', '    cgroup_parent: /system.slice'],
        ['a device cgroup rule', "    device_cgroup_rules:\n      - 'c 1:3 mr'"],
        ['a host user namespace', '    userns_mode: host'],
        ['the Docker socket, even read-only', '      - /var/run/docker.sock:/var/run/docker.sock:ro'],
    ])('flags %s as widening', (_what, line) => {
        expect(service(compose(...SAFE, line), 'gateway')).toMatch(WIDENING);
    });

    it('sees a second security_opt entry after no-new-privileges, and a mount that is not read-only', () => {
        const block = service(compose(
            '    security_opt:', '      - no-new-privileges=true', '      - seccomp=./profile.json', '    volumes:',
            '      - data:/data', '      # - ./old:/old', '      - ./certs:/tls:ro', '      - ./logs:/logs',
        ), 'gateway');
        expect(securityOpt(block)).toBe('      - no-new-privileges=true\n      - seccomp=./profile.json\n');
        expect(writableMounts(block)).toEqual(['data:/data', './logs:/logs']);
        expect(securityOpt(service(compose('    user: "65532:65532"'), 'gateway'))).toBeUndefined();
    });
});

describe('compose files -- the ready-made deployments', () => {
    const IMAGE = '    image: ghcr.io/solacelabs/solace-msg-utility:${SMU_VERSION:?set SMU_VERSION to a release, e.g. 3.6.0}';

    it.each(['docker/compose.gateway.yaml', 'docker/compose.provisioned.yaml'])('%s pins a release the deployer names, never latest', (file) => {
        const text = read(file);
        expect(count(text, IMAGE)).toBe(1);
        expect(text).not.toMatch(/:latest\b/);
    });

    it('Provisioned mode keeps its scheduled backups in a host directory', () => {
        expect(service(read('docker/compose.provisioned.yaml'), 'gateway')).toMatch(/^ {6}- \.\/backup:\/backup$/m);
    });

    it.each([
        'docker/docker-compose.yaml', 'docker/compose.gateway.yaml', 'docker/compose.provisioned.yaml', 'docker/docker-compose.e2e.yaml',
    ])('%s spells the option no-new-privileges=true and sets no pre-rename or removed gateway variable', (file) => {
        const text = read(file);
        expect(text).not.toContain('no-new-privileges:true');
        expect(text).not.toMatch(
            /^\s*(?:SSL_CERT_FILE|SSL_KEY_FILE|SSL_TRUST_DIR|SSL_INSECURE_SKIP_VERIFY|HOSTED|CONN_MODES|DEFAULT_CONN|ADMIN_PASSWORD|ADMIN_PASSWORD_FILE|USERS_FILE|CONNECTIONS_FILE|STORE_KEY_FILE):/m);
    });

    it('Gateway mode is the default: no SMU_CONN_MODES, no SMU_HOSTED', () => {
        expect(read('docker/compose.gateway.yaml')).not.toMatch(/^\s*(?:SMU_CONN_MODES|SMU_HOSTED):/m);
    });

    it('Provisioned mode takes the admin password from a secret file, never from the environment', () => {
        const text = read('docker/compose.provisioned.yaml');
        expect(service(text, 'gateway')).toContain('      SMU_CONN_MODES: provisioned\n');
        expect(text).toContain('      SMU_ADMIN_PASSWORD_FILE: /run/secrets/admin-password\n');
        expect(text).toContain('    secrets:\n      - source: admin-password\n        target: /run/secrets/admin-password\n');
        expect(text).toContain('secrets:\n  admin-password:\n    file: ./admin-password\n');
        expect(text).not.toMatch(/^\s*SMU_ADMIN_PASSWORD:/m);
    });
});
