//go:build !unix

package main

import "testing"

// Where there is no exec, a restart is an exit with status 0 and the platform
// starts the program again.
func TestRestartInPlace_ExitsWithStatusZero(t *testing.T) {
	old := exitProcess
	t.Cleanup(func() { exitProcess = old })
	code := -1
	exitProcess = func(c int) { code = c }
	if err := restartInPlace(); err != nil {
		t.Fatal(err)
	}
	if code != 0 {
		t.Errorf("exit status %d, want 0", code)
	}
}
