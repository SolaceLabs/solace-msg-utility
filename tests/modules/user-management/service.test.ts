import { describe, it, expect } from 'vitest';
import { createUserMgmtService, type UserPayload } from '../../../src/modules/user-management/service';

const PAYLOAD: UserPayload = {
    username: 'bob', password: 'S1:bob', admin: false, operate: [], readOnly: [],
};

describe('user-management/service', () => {
    it('listUsers POSTs {username, token} and returns users on 200', async () => {
        const users = [{ username: 'a', admin: true, operate: [], readOnly: [] }];
        (globalThis.fetch as any).mockResolvedValue({ status: 200, json: async () => ({ users }) });

        const result = await createUserMgmtService().listUsers('admin', 'tok');

        expect(result).toEqual(users);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/listUsers', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', token: 'tok' }),
        }));
    });

    it('listUsers returns null on a non-200 (denied)', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 400 });
        expect(await createUserMgmtService().listUsers('x', 'y')).toBeNull();
    });

    it('saveUser POSTs the user and returns true on 204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 204 });
        expect(await createUserMgmtService().saveUser('admin', 'tok', PAYLOAD)).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/saveUser', expect.objectContaining({
            body: JSON.stringify({ username: 'admin', token: 'tok', user: PAYLOAD }),
        }));
    });

    it('saveUser returns false on a non-204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 400 });
        expect(await createUserMgmtService().saveUser('a', 'b', PAYLOAD)).toBe(false);
    });

    it('deleteUser POSTs the target and returns true on 204', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 204 });
        expect(await createUserMgmtService().deleteUser('admin', 'tok', 'bob')).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/deleteUser', expect.objectContaining({
            body: JSON.stringify({ username: 'admin', token: 'tok', target: 'bob' }),
        }));
    });

    it('deleteUser returns false on a non-204 (e.g. 404)', async () => {
        (globalThis.fetch as any).mockResolvedValue({ status: 404 });
        expect(await createUserMgmtService().deleteUser('a', 'b', 'c')).toBe(false);
    });
});
