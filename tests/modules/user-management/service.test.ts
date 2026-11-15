import { describe, it, expect } from 'vitest';
import { createUserMgmtService, type UserPayload } from '../../../src/modules/user-management/service';

const PAYLOAD: UserPayload = {
    username: 'bob', password: 'bob-password-1', admin: false, operate: [], readOnly: [], modules: null, rev: 0,
};

const fetchMock = () => globalThis.fetch as any;

describe('user-management/service', () => {
    it('listUsers GETs /managed/users: the users and the module choices', async () => {
        const body = {
            users: [{ username: 'a', admin: true, operate: [], readOnly: [], modules: null, rev: 1, twoFactor: false }],
            modules: { catalog: ['queue-browser'], offered: [], userDefault: 'none' },
        };
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => body });

        expect(await createUserMgmtService().listUsers()).toEqual({ ok: true, data: body });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users', { method: 'GET', credentials: 'same-origin' });
    });

    it('saveUser PUTs the record under its username with its rev, password as typed, username not repeated in the body; answers the new rev', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rev: 4 }) });
        expect(await createUserMgmtService().saveUser({ ...PAYLOAD, rev: 3 })).toEqual({ ok: true, data: { rev: 4 } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users/bob', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ password: 'bob-password-1', admin: false, operate: [], readOnly: [], modules: null, rev: 3 }),
        }));
    });

    it('a create sends rev 0', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rev: 7 }) });
        await createUserMgmtService().saveUser(PAYLOAD);
        expect(JSON.parse(fetchMock().mock.calls[0][1].body).rev).toBe(0);
    });

    it('deleteUser sends the rev in the query and escapes the username in the path', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 204 });
        await createUserMgmtService().deleteUser('a/b c', 12);
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users/a%2Fb%20c?rev=12', { method: 'DELETE', credentials: 'same-origin' });
    });

    it('a stale save carries the current rev', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'stale', rev: 9 }) });
        expect(await createUserMgmtService().saveUser(PAYLOAD)).toEqual(expect.objectContaining({ ok: false, code: 'stale', rev: 9 }));
    });

    it('deleteUser passes the gateway code through', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'last_admin' }) });
        expect(await createUserMgmtService().deleteUser('admin', 1)).toEqual(expect.objectContaining({ ok: false, code: 'last_admin' }));
    });

    it('resetTwoFactor DELETEs /managed/users/{name}/totp with no rev, escaping the username; answers the current rev', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rev: 8 }) });
        expect(await createUserMgmtService().resetTwoFactor('a/b c')).toEqual({ ok: true, data: { rev: 8 } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/users/a%2Fb%20c/totp', { method: 'DELETE', credentials: 'same-origin' });
    });

    it('resetTwoFactor passes the gateway code through', async () => {
        fetchMock().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
        expect(await createUserMgmtService().resetTwoFactor('ghost')).toEqual(expect.objectContaining({ ok: false, code: 'not_found' }));
    });
});
