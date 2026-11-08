package main

import (
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"
)

// POST /managed/dial {broker, vpn} is the one place a broker credential
// reaches the browser: an entitled user gets the VPN's client username and
// password, and the gateway path to open the SMF socket on (smf.go). The
// browser keeps the password only for the SDK login it makes at once; a
// reconnect dials again. Stateless: no ticket, so the SDK's own reconnects
// keep working. Read-only users dial too: SMF is how they browse.
const (
	connectsPerWindow = 20          // dials plus SMF upgrades per user
	connectWindow     = time.Minute // ... in each window
)

type dialRequest struct {
	Broker string `json:"broker"`
	Vpn    string `json:"vpn"`
}

type dialResponse struct {
	SMFPath string `json:"smfPath"`
	Vpn     string `json:"vpn"`
	User    string `json:"user"`
	Pass    secret `json:"pass"`
}

// secret is a credential on its way to the browser. It marshals to JSON as
// itself, but prints and logs masked, so neither a log line nor a %v of a
// struct that holds one can carry it.
type secret string

const maskedSecret = "[masked]"

func (secret) String() string { return maskedSecret }

func (secret) GoString() string { return `"` + maskedSecret + `"` }

func (secret) LogValue() slog.Value { return slog.StringValue(maskedSecret) }

type dialer struct {
	store  *store
	rate   *rateWindow
	logger *slog.Logger
}

func newDialer(st *store, rate *rateWindow, logger *slog.Logger) *dialer {
	return &dialer{store: st, rate: rate, logger: logger}
}

// ServeHTTP runs behind managedHandler's gates (session, cross-site writes,
// forced password change). An unknown broker or VPN and one the user is not
// entitled to get the same 404.
func (d *dialer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	user := sessionOf(r).user
	var body dialRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	target, ok := d.store.smfTarget(user, body.Broker, body.Vpn)
	if !ok {
		d.logger.Info("dial denied", "user", user, "broker", body.Broker, "vpn", body.Vpn)
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if allowed, wait := d.rate.allow(user); !allowed {
		d.logger.Warn("dial rate limited", "user", user, "broker", body.Broker, "vpn", body.Vpn)
		writeRateLimited(w, wait)
		return
	}
	d.logger.Info("dial issued", "user", user, "broker", body.Broker, "vpn", body.Vpn)
	writeJSON(w, http.StatusOK, dialResponse{
		SMFPath: smfPathFor(body.Broker, body.Vpn),
		Vpn:     body.Vpn,
		User:    target.user,
		Pass:    secret(target.pass),
	})
}

// smfPathFor is the gateway path of a VPN's SMF socket; parseSMFPath reads it.
func smfPathFor(broker, vpn string) string {
	return smfPrefix + url.PathEscape(broker) + "/" + url.PathEscape(vpn)
}

// rateWindow allows max events per user in each fixed window. Dial and the
// SMF upgrade share one, so a reconnect loop cannot open sockets faster than
// it could fetch passwords. Keyed by signed-in usernames, so it stays as
// small as the users file.
type rateWindow struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	now    func() time.Time
	byUser map[string]windowCount
}

type windowCount struct {
	start time.Time
	n     int
}

func newRateWindow(max int, window time.Duration, now func() time.Time) *rateWindow {
	return &rateWindow{max: max, window: window, now: now, byUser: map[string]windowCount{}}
}

// allow counts one event for user, or reports how long until the window
// resets.
func (rw *rateWindow) allow(user string) (bool, time.Duration) {
	rw.mu.Lock()
	defer rw.mu.Unlock()
	now := rw.now()
	c := rw.byUser[user]
	if now.Sub(c.start) >= rw.window {
		c = windowCount{start: now}
	}
	if c.n >= rw.max {
		return false, c.start.Add(rw.window).Sub(now)
	}
	c.n++
	rw.byUser[user] = c
	return true, 0
}
