/**
 * Strict JSON bodies, as the gateway's `decodeJSON` reads them: one value, no
 * unknown field, no field of the wrong type, nothing after it. A body that
 * fails is a `400 bad_request`. Like Go's decoder, a key names its field
 * without regard to case, and a missing field or a JSON null leaves the zero
 * value. (The gateway's 64 KiB `too_large` cap is not simulated.)
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

/** bytes.EqualFold for a field name: ASCII case, and the two runes that fold to ASCII (long s, Kelvin sign). */
const fold = (s: string) => s.replace(/\u017f/g, 's').replace(/\u212a/g, 'k').replace(/[A-Z]/g, c => c.toLowerCase());

/** The field a JSON key names, as encoding/json matches it: the exact name, else one equal under case folding. */
export function fieldOf(k: string, fields: readonly string[]): string | undefined {
    return fields.includes(k) ? k : fields.find(f => fold(f) === fold(k));
}

/** An object's fields under their own names; a later key for the same field wins, as in Go. */
export function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
    if (v === undefined || v === null) return {};
    if (typeof v !== 'object' || Array.isArray(v)) throw new BadRequest('want an object');
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
        const f = fieldOf(k, keys);
        if (f === undefined) throw new BadRequest(`unknown field ${k}`);
        out[f] = x;
    }
    return out;
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
