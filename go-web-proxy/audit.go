package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// The audit trail: an always-on record of who did what to the gateway in
// Provisioned mode, kept apart from the application log (OWASP Logging Cheat
// Sheet, NIST SP 800-92, ISO 27001 A.8.15). It is never filtered by LOG_LEVEL
// and never read back to rebuild state. One JSON object per line is appended
// to defaultAuditFile (0600) and the file is rotated by size here, because the
// image has no logrotate and runs non-root on a read-only root filesystem.
//
// An entry names parts, never values: no password, hash, key, passphrase,
// cookie or token, no VPN client or SEMP credential, no settings value (the
// settings keys only) and no backup content. Handlers build an entry with
// auditFor, fill what the action adds and hand it to auditor.record.

// auditCategory groups the actions. admin and auth are always recorded;
// access only while audit.access is true.
type auditCategory string

const (
	auditAdmin  auditCategory = "admin"
	auditAuth   auditCategory = "auth"
	auditAccess auditCategory = "access"
)

// Outcomes of an audited action.
const (
	auditOK      = "ok"
	auditRefused = "refused"
)

// The audited actions, by category.
const (
	// admin
	auditUserCreate       = "user.create"
	auditUserUpdate       = "user.update"
	auditUserDelete       = "user.delete"
	auditConnectionCreate = "connection.create"
	auditConnectionUpdate = "connection.update"
	auditConnectionDelete = "connection.delete"
	auditSettingsUpdate   = "settings.update"
	auditBackupExport     = "backup.export"
	auditBackupImport     = "backup.import"
	auditScheduleSet      = "schedule.set"
	auditScheduleRemove   = "schedule.remove"
	auditTwoFactorReset   = "user.twofactor.reset"
	// auth
	auditSignin         = "signin"
	auditSignout        = "signout"
	auditPasswordChange = "password.change"
	auditLockout        = "lockout"
	auditTwoFactorEnrol = "twofactor.enrol"
	// access
	auditDial     = "dial"
	auditSMFOpen  = "smf.open"
	auditSMFClose = "smf.close"
	auditRelay    = "relay"
)

// auditBadCode is the Code of a refused signin or twofactor.enrol whose one-time
// code was wrong. The entry never holds the code typed.
const auditBadCode = "bad_code"

// signedInMsg is the msg of an ok signin: the session opened after the password
// (and the code, when one was asked).
func signedInMsg(user string) string { return user + " signed in" }

// signedInRecoveryMsg is the msg of an ok signin made with a recovery code, and
// how many that user has left.
func signedInRecoveryMsg(user string, left int) string {
	return fmt.Sprintf("%s signed in with a recovery code (%d left)", user, left)
}

// twoFactorEnrolMsg is the msg of an ok twofactor.enrol: the first set-up of a
// user's two-factor, or a later one that replaced it.
func twoFactorEnrolMsg(user string, again bool) string {
	if again {
		return user + " set up two-factor sign-in again"
	}
	return user + " set up two-factor sign-in"
}

// auditEntry is one line of the audit log; the field order is the order of the
// JSON keys. record sets Time (RFC 3339, UTC). Actor is the username, "" for an
// unauthenticated attempt; Client the address withClient resolved; Target the
// user, connection or broker acted on; Code the code the API answered on a
// refusal or error; Changed the names of the parts changed, never values;
// Wrote the store files a committed change wrote (auditWrote).
type auditEntry struct {
	Time    string       `json:"time"`
	Actor   string       `json:"actor"`
	Client  string       `json:"client"`
	Action  string       `json:"action"`
	Target  string       `json:"target,omitempty"`
	Outcome string       `json:"outcome"`
	Code    string       `json:"code,omitempty"`
	Changed []string     `json:"changed,omitempty"`
	Wrote   []auditWrote `json:"wrote,omitempty"`
	Msg     string       `json:"msg"`
}

// auditWrote names a store file a committed change wrote: the base name and,
// for the sealed stores and the schedule, the seq the commit gave the file.
// config.yaml has no seq (its rev is a checksum), so it is left out. Only an
// ok entry that wrote a file carries the list.
type auditWrote struct {
	File string `json:"file"`
	Seq  int64  `json:"seq,omitempty"`
}

// audit.onFailure values: what the gateway does once an audit record could
// not be written. continue (the default) logs the lost record loudly and goes
// on; refuse also refuses every change (503 audit_unavailable) until a record
// can be written again. Sign-ins and reads are never refused.
const (
	auditOnFailureContinue = "continue"
	auditOnFailureRefuse   = "refuse"
)

// auditSettings are the live audit.* keys. onFailure is auditOnFailureContinue
// or auditOnFailureRefuse; the zero value counts as continue.
type auditSettings struct {
	stdout, access bool
	onFailure      string
}

// checkAuditOnFailure validates an audit.onFailure value as the file holds
// it; the empty value (a file or backup from before the key) is the default.
func checkAuditOnFailure(v string) (string, error) {
	switch v {
	case "", auditOnFailureContinue:
		return auditOnFailureContinue, nil
	case auditOnFailureRefuse:
		return v, nil
	}
	return "", fmt.Errorf("key %q has invalid value %q: must be %q or %q", "audit.onFailure", v, auditOnFailureContinue, auditOnFailureRefuse)
}

// Rotation: a write that would take the file past auditMaxBytes renames it to
// .1, shifting .1 to .2 and so on up to .auditKeepFiles; the oldest beyond
// that is deleted, so the trail is at most about 500 MB.
const (
	auditMaxBytes  = 10 << 20
	auditKeepFiles = 50
)

// auditor writes the audit trail. A nil *auditor records nothing, so handlers
// never check for it: Gateway mode has none, and neither do tests that do not
// look at the trail.
type auditor struct {
	lv     *live // audit.stdout and audit.access, read per entry
	stdout io.Writer
	logger *slog.Logger
	now    func() time.Time
	path   string
	// maxSize and keep are fields so tests can rotate after a few lines.
	maxSize int64
	keep    int

	mu   sync.Mutex // one whole line at a time, and the rotation
	f    *os.File   // nil between a failed rotation and the next open
	size int64      // bytes in f
	// failing is true while the last write lost its record. Any write that
	// succeeds clears it. gate reads it for audit.onFailure refuse.
	failing atomic.Bool
}

// openAuditor opens (creating, 0600) the audit log at path. A failure is
// systemic, so the caller stops the start. stdout receives the copy of each
// line while audit.stdout is true.
func openAuditor(path string, lv *live, stdout io.Writer, logger *slog.Logger) (*auditor, error) {
	a := &auditor{
		lv: lv, stdout: stdout, logger: logger, now: time.Now,
		path: path, maxSize: auditMaxBytes, keep: auditKeepFiles,
	}
	if err := a.open(); err != nil {
		return nil, fmt.Errorf("cannot open the audit log %q: %w. Provisioned mode always writes it. Fix: make the directory writable by the gateway user (UID 65532), e.g. mount a writable volume at /data", path, err)
	}
	return a, nil
}

// open appends to the log, creating it. a.mu must be held (or the auditor not
// yet shared).
func (a *auditor) open() error {
	f, err := os.OpenFile(a.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_ = f.Chmod(0o600) // tightens a file an operator created; one we do not own keeps its mode
	a.f, a.size = f, 0
	if info, err := f.Stat(); err == nil {
		a.size = info.Size()
	}
	return nil
}

// auditFor starts an entry for the request's action: the actor is the
// signed-in user (empty before a gate has looked the session up, so a handler
// that knows another name, such as the account a sign-in tried, sets Actor),
// the client the address withClient resolved ("unknown" when it could not).
func auditFor(r *http.Request, action string) auditEntry {
	return auditEntry{Actor: requestUser(r), Client: clientString(r), Action: action}
}

// record appends e. It sets the time, drops an access entry while audit.access
// is off and copies the line to stdout while audit.stdout is on. A record that
// could not be written is logged at ERROR as "AUDIT RECORD LOST" with every
// field of the entry (an entry never holds a secret), so the loss is in the
// application log and the stdout copy; it never fails the caller's request.
// What happens to later changes is audit.onFailure's (gate).
func (a *auditor) record(cat auditCategory, e auditEntry) {
	if a == nil {
		return
	}
	set := a.lv.get().audit
	if cat == auditAccess && !set.access {
		return
	}
	e.Time = a.now().UTC().Format(time.RFC3339)
	line, _ := json.Marshal(e) // strings only: it always marshals, and newlines come out escaped
	line = append(line, '\n')
	a.mu.Lock()
	defer a.mu.Unlock()
	rotateErr, writeErr := a.write(line)
	a.failing.Store(writeErr != nil)
	if rotateErr != nil {
		a.logger.Error("audit log rotation failed; the entry was written to the current file, which keeps growing until the cause is fixed", "path", a.path, "err", rotateErr)
	}
	if writeErr != nil {
		a.logger.Error("AUDIT RECORD LOST", "path", a.path, "err", writeErr,
			"entry_time", e.Time, "actor", e.Actor, "client", e.Client, "action", e.Action, "target", e.Target,
			"outcome", e.Outcome, "code", e.Code, "changed", e.Changed, "wrote", e.Wrote, "entry_msg", e.Msg)
	}
	if set.stdout {
		_, _ = a.stdout.Write(line)
	}
}

// gate is the writer's gate (writer.gate) for audit.onFailure: while the value
// is refuse and the last audit write lost its record, it returns
// errAuditUnavailable and the writer refuses the change with 503. The refusal
// is itself audited by the handler that got it (outcome refused, code
// audit_unavailable); that write succeeding clears the failing state, so the
// next change goes through once the log is writable again. Sign-ins and reads
// never call it. Nil-safe: Gateway mode has no auditor.
func (a *auditor) gate() error {
	if a == nil || a.lv.get().audit.onFailure != auditOnFailureRefuse || !a.failing.Load() {
		return nil
	}
	return errAuditUnavailable
}

// write appends line, rotating first when it would take the file past
// maxSize. It returns the rotation's error and the write's own, separately: a
// rotation that fails still lets the line go to the file as it is (rotateErr
// set, writeErr nil), and only writeErr means the record was lost. a.mu must
// be held.
func (a *auditor) write(line []byte) (rotateErr, writeErr error) {
	if a.size > 0 && a.size+int64(len(line)) > a.maxSize {
		rotateErr = a.rotate()
	}
	if a.f == nil {
		if err := a.open(); err != nil {
			return rotateErr, err
		}
	}
	n, err := a.f.Write(line)
	a.size += int64(n)
	return rotateErr, err
}

// slot is the name of the i-th file: the log itself for 0, else the log with
// the suffix .i.
func (a *auditor) slot(i int) string {
	if i == 0 {
		return a.path
	}
	return a.path + "." + strconv.Itoa(i)
}

// rotate closes the log and moves every file up one place, the oldest falling
// off the end; the caller reopens it. A missing numbered file is skipped.
func (a *auditor) rotate() error {
	_ = a.f.Close() // a failed close of an append-only file loses nothing already written
	a.f = nil
	for i := a.keep; i >= 1; i-- {
		from, to := a.slot(i-1), a.slot(i)
		var err error
		if i == a.keep {
			err = os.Remove(to)
		}
		if err == nil || errors.Is(err, fs.ErrNotExist) {
			err = os.Rename(from, to)
		}
		if err != nil && !(i > 1 && errors.Is(err, fs.ErrNotExist)) {
			return fmt.Errorf("rotate %s to %s: %w", from, to, err)
		}
	}
	return nil
}

// close releases the file at shutdown, after the last request. Nil-safe.
func (a *auditor) close() error {
	if a == nil {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.f == nil {
		return nil
	}
	err := a.f.Close()
	a.f = nil
	return err
}
