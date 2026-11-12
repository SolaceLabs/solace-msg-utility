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
	// auth
	auditSignin         = "signin"
	auditSignout        = "signout"
	auditPasswordChange = "password.change"
	auditLockout        = "lockout"
	// access
	auditDial     = "dial"
	auditSMFOpen  = "smf.open"
	auditSMFClose = "smf.close"
	auditRelay    = "relay"
)

// auditEntry is one line of the audit log; the field order is the order of the
// JSON keys. record sets Time (RFC 3339, UTC). Actor is the username, "" for an
// unauthenticated attempt; Client the address withClient resolved; Target the
// user, connection or broker acted on; Code the code the API answered on a
// refusal or error; Changed the names of the parts changed, never values.
type auditEntry struct {
	Time    string   `json:"time"`
	Actor   string   `json:"actor"`
	Client  string   `json:"client"`
	Action  string   `json:"action"`
	Target  string   `json:"target,omitempty"`
	Outcome string   `json:"outcome"`
	Code    string   `json:"code,omitempty"`
	Changed []string `json:"changed,omitempty"`
	Msg     string   `json:"msg"`
}

// auditSettings are the live audit.* keys.
type auditSettings struct{ stdout, access bool }

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
// is off and copies the line to stdout while audit.stdout is on. A failed
// write is logged at ERROR, without the entry, and never fails the caller's
// request.
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
	if err := a.write(line); err != nil {
		a.logger.Error("audit log write failed, so the trail may be missing entries (the request was not affected)", "path", a.path, "err", err)
	}
	if set.stdout {
		_, _ = a.stdout.Write(line)
	}
}

// write appends line, rotating first when it would take the file past
// maxSize. A rotation that fails is reported with the write's result, and the
// line goes to the file as it is rather than being lost. a.mu must be held.
func (a *auditor) write(line []byte) error {
	var rotateErr error
	if a.size > 0 && a.size+int64(len(line)) > a.maxSize {
		rotateErr = a.rotate()
	}
	if a.f == nil {
		if err := a.open(); err != nil {
			return errors.Join(rotateErr, err)
		}
	}
	n, err := a.f.Write(line)
	a.size += int64(n)
	return errors.Join(rotateErr, err)
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
