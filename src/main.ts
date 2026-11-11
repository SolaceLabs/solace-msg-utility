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

// Pre-kernel seam. A no-op in shipped builds; the demo build redirects it to
// the in-browser broker so the SDK global and HTTP interceptor are in place
// before any module installs.
preBoot();

const kernel = new Kernel(modules);

// Start at once. This module script runs after the document is parsed, and
// nothing at install needs the Solace SDK: it is used only once a session is
// live, and Connect waits for the shell loader (src/index.html) if the SDK is
// still downloading. A missing or outdated SDK is reported at Connect, not
// by a blank page.
kernel.start();
