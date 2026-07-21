package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"portal-job/go-api/internal/service"
	custom_errors "portal-job/go-api/internal/errors"
	"errors"
)

type profileSyncPayload struct {
	ID          string  `json:"id"`
	Email       *string `json:"email"`
	DisplayName *string `json:"display_name"`
}

type profileUpdatePayload struct {
	DisplayName *string `json:"display_name"`
}

type jobSeekerProfilePayload struct {
	Bio              *string  `json:"bio"`
	DesiredRoles     []string `json:"desired_roles"`
	AvailabilityNote *string  `json:"availability_note"`
	IsOpenToWork     *bool    `json:"is_open_to_work"`
}

func (s *Server) handleSyncProfile(w http.ResponseWriter, r *http.Request) {
	identity, err := s.tokenIdentity(r)
	if err != nil {
		s.logger.Warn("go_sync_profile_token_failed", "error", err)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"detail": err.Error()})
		return
	}

	var input profileSyncPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.logger.Warn("go_sync_profile_decode_failed", "error", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}

	s.logger.Info("go_sync_profile_start", 
		"identity_id", identity.ID, 
		"identity_email", identity.Email, 
		"input_id", input.ID, 
		"input_email", derefString(input.Email),
		"input_display_name", derefString(input.DisplayName),
	)

	if input.ID != identity.ID {
		s.logger.Warn("go_sync_profile_mismatch", "input_id", input.ID, "identity_id", identity.ID)
		writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Profile mismatch"})
		return
	}

	email := identity.Email
	if email == "" && input.Email != nil {
		email = strings.TrimSpace(*input.Email)
	}
	displayName := ""
	if input.DisplayName != nil {
		displayName = strings.TrimSpace(*input.DisplayName)
	}
	if displayName == "" {
		displayName = "User"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	payload, err := s.authService.SyncProfile(ctx, service.SyncProfileInput{
		ID:          input.ID,
		Email:       email,
		DisplayName: displayName,
	})

	if err != nil {
		if errors.Is(err, custom_errors.ErrConflict) {
			writeJSON(w, http.StatusConflict, map[string]string{"detail": "Profile conflict"})
			return
		}
		if errors.Is(err, custom_errors.ErrBadRequest) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Bad Request"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"detail": "Failed to sync profile"})
		return
	}

	s.logger.Info("go_sync_profile_success", "id", input.ID)
	writeRawJSON(w, http.StatusOK, payload)
}

func derefString(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, "SELECT "+profileJSON("p")+" FROM profiles p WHERE p.id = $1 AND p.deleted_at IS NULL", user.ID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Profile not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request, user currentUser) {
	var input profileUpdatePayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE profiles
  SET display_name = COALESCE($2, display_name),
      updated_at = NOW()
  WHERE id = $1 AND deleted_at IS NULL
  RETURNING *
)
SELECT `+profileJSON("updated")+` FROM updated`, user.ID, input.DisplayName).Scan(&payload); err != nil {
		s.logger.Warn("go_update_me_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update profile"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleDeleteMe(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete account"})
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
UPDATE job_posts
SET status = 'archived', updated_at = NOW()
WHERE shop_id IN (SELECT id FROM shops WHERE owner_id = $1)`, user.ID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete account"})
		return
	}
	if _, err := tx.Exec(ctx, `
UPDATE shops
SET owner_id = NULL, claim_status = 'unclaimed', is_approved = FALSE, updated_at = NOW()
WHERE owner_id = $1`, user.ID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete account"})
		return
	}
	if _, err := tx.Exec(ctx, `
UPDATE profiles
SET deleted_at = NOW(),
    email = $2,
    display_name = 'Deleted User',
    web_push_subscription = NULL,
    updated_at = NOW()
WHERE id = $1`, user.ID, deletedEmail(user.ID)); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete account"})
		return
	}
	if err := s.deleteSupabaseAuthUser(ctx, user.ID); err != nil {
		s.logger.Warn("supabase_auth_delete_failed", "user_id", user.ID, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete Supabase auth user"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete account"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func deletedEmail(userID string) string {
	return "deleted+" + strings.ReplaceAll(userID, "-", "") + "@deleted.portal-job.local"
}

func (s *Server) deleteSupabaseAuthUser(ctx context.Context, userID string) error {
	if s.cfg.SupabaseURL == "" || s.cfg.SupabaseServiceRoleKey == "" {
		return fmt.Errorf("supabase admin configuration is missing")
	}

	endpoint := strings.TrimRight(s.cfg.SupabaseURL, "/") + "/auth/v1/admin/users/" + url.PathEscape(userID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, strings.NewReader(`{"should_soft_delete":false}`))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.SupabaseServiceRoleKey)
	req.Header.Set("apikey", s.cfg.SupabaseServiceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("supabase admin delete returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
}

func (s *Server) handleGetJobSeekerProfile(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH ensured AS (
  INSERT INTO job_seeker_profiles (id, profile_id, bio, desired_roles, availability_note, is_open_to_work, updated_at)
  VALUES (gen_random_uuid(), $1, NULL, NULL, NULL, TRUE, NOW())
  ON CONFLICT (profile_id) DO UPDATE SET updated_at = job_seeker_profiles.updated_at
  RETURNING *
)
SELECT `+jobSeekerProfileJSON("ensured")+` FROM ensured`, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_get_job_seeker_profile_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load job seeker profile"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateJobSeekerProfile(w http.ResponseWriter, r *http.Request, user currentUser) {
	var input jobSeekerProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	isOpenToWork := true
	if input.IsOpenToWork != nil {
		isOpenToWork = *input.IsOpenToWork
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH upserted AS (
  INSERT INTO job_seeker_profiles (id, profile_id, bio, desired_roles, availability_note, is_open_to_work, updated_at)
  VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
  ON CONFLICT (profile_id) DO UPDATE
  SET bio = EXCLUDED.bio,
      desired_roles = EXCLUDED.desired_roles,
      availability_note = EXCLUDED.availability_note,
      is_open_to_work = EXCLUDED.is_open_to_work,
      updated_at = NOW()
  RETURNING *
)
SELECT `+jobSeekerProfileJSON("upserted")+` FROM upserted`, user.ID, input.Bio, input.DesiredRoles, input.AvailabilityNote, isOpenToWork).Scan(&payload); err != nil {
		s.logger.Warn("go_update_job_seeker_profile_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update job seeker profile"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleMyMemberships(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(member_payload ORDER BY joined_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT sm.joined_at, `+shopMemberJSON("sm")+` AS member_payload
  FROM shop_members sm
  LEFT JOIN shops s ON s.id = sm.shop_id
  WHERE sm.profile_id = $1
) rows`, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_my_memberships_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load memberships"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func jobSeekerProfileJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'profile_id', ` + alias + `.profile_id,
  'bio', ` + alias + `.bio,
  'desired_roles', COALESCE(to_json(` + alias + `.desired_roles), '[]'::json),
  'availability_note', ` + alias + `.availability_note,
  'is_open_to_work', COALESCE(` + alias + `.is_open_to_work, TRUE),
  'updated_at', ` + alias + `.updated_at,
  'media_assets', COALESCE((
    SELECT json_agg(` + mediaAssetJSON("ma") + ` ORDER BY ma.created_at DESC NULLS LAST)
    FROM media_assets ma
    WHERE ma.profile_id = ` + alias + `.profile_id
  ), '[]'::json)
)`
}

func shopMemberJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'shop_id', ` + alias + `.shop_id,
  'profile_id', ` + alias + `.profile_id,
  'role', ` + alias + `.role,
  'display_name', ` + alias + `.display_name,
  'status', COALESCE(` + alias + `.status, 'approved'),
  'employment_status', COALESCE(` + alias + `.employment_status, 'active'),
  'display_order', COALESCE(` + alias + `.display_order, 0),
  'can_manage_shop', COALESCE(` + alias + `.can_manage_shop, FALSE),
  'joined_at', ` + alias + `.joined_at,
  'shop', CASE WHEN s.id IS NULL THEN NULL ELSE ` + shopJSON("s") + ` END
)`
}
