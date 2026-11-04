/**
 * Sign-in sessions (go-web-proxy/session.go), without the clock: a session
 * lasts until it is dropped or expired from the control panel.
 *
 * A drop (sign-out, a replaced session, a password change, a changed
 * administrator flag, a deleted user) tells the listeners, which close that
 * session's SMF sockets; an expiry does not, as in the gateway. A user-wide
 * drop also says so on its own (`onDropUser`), so a socket whose session had
 * already expired still closes, as `sessions.onDropUser` does in the gateway.
 *
 * Mock-only.
 */

export interface Session { user: string; mustChange: boolean }

function newId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function createSessions() {
    const byId = new Map<string, Session>();
    const onDrop: ((id: string, s: Session) => void)[] = [];
    const onDropUser: ((user: string) => void)[] = [];

    function drop(id: string): void {
        const s = byId.get(id);
        if (!s) return;
        byId.delete(id);
        onDrop.forEach(fn => fn(id, s));
    }

    return {
        create(user: string, mustChange: boolean): string {
            const id = newId();
            byId.set(id, { user, mustChange });
            return id;
        },
        get(id: string | null): Session | null {
            return (id && byId.get(id)) || null;
        },
        drop,
        dropUser(user: string): void {
            for (const [id, s] of Array.from(byId)) if (s.user === user) drop(id);
            onDropUser.forEach(fn => fn(user));
        },
        /** Gone without telling anyone, as an idle or absolute expiry is. */
        expire(id: string): void {
            byId.delete(id);
        },
        onDrop(fn: (id: string, s: Session) => void): void {
            onDrop.push(fn);
        },
        onDropUser(fn: (user: string) => void): void {
            onDropUser.push(fn);
        },
        dump(): [string, Session][] {
            return Array.from(byId, ([id, s]) => [id, { ...s }]);
        },
        load(entries: [string, Session][]): void {
            byId.clear();
            entries.forEach(([id, s]) => byId.set(id, { ...s }));
        },
    };
}

export type GatewaySessions = ReturnType<typeof createSessions>;
