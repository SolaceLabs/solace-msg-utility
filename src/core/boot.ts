/**
 * Pre-kernel boot hook. A no-op in every shipped build.
 *
 * It exists as a seam: when Vite builds with `--mode mock`, the
 * `serviceMockRedirect` plugin resolves this module to `src/mock-broker/boot.ts`
 * instead, which installs the in-browser broker (SDK global, HTTP interceptor,
 * demo control panel) before any module installs.
 *
 * Keeping the seam explicit is what lets the whole `src/mock-broker/` tree stay
 * out of production: the plugin is only registered in mock mode, so no import
 * edge to it exists in a production build and Rollup never parses it.
 */
export function boot(): void {
    // Intentionally empty — see above.
}
