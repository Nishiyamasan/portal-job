package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type staffShiftPayload struct {
	ID           *string  `json:"id"`
	BusinessDate string   `json:"business_date"`
	StartTime    float64  `json:"start_time"`
	EndTime      float64  `json:"end_time"`
	Note         *string  `json:"note"`
	Status       *string  `json:"status"`
}

func (s *Server) handleShiftsSubtree(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if r.Method == http.MethodOptions {
		return
	}

	user, err := s.currentUser(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"detail": err.Error()})
		return
	}

	parts := splitPath(path)
	// Expecting /api/v1/shops/{id}/shifts...
	if len(parts) < 5 {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
		return
	}

	shopID := parts[3]
	subResource := parts[4]

	if subResource != "shifts" {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not found"})
		return
	}

	if len(parts) == 5 {
		if r.Method == http.MethodGet {
			s.handleListShifts(w, r, user, shopID)
			return
		}
		if r.Method == http.MethodPost {
			s.handleUpsertShift(w, r, user, shopID)
			return
		}
	}

	if len(parts) == 6 && r.Method == http.MethodPatch {
		shiftID := parts[5]
		s.handleUpdateShiftStatus(w, r, user, shopID, shiftID)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed"})
}

func (s *Server) handleListShifts(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Query params: start_date, end_date (business dates)
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")



	isManager, _ := s.canManageShop(ctx, shopID, user, false)

	var payload json.RawMessage
	query := `
SELECT COALESCE(json_agg(shift_payload ORDER BY business_date ASC, start_time ASC), '[]'::json)
FROM (
  SELECT
    ss.id,
    ss.shop_id,
    ss.profile_id,
    ss.business_date,
    ss.start_time,
    ss.end_time,
    ss.note,
    ss.status,
    ss.created_at,
    ss.updated_at,
    json_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'email', p.email
    ) as profile
  FROM staff_shifts ss
  JOIN profiles p ON p.id = ss.profile_id
  WHERE ss.shop_id = $1::uuid
    AND ($2::date IS NULL OR ss.business_date >= $2::date)
    AND ($3::date IS NULL OR ss.business_date <= $3::date)
    AND (
      $4 = TRUE -- Manager can see all
      OR ss.profile_id = $5::uuid -- User can see their own
      OR ss.status = 'approved' -- Others can only see approved
    )
) rows`
	var startPtr *string
	if startDate != "" {
		if _, err := time.Parse("2006-01-02", startDate); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "start_date must be in YYYY-MM-DD format"})
			return
		}
		startPtr = &startDate
	}
	var endPtr *string
	if endDate != "" {
		if _, err := time.Parse("2006-01-02", endDate); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "end_date must be in YYYY-MM-DD format"})
			return
		}
		endPtr = &endDate
	}
	if err := s.db.QueryRow(ctx, query, shopID, startPtr, endPtr, isManager, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_list_shifts_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load shifts"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpsertShift(w http.ResponseWriter, r *http.Request, user currentUser, shopID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check if user is a member of the shop
	var isMember bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM shop_members WHERE shop_id = $1::uuid AND profile_id = $2::uuid AND status = 'approved')", shopID, user.ID).Scan(&isMember); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Database error"})
		return
	}
	if !isMember && user.Role != "admin" && user.Role != "supervisor" {
		writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Must be a shop member to enter shifts"})
		return
	}

	var input staffShiftPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}

	if input.BusinessDate == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "business_date is required"})
		return
	}

	// Status defaults to draft if not provided
	status := "draft"
	if input.Status != nil {
		status = *input.Status
	}

	// Logic: Only owner/manager can edit approved shifts?
	// For now, staff can edit their own drafts and submitted ones (becomes draft again or stays submitted).
	// Actually, specification says: submitted means owner is adjusting, staff can no longer edit.

	var currentStatus string
	err := s.db.QueryRow(ctx, "SELECT status FROM staff_shifts WHERE shop_id = $1::uuid AND profile_id = $2::uuid AND business_date = $3::date", shopID, user.ID, input.BusinessDate).Scan(&currentStatus)
	if err == nil && currentStatus != "draft" && user.Role != "admin" && user.Role != "supervisor" {
		// Check if they are manager
		isManager, _ := s.canManageShop(ctx, shopID, user, false)
		if !isManager {
			writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Cannot edit non-draft shifts"})
			return
		}
	}

	var payload json.RawMessage
	upsertQuery := `
INSERT INTO staff_shifts (id, shop_id, profile_id, business_date, start_time, end_time, note, status, updated_at)
VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, NOW())
ON CONFLICT (shop_id, profile_id, business_date) DO UPDATE
SET start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    note = EXCLUDED.note,
    status = EXCLUDED.status,
    updated_at = NOW()
RETURNING id, shop_id, profile_id, business_date, start_time, end_time, note, status`

	if err := s.db.QueryRow(ctx, upsertQuery, shopID, user.ID, input.BusinessDate, input.StartTime, input.EndTime, input.Note, status).Scan(&payload); err != nil {
		s.logger.Warn("go_upsert_shift_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to save shift"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleUpdateShiftStatus(w http.ResponseWriter, r *http.Request, user currentUser, shopID string, shiftID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var input struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}

	// Load shift to check ownership
	var shiftProfileID string
	var currentStatus string
	if err := s.db.QueryRow(ctx, "SELECT profile_id::text, status FROM staff_shifts WHERE id = $1::uuid", shiftID).Scan(&shiftProfileID, &currentStatus); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shift not found"})
		return
	}

	isManager, _ := s.canManageShop(ctx, shopID, user, false)
	isOwner := shiftProfileID == user.ID

	allowed := false
	if input.Status == "submitted" && isOwner {
		allowed = true
	} else if (input.Status == "approved" || input.Status == "draft") && isManager {
		allowed = true
	}

	if !allowed {
		writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Not authorized to update status to " + input.Status})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
UPDATE staff_shifts
SET status = $2, updated_at = NOW()
WHERE id = $1::uuid
RETURNING id, shop_id, profile_id, business_date, start_time, end_time, note, status`, shiftID, input.Status).Scan(&payload); err != nil {
		s.logger.Warn("go_update_shift_status_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to update shift status"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

// GetCurrentBusinessDate logic (spec: 0:00 - 8:00 is previous business day if before cutoff)
func GetCurrentBusinessDate(now time.Time, cutoffTimeStr string) time.Time {
	// Parse cutoffTimeStr (e.g. "06:00")
	cutoffHour := 6
	cutoffMin := 0
	if len(cutoffTimeStr) == 5 {
		timePart, err := time.Parse("15:04", cutoffTimeStr)
		if err == nil {
			cutoffHour = timePart.Hour()
			cutoffMin = timePart.Minute()
		}
	}

	cutoffToday := time.Date(now.Year(), now.Month(), now.Day(), cutoffHour, cutoffMin, 0, 0, now.Location())

	if now.Before(cutoffToday) {
		// It's still the previous business day
		return now.AddDate(0, 0, -1)
	}
	return now
}

func splitPath(path string) []string {
	parts := []string{}
	for _, p := range strings.Split(path, "/") {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}
