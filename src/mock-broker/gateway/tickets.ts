/**
 * Half-finished sign-ins (go-web-proxy/session.go's tickets). A ticket is not
 * a session: while one stands no session exists, so nothing that checks
 * sessions has a new state to learn. It lives in memory beside the sessions,
 * for `login.twoFactorMinutes` (read live, so a shorter value also ends the
 * tickets already issued), and grants nothing but its own page.
 *
 * `stage` is the step it waits for: `code` (a password passed, a code is
 * due), `enrol` (a password passed, two-factor must be set up before the
 * session opens) or `setup` (a signed-in user setting it up again). `password`
 * is what the password check saw, held to the account at the end as the
 * gateway holds the password hash; `secret` is the pending new secret for
 * `enrol` and `setup`, blank for `code`.
 *
 * Mock-only.
 */

export type TicketStage = 'code' | 'enrol' | 'setup';

export interface Ticket {
    user: string;
    stage: TicketStage;
    password: string;
    mustChange: boolean;
    secret: string;
    created: number;
}

/** How long a ticket lasts unless the settings say otherwise (login.twoFactorMinutes: 10). */
export const TICKET_TTL_MS = 10 * 60 * 1000;

function newId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function createTickets(now: () => number, ttl: () => number = () => TICKET_TTL_MS) {
    const byId = new Map<string, Ticket>();
    const live = (t: Ticket) => now() - t.created <= ttl();

    return {
        /** A new ticket, after the expired ones are swept. */
        create(t: Omit<Ticket, 'created'>): string {
            for (const [id, x] of Array.from(byId)) if (!live(x)) byId.delete(id);
            const id = newId();
            byId.set(id, { ...t, created: now() });
            return id;
        },
        /** The ticket, unless it is gone or expired. */
        get(id: string | null): Ticket | null {
            const t = id ? byId.get(id) : undefined;
            return t && live(t) ? t : null;
        },
        end(id: string | null): void {
            if (id) byId.delete(id);
        },
        /** Every ticket (a restart of the gateway). */
        clear(): void {
            byId.clear();
        },
        dropUser(user: string): void {
            for (const [id, t] of Array.from(byId)) if (t.user === user) byId.delete(id);
        },
        /** The live tickets that hold a pending secret, for the Demo controls' Authenticator. */
        pending(): { user: string; secret: string }[] {
            return Array.from(byId.values()).filter(t => t.stage !== 'code' && live(t)).map(t => ({ user: t.user, secret: t.secret }));
        },
        dump(): [string, Ticket][] {
            return Array.from(byId, ([id, t]) => [id, { ...t }]);
        },
        load(entries: [string, Ticket][]): void {
            byId.clear();
            entries.forEach(([id, t]) => byId.set(id, { ...t }));
        },
    };
}

export type GatewayTickets = ReturnType<typeof createTickets>;
