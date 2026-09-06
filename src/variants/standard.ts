/**
 * Full variant — every module the app ships with.
 *
 * One line per active module. To disable a module in this variant, comment
 * its line. To add a new module, drop a `src/modules/<id>/` directory and
 * add a line here. The registry resolves each id to the corresponding
 * `module.ts` via `import.meta.glob` at build time.
 *
 * Higher priority installs first and renders higher in the sidebar. Pick a
 * priority that slots into the existing values; the kernel sorts descending
 * before installing.
 */
export const ACTIVE_MODULES: Record<string, number> = {
    'connections': 100,
    'queue-browser': 80,
    'queue-copy': 70,
    'queue-subscription-explorer': 45,
};
