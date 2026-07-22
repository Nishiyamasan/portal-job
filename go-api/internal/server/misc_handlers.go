package server

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type ownerApplicationPayload struct {
	Reason        string  `json:"reason"`
	ShopID        *string `json:"shop_id"`
	Status        string  `json:"status"`
	ReviewComment *string `json:"review_comment"`
}

type inquiryPayload struct {
	InquiryType string `json:"inquiry_type"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	Content     string `json:"content"`
	IsResolved  *bool  `json:"is_resolved"`
}

type pushSubscriptionPayload struct {
	Endpoint  string `json:"endpoint"`
	UserAgent string `json:"user_agent"`
	Keys      struct {
		P256DH string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

type systemSettingPayload struct {
	Value string `json:"value"`
}

type uploadIntentPayload struct {
	AssetType string  `json:"asset_type"`
	ShopID    *string `json:"shop_id"`
	JobPostID *string `json:"job_post_id"`
}

const maxMediaImageBytes int64 = 5 * 1024 * 1024

func (s *Server) handleAdminSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/"), "/")
	if rest == "owner-applications" {
		s.requireSupervisor(s.handleAdminOwnerApplications)(w, r)
		return
	}
	if strings.HasPrefix(rest, "owner-applications/") {
		applicationID := strings.Trim(strings.TrimPrefix(rest, "owner-applications/"), "/")
		s.requireSupervisor(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleProcessOwnerApplication(w, r, user, applicationID)
		})(w, r)
		return
	}
	if strings.HasPrefix(rest, "shops/") {
		s.requireUser(s.handleAdminShopSubtree)(w, r)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
}

func (s *Server) handleAdminShopSubtree(w http.ResponseWriter, r *http.Request, user currentUser) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/shops/"), "/")
	parts := strings.Split(rest, "/")
	if len(parts) < 2 || parts[0] == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
		return
	}
	shopID := parts[0]
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if ok, statusCode := s.canManageShop(ctx, shopID, user, false); !ok {
		writeJSON(w, statusCode, map[string]string{"detail": "Access denied"})
		return
	}
	if len(parts) == 2 && parts[1] == "public-settings" {
		switch r.Method {
		case http.MethodGet:
			s.handleGetShopPublicSettings(w, r, shopID)
		case http.MethodPut:
			s.handleUpdateShopPublicSettings(w, r, shopID)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		}
		return
	}
	if len(parts) == 2 && parts[1] == "members" {
		switch r.Method {
		case http.MethodGet:
			s.handleShopMembers(w, r, shopID)
		case http.MethodPost:
			s.handleAddShopMember(w, r, shopID)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		}
		return
	}
	if len(parts) >= 3 && parts[1] == "members" {
		memberID := parts[2]
		if len(parts) == 4 && parts[3] == "public-settings" {
			if !s.canAccessMemberSettings(ctx, shopID, memberID, user) {
				writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Access denied"})
				return
			}
			switch r.Method {
			case http.MethodGet:
				s.handleGetMemberPublicSettings(w, r, memberID)
			case http.MethodPut:
				s.handleUpdateMemberPublicSettings(w, r, memberID)
			default:
				writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
			}
			return
		}
		switch r.Method {
		case http.MethodPatch:
			s.handleUpdateShopMember(w, r, shopID, memberID)
		case http.MethodDelete:
			s.handleDeleteShopMember(w, r, shopID, memberID)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		}
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
}

func (s *Server) handleGetShopPublicSettings(w http.ResponseWriter, r *http.Request, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH ensured AS (
  INSERT INTO shop_public_settings (id, shop_id, show_today_staff, updated_at)
  VALUES (gen_random_uuid(), $1::uuid, FALSE, NOW())
  ON CONFLICT (shop_id) DO UPDATE SET updated_at = shop_public_settings.updated_at
  RETURNING *
)
SELECT json_build_object(
  'id', ensured.id,
  'shop_id', ensured.shop_id,
  'show_today_staff', COALESCE(ensured.show_today_staff, FALSE),
  'updated_at', ensured.updated_at
) FROM ensured`, shopID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load public settings"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateShopPublicSettings(w http.ResponseWriter, r *http.Request, shopID string) {
	var input struct {
		ShowTodayStaff bool `json:"show_today_staff"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH upserted AS (
  INSERT INTO shop_public_settings (id, shop_id, show_today_staff, updated_at)
  VALUES (gen_random_uuid(), $1::uuid, $2, NOW())
  ON CONFLICT (shop_id) DO UPDATE
  SET show_today_staff = EXCLUDED.show_today_staff,
      updated_at = NOW()
  RETURNING *
)
SELECT json_build_object(
  'id', upserted.id,
  'shop_id', upserted.shop_id,
  'show_today_staff', COALESCE(upserted.show_today_staff, FALSE),
  'updated_at', upserted.updated_at
) FROM upserted`, shopID, input.ShowTodayStaff).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update public settings"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleShopMembers(w http.ResponseWriter, r *http.Request, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(member_payload ORDER BY display_order ASC, joined_at ASC), '[]'::json)
FROM (
  SELECT sm.display_order, sm.joined_at, `+shopMemberJSON("sm")+` AS member_payload
  FROM shop_members sm
  LEFT JOIN shops s ON s.id = sm.shop_id
  WHERE sm.shop_id = $1::uuid
) rows`, shopID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load shop members"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleAddShopMember(w http.ResponseWriter, r *http.Request, shopID string) {
	var input struct {
		ProfileID        string `json:"profile_id"`
		Role             string `json:"role"`
		DisplayName      string `json:"display_name"`
		EmploymentStatus string `json:"employment_status"`
		DisplayOrder     int    `json:"display_order"`
		CanManageShop    bool   `json:"can_manage_shop"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	if !isValidUUID(shopID) || !isValidUUID(input.ProfileID) {
        writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "shop_id and profile_id must be valid UUIDs"})
        return
    }
	if input.EmploymentStatus == "" {
		input.EmploymentStatus = "active"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO shop_members (id, shop_id, profile_id, role, display_name, status, employment_status, display_order, can_manage_shop, joined_at)
  SELECT gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, 'approved', $5, $6, $7, NOW()
  WHERE NOT EXISTS (SELECT 1 FROM shop_members WHERE shop_id = $1::uuid AND profile_id = $2::uuid)
  RETURNING *
)
SELECT `+shopMemberJSON("inserted")+` FROM inserted
LEFT JOIN shops s ON s.id = inserted.shop_id`,
		shopID, input.ProfileID, input.Role, input.DisplayName, input.EmploymentStatus, input.DisplayOrder, input.CanManageShop,
	).Scan(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "User is already a member of this shop"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateShopMember(w http.ResponseWriter, r *http.Request, shopID string, memberID string) {
	var input struct {
		Role             *string `json:"role"`
		DisplayName      *string `json:"display_name"`
		Status           *string `json:"status"`
		EmploymentStatus *string `json:"employment_status"`
		DisplayOrder     *int    `json:"display_order"`
		CanManageShop    *bool   `json:"can_manage_shop"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE shop_members
  SET role = COALESCE($3, role),
      display_name = COALESCE($4, display_name),
      status = COALESCE($5, status),
      employment_status = COALESCE($6, employment_status),
      display_order = COALESCE($7, display_order),
      can_manage_shop = COALESCE($8, can_manage_shop)
  WHERE shop_id = $1::uuid AND id = $2::uuid
  RETURNING *
)
SELECT `+shopMemberJSON("updated")+` FROM updated
LEFT JOIN shops s ON s.id = updated.shop_id`,
		shopID, memberID, input.Role, input.DisplayName, input.Status, input.EmploymentStatus, input.DisplayOrder, input.CanManageShop,
	).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Member not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleDeleteShopMember(w http.ResponseWriter, r *http.Request, shopID string, memberID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var role string
	if err := s.db.QueryRow(ctx, "SELECT role FROM shop_members WHERE shop_id = $1::uuid AND id = $2::uuid", shopID, memberID).Scan(&role); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Member not found"})
		return
	}
	if role == "owner" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Owner member cannot be removed"})
		return
	}
	if _, err := s.db.Exec(ctx, "DELETE FROM shop_members WHERE shop_id = $1::uuid AND id = $2::uuid", shopID, memberID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete member"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) canAccessMemberSettings(ctx context.Context, shopID string, memberID string, user currentUser) bool {
	if user.Role == "admin" || user.Role == "supervisor" {
		return true
	}
	var allowed bool
	if err := s.db.QueryRow(ctx, `
SELECT EXISTS(
  SELECT 1 FROM shop_members
  WHERE id = $2::uuid AND shop_id = $1::uuid AND profile_id = $3::uuid
) OR EXISTS(
  SELECT 1 FROM shops WHERE id = $1::uuid AND owner_id = $3::uuid
) OR EXISTS(
  SELECT 1 FROM shop_members
  WHERE shop_id = $1::uuid AND profile_id = $3::uuid AND COALESCE(can_manage_shop, FALSE) = TRUE
)`, shopID, memberID, user.ID).Scan(&allowed); err != nil {
		return false
	}
	return allowed
}

func (s *Server) handleGetMemberPublicSettings(w http.ResponseWriter, r *http.Request, memberID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH ensured AS (
  INSERT INTO member_public_settings (id, shop_member_id, is_visible_on_shop_page, show_profile_text, show_image, updated_at)
  VALUES (gen_random_uuid(), $1, FALSE, FALSE, FALSE, NOW())
  ON CONFLICT (shop_member_id) DO UPDATE SET updated_at = member_public_settings.updated_at
  RETURNING *
)
SELECT `+memberPublicSettingsJSON("ensured")+` FROM ensured`, memberID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load member public settings"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateMemberPublicSettings(w http.ResponseWriter, r *http.Request, memberID string) {
	var input struct {
		IsVisibleOnShopPage bool    `json:"is_visible_on_shop_page"`
		ShowProfileText     bool    `json:"show_profile_text"`
		ShowImage           bool    `json:"show_image"`
		ProfileText         *string `json:"profile_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH upserted AS (
  INSERT INTO member_public_settings (
    id, shop_member_id, is_visible_on_shop_page, show_profile_text, show_image, profile_text, updated_at
  )
  VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
  ON CONFLICT (shop_member_id) DO UPDATE
  SET is_visible_on_shop_page = EXCLUDED.is_visible_on_shop_page,
      show_profile_text = EXCLUDED.show_profile_text,
      show_image = EXCLUDED.show_image,
      profile_text = EXCLUDED.profile_text,
      updated_at = NOW()
  RETURNING *
)
SELECT `+memberPublicSettingsJSON("upserted")+` FROM upserted`,
		memberID, input.IsVisibleOnShopPage, input.ShowProfileText, input.ShowImage, input.ProfileText,
	).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update member public settings"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleSupervisorSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/n2-supervisor-portal-xyz/"), "/")
	if rest == "stats" {
		s.requireSupervisor(s.handleSupervisorStats)(w, r)
		return
	}
	if rest == "shops" {
		s.requireSupervisor(s.handleSupervisorShops)(w, r)
		return
	}
	if strings.HasPrefix(rest, "shops/") && strings.HasSuffix(rest, "/approve") {
		shopID := strings.TrimSuffix(strings.TrimPrefix(rest, "shops/"), "/approve")
		shopID = strings.Trim(shopID, "/")
		s.requireSupervisor(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			s.handleApproveShop(w, r, user, shopID)
		})(w, r)
		return
	}
	if strings.HasPrefix(rest, "system-settings/") {
		key := strings.Trim(strings.TrimPrefix(rest, "system-settings/"), "/")
		history := false
		if strings.HasSuffix(key, "/history") {
			key = strings.TrimSuffix(key, "/history")
			key = strings.Trim(key, "/")
			history = true
		}
		s.requireSupervisor(func(w http.ResponseWriter, r *http.Request, user currentUser) {
			if history {
				s.handleSystemSettingHistory(w, r, user, key)
				return
			}
			switch r.Method {
			case http.MethodGet:
				s.handleSystemSetting(w, r, key, true, user)
			case http.MethodPut:
				s.handleUpdateSystemSetting(w, r, user, key)
			default:
				writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
			}
		})(w, r)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
}

func (s *Server) handleOwnerApplicationsSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/owner-applications/"), "/")
	if rest == "" {
		s.requireUser(s.handleCreateOwnerApplication)(w, r)
		return
	}
	if rest == "me" {
		s.requireUser(s.handleMyOwnerApplications)(w, r)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
}

func (s *Server) handleInquiriesSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/inquiries/"), "/")
	if rest == "" {
		switch r.Method {
		case http.MethodPost:
			s.handleCreateInquiry(w, r)
		case http.MethodGet:
			s.requireSupervisor(s.handleListInquiries)(w, r)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		}
		return
	}
	s.requireSupervisor(func(w http.ResponseWriter, r *http.Request, user currentUser) {
		s.handleUpdateInquiry(w, r, user, rest)
	})(w, r)
}

func (s *Server) handlePushSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/push/"), "/")
	if rest == "config" {
		enabled := s.cfg.VAPIDPublicKey != "" && s.cfg.VAPIDPrivateKey != ""
		writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled, "public_key": emptyStringAsNil(s.cfg.VAPIDPublicKey)})
		return
	}
	if rest == "subscriptions" {
		s.requireUser(s.handlePushSubscriptions)(w, r)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
}

func (s *Server) handleMediaSubtree(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/media/"), "/")
	switch rest {
	case "upload-params", "upload-intent":
		s.requireUser(s.handleUploadIntent)(w, r)
	case "assets":
		s.requireUser(s.handleCreateMediaAsset)(w, r)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
	}
}

func (s *Server) handlePublicSystemSettingsSubtree(w http.ResponseWriter, r *http.Request) {
	key := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/public/system-settings/"), "/")
	s.handleSystemSetting(w, r, key, false, currentUser{})
}

func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request, user currentUser) {
	profileID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/auth/profiles/"), "/")
	if !isValidUUID(profileID) {
        writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "profile_id must be a valid UUID"})
        return
    }
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, "SELECT "+profileJSON("p")+" FROM profiles p WHERE p.id = $1::uuid AND p.deleted_at IS NULL", profileID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Profile not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleCreateOwnerApplication(w http.ResponseWriter, r *http.Request, user currentUser) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	var input ownerApplicationPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	if strings.TrimSpace(input.Reason) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "reason is required"})
		return
	}
	if input.ShopID != nil && strings.TrimSpace(*input.ShopID) != "" {
        if !isValidUUID(*input.ShopID) {
            writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "shop_id must be a valid UUID"})
            return
        }
    }
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create owner application"})
		return
	}
	defer tx.Rollback(ctx)

	if input.ShopID != nil && strings.TrimSpace(*input.ShopID) != "" {
		var claimStatus string
		if err := tx.QueryRow(ctx, "SELECT COALESCE(claim_status, 'unclaimed') FROM shops WHERE id = $1::uuid", *input.ShopID).Scan(&claimStatus); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
			return
		}
		if claimStatus != "unclaimed" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Shop is already claimed or has a pending application"})
			return
		}
		if _, err := tx.Exec(ctx, "UPDATE shops SET claim_status = 'pending', updated_at = NOW() WHERE id = $1::uuid", *input.ShopID); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update shop claim status"})
			return
		}
	}

	var payload json.RawMessage
	if err := tx.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO owner_applications (id, profile_id, shop_id, status, reason, created_at)
  VALUES (gen_random_uuid(), $1::uuid, NULLIF($2, '')::uuid, 'pending', $3, NOW())
  RETURNING *
)
SELECT `+ownerApplicationJSON("inserted")+` FROM inserted`, user.ID, nullableString(input.ShopID), strings.TrimSpace(input.Reason)).Scan(&payload); err != nil {
		s.logger.Warn("go_create_owner_application_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create owner application"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create owner application"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleMyOwnerApplications(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(application_payload ORDER BY created_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT oa.created_at, `+ownerApplicationJSON("oa")+` AS application_payload
  FROM owner_applications oa
  WHERE oa.profile_id = $1
) rows`, user.ID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load owner applications"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleAdminOwnerApplications(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(application_payload ORDER BY created_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT oa.created_at, `+ownerApplicationJSON("oa")+` AS application_payload
  FROM owner_applications oa
) rows`).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load owner applications"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleProcessOwnerApplication(w http.ResponseWriter, r *http.Request, user currentUser, applicationID string) {
	if r.Method != http.MethodPatch {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	var input ownerApplicationPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	status := strings.TrimSpace(input.Status)
	if status != "approved" && status != "rejected" && status != "pending" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid status"})
		return
	}
	if !isValidUUID(applicationID) {
        writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "application_id must be a valid UUID"})
        return
    }
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to process owner application"})
		return
	}
	defer tx.Rollback(ctx)

	var profileID string
	var shopID *string
	var previousStatus string
	if err := tx.QueryRow(ctx, "SELECT profile_id::text, shop_id::text, COALESCE(status, 'pending') FROM owner_applications WHERE id = $1::uuid", applicationID).Scan(&profileID, &shopID, &previousStatus); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Application not found"})
		return
	}

	if _, err := tx.Exec(ctx, `
UPDATE owner_applications
SET status = $2, review_comment = $3, reviewed_by = $4::uuid, reviewed_at = NOW()
WHERE id = $1::uuid`, applicationID, status, input.ReviewComment, user.ID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to process owner application"})
		return
	}
	if shopID != nil && *shopID != "" {
		if status == "approved" {
			if _, err := tx.Exec(ctx, `
UPDATE shops
SET owner_id = $2::uuid, claim_status = 'claimed', is_approved = TRUE, updated_at = NOW()
WHERE id = $1::uuid`, *shopID, profileID); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update shop"})
				return
			}
			if _, err := tx.Exec(ctx, `
INSERT INTO shop_members (id, shop_id, profile_id, role, display_name, status, employment_status, display_order, can_manage_shop, joined_at)
SELECT gen_random_uuid(), $1::uuid, p.id, 'owner', COALESCE(NULLIF(p.display_name, ''), 'Owner'), 'approved', 'active', 0, TRUE, NOW()
FROM profiles p
WHERE p.id = $2::uuid
  AND NOT EXISTS (SELECT 1 FROM shop_members sm WHERE sm.shop_id = $1::uuid AND sm.profile_id = $2::uuid)`, *shopID, profileID); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to add shop owner member"})
				return
			}
		} else {
			if _, err := tx.Exec(ctx, `
UPDATE shops
SET claim_status = 'unclaimed',
    owner_id = CASE WHEN owner_id = $2::uuid THEN NULL ELSE owner_id END,
    is_approved = CASE WHEN $3 = 'approved' THEN FALSE ELSE is_approved END,
    updated_at = NOW()
WHERE id = $1::uuid`, *shopID, profileID, previousStatus); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update shop"})
				return
			}
		}
	}

	var payload json.RawMessage
	if err := tx.QueryRow(ctx, "SELECT "+ownerApplicationJSON("oa")+" FROM owner_applications oa WHERE oa.id = $1", applicationID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to process owner application"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to process owner application"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleCreateInquiry(w http.ResponseWriter, r *http.Request) {
	var input inquiryPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	inquiryType := strings.TrimSpace(input.InquiryType)
	email := strings.TrimSpace(input.Email)
	if inquiryType != "listing" && inquiryType != "removal" && inquiryType != "other" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid inquiry type"})
		return
	}
	if email == "" || !strings.Contains(email, "@") || strings.HasPrefix(email, "@") || strings.HasSuffix(email, "@") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid email"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO inquiries (id, inquiry_type, name, email, content, is_resolved, created_at)
  VALUES (gen_random_uuid(), $1, $2, $3, $4, FALSE, NOW())
  RETURNING *
)
SELECT `+inquiryJSON("inserted")+` FROM inserted`, inquiryType, strings.TrimSpace(input.Name), email, strings.TrimSpace(input.Content)).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create inquiry"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleListInquiries(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	skip := parseNonNegativeInt(r.URL.Query().Get("skip"), 0)
	limit := clampInt(parseNonNegativeInt(r.URL.Query().Get("limit"), 100), 1, 200)
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(inquiry_payload ORDER BY created_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT i.created_at, `+inquiryJSON("i")+` AS inquiry_payload
  FROM inquiries i
  ORDER BY i.created_at DESC
  LIMIT $1 OFFSET $2
) rows`, limit, skip).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load inquiries"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateInquiry(w http.ResponseWriter, r *http.Request, user currentUser, inquiryID string) {
	if r.Method != http.MethodPatch {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	var input inquiryPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	if input.IsResolved == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "is_resolved is required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE inquiries
  SET is_resolved = $2,
      resolved_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
      resolved_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END
  WHERE id = $1
  RETURNING *
)
SELECT `+inquiryJSON("updated")+` FROM updated`, inquiryID, *input.IsResolved, user.ID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Inquiry not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handlePushSubscriptions(w http.ResponseWriter, r *http.Request, user currentUser) {
	var input pushSubscriptionPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	if strings.TrimSpace(input.Endpoint) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "endpoint is required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if r.Method == http.MethodDelete {
		if _, err := s.db.Exec(ctx, "UPDATE push_subscriptions SET is_active = FALSE WHERE endpoint = $1 AND profile_id = $2", input.Endpoint, user.ID); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to delete subscription"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	userAgent := strings.TrimSpace(input.UserAgent)
	if userAgent == "" {
		userAgent = r.Header.Get("User-Agent")
	}
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH upserted AS (
  INSERT INTO push_subscriptions (id, profile_id, endpoint, p256dh, auth, user_agent, is_active, created_at)
  VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, TRUE, NOW())
  ON CONFLICT (endpoint) DO UPDATE
  SET profile_id = EXCLUDED.profile_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      is_active = TRUE
  RETURNING *
)
SELECT json_build_object(
  'id', upserted.id,
  'endpoint', upserted.endpoint,
  'is_active', COALESCE(upserted.is_active, TRUE),
  'created_at', upserted.created_at,
  'last_used_at', upserted.last_used_at
) FROM upserted`, user.ID, input.Endpoint, input.Keys.P256DH, input.Keys.Auth, userAgent).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to save subscription"})
		return
	}
	writeRawJSON(w, http.StatusCreated, payload)
}

func (s *Server) handleUploadIntent(w http.ResponseWriter, r *http.Request, user currentUser) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	if s.cfg.CloudinaryCloud == "" || s.cfg.CloudinaryAPIKey == "" || s.cfg.CloudinarySecret == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Cloudinary environment variables are required for media uploads"})
		return
	}

	var input uploadIntentPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	if input.AssetType != "shop_image" && input.AssetType != "profile_image" && input.AssetType != "job_image" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Unsupported asset type"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	switch input.AssetType {
	case "shop_image":
		if input.ShopID == nil || strings.TrimSpace(*input.ShopID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "shop_id is required for shop images"})
			return
		}
		if ok, statusCode := s.canManageShop(ctx, *input.ShopID, user, false); !ok {
			writeJSON(w, statusCode, map[string]string{"detail": "Not authorized to upload this shop image"})
			return
		}
	case "job_image":
		if input.JobPostID == nil || strings.TrimSpace(*input.JobPostID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "job_post_id is required for job images"})
			return
		}
		var resolvedShopID string
		if err := s.db.QueryRow(ctx, "SELECT shop_id::text FROM job_posts WHERE id = $1", *input.JobPostID).Scan(&resolvedShopID); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job post not found"})
			return
		}
		if ok, statusCode := s.canManageShop(ctx, resolvedShopID, user, false); !ok {
			writeJSON(w, statusCode, map[string]string{"detail": "Not authorized to upload this job image"})
			return
		}
	}

	timestamp := time.Now().Unix()
	folder := "portal-job"
	contextValue := "asset_type=" + input.AssetType + "|profile_id=" + user.ID
	tags := "portal-job," + input.AssetType
	signatureBase := "context=" + contextValue +
		"&folder=" + folder +
		"&tags=" + tags +
		"&timestamp=" + strconv.FormatInt(timestamp, 10) +
		s.cfg.CloudinarySecret
	sum := sha1.Sum([]byte(signatureBase))
	writeJSON(w, http.StatusOK, map[string]any{
		"provider":   "cloudinary",
		"cloud_name": s.cfg.CloudinaryCloud,
		"api_key":    s.cfg.CloudinaryAPIKey,
		"timestamp":  timestamp,
		"signature":  hex.EncodeToString(sum[:]),
		"folder":     folder,
		"context":    contextValue,
		"tags":       tags,
	})
}

func (s *Server) handleCreateMediaAsset(w http.ResponseWriter, r *http.Request, user currentUser) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	var input struct {
		AssetType          string          `json:"asset_type"`
		Provider           string          `json:"provider"`
		URL                string          `json:"url"`
		ShopID             *string         `json:"shop_id"`
		ProfileID          *string         `json:"profile_id"`
		JobPostID          *string         `json:"job_post_id"`
		StorageBucket      *string         `json:"storage_bucket"`
		StoragePath        *string         `json:"storage_path"`
		MimeType           *string         `json:"mime_type"`
		Bytes              *string         `json:"bytes"`
		Width              *string         `json:"width"`
		Height             *string         `json:"height"`
		CloudinaryPublicID *string         `json:"cloudinary_public_id"`
		AssetMetadata      json.RawMessage `json:"asset_metadata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	provider := strings.TrimSpace(input.Provider)
	if provider == "" {
		provider = "cloudinary"
	}
	if provider != "cloudinary" && provider != "gcs" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Unsupported media provider"})
		return
	}
	if input.AssetType != "shop_image" && input.AssetType != "profile_image" && input.AssetType != "job_image" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Unsupported asset type"})
		return
	}
	if provider == "cloudinary" {
		if err := s.validateCloudinaryImageAsset(input.URL, input.MimeType, input.Bytes, input.CloudinaryPublicID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	shopID := input.ShopID
	profileID := input.ProfileID
	jobPostID := input.JobPostID
	switch input.AssetType {
	case "profile_image":
		profileID = &user.ID
		shopID = nil
		jobPostID = nil
	case "shop_image":
		if shopID == nil || strings.TrimSpace(*shopID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "shop_id is required for shop images"})
			return
		}
		if ok, statusCode := s.canManageShop(ctx, *shopID, user, false); !ok {
			writeJSON(w, statusCode, map[string]string{"detail": "Not authorized to update this shop image"})
			return
		}
		profileID = nil
		jobPostID = nil
	case "job_image":
		if jobPostID == nil || strings.TrimSpace(*jobPostID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "job_post_id is required for job images"})
			return
		}
		var resolvedShopID string
		if err := s.db.QueryRow(ctx, "SELECT shop_id::text FROM job_posts WHERE id = $1", *jobPostID).Scan(&resolvedShopID); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Job post not found"})
			return
		}
		if ok, statusCode := s.canManageShop(ctx, resolvedShopID, user, false); !ok {
			writeJSON(w, statusCode, map[string]string{"detail": "Not authorized to update this job image"})
			return
		}
		shopID = &resolvedShopID
		profileID = nil
	}

	metadata := json.RawMessage("null")
	if len(input.AssetMetadata) > 0 {
		metadata = input.AssetMetadata
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create media asset"})
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
UPDATE media_assets
SET active = FALSE, replaced_at = NOW()
WHERE asset_type = $1
  AND COALESCE(active, TRUE) = TRUE
  AND deleted_at IS NULL
  AND (($2::uuid IS NOT NULL AND job_post_id = $2::uuid)
    OR ($2::uuid IS NULL AND $3::uuid IS NOT NULL AND shop_id = $3::uuid)
    OR ($2::uuid IS NULL AND $3::uuid IS NULL AND profile_id = $4::uuid))`,
		input.AssetType, emptyStringAsNil(nullableString(jobPostID)), emptyStringAsNil(nullableString(shopID)), emptyStringAsNil(nullableString(profileID))); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to replace media asset"})
		return
	}
	var payload json.RawMessage
	if err := tx.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO media_assets (
    id, shop_id, profile_id, job_post_id, asset_type, provider, url,
    storage_bucket, storage_path, mime_type, bytes, width, height,
    active, cloudinary_public_id, metadata, created_at
  )
  VALUES (
    gen_random_uuid(), NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid,
    $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, $13, $14::jsonb, NOW()
  )
  RETURNING *
)
SELECT `+mediaAssetJSON("inserted")+` FROM inserted`,
		nullableString(shopID), nullableString(profileID), nullableString(jobPostID),
		input.AssetType, provider, input.URL, input.StorageBucket, input.StoragePath,
		input.MimeType, input.Bytes, input.Width, input.Height, input.CloudinaryPublicID, string(metadata),
	).Scan(&payload); err != nil {
		s.logger.Warn("go_create_media_asset_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create media asset"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create media asset"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) validateCloudinaryImageAsset(rawURL string, mimeType *string, bytesValue *string, publicID *string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme != "https" || parsed.Host != "res.cloudinary.com" {
		return errBadRequest("Invalid Cloudinary image URL")
	}
	expectedPathPrefix := "/" + s.cfg.CloudinaryCloud + "/image/upload/"
	if !strings.HasPrefix(parsed.EscapedPath(), expectedPathPrefix) {
		return errBadRequest("Invalid Cloudinary image path")
	}
	if publicID == nil || !strings.HasPrefix(strings.TrimSpace(*publicID), "portal-job/") {
		return errBadRequest("Invalid Cloudinary public id")
	}
	if mimeType != nil {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(*mimeType)), "image/") {
			return errBadRequest("Invalid media type")
		}
	}
	if bytesValue != nil && strings.TrimSpace(*bytesValue) != "" {
		size, err := strconv.ParseInt(strings.TrimSpace(*bytesValue), 10, 64)
		if err != nil || size < 0 {
			return errBadRequest("Invalid media size")
		}
		if size > maxMediaImageBytes {
			return errBadRequest("Image size must be 5MB or smaller")
		}
	}
	return nil
}

type requestError string

func (e requestError) Error() string {
	return string(e)
}

func errBadRequest(message string) error {
	return requestError(message)
}

func (s *Server) handleSystemSetting(w http.ResponseWriter, r *http.Request, rawKey string, admin bool, user currentUser) {
	key := normalizeSettingKey(rawKey)
	if key == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Setting key is required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	err := s.db.QueryRow(ctx, `
SELECT json_build_object(
  'key', ss.key,
  'value', ss.value,
  'updated_by', ss.updated_by,
  'updated_at', ss.updated_at,
  'source', 'db'
)
FROM system_settings ss
WHERE ss.key = $1`, key).Scan(&payload)
	if err == nil {
		writeRawJSON(w, http.StatusOK, payload)
		return
	}
	value, ok := defaultSystemSettings()[key]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Setting not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key, "value": value, "updated_by": nil, "updated_at": nil, "source": "default"})
}

func (s *Server) handleUpdateSystemSetting(w http.ResponseWriter, r *http.Request, user currentUser, rawKey string) {
	var input systemSettingPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	key := normalizeSettingKey(rawKey)
	defaults := defaultSystemSettings()
	oldValue := defaults[key]
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update setting"})
		return
	}
	defer tx.Rollback(ctx)
	_ = tx.QueryRow(ctx, "SELECT value FROM system_settings WHERE key = $1", key).Scan(&oldValue)
	if _, err := tx.Exec(ctx, `
INSERT INTO system_settings (key, value, updated_by, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, key, input.Value, user.ID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update setting"})
		return
	}
	if _, err := tx.Exec(ctx, `
INSERT INTO system_settings_history (id, setting_key, old_value, new_value, changed_by, changed_at)
VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`, key, oldValue, input.Value, user.ID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to record setting history"})
		return
	}
	var payload json.RawMessage
	if err := tx.QueryRow(ctx, `
SELECT json_build_object(
  'key', ss.key,
  'value', ss.value,
  'updated_by', ss.updated_by,
  'updated_at', ss.updated_at,
  'source', 'db'
)
FROM system_settings ss WHERE ss.key = $1`, key).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update setting"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update setting"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleSystemSettingHistory(w http.ResponseWriter, r *http.Request, user currentUser, rawKey string) {
	key := normalizeSettingKey(rawKey)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(history_payload ORDER BY changed_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT h.changed_at, json_build_object(
    'id', h.id,
    'setting_key', h.setting_key,
    'old_value', h.old_value,
    'new_value', h.new_value,
    'changed_by', h.changed_by,
    'changed_at', h.changed_at
  ) AS history_payload
  FROM system_settings_history h
  WHERE h.setting_key = $1
  ORDER BY h.changed_at DESC
  LIMIT 20
) rows`, key).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load setting history"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleSupervisorShops(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	skip := parseNonNegativeInt(r.URL.Query().Get("skip"), 0)
	limit := clampInt(parseNonNegativeInt(r.URL.Query().Get("limit"), 100), 1, 200)
	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(shop_payload ORDER BY updated_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT s.updated_at, (`+shopJSON("s")+`)::jsonb || jsonb_build_object('owner_email', owner.email) AS shop_payload
  FROM shops s
  LEFT JOIN profiles owner ON owner.id = s.owner_id
  ORDER BY s.updated_at DESC NULLS LAST
  LIMIT $1 OFFSET $2
) rows`, limit, skip).Scan(&payload); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load shops"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func ownerApplicationJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'profile_id', ` + alias + `.profile_id,
  'shop_id', ` + alias + `.shop_id,
  'status', COALESCE(` + alias + `.status, 'pending'),
  'reason', ` + alias + `.reason,
  'review_comment', ` + alias + `.review_comment,
  'reviewed_at', ` + alias + `.reviewed_at,
  'created_at', ` + alias + `.created_at,
  'profile', (SELECT ` + profileJSON("p") + ` FROM profiles p WHERE p.id = ` + alias + `.profile_id),
  'shop', (SELECT ` + shopJSON("s") + ` FROM shops s WHERE s.id = ` + alias + `.shop_id)
)`
}

func inquiryJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'inquiry_type', ` + alias + `.inquiry_type,
  'name', ` + alias + `.name,
  'email', ` + alias + `.email,
  'content', ` + alias + `.content,
  'is_resolved', COALESCE(` + alias + `.is_resolved, FALSE),
  'resolved_at', ` + alias + `.resolved_at,
  'resolved_by', ` + alias + `.resolved_by,
  'created_at', ` + alias + `.created_at
)`
}

func memberPublicSettingsJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'shop_member_id', ` + alias + `.shop_member_id,
  'is_visible_on_shop_page', COALESCE(` + alias + `.is_visible_on_shop_page, FALSE),
  'show_profile_text', COALESCE(` + alias + `.show_profile_text, FALSE),
  'show_image', COALESCE(` + alias + `.show_image, FALSE),
  'profile_text', ` + alias + `.profile_text,
  'updated_at', ` + alias + `.updated_at
)`
}

func nullableString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func emptyStringAsNil(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func normalizeSettingKey(key string) string {
	return strings.ToLower(strings.TrimSpace(key))
}

func defaultSystemSettings() map[string]string {
	return map[string]string{
		"terms_ja":   "# 利用規約\n\n現在、利用規約の本文を準備中です。",
		"terms_en":   "# Terms of Service\n\nThe Terms of Service content is being prepared.",
		"privacy_ja": "# プライバシーポリシー\n\n現在、プライバシーポリシーの本文を準備中です。",
		"privacy_en": "# Privacy Policy\n\nThe Privacy Policy content is being prepared.",
	}
}