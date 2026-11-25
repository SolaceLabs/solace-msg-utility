//go:build !unix

package main

import "os"

// exitProcess is os.Exit; a test stands in for it.
var exitProcess = os.Exit

// restartInPlace on a platform with no exec: the process exits with status 0
// and whatever supervises it starts it again.
func restartInPlace() error {
	exitProcess(0)
	return nil
}
