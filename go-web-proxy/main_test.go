package main

import (
	"log/slog"
	"testing"
)

func TestEnvOr(t *testing.T) {
	t.Setenv("GW_TEST_KEY", "")
	if got := envOr("GW_TEST_KEY", "fallback"); got != "fallback" {
		t.Fatalf("unset env: want fallback, got %q", got)
	}
	t.Setenv("GW_TEST_KEY", "value")
	if got := envOr("GW_TEST_KEY", "fallback"); got != "value" {
		t.Fatalf("set env: want value, got %q", got)
	}
}

func TestParseLogLevel(t *testing.T) {
	cases := map[string]slog.Level{
		"debug":   slog.LevelDebug,
		"DEBUG":   slog.LevelDebug,
		"info":    slog.LevelInfo,
		"warn":    slog.LevelWarn,
		"error":   slog.LevelError,
		"garbage": slog.LevelWarn, // default
		"":        slog.LevelWarn,
	}
	for in, want := range cases {
		if got := parseLogLevel(in); got != want {
			t.Errorf("parseLogLevel(%q): want %v, got %v", in, want, got)
		}
	}
}

func TestLoadConfig_Defaults(t *testing.T) {
	// Clear all relevant env so we exercise the default path.
	for _, k := range []string{"HOSTED", "APP_DIR", "SSL_CERT_FILE", "SSL_KEY_FILE", "SSL_TRUST_DIR", "SSL_INSECURE_SKIP_VERIFY", "LOG_LEVEL"} {
		t.Setenv(k, "")
	}
	cfg := loadConfig()
	if cfg.hosted {
		t.Errorf("hosted: want false")
	}
	if cfg.appDir != "/SolaceMsgUtility" {
		t.Errorf("appDir: want /SolaceMsgUtility, got %q", cfg.appDir)
	}
	if cfg.certFile != "/tls/tls.crt" {
		t.Errorf("certFile: want /tls/tls.crt, got %q", cfg.certFile)
	}
	if cfg.keyFile != "/tls/tls.key" {
		t.Errorf("keyFile: want /tls/tls.key, got %q", cfg.keyFile)
	}
	if cfg.trustDir != "/tls/trust" {
		t.Errorf("trustDir: want /tls/trust, got %q", cfg.trustDir)
	}
	if cfg.insecureSkipVerify {
		t.Errorf("insecureSkipVerify: want false")
	}
	if cfg.logLevel != slog.LevelWarn {
		t.Errorf("logLevel: want warn, got %v", cfg.logLevel)
	}
}

func TestLoadConfig_FromEnv(t *testing.T) {
	t.Setenv("HOSTED", "true")
	t.Setenv("APP_DIR", "/opt/pwa")
	t.Setenv("SSL_CERT_FILE", "/x/cert")
	t.Setenv("SSL_KEY_FILE", "/x/key")
	t.Setenv("SSL_TRUST_DIR", "/x/trust")
	t.Setenv("SSL_INSECURE_SKIP_VERIFY", "true")
	t.Setenv("LOG_LEVEL", "debug")

	cfg := loadConfig()
	if !cfg.hosted {
		t.Errorf("hosted: want true")
	}
	if cfg.appDir != "/opt/pwa" {
		t.Errorf("appDir: got %q", cfg.appDir)
	}
	if !cfg.insecureSkipVerify {
		t.Errorf("insecureSkipVerify: want true")
	}
	if cfg.logLevel != slog.LevelDebug {
		t.Errorf("logLevel: want debug, got %v", cfg.logLevel)
	}
}

func TestLoadConfig_HostedRequiresExactTrue(t *testing.T) {
	// HOSTED must be literally "true" — anything else is false.
	for _, v := range []string{"1", "yes", "TRUE", "True", "y", ""} {
		t.Setenv("HOSTED", v)
		if cfg := loadConfig(); cfg.hosted {
			t.Errorf("HOSTED=%q: want hosted=false", v)
		}
	}
}
