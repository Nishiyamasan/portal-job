package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *Server) handleShopsSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/v1/shops/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		s.handleListShops(w, r)
		return
	}
	if rest == "admin/all" {
		s.requireUser(s.handleMyShops)(w, r)
		return
	}
	if rest == "me/favorites" {
		s.requireUser(s.handleMyFavorites)(w, r)
		return
	}
	if rest == "register" {
		s.requireUser(s.handleRegisterShop)(w, r)
		return
	}
	if rest == "admin" {
		s.requireSupervisor(s.handleAdminCreateShop)(w, r)
		return
	}
	if strings.HasPrefix(rest, "admin/") && strings.HasSuffix(rest, "/approve") {
		shopID := strings.TrimPrefix(rest, "admin/")
		shopID = strings.TrimSuffix(shopID, "/approve")
		shopID = strings.Trim(shopID, "/")
		s.requireSupervisor(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleApproveShop(w, r, user, shopID)
		})(w, r)
		return
	}
	if strings.HasSuffix(rest, "/favorite") {
		shopID := strings.TrimSuffix(rest, "/favorite")
		shopID = strings.Trim(shopID, "/")
		switch r.Method {
		case http.MethodPost:
			s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
				s.handleFavoriteShop(w, r, user, shopID)
			})(w, r)
		case http.MethodDelete:
			s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
				s.handleUnfavoriteShop(w, r, user, shopID)
			})(w, r)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		}
		return
	}
	if strings.HasSuffix(rest, "/apply-membership") {
		shopID := strings.TrimSuffix(rest, "/apply-membership")
		shopID = strings.Trim(shopID, "/")
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleApplyMembership(w, r, user, shopID)
		})(w, r)
		return
	}
	if strings.HasSuffix(rest, "/membership") {
		shopID := strings.TrimSuffix(rest, "/membership")
		shopID = strings.Trim(shopID, "/")
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleLeaveShop(w, r, user, shopID)
		})(w, r)
		return
	}
	if strings.HasSuffix(rest, "/public-members") {
		shopIDOrSlug := strings.TrimSuffix(rest, "/public-members")
		shopIDOrSlug = strings.Trim(shopIDOrSlug, "/")
		s.handlePublicShopMembers(w, r, shopIDOrSlug)
		return
	}
	if r.Method == http.MethodPut {
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleUpdateShop(w, r, user, rest)
		})(w, r)
		return
	}
	s.handleGetShop(w, r, rest)
}

func (s *Server) handleJobsSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/v1/jobs/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		switch r.Method {
		case http.MethodGet:
			s.handleListJobs(w, r)
		case http.MethodPost:
			s.requireUser(s.handleCreateJob)(w, r)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		}
		return
	}
	if rest == "my-jobs" {
		s.requireUser(s.handleMyJobs)(w, r)
		return
	}
	if rest == "my-applications" {
		s.requireUser(s.handleMyApplications)(w, r)
		return
	}
	if strings.HasPrefix(rest, "applications/") {
		applicationID := strings.TrimPrefix(rest, "applications/")
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			switch r.Method {
			case http.MethodGet:
				s.handleGetApplication(w, r, user, applicationID)
			case http.MethodPatch:
				s.handleUpdateApplicationStatus(w, r, user, applicationID)
			default:
				writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
			}
		})(w, r)
		return
	}
	if strings.HasPrefix(rest, "shop/") {
		shopID := strings.TrimPrefix(rest, "shop/")
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleShopJobs(w, r, user, shopID)
		})(w, r)
		return
	}
	if strings.HasSuffix(rest, "/apply") {
		jobID := strings.TrimSuffix(rest, "/apply")
		jobID = strings.Trim(jobID, "/")
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			if r.Method != http.MethodPost {
				writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
				return
			}
			s.handleApplyToJob(w, r, user, jobID)
		})(w, r)
		return
	}
	if strings.HasSuffix(rest, "/applications") {
		jobID := strings.TrimSuffix(rest, "/applications")
		jobID = strings.Trim(jobID, "/")
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			if r.Method != http.MethodGet {
				writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
				return
			}
			s.handleJobApplications(w, r, user, jobID)
		})(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.handleGetJob(w, r, rest)
	case http.MethodPut:
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleUpdateJob(w, r, user, rest)
		})(w, r)
	case http.MethodDelete:
		s.requireUser(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleDeleteJob(w, r, user, rest)
		})(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
	}
}

func (s *Server) handleListShops(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	skip := parseNonNegativeInt(r.URL.Query().Get("skip"), 0)
	limit := clampInt(parseNonNegativeInt(r.URL.Query().Get("limit"), 100), 1, 200)
	random := parseBoolQuery(r.URL.Query().Get("random"))
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	tags := splitCSV(r.URL.Query().Get("tags"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	args := []any{}
	where := []string{"s.is_approved = TRUE"}
	if category != "" {
		args = append(args, category)
		where = append(where, "s.category = $"+strconv.Itoa(len(args)))
	}
	for _, tag := range tags {
		args = append(args, "%"+tag+"%")
		where = append(where, "s.tags::text LIKE $"+strconv.Itoa(len(args)))
	}
	if q != "" {
		args = append(args, "%"+q+"%")
		idx := strconv.Itoa(len(args))
		where = append(where, "(s.name ILIKE $"+idx+" OR s.description ILIKE $"+idx+")")
	}

	orderBy := "s.updated_at DESC NULLS LAST"
	if random {
		orderBy = "random()"
	}

	args = append(args, limit, skip)
	query := `
SELECT COALESCE(json_agg(shop_payload), '[]'::json)
FROM (
  SELECT ` + shopJSON("s") + ` AS shop_payload
  FROM shops s
  WHERE ` + strings.Join(where, " AND ") + `
  ORDER BY ` + orderBy + `
  LIMIT $` + strconv.Itoa(len(args)-1) + ` OFFSET $` + strconv.Itoa(len(args)) + `
) rows`

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, query, args...).Scan(&payload); err != nil {
		s.logger.Warn("go_list_shops_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to list shops"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleGetShop(w http.ResponseWriter, r *http.Request, idOrSlug string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT `+shopJSON("s")+`
FROM shops s
WHERE s.id::text = $1 OR s.slug = $1
LIMIT 1`, idOrSlug).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handlePublicShopMembers(w http.ResponseWriter, r *http.Request, idOrSlug string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH selected_shop AS (
  SELECT id
  FROM shops
  WHERE (id::text = $1 OR slug = $1)
    AND is_approved = TRUE
  LIMIT 1
),
settings AS (
  SELECT COALESCE(sps.show_today_staff, FALSE) AS show_today_staff
  FROM selected_shop ss
  LEFT JOIN shop_public_settings sps ON sps.shop_id = ss.id
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM selected_shop) THEN NULL
  WHEN NOT EXISTS (SELECT 1 FROM settings WHERE show_today_staff = TRUE) THEN '[]'::json
  ELSE COALESCE((
    SELECT json_agg(json_build_object(
      'id', sm.id,
      'display_name', sm.display_name,
      'profile_image_url', (
        SELECT ma.url
        FROM media_assets ma
        WHERE ma.profile_id = sm.profile_id
          AND ma.asset_type = 'profile_image'
          AND COALESCE(ma.active, TRUE) = TRUE
          AND ma.deleted_at IS NULL
        ORDER BY ma.created_at DESC NULLS LAST
        LIMIT 1
      )
    ) ORDER BY sm.display_order ASC, sm.joined_at ASC)
    FROM shop_members sm
    JOIN selected_shop ss ON ss.id = sm.shop_id
    WHERE sm.status = 'approved'
      AND sm.employment_status = 'active'
  ), '[]'::json)
END`, idOrSlug).Scan(&payload); err != nil || payload == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	skip := parseNonNegativeInt(r.URL.Query().Get("skip"), 0)
	limit := clampInt(parseNonNegativeInt(r.URL.Query().Get("limit"), 100), 1, 200)
	random := parseBoolQuery(r.URL.Query().Get("random"))

	orderBy := "j.published_at DESC NULLS LAST, j.created_at DESC NULLS LAST"
	if random {
		orderBy = "random()"
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(job_payload), '[]'::json)
FROM (
  SELECT `+jobJSON("j")+` AS job_payload
  FROM job_posts j
  WHERE j.status = 'open'
  ORDER BY `+orderBy+`
  LIMIT $1 OFFSET $2
) rows`, limit, skip).Scan(&payload); err != nil {
		s.logger.Warn("go_list_jobs_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to list jobs"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request, jobID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT `+jobJSON("j")+`
FROM job_posts j
WHERE j.id::text = $1
LIMIT 1`, jobID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func shopJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'name', ` + alias + `.name,
  'slug', ` + alias + `.slug,
  'category', ` + alias + `.category,
  'description', ` + alias + `.description,
  'address', ` + alias + `.address,
  'tags', COALESCE(to_json(` + alias + `.tags), '[]'::json),
  'owner_id', ` + alias + `.owner_id,
  'is_approved', COALESCE(` + alias + `.is_approved, FALSE),
  'claim_status', COALESCE(` + alias + `.claim_status, 'unclaimed'),
  'description_en', ` + alias + `.description_en,
  'description_zh', ` + alias + `.description_zh,
  'description_ko', ` + alias + `.description_ko,
  'x_account_id', ` + alias + `.x_account_id,
  'instagram_account_id', ` + alias + `.instagram_account_id,
  'contact_profile_id', COALESCE(` + alias + `.owner_id, (
    SELECT sm.profile_id
    FROM shop_members sm
    WHERE sm.shop_id = ` + alias + `.id
      AND sm.status = 'approved'
      AND sm.employment_status = 'active'
      AND COALESCE(sm.can_manage_shop, FALSE) = TRUE
    ORDER BY sm.joined_at ASC
    LIMIT 1
  )),
  'updated_at', ` + alias + `.updated_at,
  'media_assets', COALESCE((
    SELECT json_agg(` + mediaAssetJSON("ma") + ` ORDER BY ma.created_at DESC NULLS LAST)
    FROM media_assets ma
    WHERE ma.shop_id = ` + alias + `.id
  ), '[]'::json)
)`
}

func mediaAssetJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'asset_type', ` + alias + `.asset_type,
  'provider', ` + alias + `.provider,
  'url', ` + alias + `.url,
  'shop_id', ` + alias + `.shop_id,
  'profile_id', ` + alias + `.profile_id,
  'job_post_id', ` + alias + `.job_post_id,
  'storage_bucket', ` + alias + `.storage_bucket,
  'storage_path', ` + alias + `.storage_path,
  'mime_type', ` + alias + `.mime_type,
  'bytes', ` + alias + `.bytes,
  'width', ` + alias + `.width,
  'height', ` + alias + `.height,
  'active', ` + alias + `.active,
  'cloudinary_public_id', ` + alias + `.cloudinary_public_id,
  'asset_metadata', ` + alias + `.metadata,
  'created_at', ` + alias + `.created_at,
  'replaced_at', ` + alias + `.replaced_at,
  'deleted_at', ` + alias + `.deleted_at
)`
}

func profileJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'email', ` + alias + `.email,
  'display_name', ` + alias + `.display_name,
  'role', COALESCE(` + alias + `.role, 'user'),
  'created_at', ` + alias + `.created_at,
  'updated_at', ` + alias + `.updated_at,
  'media_assets', COALESCE((
    SELECT json_agg(` + mediaAssetJSON("pma") + ` ORDER BY pma.created_at DESC NULLS LAST)
    FROM media_assets pma
    WHERE pma.profile_id = ` + alias + `.id
  ), '[]'::json)
)`
}

func jobJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'shop_id', ` + alias + `.shop_id,
  'title', ` + alias + `.title,
  'description', ` + alias + `.description,
  'employment_type', ` + alias + `.employment_type,
  'location', ` + alias + `.location,
  'status', ` + alias + `.status,
  'application_deadline', ` + alias + `.application_deadline::timestamptz,
  'published_at', ` + alias + `.published_at::timestamptz,
  'expires_at', ` + alias + `.expires_at::timestamptz,
  'created_at', ` + alias + `.created_at::timestamptz,
  'updated_at', ` + alias + `.updated_at::timestamptz,
  'media_assets', COALESCE((
    SELECT json_agg(` + mediaAssetJSON("ma") + ` ORDER BY ma.created_at DESC NULLS LAST)
    FROM media_assets ma
    WHERE ma.job_post_id = ` + alias + `.id
  ), '[]'::json)
)`
}

func jobApplicationJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'job_post_id', ` + alias + `.job_post_id,
  'profile_id', ` + alias + `.profile_id,
  'status', COALESCE(` + alias + `.status, 'pending'),
  'message', ` + alias + `.message,
  'created_at', ` + alias + `.created_at,
  'updated_at', ` + alias + `.updated_at,
  'profile', CASE WHEN applicant_profile.id IS NULL THEN NULL ELSE ` + profileJSON("applicant_profile") + ` END,
  'job_post', CASE WHEN j.id IS NULL THEN NULL ELSE ` + jobJSON("j") + ` END
)`
}

func parseNonNegativeInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return fallback
	}
	return value
}

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func parseBoolQuery(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func splitCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}
