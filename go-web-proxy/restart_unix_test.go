//go:build unix

package main

import (
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

// The exec call is stood in for: a real one would replace the test binary. It
// is asked for the running executable, with this process's arguments and
// environment.
func TestRestartInPlace_ExecsTheRunningProgramWithItsArgumentsAndEnvironment(t *testing.T) {
	var gotPath string
	var gotArgs, gotEnv []string
	oldPath, oldExec := executablePath, execProgram
	t.Cleanup(func() { executablePath, execProgram = oldPath, oldExec })
	executablePath = func() (string, error) { return "/opt/gateway/go-web-proxy", nil }
	execProgram = func(path string, args, env []string) error {
		gotPath, gotArgs, gotEnv = path, args, env
		return nil
	}
	t.Setenv("RESTART_TEST_MARKER", "present")

	if err := restartInPlace(); err != nil {
		t.Fatal(err)
	}
	if gotPath != "/opt/gateway/go-web-proxy" || !reflect.DeepEqual(gotArgs, os.Args) {
		t.Errorf("exec %q %v, want the executable with %v", gotPath, gotArgs, os.Args)
	}
	found := false
	for _, kv := range gotEnv {
		found = found || kv == "RESTART_TEST_MARKER=present"
	}
	if !found {
		t.Error("the environment passes through")
	}
}

// An exec that fails says which program could not be started and why, keeping
// the cause for the log.
func TestRestartInPlace_AFailedExecNamesTheProgramAndKeepsTheCause(t *testing.T) {
	cause := errors.New("permission denied")
	oldPath, oldExec := executablePath, execProgram
	t.Cleanup(func() { executablePath, execProgram = oldPath, oldExec })
	executablePath = func() (string, error) { return "/opt/gateway/go-web-proxy", nil }
	execProgram = func(string, []string, []string) error { return cause }

	err := restartInPlace()
	if !errors.Is(err, cause) || !strings.Contains(err.Error(), "/opt/gateway/go-web-proxy") {
		t.Fatalf("want an error naming the program and wrapping the cause, got %v", err)
	}
}

// A program path that cannot be found stops before any exec.
func TestRestartInPlace_AnUnknownExecutableIsNotExecd(t *testing.T) {
	cause := errors.New("no such file")
	oldPath, oldExec := executablePath, execProgram
	t.Cleanup(func() { executablePath, execProgram = oldPath, oldExec })
	executablePath = func() (string, error) { return "", cause }
	execProgram = func(string, []string, []string) error {
		t.Error("nothing is exec'd without a program")
		return nil
	}
	if err := restartInPlace(); !errors.Is(err, cause) {
		t.Fatalf("want the cause wrapped, got %v", err)
	}
}
