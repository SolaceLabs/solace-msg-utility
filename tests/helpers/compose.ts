/**
 * A compose file read as text (there is no YAML parser in the toolchain): one
 * service's block, and the posture every service that runs the gateway image
 * or the e2e browser is held to. For tests/build/compose-files.test.ts and
 * tests/build/e2e-lib.test.ts.
 */

/**
 * The lines under `  <name>:`, up to the next service or top-level key. A
 * comment indented less than the keys (`  # ...`) does not end the block when
 * more of the block follows it, so a key after such a comment is still read.
 * '' when the service is absent.
 */
export function serviceBlock(text: string, name: string): string {
    return text.match(new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n|(?: {0,3}#.*\\n)+(?= {4}))*)`, 'm'))?.[1] ?? '';
}

/** How many times `part` occurs in `text`. */
export const count = (text: string, part: string) => text.split(part).length - 1;

/**
 * What widens a container's posture: a host namespace (ipc, pid, uts, network,
 * user), a capability, a device or device cgroup rule, a kernel parameter, a
 * cgroup of its own choosing, privileged mode, an unconfined seccomp, AppArmor
 * or systempaths profile, SELinux labelling turned off, or the Docker socket.
 */
export const WIDENING = new RegExp([
    /^ {4}(?:ipc|pid|uts|network_mode|userns_mode|cap_add|devices|device_cgroup_rules|sysctls|cgroup|cgroup_parent|privileged: true)\b/.source,
    /unconfined/.source,
    /label[:=]disable/.source,
    /docker\.sock/.source,
].join('|'), 'm');

/** Everything under the block's `    security_opt:` (items and comments alike); undefined when it has none. */
export function securityOpt(block: string): string | undefined {
    return block.match(/^ {4}security_opt:\n((?: {6}.*\n)*)/m)?.[1];
}

/** The block's mounts under `    volumes:` that are writable: every item not ending in `:ro`. */
export function writableMounts(block: string): string[] {
    const volumes = block.match(/^ {4}volumes:\n((?: {6}.*\n|\n)*)/m)?.[1] ?? '';
    return [...volumes.matchAll(/^ {6}- (\S+)$/gm)].map(m => m[1]).filter(m => !m.endsWith(':ro'));
}
