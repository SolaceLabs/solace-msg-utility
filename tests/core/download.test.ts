import { describe, it, expect, vi, afterEach } from 'vitest';
import { BLOB_URL_REVOKE_DELAY_MS, downloadBlob, saveBlob } from '../../src/core/download';

afterEach(() => {
    vi.useRealTimers();
    // A test that installed a save dialog must not leave it for the next one.
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe('core/download -- downloadBlob', () => {
    it('clicks a temporary download link for the blob, removes it, and revokes the URL a moment later', () => {
        vi.useFakeTimers();
        const clicked: { href: string; download: string; attached: boolean }[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
        });
        const blob = new Blob(['{}'], { type: 'application/json' });
        downloadBlob(blob, 'smu-backup-20261109T020000Z.json');
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        expect(clicked).toEqual([{ href: 'blob:mock-url', download: 'smu-backup-20261109T020000Z.json', attached: true }]);
        expect(document.querySelector('a[download]')).toBeNull();
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        click.mockRestore();
    });

    it('aborts when createObjectURL returns nothing: no link, no revoke, a warning', () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        (URL.createObjectURL as any).mockReturnValueOnce(null);
        const before = document.body.children.length;
        downloadBlob(new Blob(['data']), 'file.bin');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('createObjectURL returned null'));
        expect(document.body.children.length).toBe(before);
        vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
});

describe('core/download -- saveBlob', () => {
    type Writable = { write(b: Blob): Promise<void>; close(): Promise<void> };
    const installPicker = (impl: (opts: { suggestedName: string }) => Promise<{ createWritable(): Promise<Writable> }>) => {
        const picker = vi.fn(impl);
        (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker;
        return picker;
    };
    const blob = () => new Blob(['payload'], { type: 'application/octet-stream' });

    it('downloads under the suggested name when the browser has no save dialog', async () => {
        vi.useFakeTimers();
        const clicked: string[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this.download);
        });
        const b = blob();
        await saveBlob(b, 'solace-message-7.png');
        expect(URL.createObjectURL).toHaveBeenCalledWith(b);
        expect(clicked).toEqual(['solace-message-7.png']);
        click.mockRestore();
    });

    it('opens the save dialog on the suggested name, writes the blob to the chosen file and closes it, without a download link', async () => {
        const order: string[] = [];
        const written: Blob[] = [];
        let pickedOn: unknown;
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const picker = vi.fn(function (this: unknown, _opts: { suggestedName: string }) {
            pickedOn = this;
            return Promise.resolve({
                createWritable: async (): Promise<Writable> => ({
                    write: async (b: Blob) => { order.push('write'); written.push(b); },
                    close: async () => { order.push('close'); },
                }),
            });
        });
        (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker;
        const b = blob();

        await saveBlob(b, 'solace-message-7.json');

        expect(picker).toHaveBeenCalledWith({ suggestedName: 'solace-message-7.json' });
        expect(pickedOn).toBe(window);
        expect(written).toHaveLength(1);
        expect(written[0]).toBe(b);
        expect(order).toEqual(['write', 'close']);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(click).not.toHaveBeenCalled();
        click.mockRestore();
    });

    it('saves nothing when the user cancels the dialog, and says nothing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        installPicker(() => Promise.reject(new DOMException('The user aborted a request.', 'AbortError')));

        await expect(saveBlob(blob(), 'a.bin')).resolves.toBeUndefined();

        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns and downloads under the suggested name when the browser refuses the dialog', async () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const clicked: string[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this.download);
        });
        installPicker(() => Promise.reject(new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError')));
        const b = blob();

        await saveBlob(b, 'a.bin');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('Must be handling a user gesture to show a file picker.');
        expect(String(warn.mock.calls[0][0])).toContain('a.bin');
        expect(URL.createObjectURL).toHaveBeenCalledWith(b);
        expect(clicked).toEqual(['a.bin']);
        click.mockRestore();
    });

    it('rejects, naming the cause, when writing to the chosen file fails', async () => {
        installPicker(() => Promise.resolve({
            createWritable: async (): Promise<Writable> => ({
                write: async () => { throw new Error('disk full'); },
                close: async () => {},
            }),
        }));

        await expect(saveBlob(blob(), 'a.bin')).rejects.toThrow('disk full');
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
});
