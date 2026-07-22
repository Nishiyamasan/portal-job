package server

import (
	"context"
	"net/http"
	"time"
)

func (s *Server) handleSupervisorStats(w http.ResponseWriter, r *http.Request, _ currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var stats struct {
		TotalShops          int64
		ApprovedShops       int64
		PendingShops        int64
		TotalUsers          int64
		TotalApplications   int64
		PendingApplications int64
	}

	if err := s.db.QueryRow(ctx, `
SELECT
  (SELECT COUNT(*) FROM shops) AS total_shops,
  (SELECT COUNT(*) FROM shops WHERE is_approved = TRUE) AS approved_shops,
  (SELECT COUNT(*) FROM shops) - (SELECT COUNT(*) FROM shops WHERE is_approved = TRUE) AS pending_shops,
  (SELECT COUNT(*) FROM profiles) AS total_users,
  (SELECT COUNT(*) FROM owner_applications) AS total_applications,
  (SELECT COUNT(*) FROM owner_applications WHERE status = 'pending') AS pending_applications`).Scan(
		&stats.TotalShops,
		&stats.ApprovedShops,
		&stats.PendingShops,
		&stats.TotalUsers,
		&stats.TotalApplications,
		&stats.PendingApplications,
	); err != nil {
		s.logger.Warn("supervisor_stats_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load stats"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]int64{
		"total_shops":          stats.TotalShops,
		"approved_shops":       stats.ApprovedShops,
		"pending_shops":        stats.PendingShops,
		"total_users":          stats.TotalUsers,
		"total_applications":   stats.TotalApplications,
		"pending_applications": stats.PendingApplications,
	})
}
