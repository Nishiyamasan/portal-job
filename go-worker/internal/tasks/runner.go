package tasks

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"portal-job/go-worker/internal/config"
)

type Runner struct {
	cfg    config.Config
	db     *pgxpool.Pool
	logger *slog.Logger
}

func NewRunner(ctx context.Context, cfg config.Config, logger *slog.Logger) (*Runner, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	poolCfg.MaxConns = 2
	poolCfg.MinConns = 0
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute

	db, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}

	return &Runner{
		cfg:    cfg,
		db:     db,
		logger: logger,
	}, nil
}

func (r *Runner) Close() {
	if r.db != nil {
		r.db.Close()
	}
}

func (r *Runner) RunOnce(ctx context.Context) error {
	start := time.Now()

	if err := r.expireJobPosts(ctx); err != nil {
		return err
	}
	if err := r.expireBoosts(ctx); err != nil {
		return err
	}
	if err := r.inspectPushSubscriptions(ctx); err != nil {
		return err
	}

	r.logger.Info("worker_cycle_completed", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

func (r *Runner) expireJobPosts(ctx context.Context) error {
	tableExists, err := r.tableExists(ctx, "public.job_posts")
	if err != nil {
		return err
	}
	if !tableExists {
		r.logger.Warn("expire_job_posts_skipped", "reason", "job_posts table does not exist")
		return nil
	}

	const previewSQL = `
SELECT id::text, COALESCE(title, ''), expires_at
FROM job_posts
WHERE expires_at IS NOT NULL
  AND expires_at < NOW()
  AND status = 'open'
ORDER BY expires_at ASC
LIMIT 20`

	rows, err := r.db.Query(ctx, previewSQL)
	if err != nil {
		return err
	}
	defer rows.Close()

	type expiredJobPreview struct {
		id        string
		title     string
		expiresAt time.Time
	}

	previews := make([]expiredJobPreview, 0, 20)
	for rows.Next() {
		var item expiredJobPreview
		if err := rows.Scan(&item.id, &item.title, &item.expiresAt); err != nil {
			return err
		}
		previews = append(previews, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, item := range previews {
		r.logger.Info(
			"expired_job_post_candidate",
			"id", item.id,
			"title", item.title,
			"expires_at", item.expiresAt.Format(time.RFC3339),
			"dry_run", r.cfg.DryRun,
		)
	}

	if r.cfg.DryRun {
		r.logger.Info("expire_job_posts_dry_run_completed", "candidate_count", len(previews))
		return nil
	}

	commandTag, err := r.db.Exec(ctx, `
UPDATE job_posts
SET status = 'closed', updated_at = NOW()
WHERE expires_at IS NOT NULL
  AND expires_at < NOW()
  AND status = 'open'`)
	if err != nil {
		return err
	}

	r.logger.Info("expire_job_posts_completed", "updated_count", commandTag.RowsAffected())
	return nil
}

func (r *Runner) expireBoosts(ctx context.Context) error {
	tableExists, err := r.tableExists(ctx, "public.boosts")
	if err != nil {
		return err
	}
	if !tableExists {
		r.logger.Warn("expire_boosts_skipped", "reason", "boosts table does not exist")
		return nil
	}

	const previewSQL = `
SELECT id::text, shop_id::text, end_time
FROM boosts
WHERE end_time IS NOT NULL
  AND end_time < NOW()
  AND status = 'active'
ORDER BY end_time ASC
LIMIT 20`

	rows, err := r.db.Query(ctx, previewSQL)
	if err != nil {
		return err
	}
	defer rows.Close()

	type expiredBoostPreview struct {
		id      string
		shopID  string
		endTime time.Time
	}

	previews := make([]expiredBoostPreview, 0, 20)
	for rows.Next() {
		var item expiredBoostPreview
		if err := rows.Scan(&item.id, &item.shopID, &item.endTime); err != nil {
			return err
		}
		previews = append(previews, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, item := range previews {
		r.logger.Info(
			"expired_boost_candidate",
			"id", item.id,
			"shop_id", item.shopID,
			"end_time", item.endTime.Format(time.RFC3339),
			"dry_run", r.cfg.DryRun,
		)
	}

	if r.cfg.DryRun {
		r.logger.Info("expire_boosts_dry_run_completed", "candidate_count", len(previews))
		return nil
	}

	commandTag, err := r.db.Exec(ctx, `
UPDATE boosts
SET status = 'expired'
WHERE end_time IS NOT NULL
  AND end_time < NOW()
  AND status = 'active'`)
	if err != nil {
		return err
	}

	r.logger.Info("expire_boosts_completed", "updated_count", commandTag.RowsAffected())
	return nil
}

func (r *Runner) inspectPushSubscriptions(ctx context.Context) error {
	tableExists, err := r.tableExists(ctx, "public.push_subscriptions")
	if err != nil {
		return err
	}
	if !tableExists {
		r.logger.Warn("push_subscriptions_skipped", "reason", "push_subscriptions table does not exist")
		return nil
	}

	var totalCount int64
	var activeCount int64
	var inactiveCount int64
	var activeWithProfileCount int64
	if err := r.db.QueryRow(ctx, `
SELECT
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE is_active = TRUE) AS active_count,
  COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_count,
  COUNT(*) FILTER (WHERE is_active = TRUE AND profile_id IS NOT NULL) AS active_with_profile_count
FROM push_subscriptions`).Scan(
		&totalCount,
		&activeCount,
		&inactiveCount,
		&activeWithProfileCount,
	); err != nil {
		return err
	}

	r.logger.Info(
		"push_subscriptions_inspected",
		"total_count", totalCount,
		"active_count", activeCount,
		"inactive_count", inactiveCount,
		"active_with_profile_count", activeWithProfileCount,
		"vapid_configured", r.pushIsConfigured(),
		"dry_run", r.cfg.DryRun,
	)
	return nil
}

func (r *Runner) pushIsConfigured() bool {
	return r.cfg.VAPIDPublicKey != "" && r.cfg.VAPIDPrivateKey != ""
}

func (r *Runner) tableExists(ctx context.Context, tableName string) (bool, error) {
	var resolved *string
	if err := r.db.QueryRow(ctx, "SELECT to_regclass($1)::text", tableName).Scan(&resolved); err != nil {
		return false, err
	}
	return resolved != nil && *resolved != "", nil
}
