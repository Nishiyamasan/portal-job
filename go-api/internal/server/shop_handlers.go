package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type shopPayload struct {
	Name               *string  `json:"name"`
	Slug               *string  `json:"slug"`
	Description        *string  `json:"description"`
	Address            *string  `json:"address"`
	Category           *string  `json:"category"`
	Tags               []string `json:"tags"`
	CustomDescription  *string  `json:"custom_description"`
	XAccountID         *string  `json:"x_account_id"`
	InstagramAccountID *string  `json:"instagram_account_id"`
	OwnerID            *string  `json:"owner_id"`
	IsApproved         *bool    `json:"is_approved"`
	ClaimStatus        *string  `json:"claim_status"`
}

func (s *Server) handleMyShops(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
SELECT COALESCE(json_agg(shop_payload ORDER BY updated_at DESC NULLS LAST), '[]'::json)
FROM (
  SELECT s.updated_at, `+shopJSON("s")+` AS shop_payload
  FROM shops s
  WHERE $1 IN ('admin', 'supervisor')
     OR s.owner_id = $2::uuid
     OR s.id IN (
       SELECT shop_id FROM shop_members
       WHERE profile_id = $2::uuid AND COALESCE(can_manage_shop, FALSE) = TRUE
     )
) rows`, user.Role, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_my_shops_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load shops"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleRegisterShop(w http.ResponseWriter, r *http.Request, user currentUser) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	s.createShop(w, r, user, false)
}

func (s *Server) handleAdminCreateShop(w http.ResponseWriter, r *http.Request, user currentUser) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	s.createShop(w, r, user, true)
}

func (s *Server) createShop(w http.ResponseWriter, r *http.Request, user currentUser, adminMode bool) {
	var input shopPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	name := trimPtr(input.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "name is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	canClaimOwner := adminMode || user.Role == "admin" || user.Role == "supervisor"
	if !canClaimOwner {
		if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM owner_applications WHERE profile_id = $1 AND status = 'approved')", user.ID).Scan(&canClaimOwner); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to check owner status"})
			return
		}
	}
	ownerID := (*string)(nil)
	claimStatus := "unclaimed"
	if canClaimOwner {
		ownerID = &user.ID
		claimStatus = "claimed"
	}
	if adminMode && input.OwnerID != nil && *input.OwnerID != "" {
		ownerID = input.OwnerID
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create shop"})
		return
	}
	defer tx.Rollback(ctx)

	var shopID string
	var payload json.RawMessage
	if err := tx.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO shops (
    id, name, slug, category, description, address, tags,
    owner_id, is_approved, claim_status, custom_description,
    x_account_id, instagram_account_id, updated_at
  )
  VALUES (
    gen_random_uuid(), $1, NULLIF($2, ''), $3, $4, $5, $6,
    $7::text[], FALSE, $8, $9, $10, $11, NOW()
  )
  RETURNING *
)
SELECT inserted.id::text, `+shopJSON("inserted")+` FROM inserted`,
		name,
		normalizeSlug(input.Slug),
		input.Category,
		input.Description,
		input.Address,
		input.Tags,
		ownerID,
		claimStatus,
		input.CustomDescription,
		input.XAccountID,
		input.InstagramAccountID,
	).Scan(&shopID, &payload); err != nil {
		s.logger.Warn("go_create_shop_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create shop"})
		return
	}

	if canClaimOwner {
		if _, err := tx.Exec(ctx, `
INSERT INTO shop_members (id, shop_id, profile_id, role, display_name, status, employment_status, display_order, can_manage_shop, joined_at)
VALUES (gen_random_uuid(), $1, $2, 'owner', $3, 'approved', 'active', 0, TRUE, NOW())
ON CONFLICT DO NOTHING`, shopID, user.ID, defaultDisplayName(user)); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create shop membership"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to create shop"})
		return
	}
	writeRawJSON(w, http.StatusCreated, payload)
}

func (s *Server) handleUpdateShop(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	var input shopPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if ok, statusCode := s.canManageShop(ctx, shopID, user, false); !ok {
		writeJSON(w, statusCode, map[string]string{"detail": "Not authorized to update this shop"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE shops
  SET name = COALESCE($2, name),
      slug = CASE WHEN $3::text IS NULL THEN slug ELSE NULLIF($3, '') END,
      category = COALESCE($4, category),
      description = COALESCE($5, description),
      address = COALESCE($6, address),
      tags = COALESCE($7::text[], tags),
      custom_description = COALESCE($8, custom_description),
      x_account_id = COALESCE($9, x_account_id),
      instagram_account_id = COALESCE($10, instagram_account_id),
      is_approved = COALESCE($11, is_approved),
      claim_status = COALESCE($12, claim_status),
      owner_id = CASE WHEN $13::text IS NULL THEN owner_id ELSE NULLIF($13, '')::uuid END,
      updated_at = NOW()
  WHERE id = $1
  RETURNING *
)
SELECT `+shopJSON("updated")+` FROM updated`,
		shopID,
		input.Name,
		normalizeSlug(input.Slug),
		input.Category,
		input.Description,
		input.Address,
		input.Tags,
		input.CustomDescription,
		input.XAccountID,
		input.InstagramAccountID,
		input.IsApproved,
		input.ClaimStatus,
		input.OwnerID,
	).Scan(&payload); err != nil {
		s.logger.Warn("go_update_shop_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update shop"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleApproveShop(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE shops SET is_approved = TRUE, updated_at = NOW()
  WHERE id = $1
  RETURNING *
)
SELECT `+shopJSON("updated")+` FROM updated`, shopID).Scan(&payload); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleApplyMembership(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var exists bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM shops WHERE id = $1)", shopID).Scan(&exists); err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
		return
	}

	var status string
	if err := s.db.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO shop_members (id, shop_id, profile_id, role, display_name, status, employment_status, display_order, can_manage_shop, joined_at)
  VALUES (gen_random_uuid(), $1, $2, 'staff', $3, 'pending', 'active', 0, FALSE, NOW())
  ON CONFLICT DO NOTHING
  RETURNING status
)
SELECT COALESCE((SELECT status FROM inserted), (
  SELECT status FROM shop_members WHERE shop_id = $1 AND profile_id = $2 LIMIT 1
))`, shopID, user.ID, defaultDisplayName(user)).Scan(&status); err != nil {
		s.logger.Warn("go_apply_membership_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Membership application could not be saved"})
		return
	}
	if status != "pending" {
		writeJSON(w, http.StatusCreated, map[string]string{"message": "Already a member or application pending", "status": status})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"message": "Application submitted successfully", "status": "pending"})
}

func (s *Server) handleLeaveShop(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := s.db.Exec(ctx, "DELETE FROM shop_members WHERE shop_id = $1 AND profile_id = $2", shopID, user.ID); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to leave shop"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func normalizeSlug(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.ToLower(strings.TrimSpace(*value))
	return &normalized
}

func trimPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func defaultDisplayName(user currentUser) string {
	if strings.TrimSpace(user.Email) != "" {
		return user.Email
	}
	return "Owner"
}
