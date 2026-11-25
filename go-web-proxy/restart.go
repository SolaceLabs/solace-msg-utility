package main

import (
	"net/http"
)

// The console's Restart gateway button: POST /managed/restart (administrators
// only, audited as gateway.restart). The handler writes its audit line, answers
// 202 and asks serve (main.go) to stop. serve then shuts down exactly as it
// does for SIGTERM -- the listener closes, requests in flight drain, the audit
// log and the other files close -- and only then calls process.restart, which
// starts the same program again in place (restart_unix.go; restart_other.go
// exits instead). Every session and ticket is gone afterwards, open sockets
// have closed, and settings that waited for a restart are applied.
//
// If the program cannot be started again, serve logs why and the gateway exits
// with status 1, so the platform's restart policy takes over.

// restartJSON is the answer: the restart has been accepted, not done.
type restartJSON struct {
	Restarting bool `json:"restarting"`
}

// restartGateway audits the request, answers 202 and flushes it so the console
// has its answer before the listener closes, then asks serve to restart.
func (h *managedHandler) restartGateway(w http.ResponseWriter, r *http.Request, call *auditCall) {
	h.recordOK(r, call)
	writeJSON(w, http.StatusAccepted, restartJSON{Restarting: true})
	_ = http.NewResponseController(w).Flush() // a writer that cannot flush still delivers the answer when the handler returns
	h.restart()
}

// restartRequester returns the function the handler calls and the channel
// serve waits on: a request is remembered (a second one while the first is
// pending is dropped), never blocks, and starts one restart however often the
// button is pressed.
func restartRequester() (request func(), requested <-chan struct{}) {
	ch := make(chan struct{}, 1)
	return func() {
		select {
		case ch <- struct{}{}:
		default:
		}
	}, ch
}
