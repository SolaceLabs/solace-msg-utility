package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime/debug"
)

// The gateway's logging standard (docs/developer-guide.md has the full text; docs/contributing.md the reviewer checklist):
//
//   - ERROR needs attention: the gateway, or a request, could not do its job.
//   - WARN is a recoverable problem: a refusal worth a look, a fallback taken.
//   - INFO is a lifecycle step, a state change or an audit event: a sign-in,
//     a dial, an administrator's edit, a backup written.
//   - DEBUG is trace.
//
// Every line names its component (a "component" attribute, set once per
// handler with logger.With) and the identifiers it concerns as attributes,
// never inside the message: user, client, broker, vpn, path, op, target.
// Secrets are never logged. The startup summary (logStartup) is the one line
// every level shows.

type requestInfoKey struct{}

// requestInfo carries what a handler learns about its request back out to
// the middleware around it: the signed-in user, once a gate has looked the
// session up. The access log and the panic recovery read it after the
// handler returns, on the same goroutine.
type requestInfo struct {
	user string
}

// withRequestInfo returns ctx with an empty requestInfo for the handlers
// inside to fill (withClient puts it on every request).
func withRequestInfo(ctx context.Context) context.Context {
	return context.WithValue(ctx, requestInfoKey{}, &requestInfo{})
}

// setRequestUser records the signed-in user for the log lines around the
// request. Outside the gateway's chain there is nothing to record into.
func setRequestUser(r *http.Request, user string) {
	if ri, ok := r.Context().Value(requestInfoKey{}).(*requestInfo); ok {
		ri.user = user
	}
}

// requestUser is the user setRequestUser recorded, or "".
func requestUser(r *http.Request) string {
	if ri, ok := r.Context().Value(requestInfoKey{}).(*requestInfo); ok {
		return ri.user
	}
	return ""
}

// clientString is the client address withClient resolved, or "unknown".
func clientString(r *http.Request) string {
	if ip, ok := clientOf(r); ok {
		return ip.String()
	}
	return "unknown"
}

// clientLogger is base with the request's client, method and path: for the
// lines whose user is not the session's (a sign-in names the account tried).
func clientLogger(base *slog.Logger, r *http.Request) *slog.Logger {
	return base.With("client", clientString(r), "method", r.Method, "path", r.URL.Path)
}

// requestLogger is clientLogger plus the signed-in user, once a gate has
// recorded one.
func requestLogger(base *slog.Logger, r *http.Request) *slog.Logger {
	l := clientLogger(base, r)
	if u := requestUser(r); u != "" {
		l = l.With("user", u)
	}
	return l
}

// recoverPanics turns a handler panic into a 500 server_error and an ERROR
// line naming the request (client, method, path, user; never its body), with
// the stack at DEBUG. Without it net/http recovers the panic itself and logs
// it through ErrorLog, which carries TLS handshake noise at INFO and is
// therefore dropped at the default level. http.ErrAbortHandler is net/http's
// own way to abort a response, not a fault: it passes on.
func recoverPanics(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			if v == http.ErrAbortHandler {
				panic(v)
			}
			log := requestLogger(logger, r)
			log.Error("handler panicked; answered 500", "panic", fmt.Sprint(v))
			log.Debug("handler panic stack", "stack", string(debug.Stack()))
			writeError(w, http.StatusInternalServerError, "server_error")
		}()
		next.ServeHTTP(w, r)
	})
}

// modeName names the mode cfg runs: files only (hosted false), Provisioned
// (connModes offers sign-in) or Gateway.
func modeName(cfg config) string {
	switch {
	case !cfg.hosted:
		return "files-only"
	case cfg.provisioned():
		return "provisioned"
	}
	return "gateway"
}

// logStartup writes the startup summary: what this gateway runs with, on a
// handler of its own at INFO, so it shows whatever logLevel says. Nothing in
// it is a secret: the store key is named by its path, passwords not at all.
func logStartup(w io.Writer, cfg config, configFile, appDir string) {
	attrs := []any{
		"component", "gateway",
		"version", version,
		"mode", modeName(cfg),
		"conn_modes", cfg.connModes,
		"default_conn", cfg.defaultConn,
		"config_file", configFile,
		"app_dir", appDir,
		"app_bundle", appIndexFile(cfg.provisioned()),
		"log_level", levelName(cfg.logLevel),
		"tls.certFile", cfg.certFile,
		"tls.keyFile", cfg.keyFile,
		"tls.trustDir", cfg.trustDir,
		"tls.insecureSkipVerify", cfg.insecureSkipVerify,
		"access.allow", prefixStrings(cfg.access.allow),
		"access.trustedProxies", prefixStrings(cfg.access.trustedProxies),
	}
	if cfg.provisioned() {
		attrs = append(attrs,
			"usersFile", cfg.usersFile,
			"connectionsFile", cfg.connectionsFile,
			"store_key_file", cfg.storeKeyFile,
			"backup_dir", cfg.backupDir,
			"session.idle", cfg.session.idle,
			"session.absolute", cfg.session.absolute,
			"login.maxFailures", cfg.login.maxFailures,
			"login.backoff", cfg.login.backoff,
			"login.maxBackoff", cfg.login.maxBackoff,
			"login.unauthenticatedPerMinute", cfg.login.unauthPerMinute,
			"modules.offered", cfg.modules.offered,
			"modules.userDefault", cfg.modules.userDefault,
		)
	}
	slog.New(slog.NewTextHandler(w, nil)).Info("gateway starting", attrs...)
}
