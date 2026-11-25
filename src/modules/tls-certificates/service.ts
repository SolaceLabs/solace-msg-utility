/**
 * Certificates service -- the gateway's `/managed/tls*` API
 * (go-web-proxy/tls_api.go), authenticated by the session cookie (see
 * `src/core/services/managed-api.ts`).
 *
 * Paths never appear: the gateway names its certificate and trust files by
 * environment variables and answers only with what is in them. The private
 * key goes out in a request body and is never in an answer.
 */
import { managedRequest } from '../../core/services/managed-api';

/** One X.509 certificate as the gateway describes it. Times are RFC 3339, UTC. */
export interface CertInfo {
    subject: string;
    issuer: string;
    /** DNS names and IP addresses. */
    names: string[];
    notBefore: string;
    notAfter: string;
    /** Upper-case hex pairs joined by `:`. */
    sha256: string;
    selfSigned: boolean;
    expired: boolean;
}

/** A file in the trust directory; `problem` says why it gave no certificate ('' when it did). */
export interface TrustFile {
    name: string;
    certificates: CertInfo[];
    problem: string;
}

/**
 * The standard root CAs the gateway image carries: whether they are trusted now
 * (the Gateway Settings key tls.standardRoots), each one sorted by subject, and
 * why there are none ('' when there are).
 */
export interface StandardRoots {
    trusted: boolean;
    certificates: CertInfo[];
    problem: string;
}

/** The GET /managed/tls body, and the answer of the trust writes. */
export interface TlsView {
    certificate: CertInfo;
    certificateWritable: boolean;
    trustWritable: boolean;
    /** Sorted by file name. */
    trust: TrustFile[];
    standard: StandardRoots;
}

/** A certificate (PEM, leaf first) and its private key (PEM). */
export interface CertificateBody {
    certificate: string;
    key: string;
}

/** A CA file to add: PEM with one or more certificates, and an optional file name. */
export interface TrustBody {
    name?: string;
    certificate: string;
}

export function createTlsService() {
    return {
        view: () => managedRequest<TlsView>('GET', '/managed/tls'),
        /** Verifies the pair and describes the leaf; writes nothing. */
        check: (body: CertificateBody) => managedRequest<{ certificate: CertInfo }>('POST', '/managed/tls/certificate/check', body),
        /** Verifies, writes and swaps the pair at once. */
        replace: (body: CertificateBody) => managedRequest<{ certificate: CertInfo }>('PUT', '/managed/tls/certificate', body),
        addTrust: (body: TrustBody) => managedRequest<TlsView>('POST', '/managed/tls/trust', body),
        removeTrust: (name: string) => managedRequest<TlsView>('DELETE', `/managed/tls/trust/${encodeURIComponent(name)}`),
    };
}

export type TlsService = ReturnType<typeof createTlsService>;
