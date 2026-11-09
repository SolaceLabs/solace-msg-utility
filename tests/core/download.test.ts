import { describe, it, expect, vi, afterEach } from 'vitest';
import { BLOB_URL_REVOKE_DELAY_MS, downloadBlob } from '../../src/core/download';

afterEach(() => {
    vi.useRealTimers();
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
