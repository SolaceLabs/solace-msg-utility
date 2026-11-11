package main

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A handler panic is answered 500 server_error and logged at error with the
// request's client, method, path and user, the stack at debug, never the
// body; the rest of the chain (here the access log) carries on.
func TestRecoverPanics_LogsAndAnswers500(t *testing.T) {
	var buf strings.Builder
	logger := newCapturingLogger(&buf)
	lv := liveWith(nil)
	panicky := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		setRequestUser(r, "viewer")
		panic("boom")
	})
	h := withClient(lv, accessLog(recoverPanics(panicky, logger), logger))
	req := httptest.NewRequest(http.MethodPost, "/managed/users/x", strings.NewReader("secret-request-body"))
	req.RemoteAddr = "192.0.2.10:5000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	expect(t, rec, http.StatusInternalServerError, "server_error")
	log := buf.String()
	line := logLine(log, "handler panicked")
	for _, want := range []string{"level=ERROR", "panic=boom", "client=192.0.2.10", "method=POST", "path=/managed/users/x", "user=viewer"} {
		if !strings.Contains(line, want) {
			t.Errorf("the panic line lacks %q: %s", want, line)
		}
	}
	if !strings.Contains(logLine(log, "handler panic stack"), "level=DEBUG") || !strings.Contains(log, "logging_test.go") {
		t.Errorf("the stack goes to debug: %s", log)
	}
	if strings.Contains(log, "secret-request-body") {
		t.Error("the request body must never be logged")
	}
	if !strings.Contains(logLine(log, `msg=request`), "status=500") {
		t.Errorf("the access log records the 500: %s", log)
	}
}

// http.ErrAbortHandler is net/http's own way to abort a response: it passes
// through, unlogged.
func TestRecoverPanics_LetsAbortHandlerThrough(t *testing.T) {
	var buf strings.Builder
	h := recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }), newCapturingLogger(&buf))
	defer func() {
		if v := recover(); v != http.ErrAbortHandler {
			t.Errorf("want http.ErrAbortHandler to pass on, got %v", v)
		}
		if buf.Len() != 0 {
			t.Errorf("an abort is not a fault: %s", buf.String())
		}
	}()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}

// Outside the gateway's chain a request has no client or user to name: the
// helpers say so instead of failing.
func TestRequestLogger_OutsideTheChain(t *testing.T) {
	var buf strings.Builder
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	setRequestUser(r, "ignored")
	requestLogger(newCapturingLogger(&buf), r).Info("line")
	if !strings.Contains(buf.String(), "client=unknown") || strings.Contains(buf.String(), "user=") {
		t.Errorf("want an unknown client and no user: %s", buf.String())
	}
	if requestUser(r) != "" {
		t.Error("nothing to record into outside the chain")
	}
}

// The startup summary shows at every log level and names what an operator
// needs to diagnose a start: version, mode, paths, the access list, the
// trusted proxies, the TLS verify setting and, in Provisioned mode, the
// stores and the limits.
func TestLogStartup_ShowsAtEveryLevel(t *testing.T) {
	cases := []struct {
		name  string
		cfg   func(c *config)
		wants []string
		never []string
	}{
		{"gateway", func(c *config) {
			c.access.allow = prefixes(t, "10.0.0.0/8")
		}, []string{"mode=gateway", "conn_modes=direct", "app_bundle=index.html", "access.allow=[10.0.0.0/8]", "access.trustedProxies=[]", "tls.insecureSkipVerify=false"}, []string{"usersFile=", "login.maxFailures="}},
		{"provisioned", func(c *config) {
			c.connModes = connProvisioned
			c.access.trustedProxies = prefixes(t, "172.16.0.0/12")
		}, []string{"mode=provisioned", "app_bundle=provisioned.html", "access.trustedProxies=[172.16.0.0/12]", "usersFile=/data/users.yaml", "store_key_file=", "login.maxFailures=5", "session.idle=10m0s", "modules.userDefault=all"}, nil},
		{"files only", func(c *config) { c.hosted = false }, []string{"mode=files-only"}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cfg := defaultConfig()
			cfg.logLevel = slog.LevelError
			c.cfg(&cfg)
			var buf strings.Builder
			logStartup(&buf, cfg, "/data/config.yaml", "/SolaceMsgUtility")
			line := buf.String()
			for _, want := range append([]string{"level=INFO", `msg="gateway starting"`, "version=", "log_level=error", "config_file=/data/config.yaml", "app_dir=/SolaceMsgUtility"}, c.wants...) {
				if !strings.Contains(line, want) {
					t.Errorf("the summary lacks %q: %s", want, line)
				}
			}
			for _, never := range c.never {
				if strings.Contains(line, never) {
					t.Errorf("the summary must not carry %q here: %s", never, line)
				}
			}
		})
	}
}
