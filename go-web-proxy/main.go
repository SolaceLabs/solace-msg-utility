package main

import (
	"context"
	"crypto/tls"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

type config struct {
	hosted             bool
	appDir             string
	certFile           string
	keyFile            string
	trustDir           string
	insecureSkipVerify bool
	logLevel           slog.Level
}

func loadConfig() config {
	return config{
		hosted:             os.Getenv("HOSTED") == "true",
		appDir:             envOr("APP_DIR", "/SolaceMsgUtility"),
		certFile:           envOr("SSL_CERT_FILE", "/tls/tls.crt"),
		keyFile:            envOr("SSL_KEY_FILE", "/tls/tls.key"),
		trustDir:           envOr("SSL_TRUST_DIR", "/tls/trust"),
		insecureSkipVerify: os.Getenv("SSL_INSECURE_SKIP_VERIFY") == "true",
		logLevel:           parseLogLevel(envOr("LOG_LEVEL", "warn")),
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseLogLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "error":
		return slog.LevelError
	default:
		return slog.LevelWarn
	}
}

func main() {
	cfg := loadConfig()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.logLevel}))
	slog.SetDefault(logger)

	logger.Info("gateway starting",
		"hosted", cfg.hosted,
		"app_dir", cfg.appDir,
		"cert_file", cfg.certFile,
		"trust_dir", cfg.trustDir,
		"insecure_skip_verify", cfg.insecureSkipVerify,
	)

	serverCert, err := loadOrGenerateServerCert(cfg.certFile, cfg.keyFile, logger)
	if err != nil {
		logger.Error("server certificate setup failed", "err", err)
		os.Exit(1)
	}

	trustPool, err := buildTrustPool(cfg.trustDir, logger)
	if err != nil {
		logger.Error("trust pool setup failed", "err", err)
		os.Exit(1)
	}
	if cfg.insecureSkipVerify {
		logger.Warn("SSL_INSECURE_SKIP_VERIFY=true — upstream certificates will NOT be validated")
	}

	hh := newHostedHandler(cfg.hosted)
	pwa := newPWAHandler(cfg.appDir, logger)
	rp := newReverseProxy(trustPool, cfg.insecureSkipVerify, logger)

	root := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/hosted":
			hh.ServeHTTP(w, r)
		case isProxyPath(r.URL.Path):
			rp.ServeHTTP(w, r)
		default:
			pwa.ServeHTTP(w, r)
		}
	})

	handler := accessLog(root, logger)

	srv := &http.Server{
		Addr:              ":9443",
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		TLSConfig: &tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{serverCert},
		},
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServeTLS("", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err, ok := <-errCh:
		if ok && err != nil {
			logger.Error("listener failed", "err", err)
			os.Exit(1)
		}
	case sig := <-sigCh:
		logger.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			logger.Error("graceful shutdown failed", "err", err)
			os.Exit(1)
		}
		logger.Info("shutdown complete")
	}
}
