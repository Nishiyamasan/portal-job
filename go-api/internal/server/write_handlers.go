package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type jobPayload struct {
	ShopID              string  `json:"shop_id"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	EmploymentType      *string `json:"employment_type"`
	Location            *string `json:"location"`
	Status              string  `json:"status"`
	ApplicationDeadline *string `json:"application_deadline"`
	PublishedAt         *string `json:"published_at"`
	ExpiresAt           *string `json:"expires_at"`
}

type jobApplicationPayload struct {
	Message *string `json:"message"`
	Status  string  `json:"status"`
}

func (s *Server) handleMyJobs(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	query := `
SELECT COALESCE(json_agg(job_payload), '[]'::json)
FROM (
  SELECT ` + jobJSON("j") + ` AS job_payload
  FROM job_posts j
  WHERE $1 IN ('admin', 'supervisor')
     OR j.shop_id IN (
       SELECT id FROM shops WHERE owner_id = $2::uuid
       UNION
       SELECT shop_id FROM shop_members WHERE profile_id = $2::uuid AND COALESCE(can_manage_shop, FALSE) = TRUE
     )
  ORDER BY j.created_at DESC NULLS LAST
) rows`
	if err := s.db.QueryRow(ctx, query, user.Role, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_my_jobs_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load jobs"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleShopJobs(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if ok, statusCode := s.canManageApprovedShop(ctx, shopID, user); !ok {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(job_payload), '[]'::json)
FROM (
  SELECT `+jobJSON("j")+` AS job_payload
  FROM job_posts j
  WHERE j.shop_id = $1
  ORDER BY j.created_at DESC NULLS LAST
) rows`, shopID).Scan(&payload); err != nil {
		s.logger.Warn("go_shop_jobs_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load shop jobs"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var input jobPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if input.Status == "" {
		input.Status = "open"
	}
	if input.ShopID == "" || input.Title == "" || input.Description == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "shop_id, title and description are required"})
		return
	}
	if ok, statusCode := s.canManageApprovedShop(ctx, input.ShopID, user); !ok {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO job_posts (
    shop_id, title, description, employment_type, location, status,
    application_deadline, published_at, expires_at
  )
  VALUES (
    $1::uuid, $2, $3, $4, $5, $6,
    NULLIF($7, '')::timestamptz,
    NULLIF($8, '')::timestamptz,
    COALESCE(NULLIF($9, '')::timestamptz, NULLIF($8, '')::timestamptz + INTERVAL '4 weeks')
  )
  RETURNING *
)
SELECT `+jobJSON("inserted")+` FROM inserted`,
		input.ShopID,
		input.Title,
		input.Description,
		input.EmploymentType,
		input.Location,
		input.Status,
		stringOrEmpty(input.ApplicationDeadline),
		stringOrEmpty(input.PublishedAt),
		stringOrEmpty(input.ExpiresAt),
	).Scan(&payload); err != nil {
		s.logger.Warn("go_create_job_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create job"})
		return
	}
	writeRawJSON(w, http.StatusCreated, payload)
}

func (s *Server) handleUpdateJob(w http.ResponseWriter, r *http.Request, user currentUser, jobID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	shopID, ok := s.jobShopID(ctx, jobID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job not found"})
		return
	}
	if access, statusCode := s.canManageApprovedShop(ctx, shopID, user); !access {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied"})
		return
	}

	var input jobPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if input.Status == "" {
		input.Status = "open"
	}
	if input.Title == "" || input.Description == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "title and description are required"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE job_posts
  SET title = $2,
      description = $3,
      employment_type = $4,
      location = $5,
      status = $6,
      application_deadline = NULLIF($7, '')::timestamptz,
      published_at = NULLIF($8, '')::timestamptz,
      expires_at = COALESCE(NULLIF($9, '')::timestamptz, NULLIF($8, '')::timestamptz + INTERVAL '4 weeks'),
      updated_at = NOW()
  WHERE id = $1::uuid
  RETURNING *
)
SELECT `+jobJSON("updated")+` FROM updated`,
		jobID,
		input.Title,
		input.Description,
		input.EmploymentType,
		input.Location,
		input.Status,
		stringOrEmpty(input.ApplicationDeadline),
		stringOrEmpty(input.PublishedAt),
		stringOrEmpty(input.ExpiresAt),
	).Scan(&payload); err != nil {
		s.logger.Warn("go_update_job_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update job"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleDeleteJob(w http.ResponseWriter, r *http.Request, user currentUser, jobID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	shopID, ok := s.jobShopID(ctx, jobID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job not found"})
		return
	}
	if access, statusCode := s.canManageApprovedShop(ctx, shopID, user); !access {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied"})
		return
	}

	if _, err := s.db.Exec(ctx, "DELETE FROM job_posts WHERE id = $1", jobID); err != nil {
		s.logger.Warn("go_delete_job_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete job"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFavoriteShop(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var exists bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM shops WHERE id = $1)", shopID).Scan(&exists); err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
		return
	}
	var favoriteExists bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM favorite_shops WHERE shop_id = $1 AND profile_id = $2)", shopID, user.ID).Scan(&favoriteExists); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to check favorite"})
		return
	}
	if !favoriteExists {
		if _, err := s.db.Exec(ctx, "INSERT INTO favorite_shops (id, shop_id, profile_id, created_at) VALUES (gen_random_uuid(), $1, $2, NOW())", shopID, user.ID); err != nil {
			s.logger.Warn("go_favorite_shop_failed", "error", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to favorite shop"})
			return
		}
	}
	writeJSON(w, http.StatusCreated, map[string]string{"message": "Favorited successfully"})
}

func (s *Server) handleUnfavoriteShop(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := s.db.Exec(ctx, "DELETE FROM favorite_shops WHERE shop_id = $1 AND profile_id = $2", shopID, user.ID); err != nil {
		s.logger.Warn("go_unfavorite_shop_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to unfavorite shop"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMyFavorites(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(favorite_payload ORDER BY created_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT
    fs.created_at,
    json_build_object(
      'id', fs.id,
      'profile_id', fs.profile_id,
      'shop_id', fs.shop_id,
      'created_at', fs.created_at,
      'shop', CASE WHEN s.id IS NULL THEN NULL ELSE `+shopJSON("s")+` END
    ) AS favorite_payload
  FROM favorite_shops fs
  LEFT JOIN shops s ON s.id = fs.shop_id
  WHERE fs.profile_id = $1
) rows`, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_my_favorites_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load favorites"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleMyApplications(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(application_payload ORDER BY created_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT ja.created_at, `+jobApplicationJSON("ja")+` AS application_payload
  FROM job_applications ja
  LEFT JOIN profiles applicant_profile ON applicant_profile.id = ja.profile_id
  LEFT JOIN job_posts j ON j.id = ja.job_post_id
  WHERE ja.profile_id = $1
) rows`, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_my_applications_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load applications"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleGetApplication(w http.ResponseWriter, r *http.Request, user currentUser, applicationID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	shopID, profileID, found := s.applicationAccessInfo(ctx, applicationID)
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Application not found"})
		return
	}
	if profileID != user.ID {
		if ok, statusCode := s.canManageShop(ctx, shopID, user, false); !ok {
			writeJSON(w, statusCode, map[string]string{"detail": "Access denied"})
			return
		}
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT `+jobApplicationJSON("ja")+`
FROM job_applications ja
LEFT JOIN profiles applicant_profile ON applicant_profile.id = ja.profile_id
LEFT JOIN job_posts j ON j.id = ja.job_post_id
WHERE ja.id = $1`, applicationID).Scan(&payload); err != nil {
		s.logger.Warn("go_get_application_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load application"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateApplicationStatus(w http.ResponseWriter, r *http.Request, user currentUser, applicationID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	shopID, _, found := s.applicationAccessInfo(ctx, applicationID)
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Application not found"})
		return
	}
	if ok, statusCode := s.canManageApprovedShop(ctx, shopID, user); !ok {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied to update application status"})
		return
	}

	var input jobApplicationPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	input.Status = strings.TrimSpace(input.Status)
	if input.Status == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "status is required"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE job_applications
  SET status = $2,
      updated_at = NOW()
  WHERE id = $1
  RETURNING *
)
SELECT `+jobApplicationJSON("updated")+`
FROM updated
LEFT JOIN profiles applicant_profile ON applicant_profile.id = updated.profile_id
LEFT JOIN job_posts j ON j.id = updated.job_post_id`, applicationID, input.Status).Scan(&payload); err != nil {
		s.logger.Warn("go_update_application_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update application"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleApplyToJob(w http.ResponseWriter, r *http.Request, user currentUser, jobID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var exists bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM job_posts WHERE id = $1)", jobID).Scan(&exists); err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job not found"})
		return
	}
	var alreadyApplied bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM job_applications WHERE job_post_id = $1 AND profile_id = $2)", jobID, user.ID).Scan(&alreadyApplied); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to check application"})
		return
	}
	if alreadyApplied {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Already applied to this job"})
		return
	}

	var input jobApplicationPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO job_applications (id, job_post_id, profile_id, status, message, created_at, updated_at)
  VALUES (gen_random_uuid(), $1, $2, 'pending', $3, NOW(), NOW())
  RETURNING *
)
SELECT `+jobApplicationJSON("inserted")+`
FROM inserted
LEFT JOIN profiles applicant_profile ON applicant_profile.id = inserted.profile_id
LEFT JOIN job_posts j ON j.id = inserted.job_post_id`, jobID, user.ID, input.Message).Scan(&payload); err != nil {
		s.logger.Warn("go_apply_job_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to apply to job"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleJobApplications(w http.ResponseWriter, r *http.Request, user currentUser, jobID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	shopID, ok := s.jobShopID(ctx, jobID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job not found"})
		return
	}
	if access, statusCode := s.canManageApprovedShop(ctx, shopID, user); !access {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied to view applications"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(application_payload ORDER BY created_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT ja.created_at, `+jobApplicationJSON("ja")+` AS application_payload
  FROM job_applications ja
  LEFT JOIN profiles applicant_profile ON applicant_profile.id = ja.profile_id
  LEFT JOIN job_posts j ON j.id = ja.job_post_id
  WHERE ja.job_post_id = $1
) rows`, jobID).Scan(&payload); err != nil {
		s.logger.Warn("go_job_applications_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load applications"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) canManageApprovedShop(ctx context.Context, shopID string, user currentUser) (bool, int) {
	return s.canManageShop(ctx, shopID, user, true)
}

func (s *Server) canManageShop(ctx context.Context, shopID string, user currentUser, requireApproved bool) (bool, int) {
	if user.Role == "admin" || user.Role == "supervisor" {
		return true, http.StatusOK
	}

	var exists bool
	var approved bool
	var allowed bool
	if err := s.db.QueryRow(ctx, `
SELECT
  EXISTS(SELECT 1 FROM shops WHERE id = $1::uuid),
  COALESCE((SELECT is_approved FROM shops WHERE id = $1::uuid), FALSE),
  EXISTS(
    SELECT 1 FROM shops WHERE id = $1::uuid AND owner_id = $2::uuid
    UNION
    SELECT 1 FROM shop_members
    WHERE shop_id = $1::uuid
      AND profile_id = $2::uuid
      AND COALESCE(can_manage_shop, FALSE) = TRUE
  )`, shopID, user.ID).Scan(&exists, &approved, &allowed); err != nil {
		s.logger.Warn("go_shop_access_check_failed", "error", err)
		return false, http.StatusServiceUnavailable
	}
	if !exists {
		return false, http.StatusNotFound
	}
	if !allowed {
		return false, http.StatusForbidden
	}
	if requireApproved && !approved {
		return false, http.StatusForbidden
	}
	return true, http.StatusOK
}

func (s *Server) applicationAccessInfo(ctx context.Context, applicationID string) (string, string, bool) {
	var shopID string
	var profileID string
	if err := s.db.QueryRow(ctx, `
SELECT j.shop_id::text, ja.profile_id::text
FROM job_applications ja
JOIN job_posts j ON j.id = ja.job_post_id
WHERE ja.id = $1::uuid`, applicationID).Scan(&shopID, &profileID); err != nil {
		if err != pgx.ErrNoRows {
			s.logger.Warn("go_application_access_lookup_failed", "error", err)
		}
		return "", "", false
	}
	return shopID, profileID, true
}

func (s *Server) jobShopID(ctx context.Context, jobID string) (string, bool) {
	var shopID string
	if err := s.db.QueryRow(ctx, "SELECT shop_id::text FROM job_posts WHERE id = $1::uuid", jobID).Scan(&shopID); err != nil {
		if err != pgx.ErrNoRows {
			s.logger.Warn("go_job_shop_lookup_failed", "error", err)
		}
		return "", false
	}
	return shopID, true
}

func stringOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
