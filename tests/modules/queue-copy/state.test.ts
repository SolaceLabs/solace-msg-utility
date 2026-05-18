import { describe, it, expect } from 'vitest';
import { createInitialState, resetTransientState, syncDestFormFromSnapshot } from '../../../src/modules/queue-copy/state';
import type { DestPrefillSnapshot } from '../../../src/modules/queue-copy/state';

describe('queue-copy/state', () => {
    describe('createInitialState', () => {
        it('returns default form values with both toggles checked', () => {
            const s = createInitialState();
            expect(s.destForm.sameBroker).toBe(true);
            expect(s.destForm.sameVpn).toBe(true);
            expect(s.dest.type).toBe('queue');
            expect(s.dest.name).toBe('');
            expect(s.mode).toBe('copy');
        });

        it('starts with no live secondary connections', () => {
            const s = createInitialState();
            expect(s.destSession).toBeNull();
            expect(s.destSempCtx).toBeNull();
            expect(s.verify).toBeNull();
            expect(s.job).toBeNull();
        });

        it('starts with no publishers — they are created lazily on session connect', () => {
            const s = createInitialState();
            expect(s.primaryPublisher).toBeNull();
            expect(s.destPublisher).toBeNull();
        });

        it('starts with blank password fields', () => {
            const s = createInitialState();
            expect(s.destSolacePass).toBe('');
            expect(s.destSempPass).toBe('');
        });

        it('initializes SEMP and Solace sub-forms with urlPath slots', () => {
            const s = createInitialState();
            expect(s.destForm.semp.urlPath).toBe('');
            expect(s.destForm.solace.urlPath).toBe('');
        });
    });

    describe('syncDestFormFromSnapshot', () => {
        const SNAP: DestPrefillSnapshot = {
            host: 'broker.solace.com',
            solace: { protocol: 'wss', port: '443', urlPath: '/sol', vpn: 'default', user: 'admin' },
            semp: { protocol: 'https', port: '1943', urlPath: '/SEMP/v2', user: 'admin' },
        };

        it('sameBroker=true & sameVpn=true: mirrors host + SEMP + Solace fields into state', () => {
            const s = createInitialState();
            syncDestFormFromSnapshot(s, SNAP);
            expect(s.destForm.host).toBe('broker.solace.com');
            expect(s.destForm.semp).toEqual({ protocol: 'https', port: '1943', urlPath: '/SEMP/v2', user: 'admin' });
            expect(s.destForm.solace).toEqual({ protocol: 'wss', port: '443', urlPath: '/sol', vpn: 'default', user: 'admin' });
        });

        it('sameBroker=true & sameVpn=false: mirrors broker fields but leaves Solace VPN/user untouched', () => {
            const s = createInitialState();
            s.destForm.sameVpn = false;
            s.destForm.solace.vpn = 'kept';
            s.destForm.solace.user = 'kept-user';
            syncDestFormFromSnapshot(s, SNAP);
            expect(s.destForm.host).toBe('broker.solace.com');
            expect(s.destForm.solace.protocol).toBe('wss');
            expect(s.destForm.solace.vpn).toBe('kept');
            expect(s.destForm.solace.user).toBe('kept-user');
        });

        it('sameBroker=false: leaves the form untouched (different broker means different everything)', () => {
            const s = createInitialState();
            s.destForm.sameBroker = false;
            s.destForm.sameVpn = false;
            s.destForm.host = 'previously-typed';
            syncDestFormFromSnapshot(s, SNAP);
            expect(s.destForm.host).toBe('previously-typed');
            expect(s.destForm.solace.vpn).toBe('');
        });

        it('null snapshot: no-op even with toggles checked', () => {
            const s = createInitialState();
            syncDestFormFromSnapshot(s, null);
            expect(s.destForm.host).toBe('');
            expect(s.destForm.solace.vpn).toBe('');
        });
    });

    describe('resetTransientState', () => {
        it('clears verify and job slots while preserving session/sempCtx', () => {
            const s = createInitialState();
            s.verify = { inProgress: true, abort: new AbortController(), result: null };
            s.job = { total: 5, copied: 2, cancelRequested: false, lastError: null, status: 'running' };
            const fakeSession = { _mock: true };
            const fakeSempCtx = { fetch: () => Promise.resolve(new Response()), baseUrl: 'http://x' };
            s.destSession = fakeSession;
            s.destSempCtx = fakeSempCtx;

            resetTransientState(s);

            expect(s.verify).toBeNull();
            expect(s.job).toBeNull();
            expect(s.destSession).toBe(fakeSession);
            expect(s.destSempCtx).toBe(fakeSempCtx);
        });
    });
});
