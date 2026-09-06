/**
 * Application Entry Point — Clean Shell
 *
 * Only bootstraps the Kernel. No business logic here.
 * All module code lives in src/modules/
 */

import './css/main.css';
import { boot as preBoot } from './core/boot';
import { Kernel } from './core/kernel';
import { modules } from './registry';
import { logger } from './core/logger';

// Pre-kernel seam. A no-op in shipped builds; the mock build redirects it to
// the in-browser broker so the SDK global and HTTP interceptor are in place
// before any module installs.
preBoot();

const kernel = new Kernel(modules);

// Boot after DOM is ready
/* v8 ignore start -- jsdom readyState is always 'complete', can't test this branch */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
/* v8 ignore stop */
    boot();
}

function boot(): void {
    // solclient.js loads asynchronously — wait for it if not yet loaded
    if ((window as any).solace) {
        kernel.start();
    } else {
        // The solclient.js script fires this event when loaded
        const script = document.querySelector('script[src*="solclient"]');
        if (script) {
            script.addEventListener('load', () => kernel.start());
        } else {
            // No solclient.js found — boot without Solace (mock mode)
            logger.warn('[Main] solclient.js not found, booting in limited mode');
            kernel.start();
        }
    }
}
