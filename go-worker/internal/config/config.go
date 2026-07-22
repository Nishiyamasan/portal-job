package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL     string
	DryRun          bool
	OneShot         bool
	Interval        time.Duration
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DryRun:          parseBool(os.Getenv("WORKER_DRY_RUN"), true),
		OneShot:         parseBool(os.Getenv("WORKER_ONE_SHOT"), false),
		Interval:        parseInterval(),
		VAPIDPublicKey:  strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY")),
		VAPIDPrivateKey: strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY")),
		VAPIDSubject:    strings.TrimSpace(os.Getenv("VAPID_SUBJECT")),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	return cfg, nil
}

func parseInterval() time.Duration {
	raw := strings.TrimSpace(os.Getenv("WORKER_INTERVAL_SECONDS"))
	if raw == "" {
		return 5 * time.Minute
	}

	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		return 5 * time.Minute
	}

	return time.Duration(seconds) * time.Second
}

func parseBool(raw string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}
