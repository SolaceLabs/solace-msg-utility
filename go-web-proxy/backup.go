package main

import (
	"bytes"
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Backups. One file format serves both an administrator's export and the
// scheduled backups written into backupRoot, a directory the operator mounts
// from the host. A file holds the users (with their password hashes), the
// connections (with their SEMP and VPN passwords) and config.yaml's settings,
// sealed with a key derived from a passphrase, so it opens on any deployment,
// whatever its store key. On disk it is JSON:
//
//	{"format":"smu-backup","version":1,
//	 "kdf":{"name":"pbkdf2-sha256","iter":600000,"salt":"<base64>"},
//	 "data":"<base64 of sealer.seal(roleBackup, yaml)>"}
//
// The sealing is the stores' own (storecrypt.go): AES-256-GCM with a random
// nonce and the authenticated "SMUS" header, role backup. The kdf parameters
// need no separate authentication: changing them derives another key, and the
// file no longer opens.
//
// A schedule keeps the passphrase-derived key (never the passphrase) sealed
// with the store key in scheduleFileName beside the users file, so a scheduled
// run needs no one to type anything. The file also holds a seq, the counter
// that is the schedule's rev (scheduleFile).
const (
	backupRoot       = "/backup" // fixed, like appRoot: mount a directory here
	scheduleFileName = "backup.yaml"
	backupFormat     = "smu-backup"
	backupVersion    = 1
	backupKDFName    = "pbkdf2-sha256"
	backupSaltBytes  = 16
	backupKeepMax    = 365
	backupNameLayout = "20060102T150405Z"
	// maxBackupSleep bounds one wait of the scheduler, so a suspended host or
	// a changed clock delays a run by at most this much.
	maxBackupSleep = time.Hour
)

// backupNamePattern is the only name the gateway lists, reads, or prunes in
// backupRoot.
var backupNamePattern = regexp.MustCompile(`^smu-backup-[0-9]{8}T[0-9]{6}Z\.json$`)

// partialNamePattern is a run's file while it is written: the backup's name
// ending .partial instead of .json. The run renames it once the data is on
// disk, so a .json in the directory is always a whole backup; a .partial left
// by a run that stopped (a crash, a full disk) is deleted by the next run.
var partialNamePattern = regexp.MustCompile(`^smu-backup-[0-9]{8}T[0-9]{6}Z\.partial$`)

func backupName(t time.Time) string {
	return "smu-backup-" + t.UTC().Format(backupNameLayout) + ".json"
}

func partialName(name string) string {
	return strings.TrimSuffix(name, ".json") + ".partial"
}

// ----- file format ----------------------------------------------------------------

type backupKDF struct {
	Name string `json:"name"`
	Iter int    `json:"iter"`
	Salt string `json:"salt"`
}

type backupEnvelope struct {
	Format  string    `json:"format"`
	Version int       `json:"version"`
	KDF     backupKDF `json:"kdf"`
	Data    string    `json:"data"`
}

// backupDoc is what a backup seals.
type backupDoc struct {
	Version     int        `yaml:"version"`
	Created     string     `yaml:"created"` // RFC 3339, UTC
	Gateway     string     `yaml:"gateway"` // the version that wrote it
	Users       []userRec  `yaml:"msg-utility-users"`
	Connections []connRec  `yaml:"msg-utility-connections"`
	Settings    fileConfig `yaml:"settings"`
}

// backupKey is a passphrase-derived key and the parameters that derive it.
type backupKey struct {
	iter int
	salt []byte
	key  []byte
}

// backupProblem is a refusal fit to show the administrator: the request
// field it concerns and why. It never carries a secret.
type backupProblem struct{ field, reason string }

func (p *backupProblem) Error() string { return p.field + ": " + p.reason }

var (
	errNotBackup = &backupProblem{"file", "This is not a Solace Message Utility backup file."}
	errDamaged   = &backupProblem{"file", "This backup file is damaged."}
	errWrongPass = &backupProblem{"passphrase", "The passphrase does not open this file, or the file is damaged."}
	errPassRule  = &backupProblem{"passphrase", fmt.Sprintf("The passphrase must be %d to %d characters.", passwordMinLen, passwordMaxLen)}
	errNoSched   = errors.New("no backup schedule")
)

// deriveKey runs PBKDF2 in one of the hasher's slots, so derivations share
// the CPU bound sign-ins have.
func (h *hasher) deriveKey(ctx context.Context, passphrase string, iter int, salt []byte) ([]byte, error) {
	if err := h.acquire(ctx); err != nil {
		return nil, err
	}
	defer h.release()
	return pbkdf2.Key(sha256.New, passphrase, salt, iter, storeKeyBytes)
}

// newBackupKey derives a key from passphrase with a fresh salt, at the
// hasher's cost.
func newBackupKey(ctx context.Context, h *hasher, passphrase string) (backupKey, error) {
	if checkPassphrase(passphrase) != nil {
		return backupKey{}, errPassRule
	}
	salt := make([]byte, backupSaltBytes)
	rand.Read(salt) // never fails: since Go 1.24 it crashes the process instead
	key, err := h.deriveKey(ctx, passphrase, h.iter, salt)
	if err != nil {
		return backupKey{}, err
	}
	return backupKey{iter: h.iter, salt: salt, key: key}, nil
}

// sealBackup returns the file for doc. The sealed text is JSON with the
// store files' YAML names (JSON is YAML, so openBackup decodes it with the
// stores' strict YAML rules), which the demo's fake gateway can read and
// write without a YAML parser.
func sealBackup(k backupKey, doc backupDoc) ([]byte, error) {
	plain, err := yamlAsJSON(doc)
	if err != nil {
		return nil, err
	}
	sl, err := newSealer(k.key)
	if err != nil {
		return nil, err
	}
	out, err := json.MarshalIndent(backupEnvelope{
		Format:  backupFormat,
		Version: backupVersion,
		KDF:     backupKDF{Name: backupKDFName, Iter: k.iter, Salt: base64.StdEncoding.EncodeToString(k.salt)},
		Data:    base64.StdEncoding.EncodeToString(sl.seal(roleBackup, plain)),
	}, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

// yamlAsJSON encodes v as JSON under its YAML field names.
func yamlAsJSON(v any) ([]byte, error) {
	y, err := yaml.Marshal(v)
	if err != nil {
		return nil, err
	}
	var tree any
	if err := yaml.Unmarshal(y, &tree); err != nil {
		return nil, err
	}
	return json.Marshal(tree)
}

// openBackup checks and decrypts a backup file. A *backupProblem says what is
// wrong with the file or the passphrase; any other error is the request
// going away while the key was derived.
func openBackup(ctx context.Context, h *hasher, data []byte, passphrase string) (backupDoc, error) {
	var env backupEnvelope
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&env); err != nil || env.Format != backupFormat {
		return backupDoc{}, errNotBackup
	}
	if env.Version != backupVersion {
		return backupDoc{}, &backupProblem{"file", fmt.Sprintf("This backup has format version %d, which this gateway does not read.", env.Version)}
	}
	if env.KDF.Name != backupKDFName || env.KDF.Iter < 1 || env.KDF.Iter > passwordMaxIter {
		return backupDoc{}, errDamaged
	}
	salt, err := base64.StdEncoding.DecodeString(env.KDF.Salt)
	if err != nil || len(salt) < backupSaltBytes {
		return backupDoc{}, errDamaged
	}
	blob, err := base64.StdEncoding.DecodeString(env.Data)
	if err != nil || !bytes.HasPrefix(blob, storeHeader(roleBackup)) {
		return backupDoc{}, errDamaged
	}
	if checkPassphrase(passphrase) != nil {
		return backupDoc{}, errPassRule
	}
	key, err := h.deriveKey(ctx, passphrase, env.KDF.Iter, salt)
	if err != nil {
		return backupDoc{}, err
	}
	sl, err := newSealer(key)
	if err != nil {
		return backupDoc{}, err
	}
	plain, err := sl.open(roleBackup, blob)
	if err != nil {
		return backupDoc{}, errWrongPass
	}
	// The settings are decoded over the built-in defaults, so a key a backup
	// does not hold (one added to the gateway after the backup was written)
	// reads as its default: it previews as no change from a default and
	// imports as the default.
	doc := backupDoc{Settings: defaultFileConfig()}
	yd := yaml.NewDecoder(bytes.NewReader(plain))
	yd.KnownFields(true)
	if err := yd.Decode(&doc); err != nil || doc.Version != backupVersion {
		return backupDoc{}, errDamaged
	}
	doc.Settings.Audit.OnFailure = onFailureOrDefault(doc.Settings.Audit.OnFailure)
	doc.Settings.Login.TwoFactor = twoFactorOrDefault(doc.Settings.Login.TwoFactor)
	return doc, nil
}

// ----- import planning ---------------------------------------------------------------

// nameDiff lists what an import of one section adds, changes and, under
// Replace, removes, by name.
type nameDiff struct {
	Added   []string `json:"added"`
	Changed []string `json:"changed"`
	Removed []string `json:"removed"`
}

func diffByName[T any](cur, next []T, name func(T) string) nameDiff {
	d := nameDiff{Added: []string{}, Changed: []string{}, Removed: []string{}}
	for _, n := range next {
		i := slices.IndexFunc(cur, func(c T) bool { return name(c) == name(n) })
		switch {
		case i < 0:
			d.Added = append(d.Added, name(n))
		case !sameRecord(cur[i], n):
			d.Changed = append(d.Changed, name(n))
		}
	}
	for _, c := range cur {
		if !slices.ContainsFunc(next, func(n T) bool { return name(n) == name(c) }) {
			d.Removed = append(d.Removed, name(c))
		}
	}
	return d
}

// sameRecord compares two store records as the store file holds them, so a
// list the file has empty and one it never set are the same.
func sameRecord(a, b any) bool {
	x, errA := yaml.Marshal(withoutRev(a))
	y, errB := yaml.Marshal(withoutRev(b))
	return errA == nil && errB == nil && bytes.Equal(x, y)
}

// withoutRev clears the rev of a user or connection: it is the version the
// store stamped, not part of what a backup says about the record, so two
// records that differ only in rev are the same record.
func withoutRev(v any) any {
	switch r := v.(type) {
	case userRec:
		r.Rev = 0
		return r
	case connRec:
		r.Rev = 0
		return r
	}
	return v
}

// mergeByName is Merge: the file's records replace those with the same name,
// and the rest are kept.
func mergeByName[T any](cur, file []T, name func(T) string) []T {
	out := slices.Clone(cur)
	for _, f := range file {
		if i := slices.IndexFunc(out, func(c T) bool { return name(c) == name(f) }); i >= 0 {
			out[i] = f
		} else {
			out = append(out, f)
		}
	}
	return out
}

func userName(u userRec) string { return u.Username }
func connName(c connRec) string { return c.Broker }

// sessionEnders lists the users of cur whose sessions must end when next
// replaces it: removed, or with a new password hash or admin flag (the rule
// upsertUser applies to one user), or with two-factor added, removed or
// replaced (another secret). Recovery codes alone do not end a session.
func sessionEnders(cur, next []userRec) []string {
	out := []string{}
	for _, c := range cur {
		i := slices.IndexFunc(next, func(n userRec) bool { return n.Username == c.Username })
		if i < 0 || next[i].Password != c.Password || next[i].Admin != c.Admin || secretOf(next[i].TOTP) != secretOf(c.TOTP) {
			out = append(out, c.Username)
		}
	}
	return out
}

// settingsChanges lists the settings keys, dotted as the settings page names
// them, on which next differs from cur. The removed keys a document may still
// hold (json "-") are not settings and never show.
func settingsChanges(cur, next fileConfig) []string {
	a, b := flattenSettings(cur), flattenSettings(next)
	out := []string{}
	for _, k := range sortedKeys(a, b) {
		if !reflect.DeepEqual(a[k], b[k]) {
			out = append(out, k)
		}
	}
	return out
}

// flattenSettings maps fc's JSON keys, dotted, to their values; lists are
// values, not expanded, and a list never set is an empty one.
func flattenSettings(fc fileConfig) map[string]any {
	var tree map[string]any
	data, _ := json.Marshal(fc) // a fileConfig always marshals
	_ = json.Unmarshal(data, &tree)
	out := map[string]any{}
	var walk func(prefix string, m map[string]any)
	walk = func(prefix string, m map[string]any) {
		for k, v := range m {
			switch v := v.(type) {
			case map[string]any:
				walk(prefix+k+".", v)
			case nil:
				out[prefix+k] = []any{}
			default:
				out[prefix+k] = v
			}
		}
	}
	walk("", tree)
	return out
}

func sortedKeys(maps ...map[string]any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, m := range maps {
		for k := range m {
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
	}
	sort.Strings(out)
	return out
}

// ----- schedule ----------------------------------------------------------------------

const (
	scheduleHourly  = "hourly"
	scheduleDaily   = "daily"
	scheduleWeekly  = "weekly"
	scheduleMonthly = "monthly"
)

// backupSchedule is when scheduled backups run, in UTC. The fields a kind
// does not use are zero.
type backupSchedule struct {
	Kind    string `yaml:"kind" json:"kind"`
	Minute  int    `yaml:"minute" json:"minute"`   // 0-59, every kind
	Hour    int    `yaml:"hour" json:"hour"`       // 0-23: daily, weekly, monthly
	Weekday int    `yaml:"weekday" json:"weekday"` // 0-6, Sunday = 0: weekly
	Day     int    `yaml:"day" json:"day"`         // 1-31: monthly; a shorter month runs on its last day
}

// problem says what is wrong with s, or "" when it is valid.
func (s backupSchedule) problem() string {
	switch {
	case s.Kind != scheduleHourly && s.Kind != scheduleDaily && s.Kind != scheduleWeekly && s.Kind != scheduleMonthly:
		return "Choose hourly, daily, weekly or monthly."
	case s.Minute < 0 || s.Minute > 59:
		return "The minute must be 0 to 59."
	case s.Hour < 0 || s.Hour > 23 || (s.Kind == scheduleHourly && s.Hour != 0):
		return "The hour must be 0 to 23, and an hourly schedule takes none."
	case s.Weekday < 0 || s.Weekday > 6 || (s.Kind != scheduleWeekly && s.Weekday != 0):
		return "The day of the week must be 0 (Sunday) to 6, and only a weekly schedule takes one."
	case (s.Kind == scheduleMonthly) != (s.Day != 0) || s.Day < 0 || s.Day > 31:
		return "The day of the month must be 1 to 31, and only a monthly schedule takes one."
	}
	return ""
}

// nextRun is the first time strictly after now that s names, in UTC.
func nextRun(now time.Time, s backupSchedule) time.Time {
	now = now.UTC()
	y, m, d := now.Date()
	at := func(day int) time.Time { return time.Date(y, m, day, s.Hour, s.Minute, 0, 0, time.UTC) }
	var t time.Time
	switch s.Kind {
	case scheduleHourly:
		if t = now.Truncate(time.Hour).Add(time.Duration(s.Minute) * time.Minute); !t.After(now) {
			t = t.Add(time.Hour)
		}
	case scheduleDaily:
		if t = at(d); !t.After(now) {
			t = t.AddDate(0, 0, 1)
		}
	case scheduleWeekly:
		if t = at(d + (s.Weekday-int(now.Weekday())+7)%7); !t.After(now) {
			t = t.AddDate(0, 0, 7)
		}
	default: // monthly
		if t = monthSlot(y, m, s); !t.After(now) {
			t = monthSlot(y, m+1, s)
		}
	}
	return t
}

// monthSlot is s's run in month m of year y (m may be 13: the next January).
func monthSlot(y int, m time.Month, s backupSchedule) time.Time {
	first := time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1).Day()
	return time.Date(first.Year(), first.Month(), min(s.Day, last), s.Hour, s.Minute, 0, 0, time.UTC)
}

// scheduleDoc is the sealed schedule file.
type scheduleDoc struct {
	Schedule backupSchedule `yaml:"schedule"`
	Keep     int            `yaml:"keep"`
	Iter     int            `yaml:"iter"`
	Salt     string         `yaml:"salt"` // base64
	Key      string         `yaml:"key"`  // base64: the passphrase-derived key
}

func (sd scheduleDoc) backupKey() (backupKey, error) {
	salt, err := base64.StdEncoding.DecodeString(sd.Salt)
	if err != nil {
		return backupKey{}, err
	}
	key, err := base64.StdEncoding.DecodeString(sd.Key)
	if err != nil {
		return backupKey{}, err
	}
	return backupKey{iter: sd.Iter, salt: salt, key: key}, nil
}

func (sd scheduleDoc) problem() string {
	if p := sd.Schedule.problem(); p != "" {
		return p
	}
	if sd.Keep < 1 || sd.Keep > backupKeepMax {
		return fmt.Sprintf("keep must be 1 to %d", backupKeepMax)
	}
	if k, err := sd.backupKey(); err != nil || len(k.key) != storeKeyBytes || k.iter < 1 {
		return "the key is damaged"
	}
	return ""
}

// scheduleFile is backup.yaml as stored: the counter that is the schedule's
// rev, and the schedule when there is one. Every save and every delete moves
// the seq by one. A delete keeps the file with the seq and no schedule, so a
// schedule created afterwards gets a rev nobody holds; no schedule is rev 0.
type scheduleFile struct {
	Seq      int             `yaml:"seq"`
	Schedule *backupSchedule `yaml:"schedule,omitempty"`
	Keep     int             `yaml:"keep,omitempty"`
	Iter     int             `yaml:"iter,omitempty"`
	Salt     string          `yaml:"salt,omitempty"` // base64
	Key      string          `yaml:"key,omitempty"`  // base64: the passphrase-derived key
}

// fileOfSchedule is the file that holds sd (nil: no schedule) at seq.
func fileOfSchedule(seq int, sd *scheduleDoc) scheduleFile {
	f := scheduleFile{Seq: seq}
	if sd != nil {
		sched := sd.Schedule
		f.Schedule, f.Keep, f.Iter, f.Salt, f.Key = &sched, sd.Keep, sd.Iter, sd.Salt, sd.Key
	}
	return f
}

// doc is the schedule the file holds, nil when it holds none.
func (f scheduleFile) doc() *scheduleDoc {
	if f.Schedule == nil {
		return nil
	}
	return &scheduleDoc{Schedule: *f.Schedule, Keep: f.Keep, Iter: f.Iter, Salt: f.Salt, Key: f.Key}
}

// problem says what is wrong with the file, or "" when it is sound.
func (f scheduleFile) problem() string {
	switch {
	case f.Seq < 0:
		return "its seq is negative"
	case f.Schedule == nil && (f.Keep != 0 || f.Iter != 0 || f.Salt != "" || f.Key != ""):
		return "it holds a key but no schedule"
	case f.Schedule == nil:
		return ""
	case f.Seq < 1:
		return "its seq must be at least 1 while there is a schedule"
	}
	return f.doc().problem()
}

// ----- service -------------------------------------------------------------------------

// backupRun is the outcome of the last scheduled or manual run, kept in
// memory (a restart forgets it; the log keeps every run).
type backupRun struct {
	at   time.Time
	file string
	err  string
}

// backupService writes, lists and prunes the backups in dir, and runs the
// schedule. It reads the stores and config.yaml through their own locks.
type backupService struct {
	dir          string
	schedulePath string
	store        *store
	settings     *settingsFile
	hasher       *hasher
	now          func() time.Time
	logger       *slog.Logger

	mu    sync.Mutex // guards sched, seq and last
	sched *scheduleDoc
	seq   int // backup.yaml's seq: the schedule's rev while there is a schedule
	last  *backupRun
	runMu sync.Mutex    // one run at a time
	reset chan struct{} // a schedule change wakes the loop
}

// newBackupService loads the schedule, if there is one. A schedule the
// gateway cannot read stops the start, as a store does.
func newBackupService(dir, schedulePath string, st *store, sf *settingsFile, h *hasher, now func() time.Time, logger *slog.Logger) (*backupService, error) {
	b := &backupService{dir: dir, schedulePath: schedulePath, store: st, settings: sf, hasher: h, now: now, logger: logger, reset: make(chan struct{}, 1)}
	var f scheduleFile
	switch err := st.seal.readDoc(roleSchedule, schedulePath, &f); {
	case errors.Is(err, fs.ErrNotExist):
		// no schedule yet: seq 0
	case err != nil:
		return nil, fmt.Errorf("read backup schedule %q: %w", schedulePath, err)
	default:
		if p := f.problem(); p != "" {
			return nil, fmt.Errorf("backup schedule %q: %s; delete it and set the schedule again", schedulePath, p)
		}
		b.sched, b.seq = f.doc(), f.Seq
	}
	// The disk check of every later write starts from what is there now.
	if err := st.sums.rememberDisk(schedulePath); err != nil {
		return nil, err
	}
	return b, nil
}

func (b *backupService) schedule() *scheduleDoc {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.sched
}

// scheduleWithRev is the schedule and its rev read together: backup.yaml's
// seq, or 0 when there is no schedule.
func (b *backupService) scheduleWithRev() (*scheduleDoc, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.sched == nil {
		return nil, 0
	}
	return b.sched, b.seq
}

// counter is backup.yaml's seq as it stands, which a delete of the schedule
// keeps. Read in an after-commit hook it is the seq of that commit.
func (b *backupService) counter() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.seq
}

func (b *backupService) lastRun() *backupRun {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.last
}

func (b *backupService) poke() {
	select {
	case b.reset <- struct{}{}:
	default:
	}
}

// setSchedule saves a schedule as one writer transaction and returns its new
// rev. rev is the one the administrator read: 0 creates (409 exists when there
// is a schedule), above 0 edits (404 not_found when there is none, 409 stale
// when it moved). A passphrase derives a new key, before the lock; "" keeps the
// current schedule's key, and is refused when there is none. caller is the
// requesting administrator, re-checked inside the lock ("" skips it). The file
// and the memory change together or not at all.
func (b *backupService) setSchedule(ctx context.Context, caller string, s backupSchedule, keep int, passphrase string, rev int, committed ...func()) (int, error) {
	if rev < 0 {
		return 0, errRevRequired
	}
	var k backupKey
	if passphrase != "" {
		var err error
		if k, err = newBackupKey(ctx, b.hasher, passphrase); err != nil {
			return 0, err
		}
	}
	newRev := 0
	err := b.store.wr.Do(ctx, func(tx *txn) error {
		if err := b.store.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(b.schedulePath); err != nil {
			return err
		}
		cur, seq := b.scheduleWithRev()
		switch {
		case rev == 0 && cur != nil:
			return errExists
		case rev > 0 && cur == nil:
			return errNotFound
		case rev > 0 && rev != seq:
			return newStale(seq)
		}
		if passphrase == "" {
			if cur == nil {
				return &backupProblem{"passphrase", "A new schedule needs a passphrase."}
			}
			k, _ = cur.backupKey() // validated when it was loaded or saved
		}
		// A new seq even after a delete: b.seq is kept when there is no schedule.
		b.mu.Lock()
		next := b.seq + 1
		b.mu.Unlock()
		doc := scheduleDoc{
			Schedule: s, Keep: keep, Iter: k.iter,
			Salt: base64.StdEncoding.EncodeToString(k.salt),
			Key:  base64.StdEncoding.EncodeToString(k.key),
		}
		b.store.seal.stageDoc(tx, roleSchedule, b.schedulePath, fileOfSchedule(next, &doc))
		tx.onPublish(func() {
			b.mu.Lock()
			b.sched, b.seq = &doc, next
			b.mu.Unlock()
		})
		tx.afterCommit(b.poke)
		tx.afterCommit(committed...)
		newRev = next
		return nil
	})
	if err != nil {
		return 0, err
	}
	return newRev, nil
}

// removeSchedule deletes the schedule as one writer transaction and returns the
// new seq of backup.yaml, which stays with the counter and no schedule (rev 0
// from then on). rev must be the schedule's rev (at least 1): 404 not_found
// when there is no schedule, 409 stale when it moved. The backups already
// written stay.
func (b *backupService) removeSchedule(ctx context.Context, caller string, rev int, committed ...func()) (int, error) {
	if rev < 1 {
		return 0, errRevRequired
	}
	newSeq := 0
	err := b.store.wr.Do(ctx, func(tx *txn) error {
		if err := b.store.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(b.schedulePath); err != nil {
			return err
		}
		cur, seq := b.scheduleWithRev()
		switch {
		case cur == nil:
			return errNotFound
		case rev != seq:
			return newStale(seq)
		}
		next := seq + 1
		b.store.seal.stageDoc(tx, roleSchedule, b.schedulePath, fileOfSchedule(next, nil))
		tx.onPublish(func() {
			b.mu.Lock()
			b.sched, b.seq = nil, next
			b.mu.Unlock()
		})
		tx.afterCommit(b.poke)
		tx.afterCommit(committed...)
		newSeq = next
		return nil
	})
	if err != nil {
		return 0, err
	}
	return newSeq, nil
}

// snapshot is the configuration a backup holds.
// It reads the users, the connections and the settings as one committed state
// (the read side of the writer's publish lock), so an import in flight is seen
// whole or not at all.
func (b *backupService) snapshot() backupDoc {
	doc := backupDoc{
		Version: backupVersion,
		Created: b.now().UTC().Format(time.RFC3339),
		Gateway: version,
	}
	b.store.wr.snapshot(func() {
		doc.Users, doc.Connections = b.store.listUsers(), b.store.listConnections()
		doc.Settings = b.settings.current()
	})
	return doc
}

// run writes one backup with the schedule's key and prunes to its keep
// count. It records the outcome for the admin page and logs it.
func (b *backupService) run() (string, error) {
	b.runMu.Lock()
	defer b.runMu.Unlock()
	sd := b.schedule()
	if sd == nil {
		return "", errNoSched
	}
	k, _ := sd.backupKey() // validated when it was loaded or saved
	b.removePartials()
	name := backupName(b.now())
	data, err := sealBackup(k, b.snapshot())
	if err == nil {
		err = b.writeNew(name, data)
	}
	rec := &backupRun{at: b.now(), file: name}
	if err != nil {
		rec.file, rec.err = "", err.Error()
	}
	b.mu.Lock()
	b.last = rec
	b.mu.Unlock()
	if err != nil {
		b.logger.Error("backup failed", "dir", b.dir, "err", err)
		return "", err
	}
	b.logger.Info("backup written", "file", filepath.Join(b.dir, name))
	b.prune(sd.Keep)
	return name, nil
}

// writeNew writes a backup that must not exist yet, owner-only: the data goes
// to its .partial name, is synced, and only then is renamed to name.
func (b *backupService) writeNew(name string, data []byte) error {
	path := filepath.Join(b.dir, name)
	if _, err := os.Lstat(path); err == nil {
		return fmt.Errorf("%s already exists; wait a second and run it again", path)
	}
	partial := filepath.Join(b.dir, partialName(name))
	if err := createExclusive(partial, data, 0o600); err != nil {
		return fmt.Errorf("cannot write %s: %w%s", partial, err, ownershipHint(err))
	}
	if err := os.Rename(partial, path); err != nil {
		_ = os.Remove(partial)
		return fmt.Errorf("cannot rename %s to %s: %w%s", partial, name, err, ownershipHint(err))
	}
	return nil
}

// removePartials deletes the .partial files runs that stopped left behind.
// It runs under runMu, so no run is writing one. A directory it cannot read
// is left to the write that follows to report.
func (b *backupService) removePartials() {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !partialNamePattern.MatchString(e.Name()) || !e.Type().IsRegular() {
			continue
		}
		if err := os.Remove(filepath.Join(b.dir, e.Name())); err != nil {
			b.logger.Warn("backup: cannot delete an unfinished backup", "file", e.Name(), "err", err)
			continue
		}
		b.logger.Warn("backup: deleted an unfinished backup a stopped run left", "file", e.Name())
	}
}

// prune deletes the oldest backups beyond keep. Only names the gateway
// writes are ever deleted; a failure is logged and the backup stands.
func (b *backupService) prune(keep int) {
	files, err := b.list()
	if err != nil {
		b.logger.Warn("backup prune skipped: cannot list the backup directory", "dir", b.dir, "err", err)
		return
	}
	for _, f := range files[min(keep, len(files)):] { // newest first
		if err := os.Remove(filepath.Join(b.dir, f.Name)); err != nil {
			b.logger.Warn("backup prune: cannot delete an old backup", "file", f.Name, "err", err)
		}
	}
}

// backupFileInfo is one backup in the directory.
type backupFileInfo struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Created string `json:"created"` // from the name, RFC 3339
}

// list returns the gateway's backups in dir, newest first. Other files are
// ignored.
func (b *backupService) list() ([]backupFileInfo, error) {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return nil, err
	}
	out := []backupFileInfo{}
	for _, e := range entries {
		info, err := e.Info()
		if !backupNamePattern.MatchString(e.Name()) || err != nil || !info.Mode().IsRegular() {
			continue
		}
		created, _ := time.Parse("smu-backup-"+backupNameLayout+".json", e.Name()) // the pattern guarantees the shape
		out = append(out, backupFileInfo{Name: e.Name(), Size: info.Size(), Created: created.Format(time.RFC3339)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name > out[j].Name })
	return out, nil
}

// read returns one of the gateway's backups by name.
func (b *backupService) read(name string) ([]byte, error) {
	if !backupNamePattern.MatchString(name) {
		return nil, fs.ErrNotExist
	}
	f, err := os.Open(filepath.Join(b.dir, name))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxStoreFile+1))
	if err == nil && len(data) > maxStoreFile {
		return nil, errNotBackup
	}
	return data, err
}

// dirProblem says why backups cannot be written to dir, or "" when they can.
func (b *backupService) dirProblem() string {
	info, err := os.Stat(b.dir)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return b.dir + " does not exist. Mount a directory there to keep backups outside the container."
	case err != nil:
		return "Cannot read " + b.dir + ": " + err.Error()
	case !info.IsDir():
		return b.dir + " is not a directory. Mount a directory there."
	}
	f, err := os.CreateTemp(b.dir, ".probe-*")
	if err != nil {
		return b.dir + " is not writable" + ownershipHint(err) + "."
	}
	_ = f.Close()
	_ = os.Remove(f.Name())
	return ""
}

// loop runs the schedule until ctx ends, then closes done. after is
// time.After; tests pass their own. due is kept across wake-ups, so a wait
// cut short by maxBackupSleep never skips a run; a schedule change or a run
// computes the next one from the clock.
func (b *backupService) loop(ctx context.Context, after func(time.Duration) <-chan time.Time, done chan<- struct{}) {
	defer close(done)
	var due time.Time
	for {
		sd := b.schedule()
		var wake <-chan time.Time
		if sd != nil {
			if due.IsZero() {
				due = nextRun(b.now(), sd.Schedule)
			}
			wake = after(min(due.Sub(b.now()), maxBackupSleep))
		}
		select {
		case <-ctx.Done():
			return
		case <-b.reset:
			due = time.Time{}
		case <-wake:
			if !b.now().Before(due) {
				_, _ = b.run() // run records and logs the outcome
				due = time.Time{}
			}
		}
	}
}
