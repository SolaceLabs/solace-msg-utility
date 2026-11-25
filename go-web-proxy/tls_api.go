package main

import (
	"errors"
	"net/http"
	"unicode/utf8"
)

// The Certificates page's API (administrators only; tls.go holds the checks
// and the writes, and the live holders they swap):
//
//	GET    /managed/tls                      the certificate, the CA files, whether each can be changed
//	POST   /managed/tls/certificate/check    verify a certificate and key; nothing is written
//	PUT    /managed/tls/certificate          verify, write and swap the certificate and key
//	POST   /managed/tls/trust                add a CA certificate file
//	DELETE /managed/tls/trust/{name}         delete one
//
// A write answers once it is applied: no restart is needed. A path never
// appears in an answer, and the key is read from the body only: it is not
// echoed, logged or audited. The changes are audited as tls.certificate.replace,
// tls.trust.add and tls.trust.remove.

// auditDetailMax cuts the part of an audit message that comes from a
// certificate the administrator supplied, so a huge subject cannot bloat the
// trail.
const auditDetailMax = 200

// tlsPairJSON is the body of the certificate check and replace: PEM text.
type tlsPairJSON struct {
	Certificate string `json:"certificate"`
	Key         string `json:"key"`
}

// tlsTrustAddJSON is the body of a CA file add. A missing name is derived
// from the first certificate's subject.
type tlsTrustAddJSON struct {
	Name        string `json:"name"`
	Certificate string `json:"certificate"`
}

// tlsCertAnswerJSON answers a certificate check or replacement with the leaf.
type tlsCertAnswerJSON struct {
	Certificate tlsCertJSON `json:"certificate"`
}

func (h *managedHandler) registerTLSRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /managed/tls", h.adminOnly(h.getTLS))
	mux.HandleFunc("POST /managed/tls/certificate/check", h.adminOnly(h.checkTLSCertificate))
	mux.HandleFunc("PUT /managed/tls/certificate", h.audited(fixedAction(auditTLSCertificateReplace), h.replaceTLSCertificate))
	mux.HandleFunc("POST /managed/tls/trust", h.audited(fixedAction(auditTLSTrustAdd), h.addTLSTrust))
	mux.HandleFunc("DELETE /managed/tls/trust/{name}", h.audited(fixedAction(auditTLSTrustRemove), h.removeTLSTrust))
}

// writeTLSFailure answers what the TLS manager refused or could not do. The
// manager has logged a failed write with its cause already; the answer carries
// no cause, never a path and never key material. Every error it returns but
// the named refusals is a *tlsWriteError.
func writeTLSFailure(w http.ResponseWriter, err error) {
	var invalid *tlsInvalidError
	switch {
	case errors.As(err, &invalid):
		writeInvalid(w, invalid.Field, invalid.Reason)
	case errors.Is(err, errTLSReadOnly):
		writeError(w, http.StatusConflict, "tls_read_only")
	case errors.Is(err, errTLSExists):
		writeError(w, http.StatusConflict, "exists")
	case errors.Is(err, errTLSNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	default:
		writeError(w, http.StatusInternalServerError, "tls_write_failed")
	}
}

// tlsChangeAllowed is audit.onFailure refuse for the TLS files: a certificate
// or trusted-CA change is refused (503 audit_unavailable) while the audit log
// cannot be written, as every store change is by the writer's gate. The TLS
// files have their own journal and never pass the writer, so the routes ask
// the gate themselves. Restart is not asked: it changes no stored file, and
// restarting may be what makes the audit log writable again.
func (h *managedHandler) tlsChangeAllowed(w http.ResponseWriter) bool {
	if err := h.audit.gate(); err != nil {
		writeError(w, http.StatusServiceUnavailable, "audit_unavailable")
		return false
	}
	return true
}

// clip cuts s to at most n bytes, at a character boundary: a subject in UTF-8
// is never cut inside a character.
func clip(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

func (h *managedHandler) getTLS(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, h.tls.state())
}

func (h *managedHandler) checkTLSCertificate(w http.ResponseWriter, r *http.Request) {
	var in tlsPairJSON
	if !decodeJSON(w, r, &in) {
		return
	}
	cert, err := h.tls.checkCertificate(in.Certificate, in.Key)
	if err != nil {
		writeTLSFailure(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tlsCertAnswerJSON{Certificate: cert})
}

// replaceTLSCertificate writes its ok audit entry once the pair is in place
// and the listener serves it, before the answer.
func (h *managedHandler) replaceTLSCertificate(w http.ResponseWriter, r *http.Request, call *auditCall) {
	var in tlsPairJSON
	if !decodeJSON(w, r, &in) || !h.tlsChangeAllowed(w) {
		return
	}
	cert, err := h.tls.replaceCertificate(in.Certificate, in.Key)
	if err != nil {
		writeTLSFailure(w, err)
		return
	}
	call.detail = "subject " + clip(cert.Subject, auditDetailMax) + ", expires " + cert.NotAfter
	h.recordOK(r, call)
	writeJSON(w, http.StatusOK, tlsCertAnswerJSON{Certificate: cert})
}

// addTLSTrust audits the file name the gateway chose (the derived one when the
// body named none); a refusal is audited under the name asked for, if any.
func (h *managedHandler) addTLSTrust(w http.ResponseWriter, r *http.Request, call *auditCall) {
	var in tlsTrustAddJSON
	if !decodeJSON(w, r, &in) {
		return
	}
	call.target = in.Name
	if !h.tlsChangeAllowed(w) {
		return
	}
	name, err := h.tls.addTrust(in.Name, in.Certificate)
	if err != nil {
		writeTLSFailure(w, err)
		return
	}
	call.target = name
	h.recordOK(r, call)
	writeJSON(w, http.StatusOK, h.tls.state())
}

func (h *managedHandler) removeTLSTrust(w http.ResponseWriter, r *http.Request, call *auditCall) {
	if !h.tlsChangeAllowed(w) {
		return
	}
	if err := h.tls.removeTrust(r.PathValue("name")); err != nil {
		writeTLSFailure(w, err)
		return
	}
	h.recordOK(r, call)
	writeJSON(w, http.StatusOK, h.tls.state())
}
