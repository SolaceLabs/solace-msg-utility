/**
 * A stand-in for the browser's save dialog (`window.showSaveFilePicker`):
 * records the name it was asked for, the object it was called on, and every
 * blob written to the chosen file, and counts the files it closed. It stays
 * installed until `restore()` removes it: a test that installs one calls
 * `restore()` itself (typically from an afterEach).
 */
import { vi } from 'vitest';

export interface SavePickerStub {
    /** The `suggestedName` of each dialog opened. */
    names: string[];
    /** The `this` of each dialog call: the browser needs it to be `window`. */
    receivers: unknown[];
    /** Each blob written, in order. */
    blobs: Blob[];
    /** How many chosen files were closed. */
    closes: number;
    restore(): void;
}

interface Options {
    /** The dialog is closed without a choice: it rejects with an AbortError. */
    cancel?: boolean;
    /** The dialog is refused: it rejects with this error (e.g. a SecurityError without a user gesture). */
    refuse?: Error;
    /** Writing to the chosen file fails with this error. */
    writeError?: Error;
}

export function stubSavePicker(opts: Options = {}): SavePickerStub {
    const w = window as unknown as { showSaveFilePicker?: unknown };
    const stub: SavePickerStub = { names: [], receivers: [], blobs: [], closes: 0, restore: () => { delete w.showSaveFilePicker; } };
    w.showSaveFilePicker = vi.fn(async function (this: unknown, { suggestedName }: { suggestedName: string }) {
        stub.names.push(suggestedName);
        stub.receivers.push(this);
        if (opts.refuse) throw opts.refuse;
        if (opts.cancel) throw new DOMException('The user aborted a request.', 'AbortError');
        return {
            createWritable: async () => ({
                write: async (blob: Blob) => {
                    if (opts.writeError) throw opts.writeError;
                    stub.blobs.push(blob);
                },
                close: async () => { stub.closes++; },
            }),
        };
    });
    return stub;
}

/** A blob's bytes. */
export async function blobBytes(blob: Blob): Promise<number[]> {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
