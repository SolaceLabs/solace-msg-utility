//go:build unix

package main

import (
	"fmt"
	"os"
	"syscall"
)

// The program and the exec call are variables so a test can stand in for them:
// a real exec would replace the test binary.
var (
	executablePath = os.Executable
	execProgram    = syscall.Exec
)

// restartInPlace replaces this process with the running executable, with the
// same arguments and environment. On success it does not return; a failure
// comes back as an error that says what could not be done.
func restartInPlace() error {
	exe, err := executablePath()
	if err != nil {
		return fmt.Errorf("cannot find the running program to start again: %w", err)
	}
	if err := execProgram(exe, os.Args, os.Environ()); err != nil {
		return fmt.Errorf("cannot start %s again: %w", exe, err)
	}
	return nil
}
