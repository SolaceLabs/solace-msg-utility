import { vi } from 'vitest';
import type { AppContext } from '../../src/core/types';
import { createManagedProfile } from '../../src/core/services/managed-profile';
import { createNotificationCenter } from '../../src/core/components/notification-center';
import { createQueuePicker } from '../../src/core/components/queue-picker';

type KernelOwned = 'managedProfile' | 'notifications' | 'queuePicker' | 'mountSidebarAccount';

/**
 * A module test's AppContext from the fields it cares about. The
 * kernel-owned services a module rarely exercises get real, inert defaults:
 * an unsigned managed profile, a notification center that keeps nothing in
 * storage, a queue picker of its own, and a no-op sidebar mount. A test
 * that asserts against one of them passes its own.
 */
export function completeContext(
    ctx: Omit<AppContext, KernelOwned> & Partial<Pick<AppContext, KernelOwned>>,
): AppContext {
    return {
        ...ctx,
        managedProfile: ctx.managedProfile ?? createManagedProfile(),
        notifications: ctx.notifications ?? createNotificationCenter({ storage: null }),
        queuePicker: ctx.queuePicker ?? createQueuePicker(),
        mountSidebarAccount: ctx.mountSidebarAccount ?? vi.fn(),
    };
}
