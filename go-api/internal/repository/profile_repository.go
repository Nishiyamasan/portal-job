package repository

import (
	"context"
	"fmt"
	"encoding/json"

	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	custom_errors "portal-job/go-api/internal/errors"
)

type ProfileRepository interface {
	GetExistingIDByEmail(ctx context.Context, email string) (string, error)
	CheckIDExists(ctx context.Context, id string) (bool, error)
	DeleteProfile(ctx context.Context, id string) error
	InsertProfileCopyingFields(ctx context.Context, newID, oldID string) error
	MigrateReferences(ctx context.Context, newID, oldID string) error
	UpdateProfileEmail(ctx context.Context, id, email string) error
	UpsertProfile(ctx context.Context, id, email, displayName string) (json.RawMessage, error)
}

type profileRepository struct {
	pool *pgxpool.Pool
}

func NewProfileRepository(pool *pgxpool.Pool) ProfileRepository {
	return &profileRepository{pool: pool}
}

func (r *profileRepository) GetExistingIDByEmail(ctx context.Context, email string) (string, error) {
	var existingID string
	err := GetDB(ctx, r.pool).QueryRow(ctx, "SELECT id::text FROM profiles WHERE email = $1", email).Scan(&existingID)
	return existingID, err
}

func (r *profileRepository) CheckIDExists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := GetDB(ctx, r.pool).QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM profiles WHERE id = $1::uuid)", id).Scan(&exists)
	return exists, err
}

func (r *profileRepository) DeleteProfile(ctx context.Context, id string) error {
	_, err := GetDB(ctx, r.pool).Exec(ctx, "DELETE FROM profiles WHERE id = $1::uuid", id)
	return err
}

func (r *profileRepository) InsertProfileCopyingFields(ctx context.Context, newID, oldID string) error {
	_, err := GetDB(ctx, r.pool).Exec(ctx, `
		INSERT INTO profiles (id, email, display_name, role, web_push_subscription, created_at, updated_at, deleted_at)
		SELECT $1::uuid, NULL, display_name, role, web_push_subscription, created_at, updated_at, deleted_at
		FROM profiles WHERE id = $2::uuid`, newID, oldID)
	return err
}

func (r *profileRepository) MigrateReferences(ctx context.Context, newID, oldID string) error {
	updates := []struct {
		table  string
		column string
	}{
		{"job_seeker_profiles", "profile_id"},
		{"shops", "owner_id"},
		{"owner_applications", "profile_id"},
		{"owner_applications", "reviewed_by"},
		{"shop_members", "profile_id"},
		{"staff_shifts", "profile_id"},
		{"job_applications", "profile_id"},
		{"favorite_shops", "profile_id"},
		{"messages", "sender_id"},
		{"messages", "receiver_id"},
		{"push_subscriptions", "profile_id"},
		{"media_assets", "profile_id"},
		{"inquiries", "resolved_by"},
		{"system_settings", "updated_by"},
		{"system_settings_history", "changed_by"},
	}
	db := GetDB(ctx, r.pool)
	for _, u := range updates {
		query := fmt.Sprintf("UPDATE %s SET %s = $1::uuid WHERE %s = $2::uuid", u.table, u.column, u.column)
		if _, err := db.Exec(ctx, query, newID, oldID); err != nil {
			return fmt.Errorf("failed to update %s.%s: %w", u.table, u.column, err)
		}
	}
	return nil
}

func (r *profileRepository) UpdateProfileEmail(ctx context.Context, id, email string) error {
	_, err := GetDB(ctx, r.pool).Exec(ctx, `
		UPDATE profiles
		SET email = $2, deleted_at = NULL
		WHERE id = $1::uuid`, id, email)
	return err
}

func (r *profileRepository) UpsertProfile(ctx context.Context, id, email, displayName string) (json.RawMessage, error) {
	var payload json.RawMessage
	query := `
WITH upserted AS (
  INSERT INTO profiles (id, email, display_name, role, created_at, updated_at)
  VALUES ($1, NULLIF($2, ''), $3, 'user', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
      updated_at = NOW()
  WHERE profiles.deleted_at IS NULL
  RETURNING *
)
SELECT ` + profileJSONQuery("upserted") + ` FROM upserted`

		err := GetDB(ctx, r.pool).QueryRow(ctx, query, id, email, displayName).Scan(&payload)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, custom_errors.ErrConflict
		}
	}
	return payload, err
}

func profileJSONQuery(alias string) string {
	return `json_build_object(
  'id', ` + alias + `.id,
  'email', ` + alias + `.email,
  'display_name', ` + alias + `.display_name,
  'role', COALESCE(` + alias + `.role, 'user'),
  'created_at', ` + alias + `.created_at,
  'updated_at', ` + alias + `.updated_at,
  'media_assets', COALESCE((
    SELECT json_agg(json_build_object(
      'id', pma.id,
      'asset_type', pma.asset_type,
      'provider', pma.provider,
      'url', pma.url,
      'shop_id', pma.shop_id,
      'profile_id', pma.profile_id,
      'job_post_id', pma.job_post_id,
      'storage_bucket', pma.storage_bucket,
      'storage_path', pma.storage_path,
      'created_at', pma.created_at
    ) ORDER BY pma.created_at DESC NULLS LAST)
    FROM media_assets pma
    WHERE pma.profile_id = ` + alias + `.id
  ), '[]'::json)
)`
}
