package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"portal-job/go-worker/internal/config"
	"portal-job/go-worker/internal/tasks"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config_error", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	runner, err := tasks.NewRunner(ctx, cfg, logger)
	if err != nil {
		logger.Error("worker_init_error", "error", err)
		os.Exit(1)
	}
	defer runner.Close()

	logger.Info(
		"worker_started",
		"dry_run", cfg.DryRun,
		"one_shot", cfg.OneShot,
		"interval", cfg.Interval.String(),
	)

	if cfg.OneShot {
		if err := runner.RunOnce(ctx); err != nil {
			logger.Error("worker_run_error", "error", err)
			os.Exit(1)
		}
		logger.Info("worker_finished")
		return
	}

	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()

	if err := runner.RunOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("worker_run_error", "error", err)
	}

	for {
		select {
		case <-ctx.Done():
			logger.Info("worker_stopped")
			return
		case <-ticker.C:
			if err := runner.RunOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("worker_run_error", "error", err)
			}
		}
	}
}
