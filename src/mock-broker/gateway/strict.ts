/**
 * Strict JSON bodies, as the gateway's `decodeJSON` reads them: one value, no
 * unknown field, no field of the wrong type, nothing after it. A body that
 * fails is a `400 bad_request`. Like Go's decoder, a missing field or a JSON
 * null leaves the zero value. (The gateway's 64 KiB `too_large` cap is not
 * simulated.)
 *
 * Mock-only.
 */

export class BadRequest extends Error {}

export function parseBody(body: string): unknown {
    try {
        return JSON.parse(body);
    } catch {
        throw new BadRequest('not one JSON value');
    }
}

export function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
    if (v === undefined || v === null) return {};
    if (typeof v !== 'object' || Array.isArray(v)) throw new BadRequest('want an object');
    for (const k of Object.keys(v)) {
        if (!keys.includes(k)) throw new BadRequest(`unknown field ${k}`);
    }
    return v as Record<string, unknown>;
}

export function string(v: unknown): string {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw new BadRequest('want a string');
    return v;
}

export function boolean(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v !== 'boolean') throw new BadRequest('want a boolean');
    return v;
}

export function integer(v: unknown, zero: number): number {
    if (v === undefined || v === null) return zero;
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new BadRequest('want an integer');
    return v;
}

export function list<T>(v: unknown, item: (x: unknown) => T): T[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new BadRequest('want an array');
    return v.map(item);
}

/** A list that may be absent or null (Go's `*[]string`): null then. */
export function nullableList<T>(v: unknown, item: (x: unknown) => T): T[] | null {
    return v === undefined || v === null ? null : list(v, item);
}
