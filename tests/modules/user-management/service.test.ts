import { describe, it, expect } from 'vitest';
import { createUserMgmtService, type UserPayload } from '../../../src/modules/user-management/service';

const PAYLOAD: UserPayload = {
    username: 'bob', password: 'bob-password-1', admin: false, operate: [], readOnly: [],
};

const fetchMock = () => globalThis.fetch as any;

describe('user-management/service', () => {
    it('listUsers GETs /managed/users and unwraps the list', async () => {
        const users = [{ username: 'a', admin: true, operate: [], readOnly: [] }];
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ users }) });

        expect(await createUserMgmtService().listUsers()).toEqual({ ok: true, data: users });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users', { method: 'GET', credentials: 'same-origin' });
    });

    it('listUsers passes a failure through', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) });
        expect(await createUserMgmtService().listUsers()).toEqual(expect.objectContaining({ ok: false, code: 'forbidden' }));
    });

    it('saveUser PUTs the record under its username, password as typed, username not repeated in the body', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 204 });
        expect(await createUserMgmtService().saveUser(PAYLOAD)).toEqual({ ok: true, data: undefined });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users/bob', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ password: 'bob-password-1', admin: false, operate: [], readOnly: [] }),
        }));
    });

    it('escapes the username in the path', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 204 });
        await createUserMgmtService().deleteUser('a/b c');
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users/a%2Fb%20c', { method: 'DELETE', credentials: 'same-origin' });
    });

    it('deleteUser passes the gateway code through', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'last_admin' }) });
        expect(await createUserMgmtService().deleteUser('admin')).toEqual(expect.objectContaining({ ok: false, code: 'last_admin' }));
    });
});
