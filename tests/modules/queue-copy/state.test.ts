// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    createInitialState, resetTransientState, syncDestFormFromSnapshot, destTargetKey, destMessagingHost, destScopeOf, DEST_SCOPES,
} from '../../../src/modules/queue-copy/state';
import type { DestPrefillSnapshot } from '../../../src/modules/queue-copy/state';

describe('queue-copy/state', () => {
    describe('createInitialState', () => {
        it('returns default form values, with the destination on the source\'s own VPN', () => {
            const s = createInitialState();
            expect(s.destForm.sameBroker).toBe(true);
            expect(s.destForm.sameVpn).toBe(true);
            expect(s.dest.type).toBe('queue');
            expect(s.dest.name).toBe('');
            expect(s.mode).toBe('copy');
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

        it('sameBroker=true: takes an appliance primary\'s messaging host too, and drops it for a primary with one host', () => {
            const s = createInitialState();
            syncDestFormFromSnapshot(s, { ...SNAP, host: 'mgmt.example', messagingHost: 'msg.example' });
            expect([s.destForm.host, s.destForm.messagingHost]).toEqual(['mgmt.example', 'msg.example']);
            expect(destMessagingHost(s.destForm)).toBe('msg.example');

            syncDestFormFromSnapshot(s, SNAP);
            expect([s.destForm.host, s.destForm.messagingHost]).toEqual(['broker.solace.com', undefined]);
            expect(destMessagingHost(s.destForm)).toBe('broker.solace.com');
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

        it('null snapshot: no-op even on the source\'s own VPN', () => {
            const s = createInitialState();
            syncDestFormFromSnapshot(s, null);
            expect(s.destForm.host).toBe('');
            expect(s.destForm.solace.vpn).toBe('');
        });
    });

    describe('destScopeOf', () => {
        it('names the Copy to answer of each pair, and the same VPN means nothing on another broker', () => {
            expect(destScopeOf(true, true)).toBe('this-vpn');
            expect(destScopeOf(true, false)).toBe('another-vpn');
            expect(destScopeOf(false, false)).toBe('another-broker');
            expect(destScopeOf(false, true)).toBe('another-broker');
            // The button offers exactly these three, nearest the source first.
            expect(DEST_SCOPES).toEqual(['this-vpn', 'another-vpn', 'another-broker']);
        });
    });

    describe('destTargetKey', () => {
        it('a provisioned destination is its broker and VPN names, whatever the typed fields hold', () => {
            const s = createInitialState();
            s.destForm.credMode = 'provisioned';
            s.destForm.provisioned = { broker: 'b1', vpn: 'v1' };
            s.destForm.host = 'typed-host';
            const key = destTargetKey(s.destForm);
            s.destForm.solace.vpn = 'typed-vpn';
            expect(destTargetKey(s.destForm)).toBe(key);
            s.destForm.provisioned.vpn = 'v2';
            expect(destTargetKey(s.destForm)).not.toBe(key);
        });

        it('a manual appliance destination is its messaging host and VPN: the management host does not carry messages', () => {
            const s = createInitialState();
            s.destForm.host = 'mgmt';
            s.destForm.messagingHost = 'msg1';
            s.destForm.solace.vpn = 'v1';
            const key = destTargetKey(s.destForm);
            s.destForm.host = 'mgmt2';
            expect(destTargetKey(s.destForm)).toBe(key);
            s.destForm.messagingHost = 'msg2';
            expect(destTargetKey(s.destForm)).not.toBe(key);
        });

        it('a manual destination is its typed host and VPN', () => {
            const s = createInitialState();
            s.destForm.host = 'h1';
            s.destForm.solace.vpn = 'v1';
            const key = destTargetKey(s.destForm);
            s.destForm.solace.vpn = 'v2';
            expect(destTargetKey(s.destForm)).not.toBe(key);
            s.destForm.solace.vpn = 'v1';
            s.destForm.host = 'h2';
            expect(destTargetKey(s.destForm)).not.toBe(key);
        });

        it('the same names under the other credential source are a different destination', () => {
            const s = createInitialState();
            s.destForm.host = 'b1';
            s.destForm.solace.vpn = 'v1';
            s.destForm.provisioned = { broker: 'b1', vpn: 'v1' };
            const manual = destTargetKey(s.destForm);
            s.destForm.credMode = 'provisioned';
            expect(destTargetKey(s.destForm)).not.toBe(manual);
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
