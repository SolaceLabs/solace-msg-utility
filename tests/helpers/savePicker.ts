/**
 * A stand-in for the browser's save dialog (`window.showSaveFilePicker`):
 * records the name it was asked for and every blob written to the chosen
 * file. Call `restore()` (or let the test's afterEach do it) so the stub does
 * not outlive the test.
 */
import { vi } from 'vitest';

export interface SavePickerStub {
    /** The `suggestedName` of each dialog opened. */
    names: string[];
    /** Each blob written, in order. */
    blobs: Blob[];
    restore(): void;
}

interface Options {
    /** The dialog is closed without a choice: it rejects with an AbortError. */
    cancel?: boolean;
    /** Writing to the chosen file fails with this error. */
    writeError?: Error;
}

export function stubSavePicker(opts: Options = {}): SavePickerStub {
    const w = window as unknown as { showSaveFilePicker?: unknown };
    const stub: SavePickerStub = { names: [], blobs: [], restore: () => { delete w.showSaveFilePicker; } };
    w.showSaveFilePicker = vi.fn(async ({ suggestedName }: { suggestedName: string }) => {
        stub.names.push(suggestedName);
        if (opts.cancel) throw new DOMException('The user aborted a request.', 'AbortError');
        return {
            createWritable: async () => ({
                write: async (blob: Blob) => {
                    if (opts.writeError) throw opts.writeError;
                    stub.blobs.push(blob);
                },
                close: async () => {},
            }),
        };
    });
    return stub;
}

/** A blob's bytes. */
export async function blobBytes(blob: Blob): Promise<number[]> {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
