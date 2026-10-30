/**
 * Connections Module -- managed entry (the `managed` variant).
 *
 * Same module id, sidebar entry and Direct form as `module.ts`, plus the
 * Managed tab: sign-in, entitled broker/VPN pickers and the managed session
 * (`managed-panel.ts`). Built only into `dist/managed.html`, which the managed
 * container image serves as its index. Release bundles install `module.ts`,
 * which never imports this file or the panel.
 *
 * Template: `index.managed.html` wraps the shared Direct markup (`index.html`,
 * spliced in at its `<!-- @module-base -->` marker) in the Direct tab panel
 * and adds the tab bar and the Managed panel.
 */

import { required } from '../../core/dom';
import { logger } from '../../core/logger';
import { probeDeployment, setHosted } from '../../core/hosted';
import { resolveConnTabs, type ConnMode } from '../../core/connections/conn-modes';
import { CONNECTIONS_ICON, installDirect } from './module';
import { createManagedPanel } from './managed-panel';
import type { AppContext } from '../../core/types';

/** The Direct / Managed tab bar and its two panels, all required by `index.managed.html`. */
function createConnTabs(container: HTMLElement) {
    const bar = required<HTMLElement>(container, '#conn-tabs');
    const tabDirect = required<HTMLButtonElement>(container, '#conn-tab-direct');
    const tabManaged = required<HTMLButtonElement>(container, '#conn-tab-managed');
    const panelDirect = required<HTMLElement>(container, '#conn-panel-direct');
    const panelManaged = required<HTMLElement>(container, '#conn-panel-managed');

    function setTabActive(btn: HTMLElement, active: boolean): void {
        btn.classList.toggle('btn-primary', active);
        btn.classList.toggle('btn-secondary', !active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    /** Show one connection panel (and mark its tab active), hide the other. */
    function show(mode: ConnMode): void {
        panelDirect.classList.toggle('hidden', mode !== 'direct');
        panelManaged.classList.toggle('hidden', mode !== 'managed');
        setTabActive(tabDirect, mode === 'direct');
        setTabActive(tabManaged, mode === 'managed');
    }

    /**
     * Render the tabs from `resolveConnTabs()` output (`['direct']`,
     * `['managed']`, or both, ordered). The bar is shown only when there is a
     * choice, so a single-mode deployment shows no tabs. Activates the first tab.
     */
    function render(tabs: ConnMode[]): void {
        tabDirect.classList.toggle('hidden', !tabs.includes('direct'));
        tabManaged.classList.toggle('hidden', !tabs.includes('managed'));
        bar.classList.toggle('hidden', tabs.length < 2);
        show(tabs[0]);
    }

    return { tabDirect, tabManaged, render, show };
}

export const ConnectionsModule = {
    name: 'Connections',
    id: 'connections',
    icon: CONNECTIONS_ICON,

    async install(app: AppContext) {
        const { container, appState, eventBus, loadSelf } = app;

        // 0. Probe `/hosted` (see module.ts) and publish the deployment's
        //    connection config, so other modules derive what they may offer for
        //    their own secondary connections without re-probing the gateway.
        const { hosted, conn } = await probeDeployment();
        setHosted(hosted);
        app.setState('connConfig', conn);
        logger.info(`[Connections] mode = ${hosted ? 'hosted' : 'browser'}`);

        // 1. Tabs. resolveConnTabs yields Direct-only unless the gateway
        //    advertised Managed; the bar hides itself for a single-mode deployment.
        const tabs = resolveConnTabs(conn);
        const tabBar = createConnTabs(container);
        tabBar.render(tabs);

        // 2. The Direct form first, so its factory pair is created before the
        //    panel's; then the Managed panel, only when that tab is offered.
        //    Only one mode may be live: each tears the other down before it
        //    connects.
        const direct = installDirect(app, { onBeforeConnect: tearDownManaged });
        const managedPanel = tabs.includes('managed')
            ? createManagedPanel(app, { tearDownOther: () => direct.disconnect() })
            : null;
        /** Drop a managed session before a Direct connect, so RBAC (which keys
         *  off appState.managed) can't leak onto a direct session. Also the
         *  answer to `rbac:sign-out-requested` (router below). */
        function tearDownManaged(): void {
            if (appState.managed) managedPanel?.logout();
        }
        tabBar.tabDirect.addEventListener('click', () => tabBar.show('direct'));
        tabBar.tabManaged.addEventListener('click', () => {
            tabBar.show('managed');
            managedPanel?.refreshView();
        });

        // 3. Cross-module routers, by the ACTIVE connection mode: a managed
        //    session's panel decides, otherwise the Direct form does.
        eventBus.on('connection:edit-requested', () => {
            if (appState.managed && managedPanel) {
                managedPanel.handleEditRequested();
                return;
            }
            loadSelf();
        });

        // End the managed session on request (user-management, after the admin
        // changed their own password or deleted their own account). Same
        // teardown as the Direct-connect interlock; no-op without a session.
        eventBus.on('rbac:sign-out-requested', tearDownManaged);

        eventBus.on('connection:check-connection', (payload) => {
            if (appState.managed && managedPanel) {
                managedPanel.handleCheckConnection(payload);
                return;
            }
            direct.checkConnection(payload);
        });

        logger.info('Connections Module Setup Complete');
    }
};
