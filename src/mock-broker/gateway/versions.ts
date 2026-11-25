/**
 * The version rules every whole-record save shares (go-web-proxy store
 * versions): the `rev` a body carries, the `?rev=` a delete carries, and the
 * refusals a wrong one earns. A missing, negative, fractional or non-numeric
 * rev is `400 rev_required`, never a read as 0; the checks that need the
 * record (404 not_found, 409 exists, 409 stale) are each store's own.
 *
 * Mock-only.
 */
import type { GatewayResponse } from './types';

export const revRequired: GatewayResponse = { status: 400, json: { error: 'rev_required' } };
export const exists: GatewayResponse = { status: 409, json: { error: 'exists' } };
export const notFound: GatewayResponse = { status: 404, json: { error: 'not_found' } };

/** stale: the rev sent is not the current one; the body names the current one. */
export const stale = (rev: number | string): GatewayResponse => ({ status: 409, json: { error: 'stale', rev } });

/** A body's rev: a whole number from 0 up; null when it is missing, null or anything else. */
export function bodyRev(v: unknown): number | null {
    return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** A delete's `?rev=N`: a whole number from 1 up (a record that exists has a rev of 1 or more); null otherwise. */
export function queryRev(query: string): number | null {
    const v = new URLSearchParams(query).get('rev');
    if (v === null || !/^[0-9]+$/.test(v)) return null;
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}
