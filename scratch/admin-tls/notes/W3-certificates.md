# W3-certificates: the Certificates module and the two stock messages (nothing was run)

Files: src/modules/tls-certificates/{module.ts,service.ts,index.html,styles.css}, tests/modules/tls-certificates/{module,service}.test.ts,
src/variants/{admin,managed-demo,all-for-testing-only}.ts, src/core/rbac.ts, src/core/services/managed-api.ts,
tests/{variants,core/rbac,core/services/managed-api,build/module-registry-plugin}.test.ts (one-line additions).

## Module
- id `tls-certificates`, name `Certificates`, export `TlsCertificatesModule` from src/modules/tls-certificates/module.ts.
  `install(app, opts?: { now?(): number })` (clock for the expiry marks). Exports: `formatUtc`, `expiryMark(cert, now)`, `MAX_PEM_BYTES` (256 KiB), `EXPIRY_WARN_DAYS` (30).
- Priority 8 in admin, managed-demo and all-for-testing-only (between gateway-settings 10 and backup 5). rbac MODULE_REQUIREMENTS: `'tls-certificates': 'admin'`.
- service.ts: `createTlsService()` -> `view()`, `check({certificate,key})`, `replace({certificate,key})`, `addTrust({name?,certificate})`, `removeTrust(name)`;
  types `CertInfo, TrustFile, TlsView, CertificateBody, TrustBody, TlsService`.
- Ids: `#tls-view` (hidden until admin), gate `#tls-gate`, `#btn-tls-reload`, `#tls-error`; cert card `#tls-cert-card` (`#tls-cert-details` dl, `#tls-cert-selfsigned`,
  `#tls-cert-readonly`, `#tls-cert-file`, `#tls-cert-pem`, `#tls-key-file`, `#tls-key-pem`, `#tls-cert-error`, `#tls-cert-preview`, `#tls-cert-preview-details`, `#btn-tls-cert-replace`);
  trust card `#tls-trust-card` (`#tls-trust-readonly`, `#tls-trust-error`, `#tls-trust-list` holding `.tls-trust-file[data-name]` with `button.tls-trust-delete`,
  `#tls-ca-file`, `#tls-ca-pem`, `#tls-ca-name`, `#tls-ca-error`, `#btn-tls-ca-add`). Marks: `span.tls-mark.tls-mark-expired|tls-mark-soon`.
- Flow: a chosen file is read into the PEM field. Replace = check -> preview + confirm dialog (confirmLabel "Install") -> PUT; the key is a local of that
  function, and its field and file input are emptied in `finally` (refusal, cancel, success, validation error). Delete CA: confirm (confirmLabel "Delete").
  `tls_read_only` (and `not_found` on delete) reload the view.
- Stock messages added to MESSAGES (so to MANAGED_ERROR_CODES): `tls_read_only`, `tls_write_failed`.

## Next agents
- tests/mock-broker/gateway/error-codes.test.ts (not mine): it enforces MANAGED_ERROR_CODES, so add `tls_write_failed` to NOT_SIMULATED and `tls_read_only` to FAULTS.
- tests/mock-broker/demo-flow.test.ts (not mine): MODULES map gains `'tls-certificates': TlsCertificatesModule`; the nav order assertion (line ~240) becomes
  `... 'gateway-settings', 'tls-certificates', 'backup'`.
- Other tests enumerating the admin modules or nav (tests/integration/admin-session.test.ts, scripts/e2e.mjs browser checks): re-check.
- Docs: user-guide.md (Certificates page), developer-guide.md, architecture.md (module list), test-report.md.
