package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type messagePayload struct {
	ReceiverID string `json:"receiver_id"`
	ShopID     string `json:"shop_id"`
	Content    string `json:"content"`
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var input messagePayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid request body"})
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Message content is required"})
		return
	}
	if input.ReceiverID == "" || input.ShopID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "receiver_id and shop_id are required"})
		return
	}

	// DBを叩く前にUUIDの形式をチェックする
	if !isValidUUID(input.ReceiverID) || !isValidUUID(input.ShopID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "receiver_id and shop_id must be valid UUIDs"})
		return
	}

	var shopExists bool
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM shops WHERE id = $1::uuid)", input.ShopID).Scan(&shopExists); err != nil || !shopExists {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Shop not found"})
		return
	}

	if _, err := s.db.Exec(ctx, `
INSERT INTO profiles (id, email, display_name, role, created_at, updated_at)
VALUES ($1::uuid, $2, 'User', 'user', NOW(), NOW())
ON CONFLICT (id) DO NOTHING`, input.ReceiverID, input.ReceiverID+"@placeholder.portal-job.local"); err != nil {
		s.logger.Warn("go_placeholder_profile_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to prepare receiver profile"})
		return
	}

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH inserted AS (
  INSERT INTO messages (id, sender_id, receiver_id, shop_id, content, is_read, created_at)
  VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, FALSE, NOW())
  RETURNING *
)
SELECT `+messageJSON("inserted")+`
FROM inserted
LEFT JOIN profiles sender_profile ON sender_profile.id = inserted.sender_id
LEFT JOIN profiles receiver_profile ON receiver_profile.id = inserted.receiver_id
LEFT JOIN shops s ON s.id = inserted.shop_id`, user.ID, input.ReceiverID, input.ShopID, input.Content).Scan(&payload); err != nil {
		s.logger.Warn("go_send_message_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to send message"})
		return
	}

	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleRecentConversations(w http.ResponseWriter, r *http.Request, user currentUser) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload json.RawMessage
	if err := s.db.QueryRow(ctx, `
WITH ranked_messages AS (
  SELECT
    m.id AS message_id,
    m.shop_id,
    CASE WHEN m.sender_id = $1::uuid THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY m.shop_id, CASE WHEN m.sender_id = $1::uuid THEN m.receiver_id ELSE m.sender_id END
      ORDER BY m.created_at DESC
    ) AS row_number
  FROM messages m
  WHERE m.shop_id IS NOT NULL
    AND (m.sender_id = $1::uuid OR m.receiver_id = $1::uuid)
),
latest AS (
  SELECT message_id, shop_id, other_user_id
  FROM ranked_messages
  WHERE row_number = 1
),
unread AS (
  SELECT shop_id, sender_id AS other_user_id, COUNT(*) AS unread_count
  FROM messages
  WHERE shop_id IS NOT NULL
    AND receiver_id = $1::uuid
    AND COALESCE(is_read, FALSE) = FALSE
  GROUP BY shop_id, sender_id
)
SELECT COALESCE(json_agg(
  json_build_object(
    'shop_id', latest.shop_id,
    'other_user_id', latest.other_user_id,
    'shop', `+shopJSON("s")+`,
    'other_user', `+profileJSON("other_profile")+`,
    'last_message', `+messageJSON("m")+`,
    'unread_count', COALESCE(unread.unread_count, 0)
  )
  ORDER BY m.created_at DESC
), '[]'::json)
FROM latest
JOIN messages m ON m.id = latest.message_id
LEFT JOIN shops s ON s.id = latest.shop_id
LEFT JOIN profiles other_profile ON other_profile.id = latest.other_user_id
LEFT JOIN profiles sender_profile ON sender_profile.id = m.sender_id
LEFT JOIN profiles receiver_profile ON receiver_profile.id = m.receiver_id
LEFT JOIN unread ON unread.shop_id = latest.shop_id AND unread.other_user_id = latest.other_user_id`, user.ID).Scan(&payload); err != nil {
		s.logger.Warn("go_recent_conversations_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load conversations"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func (s *Server) handleConversation(w http.ResponseWriter, r *http.Request, user currentUser) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/v1/messages/conversation/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) != 2 {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Conversation not found"})
		return
	}
	shopID := parts[0]
	otherUserID := parts[1]

	// この関数でもURLから取得したIDがUUIDの形式を満たしているかチェックする
	if !isValidUUID(shopID) || !isValidUUID(otherUserID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "shop_id and other_user_id must be valid UUIDs"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load conversation"})
		return
	}
	defer tx.Rollback(ctx)

	var payload json.RawMessage
	if err := tx.QueryRow(ctx, `
SELECT COALESCE(json_agg(`+messageJSON("m")+` ORDER BY m.created_at ASC), '[]'::json)
FROM messages m
LEFT JOIN profiles sender_profile ON sender_profile.id = m.sender_id
LEFT JOIN profiles receiver_profile ON receiver_profile.id = m.receiver_id
LEFT JOIN shops s ON s.id = m.shop_id
WHERE m.shop_id = $1::uuid
  AND (
    (m.sender_id = $2::uuid AND m.receiver_id = $3::uuid)
    OR (m.sender_id = $3::uuid AND m.receiver_id = $2::uuid)
  )`, shopID, user.ID, otherUserID).Scan(&payload); err != nil {
		s.logger.Warn("go_conversation_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load conversation"})
		return
	}

	if _, err := tx.Exec(ctx, `
UPDATE messages
SET is_read = TRUE
WHERE shop_id = $1::uuid
  AND sender_id = $2::uuid
  AND receiver_id = $3::uuid
  AND COALESCE(is_read, FALSE) = FALSE`, shopID, otherUserID, user.ID); err != nil {
		s.logger.Warn("go_mark_conversation_read_failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to mark conversation read"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Failed to load conversation"})
		return
	}
	writeRawJSON(w, http.StatusOK, payload)
}

func messageJSON(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'sender_id', ` + alias + `.sender_id,
  'receiver_id', ` + alias + `.receiver_id,
  'shop_id', ` + alias + `.shop_id,
  'content', ` + alias + `.content,
  'is_read', COALESCE(` + alias + `.is_read, FALSE),
  'created_at', ` + alias + `.created_at,
  'sender', CASE WHEN sender_profile.id IS NULL THEN NULL ELSE ` + profileJSON("sender_profile") + ` END,
  'receiver', CASE WHEN receiver_profile.id IS NULL THEN NULL ELSE ` + profileJSON("receiver_profile") + ` END,
  'shop', CASE WHEN s.id IS NULL THEN NULL ELSE ` + shopJSON("s") + ` END
)`
}

// 共通の判定関数として独立して定義
func isValidUUID(u string) bool {
	if len(u) != 36 {
		return false
	}
	for i, r := range u {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if r != '-' {
				return false
			}
		} else {
			if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
				return false
			}
		}
	}
	return true
}