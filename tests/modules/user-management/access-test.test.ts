import { describe, it, expect } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { ACCESS_PROMPT, createAccessTest } from '../../../src/modules/user-management/access-test';
import type { ManagedUser, ModuleChoices } from '../../../src/modules/user-management/service';

const OPS: ManagedUser = {
    username: 'ops', admin: false,
    operate: [{ brokers: 'prod', msgVpns: 'vpn-*', queues: 'orders.*' }],
    readOnly: [{ brokers: 'prod', msgVpns: 'vpn-a', queues: '*' }],
    modules: ['queue-browser', 'queue-copy'],
};
const READER: ManagedUser = {
    username: 'reader', admin: false,
    operate: [],
    readOnly: [{ brokers: '*', msgVpns: 'vpn-a', queues: 'audit.*' }],
    modules: null,
};
/** The deployment offers only queue-browser of the two catalog modules. */
const CHOICES: ModuleChoices = { catalog: ['queue-browser', 'queue-copy'], offered: ['queue-browser'], userDefault: 'all' };

function setup(users: ManagedUser[] = [OPS, READER], choices: ModuleChoices = CHOICES) {
    const container = loadModuleDOM('user-management');
    const test = createAccessTest(container);
    test.setData(users, choices);
    const q = <T extends HTMLElement>(sel: string) => container.querySelector(sel) as T;
    const user = q<HTMLSelectElement>('#user-mgmt-test-user');
    const result = q<HTMLElement>('#user-mgmt-test-result');
    function pick(name: string): void {
        user.value = name;
        user.dispatchEvent(new Event('change'));
    }
    function type(broker: string, vpn: string, queue: string): void {
        for (const [sel, v] of [['#user-mgmt-test-broker', broker], ['#user-mgmt-test-vpn', vpn], ['#user-mgmt-test-queue', queue]]) {
            const input = q<HTMLInputElement>(sel);
            input.value = v;
            input.dispatchEvent(new Event('input'));
        }
    }
    const badge = () => result.querySelector('.badge');
    const lines = () => [...result.querySelectorAll('p')].map(p => p.textContent);
    return { test, user, result, pick, type, badge, lines };
}

describe('user-management access-test -- inputs', () => {
    it('lists the loaded users after a placeholder, and prompts until user, broker, VPN and queue are all given', () => {
        const { user, result, pick, type } = setup();
        expect([...user.options].map(o => o.textContent)).toEqual(['Select a user...', 'ops', 'reader']);
        expect(result.textContent).toBe(ACCESS_PROMPT);
        type('prod', 'vpn-a', 'orders.new');
        expect(result.textContent).toBe(ACCESS_PROMPT); // no user yet
        pick('ops');
        type('prod', 'vpn-a', '  ');
        expect(result.textContent).toBe(ACCESS_PROMPT); // a blank queue
    });

    it('keeps the picked user across a reload while they exist, and resets when they are gone', () => {
        const { test, user, result, pick, type } = setup();
        pick('reader');
        type('b1', 'vpn-a', 'audit.x');
        test.setData([OPS, READER], CHOICES);
        expect(user.value).toBe('reader');
        expect(result.textContent).not.toBe(ACCESS_PROMPT);
        test.setData([OPS], CHOICES);
        expect(user.value).toBe('');
        expect(result.textContent).toBe(ACCESS_PROMPT);
    });
});

describe('user-management access-test -- verdict', () => {
    it('operate: an operate row matching all three wins over a read-only row, and is named', () => {
        const { pick, type, badge, lines } = setup();
        pick('ops');
        type('prod', 'vpn-a', 'orders.new');
        expect(badge()?.textContent).toBe('Operate');
        expect(badge()?.classList.contains('badge-outline-success')).toBe(true);
        expect(lines()).toContain('Matching row: prod / vpn-* / orders.*');
    });

    it('read-only: only a read-only row matches the queue', () => {
        const { pick, type, badge, lines } = setup();
        pick('ops');
        type('prod', 'vpn-a', 'payments');
        expect(badge()?.textContent).toBe('Read-only');
        expect(lines()).toContain('Matching row: prod / vpn-a / *');
    });

    it('queue hidden: a row reaches the VPN but no queue pattern matches', () => {
        const { pick, type, badge, lines } = setup();
        pick('reader');
        type('any-broker', 'vpn-a', 'orders.new');
        expect(badge()?.textContent).toBe('Queue hidden');
        expect(lines()).toContain('Matching row: * / vpn-a / audit.*');
    });

    it('no access: matching is exact and case-sensitive, and no row is named', () => {
        const { pick, type, badge, lines } = setup();
        pick('ops');
        type('PROD', 'vpn-a', 'orders.new');
        expect(badge()?.textContent).toBe('No access');
        expect(lines().some(l => l?.startsWith('Matching row'))).toBe(false);
    });

    it('a record the gateway sent without row lists or modules has no access and the default modules', () => {
        const legacy = { username: 'legacy', admin: false } as ManagedUser;
        const { pick, type, badge, lines } = setup([legacy]);
        pick('legacy');
        type('prod', 'vpn-a', 'q');
        expect(badge()?.textContent).toBe('No access');
        expect(lines()).toContain('Modules: Queue Browser');
    });

    it('writes the rows as text, never markup', () => {
        const odd: ManagedUser = { ...OPS, username: 'odd', operate: [{ brokers: '*', msgVpns: '*', queues: '<img src=x>*' }] };
        const { result, pick, type, lines } = setup([odd]);
        pick('odd');
        type('b', 'v', '<img src=x>1');
        expect(result.querySelector('img')).toBeNull();
        expect(lines()).toContain('Matching row: * / * / <img src=x>*');
    });
});

describe('user-management access-test -- modules', () => {
    it("the user's own list, within what the deployment offers", () => {
        const { pick, type, lines } = setup();
        pick('ops'); // own list: queue-browser + queue-copy, but queue-copy is not offered
        type('prod', 'vpn-a', 'orders.new');
        expect(lines()).toContain('Modules: Queue Browser');
    });

    it('a user without a list gets the deployment default: everything offered', () => {
        const { pick, type, lines } = setup();
        pick('reader');
        type('b', 'vpn-a', 'audit.x');
        expect(lines()).toContain('Modules: Queue Browser');
    });

    it('a user without a list under a "none" default gets no modules', () => {
        const { pick, type, lines } = setup([READER], { ...CHOICES, userDefault: 'none' });
        pick('reader');
        type('b', 'vpn-a', 'audit.x');
        expect(lines()).toContain('Modules: none');
    });
});
