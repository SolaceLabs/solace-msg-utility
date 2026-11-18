import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';
import type { CertInfo, TlsView } from '../../../src/modules/tls-certificates/service';

const svc = vi.hoisted(() => ({
    view: vi.fn(), check: vi.fn(), replace: vi.fn(), addTrust: vi.fn(), removeTrust: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/modules/tls-certificates/service', () => ({ createTlsService: () => svc }));

import {
    TlsCertificatesModule, expiryMark, formatUtc, MAX_TLS_REQUEST_BYTES, EXPIRY_WARN_DAYS,
} from '../../../src/modules/tls-certificates/module';
import { completeContext } from '../../helpers/appContext';
import { answerConfirm, confirmOpen } from '../../helpers/confirmDialog';

const ADMIN: ManagedSession = { admin: true, username: 'admin', broker: '', vpns: [], operate: [], readOnly: [], modules: [] };
const NOW = Date.parse('2026-11-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const cert = (over: Partial<CertInfo> = {}): CertInfo => ({
    subject: 'CN=gw.example.com', issuer: 'CN=Example CA', names: ['gw.example.com', '10.0.0.5'],
    notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-06-01T00:00:00Z',
    sha256: 'AB:CD:EF', selfSigned: false, expired: false, ...over,
});
const view = (over: Partial<TlsView> = {}): TlsView => ({
    certificate: cert(), certificateWritable: true, trustWritable: true, trust: [], ...over,
});
const CA = (name: string, over: Partial<CertInfo> = {}) => ({ name, certificates: [cert({ subject: 'CN=Broker CA', ...over })], problem: '' });

const ok = <T>(data: T) => ({ ok: true, data });
const refused = (code: string, status = 422, extra: Record<string, unknown> = {}) => ({ ok: false, status, code, ...extra });

const el = <T extends HTMLElement>(c: HTMLElement, sel: string) => c.querySelector(sel) as T;
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');
const text = (c: HTMLElement, sel: string) => el(c, sel).textContent;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const click = async (c: HTMLElement, sel: string) => {
    el<HTMLButtonElement>(c, sel).click();
    await flush();
};
/** Answer the open confirm dialog, then let the handler finish (the call, the reload, the toast). */
const answer = async (yes: boolean) => {
    const question = await answerConfirm(yes);
    await flush();
    return question;
};
const type = (c: HTMLElement, sel: string, v: string) => {
    el<HTMLInputElement | HTMLTextAreaElement>(c, sel).value = v;
};
const value = (c: HTMLElement, sel: string) => el<HTMLInputElement | HTMLTextAreaElement>(c, sel).value;

function makeCtx(container: HTMLElement, managed: ManagedSession | null): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false, managed,
    };
    return completeContext({
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(),
    });
}

async function setup(v: TlsView = view(), managed: ManagedSession | null = ADMIN) {
    const c = loadModuleDOM('tls-certificates');
    const ctx = makeCtx(c, managed);
    svc.view.mockResolvedValue(ok(v));
    await TlsCertificatesModule.install(ctx, { now: () => NOW });
    await flush();
    return { c, ctx };
}

/** Pick a file in a file input. */
async function pick(c: HTMLElement, sel: string, file: File | null) {
    const input = el<HTMLInputElement>(c, sel);
    Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : null });
    input.dispatchEvent(new Event('change'));
    await flush();
    await flush();
}

const KEY = '-----BEGIN PRIVATE KEY-----\nTEST-ONLY-NOT-A-REAL-KEY\n-----END PRIVATE KEY-----';
const CERT_PEM = '-----BEGIN CERTIFICATE-----\nTEST-ONLY\n-----END CERTIFICATE-----';

beforeEach(() => {
    for (const fn of Object.values(svc)) fn.mockReset();
    toastMock.showToast.mockReset();
});

describe('tls-certificates -- helpers', () => {
    it('shows a gateway time without seconds, marked UTC', () => {
        expect(formatUtc('2026-11-09T02:15:00Z')).toBe('2026-11-09 02:15 UTC');
    });

    it('marks a certificate the gateway calls expired, and one whose end has passed', () => {
        expect(expiryMark(cert({ expired: true }), NOW)).toEqual({ kind: 'expired', text: 'Expired' });
        expect(expiryMark(cert({ notAfter: '2026-11-15T11:59:59Z' }), NOW)).toEqual({ kind: 'expired', text: 'Expired' });
        expect(expiryMark(cert({ notAfter: '2026-11-15T12:00:00Z' }), NOW)).toEqual({ kind: 'expired', text: 'Expired' });
    });

    it('marks a certificate that ends within 30 days, counting started days up, and nothing beyond', () => {
        const at = (ms: number) => cert({ notAfter: new Date(NOW + ms).toISOString() });
        expect(expiryMark(at(1000), NOW)).toEqual({ kind: 'soon', text: 'Expires in 1 day' });
        expect(expiryMark(at(DAY), NOW)).toEqual({ kind: 'soon', text: 'Expires in 1 day' });
        expect(expiryMark(at(DAY + 1000), NOW)).toEqual({ kind: 'soon', text: 'Expires in 2 days' });
        expect(expiryMark(at(EXPIRY_WARN_DAYS * DAY), NOW)).toEqual({ kind: 'soon', text: 'Expires in 30 days' });
        expect(expiryMark(at(EXPIRY_WARN_DAYS * DAY + 1000), NOW)).toBeNull();
    });
});

describe('tls-certificates -- gate and load', () => {
    it('fetches once at start with an admin restored, and ignores an rbac:changed that leaves the session as it is', async () => {
        const { c, ctx } = await setup();
        expect(svc.view).toHaveBeenCalledTimes(1);
        ctx.eventBus.emit('rbac:changed');
        await flush();
        expect(svc.view).toHaveBeenCalledTimes(1);
        expect(hidden(c, '#tls-view')).toBe(false);
    });

    it('shows the gate, not the page, without an administrator, and loads once one arrives', async () => {
        const { c, ctx } = await setup(view(), null);
        expect(hidden(c, '#tls-view')).toBe(true);
        expect(hidden(c, '#tls-gate')).toBe(false);
        ctx.appState.managed = { ...ADMIN, admin: false };
        ctx.eventBus.emit('rbac:changed');
        expect(hidden(c, '#tls-view')).toBe(true);
        expect(svc.view).not.toHaveBeenCalled();
        ctx.appState.managed = ADMIN;
        ctx.eventBus.emit('rbac:changed');
        await flush();
        expect(hidden(c, '#tls-view')).toBe(false);
        expect(hidden(c, '#tls-gate')).toBe(true);
        expect(svc.view).toHaveBeenCalledTimes(1);
    });

    it('shows the gate again when the signed-in admin is demoted', async () => {
        const { c, ctx } = await setup();
        ctx.appState.managed = { ...ADMIN, admin: false };
        ctx.eventBus.emit('rbac:changed');
        expect(hidden(c, '#tls-view')).toBe(true);
        expect(svc.view).toHaveBeenCalledTimes(1);
    });

    it('Reload fetches again', async () => {
        const { c } = await setup();
        await click(c, '#btn-tls-reload');
        expect(svc.view).toHaveBeenCalledTimes(2);
    });

    it('a failed load shows the gateway message in the page error, and the next good load clears it', async () => {
        const { c } = await setup();
        svc.view.mockResolvedValueOnce(refused('server_error', 500));
        await click(c, '#btn-tls-reload');
        expect(text(c, '#tls-error')).toBe('The gateway could not complete the request. Its log has the cause.');
        expect(hidden(c, '#tls-error')).toBe(false);
        await click(c, '#btn-tls-reload');
        expect(hidden(c, '#tls-error')).toBe(true);
    });

    it('an ended session goes to a toast and a sign-out request, not the page error', async () => {
        const { c, ctx } = await setup();
        const signOut = vi.fn();
        ctx.eventBus.on('rbac:sign-out-requested', signOut);
        svc.view.mockResolvedValueOnce(refused('unauthenticated', 401));
        await click(c, '#btn-tls-reload');
        expect(signOut).toHaveBeenCalledTimes(1);
        expect(toastMock.showToast).toHaveBeenCalledWith('Your session has ended. Sign in again.', 'error', expect.any(Number));
        expect(hidden(c, '#tls-error')).toBe(true);
    });
});

describe('tls-certificates -- gateway certificate card', () => {
    it('describes the certificate and offers the replace form', async () => {
        const { c } = await setup();
        const dts = [...c.querySelectorAll('#tls-cert-details dt')].map(e => e.textContent);
        const dds = [...c.querySelectorAll('#tls-cert-details dd')].map(e => e.textContent);
        expect(dts).toEqual(['Subject', 'Names', 'Issuer', 'Valid from', 'Valid to', 'Fingerprint (SHA-256)']);
        expect(dds).toEqual(['CN=gw.example.com', 'gw.example.com10.0.0.5', 'CN=Example CA', '2026-01-01 00:00 UTC', '2027-06-01 00:00 UTC', 'AB:CD:EF']);
        // One name per line: a certificate can cover many.
        expect([...c.querySelectorAll('#tls-cert-details .tls-names li')].map(e => e.textContent)).toEqual(['gw.example.com', '10.0.0.5']);
        expect(c.querySelector('#tls-cert-details .tls-mark')).toBeNull();
        expect(hidden(c, '#tls-cert-selfsigned')).toBe(true);
        expect(hidden(c, '#tls-cert-readonly')).toBe(true);
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(false);
    });

    it('says when there are no names, and notes a self-signed certificate', async () => {
        const { c } = await setup(view({ certificate: cert({ names: [], selfSigned: true }) }));
        expect(text(c, '#tls-cert-details dd:nth-of-type(2)')).toBe('None listed');
        expect(hidden(c, '#tls-cert-selfsigned')).toBe(false);
    });

    it('marks an expired certificate and one that expires within 30 days, next to its end date', async () => {
        const expired = await setup(view({ certificate: cert({ expired: true }) }));
        const mark = expired.c.querySelector('#tls-cert-details .tls-mark') as HTMLElement;
        expect([mark.textContent, mark.className]).toEqual(['Expired', 'tls-mark tls-mark-expired']);
        expired.c.remove(); // two copies of the template would put every id in the page twice
        const soon = await setup(view({ certificate: cert({ notAfter: new Date(NOW + 10 * DAY).toISOString() }) }));
        const warn = soon.c.querySelector('#tls-cert-details .tls-mark') as HTMLElement;
        expect([warn.textContent, warn.className]).toEqual(['Expires in 10 days', 'tls-mark tls-mark-soon']);
    });

    it('reads the clock at the time it renders, so the default clock works too', async () => {
        const c = loadModuleDOM('tls-certificates');
        svc.view.mockResolvedValue(ok(view({ certificate: cert({ notAfter: '2000-01-01T00:00:00Z' }) })));
        await TlsCertificatesModule.install(makeCtx(c, ADMIN));
        await flush();
        expect(text(c, '#tls-cert-details .tls-mark')).toBe('Expired');
    });

    it('read-only files: the replace form is disabled with a sentence saying why, and nothing can be sent', async () => {
        const { c } = await setup(view({ certificateWritable: false }));
        expect(hidden(c, '#tls-cert-readonly')).toBe(false);
        for (const sel of ['#tls-cert-file', '#tls-cert-pem', '#tls-key-file', '#tls-key-pem', '#btn-tls-cert-replace']) {
            expect(el<HTMLInputElement>(c, sel).disabled, sel).toBe(true);
        }
        // The trust card is governed by its own flag.
        expect(el<HTMLButtonElement>(c, '#btn-tls-ca-add').disabled).toBe(false);
        await click(c, '#btn-tls-cert-replace');
        expect(svc.check).not.toHaveBeenCalled();
    });

    it('a chosen certificate file and key file fill the PEM fields beside them', async () => {
        const { c } = await setup();
        await pick(c, '#tls-cert-file', new File([CERT_PEM], 'gw.crt'));
        await pick(c, '#tls-key-file', new File([KEY], 'gw.key'));
        expect(value(c, '#tls-cert-pem')).toBe(CERT_PEM);
        expect(value(c, '#tls-key-pem')).toBe(KEY);
    });

    it('a file that is too large is refused unread, and clearing the choice leaves the field as typed', async () => {
        const { c } = await setup();
        type(c, '#tls-cert-pem', 'typed');
        const big = new File(['x'], 'huge.crt');
        Object.defineProperty(big, 'size', { value: MAX_TLS_REQUEST_BYTES + 1 });
        await pick(c, '#tls-cert-file', big);
        expect(text(c, '#tls-cert-error')).toBe('huge.crt is larger than 64 KiB, the most the gateway accepts in one request.');
        expect(value(c, '#tls-cert-pem')).toBe('typed');
        await pick(c, '#tls-cert-file', null);
        expect(hidden(c, '#tls-cert-error')).toBe(true);
        expect(value(c, '#tls-cert-pem')).toBe('typed');
    });
});

describe('tls-certificates -- replace certificate', () => {
    async function ready(v: TlsView = view()) {
        const s = await setup(v);
        type(s.c, '#tls-cert-pem', CERT_PEM);
        type(s.c, '#tls-key-pem', KEY);
        return s;
    }
    const NEW = cert({ subject: 'CN=new.example.com', notAfter: '2028-01-01T00:00:00Z', sha256: '11:22:33' });

    it('without a certificate: says so, sends nothing, and empties the key field', async () => {
        const { c } = await setup();
        type(c, '#tls-key-pem', KEY);
        await click(c, '#btn-tls-cert-replace');
        expect(text(c, '#tls-cert-error')).toBe('Choose a certificate file or paste the certificate (PEM).');
        expect(svc.check).not.toHaveBeenCalled();
        expect(value(c, '#tls-key-pem')).toBe('');
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(false);
    });

    it('without a key: says so and sends nothing', async () => {
        const { c } = await setup();
        type(c, '#tls-cert-pem', CERT_PEM);
        await click(c, '#btn-tls-cert-replace');
        expect(text(c, '#tls-cert-error')).toBe('Choose a key file or paste the private key (PEM).');
        expect(svc.check).not.toHaveBeenCalled();
        expect(value(c, '#tls-cert-pem')).toBe(CERT_PEM);
    });

    it('a pair larger than one gateway request, as the JSON it is sent in, is refused before it is sent', async () => {
        const { c } = await setup();
        // 44 000 bytes as typed, but each newline is two bytes in JSON: 66 000 on the wire.
        type(c, '#tls-cert-pem', 'A\n'.repeat(22_000));
        type(c, '#tls-key-pem', KEY);
        await click(c, '#btn-tls-cert-replace');
        expect(text(c, '#tls-cert-error')).toBe('The certificate and key together are larger than the 64 KiB the gateway accepts in one request. Leave out any certificate the chain does not need.');
        expect(svc.check).not.toHaveBeenCalled();
        expect(value(c, '#tls-key-pem')).toBe('');
    });

    it('a pair the gateway refuses shows its reason, installs nothing, empties the key, keeps the certificate', async () => {
        const { c } = await ready();
        svc.check.mockResolvedValue(refused('invalid', 422, { field: 'key', reason: 'The key does not match the certificate.' }));
        await click(c, '#btn-tls-cert-replace');
        expect(svc.check).toHaveBeenCalledWith({ certificate: CERT_PEM, key: KEY });
        expect(text(c, '#tls-cert-error')).toBe('The key does not match the certificate.');
        expect(confirmOpen()).toBe(false);
        expect(svc.replace).not.toHaveBeenCalled();
        expect(value(c, '#tls-key-pem')).toBe('');
        expect(value(c, '#tls-cert-pem')).toBe(CERT_PEM);
        expect(hidden(c, '#tls-cert-preview')).toBe(true);
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(false);
    });

    it('shows what will be installed and asks before installing; Cancel installs nothing and still empties the key', async () => {
        const { c } = await ready();
        svc.check.mockResolvedValue(ok({ certificate: NEW }));
        el<HTMLButtonElement>(c, '#btn-tls-cert-replace').click();
        await flush();
        expect(hidden(c, '#tls-cert-preview')).toBe(false);
        expect(text(c, '#tls-cert-preview-details')).toContain('CN=new.example.com');
        expect(text(c, '#tls-cert-preview-details')).toContain('11:22:33');
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(true);
        const question = await answer(false);
        expect(question).toBe(
            'Install this certificate? Subject: CN=new.example.com. Valid to 2028-01-01 00:00 UTC. '
            + "Fingerprint (SHA-256): 11:22:33. It replaces the gateway's certificate at once; open connections carry on.");
        expect(svc.replace).not.toHaveBeenCalled();
        expect(value(c, '#tls-key-pem')).toBe('');
        expect(hidden(c, '#tls-cert-preview')).toBe(true);
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(false);
    });

    it('on confirm sends the same pair, reloads the page, toasts, and leaves no key or certificate in the form', async () => {
        const { c } = await ready();
        svc.check.mockResolvedValue(ok({ certificate: NEW }));
        svc.replace.mockResolvedValue(ok({ certificate: NEW }));
        svc.view.mockResolvedValue(ok(view({ certificate: NEW })));
        el<HTMLButtonElement>(c, '#btn-tls-cert-replace').click();
        await flush();
        await answer(true);
        expect(svc.replace).toHaveBeenCalledWith({ certificate: CERT_PEM, key: KEY });
        expect(toastMock.showToast).toHaveBeenCalledWith('Certificate replaced. New connections use it now.', 'ok');
        expect(text(c, '#tls-cert-details dd')).toBe('CN=new.example.com');
        expect(value(c, '#tls-key-pem')).toBe('');
        expect(value(c, '#tls-cert-pem')).toBe('');
        expect(hidden(c, '#tls-cert-error')).toBe(true);
    });

    it('a replace the gateway refuses shows the message and still empties the key', async () => {
        const { c } = await ready();
        svc.check.mockResolvedValue(ok({ certificate: NEW }));
        svc.replace.mockResolvedValue(refused('tls_write_failed', 500));
        el<HTMLButtonElement>(c, '#btn-tls-cert-replace').click();
        await flush();
        await answer(true);
        expect(text(c, '#tls-cert-error')).toBe('The gateway could not write its certificate or trust files, so nothing was changed. Its log has the cause.');
        expect(svc.view).toHaveBeenCalledTimes(1);
        expect(value(c, '#tls-key-pem')).toBe('');
        expect(toastMock.showToast).not.toHaveBeenCalled();
    });

    it('files that turned read-only since the page loaded: the page reloads into its read-only state and says why', async () => {
        const { c } = await ready();
        svc.check.mockResolvedValue(ok({ certificate: NEW }));
        svc.replace.mockResolvedValue(refused('tls_read_only', 409));
        svc.view.mockResolvedValue(ok(view({ certificateWritable: false })));
        el<HTMLButtonElement>(c, '#btn-tls-cert-replace').click();
        await flush();
        await answer(true);
        expect(text(c, '#tls-cert-error')).toBe("The gateway's certificate or trust files are read-only on its host, so they cannot be changed here.");
        expect(hidden(c, '#tls-cert-readonly')).toBe(false);
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(true);
        expect(value(c, '#tls-key-pem')).toBe('');
    });

    it('the key never reaches a toast or a message, and a key file choice is emptied with the field', async () => {
        const { c } = await setup();
        await pick(c, '#tls-key-file', new File([KEY], 'gw.key'));
        type(c, '#tls-cert-pem', CERT_PEM);
        svc.check.mockResolvedValue(refused('invalid', 422, { reason: 'The certificate is expired.' }));
        await click(c, '#btn-tls-cert-replace');
        expect(value(c, '#tls-key-pem')).toBe('');
        expect(el<HTMLInputElement>(c, '#tls-key-file').value).toBe('');
        expect(c.textContent).not.toContain('TEST-ONLY-NOT-A-REAL-KEY');
        expect(JSON.stringify(toastMock.showToast.mock.calls)).not.toContain('PRIVATE KEY');
    });
});

describe('tls-certificates -- trusted CAs', () => {
    it('says when the trust directory holds no files', async () => {
        const { c } = await setup();
        expect(text(c, '#tls-trust-list')).toBe('No CA files in the trust directory.');
    });

    it('lists each file with its certificates, their end dates, marks and fingerprints, and a problem file with its reason', async () => {
        const { c } = await setup(view({
            trust: [
                CA('broker-ca.crt', { notAfter: '2027-06-01T00:00:00Z' }),
                CA('old.pem', { expired: true }),
                { name: 'empty.crt', certificates: [], problem: 'no certificate in it' },
            ],
        }));
        const files = [...c.querySelectorAll('.tls-trust-file')];
        expect(files.map(f => (f as HTMLElement).dataset.name)).toEqual(['broker-ca.crt', 'old.pem', 'empty.crt']);
        expect(files[0].querySelector('li')!.textContent).toBe('CN=Broker CA: valid to 2027-06-01 00:00 UTC; SHA-256 AB:CD:EF');
        expect(files[1].querySelector('li .tls-mark-expired')!.textContent).toBe('Expired');
        expect(files[0].querySelector('li .tls-mark')).toBeNull();
        expect(files[2].querySelector('ul')).toBeNull();
        expect(files[2].querySelector('.tls-trust-problem')!.textContent).toBe('No certificate from this file: no certificate in it');
        expect(files[0].querySelector('.tls-trust-problem')).toBeNull();
        expect(el(files[0] as HTMLElement, '.tls-trust-delete').getAttribute('aria-label')).toBe('Delete "broker-ca.crt"');
    });

    it('read-only trust files: add and every Delete are disabled with a sentence saying why', async () => {
        const { c } = await setup(view({ trustWritable: false, trust: [CA('broker-ca.crt')] }));
        expect(hidden(c, '#tls-trust-readonly')).toBe(false);
        for (const sel of ['#tls-ca-file', '#tls-ca-pem', '#tls-ca-name', '#btn-tls-ca-add', '.tls-trust-delete']) {
            expect(el<HTMLInputElement>(c, sel).disabled, sel).toBe(true);
        }
        expect(el<HTMLButtonElement>(c, '#btn-tls-cert-replace').disabled).toBe(false);
        await click(c, '#btn-tls-ca-add');
        expect(svc.addTrust).not.toHaveBeenCalled();
    });

    it('a chosen CA file fills the PEM field', async () => {
        const { c } = await setup();
        await pick(c, '#tls-ca-file', new File([CERT_PEM], 'ca.crt'));
        expect(value(c, '#tls-ca-pem')).toBe(CERT_PEM);
    });

    it('adding without a certificate says so and sends nothing', async () => {
        const { c } = await setup();
        await click(c, '#btn-tls-ca-add');
        expect(text(c, '#tls-ca-error')).toBe('Choose a CA certificate file or paste the certificate (PEM).');
        expect(svc.addTrust).not.toHaveBeenCalled();
    });

    it('adds a CA with the name typed, shows the list the gateway answers with, and clears the form', async () => {
        const { c } = await setup();
        type(c, '#tls-ca-pem', CERT_PEM);
        type(c, '#tls-ca-name', ' my-ca.crt ');
        svc.addTrust.mockResolvedValue(ok(view({ trust: [CA('my-ca.crt')] })));
        await click(c, '#btn-tls-ca-add');
        expect(svc.addTrust).toHaveBeenCalledWith({ name: 'my-ca.crt', certificate: CERT_PEM });
        expect(c.querySelectorAll('.tls-trust-file')).toHaveLength(1);
        expect(toastMock.showToast).toHaveBeenCalledWith('CA certificate added. New broker connections trust it now.', 'ok');
        expect([value(c, '#tls-ca-pem'), value(c, '#tls-ca-name')]).toEqual(['', '']);
        expect(el<HTMLButtonElement>(c, '#btn-tls-ca-add').disabled).toBe(false);
    });

    it('a CA file larger than one gateway request is refused before it is sent, and kept as typed', async () => {
        const { c } = await setup();
        const pem = 'A'.repeat(MAX_TLS_REQUEST_BYTES);
        type(c, '#tls-ca-pem', pem);
        await click(c, '#btn-tls-ca-add');
        expect(text(c, '#tls-ca-error')).toBe('This CA file is larger than the 64 KiB the gateway accepts in one request. Split it into smaller files and add each one.');
        expect(svc.addTrust).not.toHaveBeenCalled();
        expect(value(c, '#tls-ca-pem')).toBe(pem);
    });

    it('adds a CA without a name: the gateway names it', async () => {
        const { c } = await setup();
        type(c, '#tls-ca-pem', CERT_PEM);
        svc.addTrust.mockResolvedValue(ok(view({ trust: [CA('broker-ca.crt')] })));
        await click(c, '#btn-tls-ca-add');
        expect(svc.addTrust).toHaveBeenCalledWith({ certificate: CERT_PEM });
    });

    it('a refused add (a duplicate name, a private key as a CA) shows the message and keeps what was typed', async () => {
        const { c } = await setup();
        type(c, '#tls-ca-pem', CERT_PEM);
        type(c, '#tls-ca-name', 'dup.crt');
        svc.addTrust.mockResolvedValue(refused('exists', 409));
        await click(c, '#btn-tls-ca-add');
        expect(text(c, '#tls-ca-error')).toBe('A CA file with that name already exists. Delete it first, or choose another name.');
        expect(value(c, '#tls-ca-pem')).toBe(CERT_PEM);
        svc.addTrust.mockResolvedValue(refused('invalid', 422, { field: 'certificate', reason: 'A private key is not a CA certificate.' }));
        await click(c, '#btn-tls-ca-add');
        expect(text(c, '#tls-ca-error')).toBe('A private key is not a CA certificate.');
        expect(svc.view).toHaveBeenCalledTimes(1);
        expect(toastMock.showToast).not.toHaveBeenCalled();
    });

    it('an add that finds the files read-only reloads the page into its read-only state', async () => {
        const { c } = await setup();
        type(c, '#tls-ca-pem', CERT_PEM);
        svc.addTrust.mockResolvedValue(refused('tls_read_only', 409));
        svc.view.mockResolvedValue(ok(view({ trustWritable: false })));
        await click(c, '#btn-tls-ca-add');
        expect(hidden(c, '#tls-trust-readonly')).toBe(false);
        expect(el<HTMLButtonElement>(c, '#btn-tls-ca-add').disabled).toBe(true);
        expect(text(c, '#tls-ca-error')).toContain('read-only');
    });
});

describe('tls-certificates -- delete a CA', () => {
    const withCa = () => setup(view({ trust: [CA('broker-ca.crt'), CA('other.pem')] }));

    it('asks first; Cancel deletes nothing', async () => {
        const { c } = await withCa();
        el<HTMLButtonElement>(c, '.tls-trust-delete').click();
        await flush();
        const question = await answer(false);
        expect(question).toBe('Delete "broker-ca.crt" from the trusted CAs? Brokers that rely on it stop verifying for new connections at once.');
        expect(svc.removeTrust).not.toHaveBeenCalled();
    });

    it('on confirm deletes that file and shows the list the gateway answers with', async () => {
        const { c } = await withCa();
        svc.removeTrust.mockResolvedValue(ok(view({ trust: [CA('other.pem')] })));
        el<HTMLButtonElement>(c, '.tls-trust-delete').click();
        await flush();
        await answer(true);
        expect(svc.removeTrust).toHaveBeenCalledWith('broker-ca.crt');
        expect([...c.querySelectorAll('.tls-trust-file')].map(f => (f as HTMLElement).dataset.name)).toEqual(['other.pem']);
        expect(toastMock.showToast).toHaveBeenCalledWith('Deleted broker-ca.crt', 'ok');
    });

    it('a file already gone: says so and reloads the list', async () => {
        const { c } = await withCa();
        svc.removeTrust.mockResolvedValue(refused('not_found', 404));
        svc.view.mockResolvedValue(ok(view({ trust: [CA('other.pem')] })));
        el<HTMLButtonElement>(c, '.tls-trust-delete').click();
        await flush();
        await answer(true);
        expect(text(c, '#tls-trust-error')).toBe('Not found. It may already have been removed.');
        expect(c.querySelectorAll('.tls-trust-file')).toHaveLength(1);
    });

    it('files that turned read-only: says so and reloads into the read-only state', async () => {
        const { c } = await withCa();
        svc.removeTrust.mockResolvedValue(refused('tls_read_only', 409));
        svc.view.mockResolvedValue(ok(view({ trustWritable: false, trust: [CA('broker-ca.crt')] })));
        el<HTMLButtonElement>(c, '.tls-trust-delete').click();
        await flush();
        await answer(true);
        expect(text(c, '#tls-trust-error')).toContain('read-only');
        expect(el<HTMLButtonElement>(c, '.tls-trust-delete').disabled).toBe(true);
    });

    it('any other failure shows its message without reloading', async () => {
        const { c } = await withCa();
        svc.removeTrust.mockResolvedValue(refused('tls_write_failed', 500));
        el<HTMLButtonElement>(c, '.tls-trust-delete').click();
        await flush();
        await answer(true);
        expect(text(c, '#tls-trust-error')).toContain('could not write');
        expect(svc.view).toHaveBeenCalledTimes(1);
        expect(c.querySelectorAll('.tls-trust-file')).toHaveLength(2);
    });
});
