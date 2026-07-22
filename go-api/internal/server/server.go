package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"portal-job/go-api/internal/config"
	"portal-job/go-api/internal/repository"
	"portal-job/go-api/internal/service"
)

type Server struct {
	cfg         config.Config
	db          *pgxpool.Pool
	logger      *slog.Logger
	jwks        jwksCache
	authService service.AuthService
}

func New(cfg config.Config, logger *slog.Logger) (*Server, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

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

	transactor := repository.NewTransactor(db)
	profileRepo := repository.NewProfileRepository(db)
	authSvc := service.NewAuthService(transactor, profileRepo, logger)

	server := &Server{cfg: cfg, db: db, logger: logger, authService: authSvc}
	if err := server.ensureCompatibilitySchema(ctx); err != nil {
		logger.Warn("go_api_schema_compatibility_failed", "error", err)
	}

	return server, nil
}

func (s *Server) Close() {
	if s.db != nil {
		s.db.Close()
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /internal/db/ping", s.requireInternalToken(s.handleDBPing))
	mux.HandleFunc("GET /internal/version", s.requireInternalToken(s.handleVersion))
	mux.HandleFunc("GET /internal/jobs/expire-preview", s.requireInternalToken(s.handleExpirePreview))
	mux.HandleFunc("GET /api/v1/shops", s.handleListShops)
	mux.HandleFunc("GET /api/v1/shops/", s.handleShopsSubtree)
	mux.HandleFunc("GET /api/v1/shops/{id}/shifts", s.handleShiftsSubtree)
	mux.HandleFunc("POST /api/v1/shops/{id}/shifts", s.handleShiftsSubtree)
	mux.HandleFunc("PATCH /api/v1/shops/{id}/shifts/{shift_id}/status", s.handleShiftsSubtree)
	mux.HandleFunc("POST /api/v1/shops/", s.handleShopsSubtree)
	mux.HandleFunc("PUT /api/v1/shops/", s.handleShopsSubtree)
	mux.HandleFunc("DELETE /api/v1/shops/", s.handleShopsSubtree)
	mux.HandleFunc("GET /api/v1/jobs", s.handleListJobs)
	mux.HandleFunc("GET /api/v1/jobs/", s.handleJobsSubtree)
	mux.HandleFunc("POST /api/v1/jobs/", s.handleJobsSubtree)
	mux.HandleFunc("PUT /api/v1/jobs/", s.handleJobsSubtree)
	mux.HandleFunc("PATCH /api/v1/jobs/", s.handleJobsSubtree)
	mux.HandleFunc("DELETE /api/v1/jobs/", s.handleJobsSubtree)
	mux.HandleFunc("POST /api/v1/auth/sync-profile", s.handleSyncProfile)
	mux.HandleFunc("GET /api/v1/auth/profiles/", s.requireUser(s.handleGetProfile))
	mux.HandleFunc("GET /api/v1/auth/me", s.requireUser(s.handleGetMe))
	mux.HandleFunc("PUT /api/v1/auth/me", s.requireUser(s.handleUpdateMe))
	mux.HandleFunc("DELETE /api/v1/auth/me", s.requireUser(s.handleDeleteMe))
	mux.HandleFunc("GET /api/v1/auth/me/job-seeker-profile", s.requireUser(s.handleGetJobSeekerProfile))
	mux.HandleFunc("PUT /api/v1/auth/me/job-seeker-profile", s.requireUser(s.handleUpdateJobSeekerProfile))
	mux.HandleFunc("GET /api/v1/auth/me/memberships", s.requireUser(s.handleMyMemberships))
	mux.HandleFunc("POST /api/v1/messages/", s.requireUser(s.handleSendMessage))
	mux.HandleFunc("GET /api/v1/messages/conversations", s.requireUser(s.handleRecentConversations))
	mux.HandleFunc("GET /api/v1/messages/conversation/", s.requireUser(s.handleConversation))
	mux.HandleFunc("GET /api/v1/admin/", s.handleAdminSubtree)
	mux.HandleFunc("POST /api/v1/admin/", s.handleAdminSubtree)
	mux.HandleFunc("PUT /api/v1/admin/", s.handleAdminSubtree)
	mux.HandleFunc("PATCH /api/v1/admin/", s.handleAdminSubtree)
	mux.HandleFunc("DELETE /api/v1/admin/", s.handleAdminSubtree)
	mux.HandleFunc("GET /api/v1/owner-applications/", s.handleOwnerApplicationsSubtree)
	mux.HandleFunc("POST /api/v1/owner-applications/", s.handleOwnerApplicationsSubtree)
	mux.HandleFunc("GET /api/v1/inquiries/", s.handleInquiriesSubtree)
	mux.HandleFunc("POST /api/v1/inquiries/", s.handleInquiriesSubtree)
	mux.HandleFunc("PATCH /api/v1/inquiries/", s.handleInquiriesSubtree)
	mux.HandleFunc("GET /api/v1/push/", s.handlePushSubtree)
	mux.HandleFunc("POST /api/v1/push/", s.handlePushSubtree)
	mux.HandleFunc("DELETE /api/v1/push/", s.handlePushSubtree)
	mux.HandleFunc("GET /api/v1/media/", s.handleMediaSubtree)
	mux.HandleFunc("POST /api/v1/media/", s.handleMediaSubtree)
	mux.HandleFunc("GET /api/v1/public/system-settings/", s.handlePublicSystemSettingsSubtree)
	mux.HandleFunc("GET /api/v1/n2-supervisor-portal-xyz/", s.handleSupervisorSubtree)
	mux.HandleFunc("POST /api/v1/n2-supervisor-portal-xyz/", s.handleSupervisorSubtree)
	mux.HandleFunc("PUT /api/v1/n2-supervisor-portal-xyz/", s.handleSupervisorSubtree)
	return s.logRequests(s.withCORS(mux))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "go-api",
	})
}

func (s *Server) ensureCompatibilitySchema(ctx context.Context) error {
	exists, err := s.tableExists(ctx, "public.media_assets")
	if err != nil {
		return err
	}
	if exists {
		if _, err := s.db.Exec(ctx, "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS job_post_id UUID"); err != nil {
			return err
		}
	}

	exists, err = s.tableExists(ctx, "public.favorite_shops")
	if err != nil {
		return err
	}
	if exists {
		if _, err := s.db.Exec(ctx, "UPDATE favorite_shops SET created_at = NOW() WHERE created_at IS NULL"); err != nil {
			return err
		}
	}

	return nil
}

func (s *Server) handleDBPing(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var value int
	if err := s.db.QueryRow(ctx, "SELECT 1").Scan(&value); err != nil {
		s.logger.Warn("db_ping_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "error",
			"db":     "unavailable",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"db":          "ok",
		"latency_ms":  time.Since(start).Milliseconds(),
		"select_one":  value,
		"checked_at":  time.Now().UTC().Format(time.RFC3339),
		"environment": "local",
	})
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service":    "go-api",
		"version":    "local",
		"phase":      "phase-2-diagnostics",
		"checked_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleExpirePreview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	jobPreview, err := s.previewJobPostExpirations(ctx)
	if err != nil {
		s.logger.Warn("job_expire_preview_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "error",
			"detail": "failed to preview job expirations",
		})
		return
	}

	boostPreview, err := s.previewBoostExpirations(ctx)
	if err != nil {
		s.logger.Warn("boost_expire_preview_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "error",
			"detail": "failed to preview boost expirations",
		})
		return
	}

	pushPreview, err := s.previewPushSubscriptions(ctx)
	if err != nil {
		s.logger.Warn("push_subscription_preview_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "error",
			"detail": "failed to preview push subscriptions",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":             "ok",
		"dry_run":            true,
		"job_posts_to_close": jobPreview,
		"boosts_to_expire":   boostPreview,
		"push_subscriptions": pushPreview,
		"checked_at":         time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) previewJobPostExpirations(ctx context.Context) (map[string]any, error) {
	exists, err := s.tableExists(ctx, "public.job_posts")
	if err != nil {
		return nil, err
	}
	if !exists {
		return map[string]any{"table_exists": false, "candidate_count": 0}, nil
	}

	var count int64
	if err := s.db.QueryRow(ctx, `
SELECT COUNT(*)
FROM job_posts
WHERE expires_at IS NOT NULL
  AND expires_at < NOW()
  AND status = 'open'`).Scan(&count); err != nil {
		return nil, err
	}

	return map[string]any{"table_exists": true, "candidate_count": count}, nil
}

func (s *Server) previewBoostExpirations(ctx context.Context) (map[string]any, error) {
	exists, err := s.tableExists(ctx, "public.boosts")
	if err != nil {
		return nil, err
	}
	if !exists {
		return map[string]any{"table_exists": false, "candidate_count": 0}, nil
	}

	var count int64
	if err := s.db.QueryRow(ctx, `
SELECT COUNT(*)
FROM boosts
WHERE end_time IS NOT NULL
  AND end_time < NOW()
  AND status = 'active'`).Scan(&count); err != nil {
		return nil, err
	}

	return map[string]any{"table_exists": true, "candidate_count": count}, nil
}

func (s *Server) previewPushSubscriptions(ctx context.Context) (map[string]any, error) {
	exists, err := s.tableExists(ctx, "public.push_subscriptions")
	if err != nil {
		return nil, err
	}
	if !exists {
		return map[string]any{
			"table_exists":              false,
			"total_count":               0,
			"active_count":              0,
			"inactive_count":            0,
			"active_with_profile_count": 0,
		}, nil
	}

	var totalCount int64
	var activeCount int64
	var inactiveCount int64
	var activeWithProfileCount int64
	if err := s.db.QueryRow(ctx, `
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
		return nil, err
	}

	return map[string]any{
		"table_exists":              true,
		"total_count":               totalCount,
		"active_count":              activeCount,
		"inactive_count":            inactiveCount,
		"active_with_profile_count": activeWithProfileCount,
	}, nil
}

func (s *Server) tableExists(ctx context.Context, tableName string) (bool, error) {
	var resolved *string
	if err := s.db.QueryRow(ctx, "SELECT to_regclass($1)::text", tableName).Scan(&resolved); err != nil {
		return false, err
	}
	return resolved != nil && *resolved != "", nil
}

func (s *Server) requireInternalToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.InternalAPIToken == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"detail": "INTERNAL_API_TOKEN is not configured",
			})
			return
		}

		got := r.Header.Get("X-Internal-API-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.InternalAPIToken)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"detail": "Unauthorized",
			})
			return
		}

		next(w, r)
	}
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if r.URL.Path != "/health" {
			s.logger.Info(
				"go_api_request",
				"method", r.Method,
				"path", r.URL.Path,
				"duration_ms", time.Since(start).Milliseconds(),
			)
		}
	})
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	allowedOrigins := map[string]bool{}

	for _, origin := range strings.Split(s.cfg.AllowedOrigins, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowedOrigins[origin] = true
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins[origin] || strings.HasSuffix(origin, ".portal-job.pages.dev") {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-API-Token")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Warn("json_write_failed", "error", err)
	}
}

func writeRawJSON(w http.ResponseWriter, status int, payload json.RawMessage) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(payload); err != nil {
		slog.Warn("json_write_failed", "error", err)
	}
	if _, err := w.Write([]byte("\n")); err != nil {
		slog.Warn("json_write_failed", "error", err)
	}
}
