/**
 * Certificates Module (managed/RBAC variant, admin-only).
 *
 * Shows the gateway's own certificate and the CA certificates it trusts for
 * brokers, and, when the gateway's files are writable, replaces the
 * certificate and adds or deletes CA files (go-web-proxy/tls_api.go). Every
 * change applies at once on the gateway, with no restart. Ships in the
 * standalone `/solAdmin` app and the Provisioned demo; the id maps to
 * `'admin'` in rbac.ts's MODULE_REQUIREMENTS, and it is never in the module
 * catalog. Imports only from `src/core/*` and its own service.
 *
 * Replacing the certificate is one attempt: the pair is sent to the check
 * route, the answer (what would be installed) is shown and confirmed, and the
 * same pair is sent to the replace route. The private key lives only in its
 * field and in that function's local variable; the field is emptied when the
 * attempt ends, whatever its outcome (a refusal, a cancel, success). The
 * module keeps no copy.
 *
 * A file chosen in a file input is read into the PEM field next to it, so the
 * field is always what is sent.
 */
import { required, setError } from '../../core/dom';
import { createGate, gateOnAdminSession } from '../../core/components/module-gate';
import { confirmDialog } from '../../core/components/confirm-dialog';
import { logger } from '../../core/logger';
import { showToast } from '../../core/toast';
import { formatUtc } from '../../core/utils';
import { reportManagedFailure } from '../../core/services/managed-api';
import { createTlsService, type CertInfo, type TlsView } from './service';
import type { AppContext } from '../../core/types';

/**
 * The most the gateway takes in one request body (its 64 KiB JSON cap). A file
 * larger than this cannot be sent, so it is refused before it is read into the
 * page; a pair, or a CA file, is measured as the JSON it travels in before it
 * is sent.
 */
export const MAX_TLS_REQUEST_BYTES = 64 * 1024;

/** Whether `body`, as the JSON it is sent as, fits one gateway request. */
const fitsOneRequest = (body: object): boolean => new TextEncoder().encode(JSON.stringify(body)).length <= MAX_TLS_REQUEST_BYTES;

/** A certificate that ends within this many days is marked. */
export const EXPIRY_WARN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Options for tests: the clock the expiry marks read. */
export interface TlsCertificatesOptions {
    now?(): number;
}

/** The mark a certificate's expiry earns: expired, or ending within EXPIRY_WARN_DAYS; null when neither. */
export function expiryMark(cert: CertInfo, now: number): { kind: 'expired' | 'soon'; text: string } | null {
    const end = Date.parse(cert.notAfter);
    if (cert.expired || end <= now) return { kind: 'expired', text: 'Expired' };
    const days = Math.ceil((end - now) / DAY_MS);
    if (!(days <= EXPIRY_WARN_DAYS)) return null;
    return { kind: 'soon', text: `Expires in ${days} ${days === 1 ? 'day' : 'days'}` };
}

function markElement(cert: CertInfo, now: number): HTMLElement | null {
    const mark = expiryMark(cert, now);
    if (!mark) return null;
    const span = document.createElement('span');
    span.className = `tls-mark tls-mark-${mark.kind}`;
    span.textContent = mark.text;
    return span;
}

/** The names a certificate covers, one per line: a certificate can list many. */
function namesList(names: string[]): HTMLElement {
    const ul = document.createElement('ul');
    ul.className = 'tls-names';
    for (const name of names) {
        const li = document.createElement('li');
        li.textContent = name;
        ul.appendChild(li);
    }
    return ul;
}

/** A certificate as a definition list: subject, names, issuer, validity (with its mark) and fingerprint. */
function fillDetails(dl: HTMLElement, cert: CertInfo, now: number): void {
    dl.replaceChildren();
    const row = (label: string, value: string, extra?: HTMLElement | null, className?: string) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        if (className) dd.className = className;
        if (extra) dd.appendChild(extra);
        dl.append(dt, dd);
    };
    row('Subject', cert.subject);
    row('Names', cert.names.length ? '' : 'None listed', cert.names.length ? namesList(cert.names) : null);
    row('Issuer', cert.issuer);
    row('Valid from', formatUtc(cert.notBefore));
    row('Valid to', formatUtc(cert.notAfter), markElement(cert, now));
    row('Fingerprint (SHA-256)', cert.sha256, null, 'tls-fingerprint');
}

export const TlsCertificatesModule = {
    name: 'Certificates',
    id: 'tls-certificates',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>',

    async install(app: AppContext, opts: TlsCertificatesOptions = {}) {
        const { container, eventBus } = app;
        const now = opts.now ?? Date.now;
        const q = <T extends HTMLElement>(sel: string) => required<T>(container, sel);
        const els = {
            view: q<HTMLElement>('#tls-view'),
            btnReload: q<HTMLButtonElement>('#btn-tls-reload'),
            error: q<HTMLElement>('#tls-error'),
            certDetails: q<HTMLElement>('#tls-cert-details'),
            certSelfSigned: q<HTMLElement>('#tls-cert-selfsigned'),
            certReadonly: q<HTMLElement>('#tls-cert-readonly'),
            certFile: q<HTMLInputElement>('#tls-cert-file'),
            certPem: q<HTMLTextAreaElement>('#tls-cert-pem'),
            keyFile: q<HTMLInputElement>('#tls-key-file'),
            keyPem: q<HTMLTextAreaElement>('#tls-key-pem'),
            certError: q<HTMLElement>('#tls-cert-error'),
            certPreview: q<HTMLElement>('#tls-cert-preview'),
            previewDetails: q<HTMLElement>('#tls-cert-preview-details'),
            btnReplace: q<HTMLButtonElement>('#btn-tls-cert-replace'),
            trustReadonly: q<HTMLElement>('#tls-trust-readonly'),
            trustError: q<HTMLElement>('#tls-trust-error'),
            trustList: q<HTMLElement>('#tls-trust-list'),
            caFile: q<HTMLInputElement>('#tls-ca-file'),
            caPem: q<HTMLTextAreaElement>('#tls-ca-pem'),
            caName: q<HTMLInputElement>('#tls-ca-name'),
            caError: q<HTMLElement>('#tls-ca-error'),
            btnAddCa: q<HTMLButtonElement>('#btn-tls-ca-add'),
            standardStatus: q<HTMLElement>('#tls-standard-status'),
            standardProblem: q<HTMLElement>('#tls-standard-problem'),
            standardDetails: q<HTMLElement>('#tls-standard-details'),
            standardSummary: q<HTMLElement>('#tls-standard-summary'),
            standardList: q<HTMLElement>('#tls-standard-list'),
        };

        const service = createTlsService();
        const gate = createGate(container, {
            id: 'tls-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in as an administrator to see or change the gateway\'s certificates.',
        });

        /** Whether the gateway can write its certificate pair / trust directory, as last reported. */
        let certWritable = true;
        let trustWritable = true;

        const fail = (el: HTMLElement) => (msg: string) => setError(el, msg);

        // ---- view ----

        function applyWritable(): void {
            els.certReadonly.classList.toggle('hidden', certWritable);
            for (const f of [els.certFile, els.certPem, els.keyFile, els.keyPem, els.btnReplace]) f.disabled = !certWritable;
            els.trustReadonly.classList.toggle('hidden', trustWritable);
            for (const f of [els.caFile, els.caPem, els.caName, els.btnAddCa]) f.disabled = !trustWritable;
        }

        /** One certificate as a list line: subject, end of validity (with its mark) and fingerprint. */
        function certLine(c: CertInfo): HTMLLIElement {
            const li = document.createElement('li');
            li.textContent = `${c.subject}: valid to ${formatUtc(c.notAfter)}; SHA-256 ${c.sha256}`;
            const mark = markElement(c, now());
            if (mark) li.appendChild(mark);
            return li;
        }

        function renderTrust(view: TlsView): void {
            els.trustList.replaceChildren();
            if (!view.trust.length) {
                const p = document.createElement('p');
                p.className = 'text-secondary';
                p.textContent = 'No CA files in the trust directory.';
                els.trustList.appendChild(p);
                return;
            }
            for (const file of view.trust) {
                const box = document.createElement('div');
                box.className = 'tls-trust-file';
                box.dataset.name = file.name;
                const head = document.createElement('div');
                head.className = 'tls-trust-head';
                const name = document.createElement('span');
                name.textContent = file.name;
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn btn-secondary tls-trust-delete';
                del.textContent = 'Delete';
                del.setAttribute('aria-label', `Delete "${file.name}"`);
                del.disabled = !trustWritable;
                del.addEventListener('click', () => void removeTrust(file.name));
                head.append(name, del);
                box.appendChild(head);
                if (file.certificates.length) {
                    const ul = document.createElement('ul');
                    ul.className = 'tls-trust-certs';
                    for (const c of file.certificates) ul.appendChild(certLine(c));
                    box.appendChild(ul);
                }
                if (file.problem) {
                    const p = document.createElement('p');
                    p.className = 'tls-trust-problem';
                    p.textContent = `No certificate from this file: ${file.problem}`;
                    box.appendChild(p);
                }
                els.trustList.appendChild(box);
            }
        }

        function renderStandard(view: TlsView): void {
            const { trusted, certificates, problem } = view.standard;
            const count = `${certificates.length} ${certificates.length === 1 ? 'certificate' : 'certificates'}`;
            els.standardStatus.textContent = trusted
                ? `Trusted: brokers whose certificates chain to one of these ${count} are accepted.`
                : 'Not trusted: turned off on Gateway Settings. Only the CA files above are trusted.';
            els.standardProblem.textContent = problem;
            els.standardProblem.classList.toggle('hidden', !problem);
            els.standardDetails.classList.toggle('hidden', !certificates.length);
            els.standardSummary.textContent = `Show the ${count}`;
            els.standardList.replaceChildren(...certificates.map(certLine));
        }

        function renderView(view: TlsView): void {
            certWritable = view.certificateWritable;
            trustWritable = view.trustWritable;
            fillDetails(els.certDetails, view.certificate, now());
            els.certSelfSigned.classList.toggle('hidden', !view.certificate.selfSigned);
            renderTrust(view);
            renderStandard(view);
            applyWritable();
        }

        async function load(): Promise<void> {
            setError(els.error, null);
            const res = await service.view();
            if (!res.ok) {
                reportManagedFailure(res, eventBus, fail(els.error));
                return;
            }
            renderView(res.data);
        }

        // ---- files ----

        /** Reads a chosen file into the PEM field beside it; a file too large to be PEM is refused unread. */
        async function fillFromFile(input: HTMLInputElement, pem: HTMLTextAreaElement, errorEl: HTMLElement): Promise<void> {
            setError(errorEl, null);
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > MAX_TLS_REQUEST_BYTES) {
                input.value = '';
                setError(errorEl, `${file.name} is larger than 64 KiB, the most the gateway accepts in one request.`);
                return;
            }
            pem.value = await file.text();
        }

        // ---- gateway certificate ----

        async function replaceCertificate(): Promise<void> {
            setError(els.certError, null);
            els.certPreview.classList.add('hidden');
            const certificate = els.certPem.value.trim();
            const key = els.keyPem.value.trim(); // this attempt's only copy besides the field
            els.btnReplace.disabled = true;
            try {
                if (!certificate) {
                    setError(els.certError, 'Choose a certificate file or paste the certificate (PEM).');
                    return;
                }
                if (!key) {
                    setError(els.certError, 'Choose a key file or paste the private key (PEM).');
                    return;
                }
                if (!fitsOneRequest({ certificate, key })) {
                    setError(els.certError, 'The certificate and key together are larger than the 64 KiB the gateway accepts in one request. Leave out any certificate the chain does not need.');
                    return;
                }
                const checked = await service.check({ certificate, key });
                if (!checked.ok) {
                    reportManagedFailure(checked, eventBus, fail(els.certError));
                    return;
                }
                const cert = checked.data.certificate;
                fillDetails(els.previewDetails, cert, now());
                els.certPreview.classList.remove('hidden');
                const yes = await confirmDialog(
                    `Install this certificate? Subject: ${cert.subject}. Valid to ${formatUtc(cert.notAfter)}. `
                    + `Fingerprint (SHA-256): ${cert.sha256}. It replaces the gateway's certificate at once; open connections carry on.`,
                    { confirmLabel: 'Install' });
                if (!yes) return;
                const res = await service.replace({ certificate, key });
                if (!res.ok) {
                    // The files turned read-only since the page loaded: show the page as it now is.
                    if (res.code === 'tls_read_only') await load();
                    reportManagedFailure(res, eventBus, fail(els.certError));
                    return;
                }
                els.certPem.value = '';
                showToast('Certificate replaced. New connections use it now.', 'ok');
                await load();
            } finally {
                els.keyPem.value = '';
                els.keyFile.value = '';
                els.certPreview.classList.add('hidden');
                els.btnReplace.disabled = !certWritable;
            }
        }

        // ---- trusted CAs ----

        async function addTrust(): Promise<void> {
            setError(els.caError, null);
            const certificate = els.caPem.value.trim();
            if (!certificate) {
                setError(els.caError, 'Choose a CA certificate file or paste the certificate (PEM).');
                return;
            }
            const name = els.caName.value.trim();
            const body = name ? { name, certificate } : { certificate };
            if (!fitsOneRequest(body)) {
                setError(els.caError, 'This CA file is larger than the 64 KiB the gateway accepts in one request. Split it into smaller files and add each one.');
                return;
            }
            els.btnAddCa.disabled = true;
            const res = await service.addTrust(body);
            els.btnAddCa.disabled = !trustWritable;
            if (!res.ok) {
                if (res.code === 'exists') {
                    setError(els.caError, 'A CA file with that name already exists. Delete it first, or choose another name.');
                    return;
                }
                if (res.code === 'tls_read_only') await load();
                reportManagedFailure(res, eventBus, fail(els.caError));
                return;
            }
            els.caPem.value = '';
            els.caName.value = '';
            els.caFile.value = '';
            renderView(res.data);
            showToast('CA certificate added. New broker connections trust it now.', 'ok');
        }

        async function removeTrust(name: string): Promise<void> {
            setError(els.trustError, null);
            if (!(await confirmDialog(
                `Delete "${name}" from the trusted CAs? Brokers that rely on it stop verifying for new connections at once.`,
                { confirmLabel: 'Delete' }))) return;
            const res = await service.removeTrust(name);
            if (!res.ok) {
                // Gone already, or the files turned read-only: show the list as it now is.
                if (res.code === 'not_found' || res.code === 'tls_read_only') await load();
                reportManagedFailure(res, eventBus, fail(els.trustError));
                return;
            }
            renderView(res.data);
            showToast(`Deleted ${name}`, 'ok');
        }

        // Admin sessions only, like the other admin modules. Called at install
        // and on an rbac:changed that changes the session.
        const applyGate = gateOnAdminSession(app, {
            onNoAdmin: () => {
                els.view.classList.add('hidden');
                gate.show();
            },
            onAdmin: () => {
                gate.hide();
                els.view.classList.remove('hidden');
                void load();
            },
        });

        els.btnReload.addEventListener('click', () => void load());
        els.certFile.addEventListener('change', () => void fillFromFile(els.certFile, els.certPem, els.certError));
        els.keyFile.addEventListener('change', () => void fillFromFile(els.keyFile, els.keyPem, els.certError));
        els.caFile.addEventListener('change', () => void fillFromFile(els.caFile, els.caPem, els.caError));
        els.btnReplace.addEventListener('click', () => void replaceCertificate());
        els.btnAddCa.addEventListener('click', () => void addTrust());

        applyGate();
        logger.info('Certificates Module Setup Complete');
    },
};
