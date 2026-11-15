import { describe, it, expect } from 'vitest';
import { createTickets, TICKET_TTL_MS, type Ticket } from '../../../src/mock-broker/gateway/tickets';

/**
 * Sign-in tickets (src/mock-broker/gateway/tickets.ts): ten minutes from
 * creation, swept on create, ended with the user's sessions.
 */
const mk = (user: string, stage: Ticket['stage'] = 'code', secret = '') => ({ user, stage, password: 'p', mustChange: false, secret });

describe('mock-broker/gateway/tickets', () => {
    it('holds a ticket by an unguessable id until it ends', () => {
        let t = 1000;
        const tickets = createTickets(() => t);
        const id = tickets.create(mk('admin'));
        expect(id).toMatch(/^[0-9a-f]{64}$/);
        expect(tickets.create(mk('admin'))).not.toBe(id);
        expect(tickets.get(id)).toEqual({ ...mk('admin'), created: 1000 });
        t += 5000;   // a lookup does not extend it
        expect(tickets.get(id)!.created).toBe(1000);
        tickets.end(id);
        expect(tickets.get(id)).toBeNull();
    });

    it('clears every ticket at once, as a restart does', () => {
        const tickets = createTickets(() => 0);
        const ids = [tickets.create(mk('admin')), tickets.create(mk('viewer', 'enrol', 'S'))];
        tickets.clear();
        expect(ids.map(id => tickets.get(id))).toEqual([null, null]);
        expect(tickets.dump()).toEqual([]);
        expect(tickets.pending()).toEqual([]);
    });

    it('knows no ticket for a missing id, and ends nothing for one', () => {
        const tickets = createTickets(() => 0);
        const id = tickets.create(mk('admin'));
        tickets.end(null);
        expect(tickets.get(null)).toBeNull();
        expect(tickets.get('nope')).toBeNull();
        expect(tickets.get(id)).not.toBeNull();
    });

    it('lets a ticket go ten minutes after it was made, not before, and sweeps the expired on the next create', () => {
        let t = 0;
        const tickets = createTickets(() => t);
        const old = tickets.create(mk('admin'));
        t = TICKET_TTL_MS;
        expect(tickets.get(old)).not.toBeNull();
        t = TICKET_TTL_MS + 1;
        expect(tickets.get(old)).toBeNull();
        const fresh = tickets.create(mk('viewer'));
        expect(tickets.dump().map(([id]) => id)).toEqual([fresh]);
    });

    it('drops every ticket of a user and no one else\'s', () => {
        const tickets = createTickets(() => 0);
        const a1 = tickets.create(mk('admin'));
        const a2 = tickets.create(mk('admin', 'setup', 'S'));
        const v = tickets.create(mk('viewer'));
        tickets.dropUser('admin');
        expect([tickets.get(a1), tickets.get(a2)]).toEqual([null, null]);
        expect(tickets.get(v)).not.toBeNull();
    });

    it('lists the pending secrets: enrol and setup tickets, live, never a code ticket', () => {
        let t = 0;
        const tickets = createTickets(() => t);
        tickets.create(mk('admin'));
        tickets.create(mk('newbie', 'enrol', 'SECRETONE'));
        tickets.create(mk('admin', 'setup', 'SECRETTWO'));
        expect(tickets.pending()).toEqual([{ user: 'newbie', secret: 'SECRETONE' }, { user: 'admin', secret: 'SECRETTWO' }]);
        t = TICKET_TTL_MS + 1;
        expect(tickets.pending()).toEqual([]);
    });

    it('dumps and loads for a reload, copies and all', () => {
        const tickets = createTickets(() => 0);
        const id = tickets.create(mk('admin', 'enrol', 'S'));
        const dump = tickets.dump();
        dump[0][1].secret = 'changed';
        expect(tickets.get(id)!.secret).toBe('S');

        const other = createTickets(() => 0);
        other.create(mk('stale'));
        other.load(tickets.dump());
        expect(other.dump()).toEqual(tickets.dump());
    });
});
