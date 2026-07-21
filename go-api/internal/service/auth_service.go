package service

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"portal-job/go-api/internal/repository"
	custom_errors "portal-job/go-api/internal/errors"
)

type SyncProfileInput struct {
	ID          string
	Email       string
	DisplayName string
}

type AuthService interface {
	SyncProfile(ctx context.Context, input SyncProfileInput) (json.RawMessage, error)
}

type authService struct {
	transactor repository.Transactor
	profileRepo repository.ProfileRepository
	logger      *slog.Logger
}

func NewAuthService(transactor repository.Transactor, profileRepo repository.ProfileRepository, logger *slog.Logger) AuthService {
	return &authService{
		transactor:  transactor,
		profileRepo: profileRepo,
		logger:      logger,
	}
}

func (s *authService) SyncProfile(ctx context.Context, input SyncProfileInput) (json.RawMessage, error) {
	if input.ID == "" {
		return nil, custom_errors.ErrBadRequest
	}

	var payload json.RawMessage

	err := s.transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		if input.Email != "" {
			existingID, err := s.profileRepo.GetExistingIDByEmail(txCtx, input.Email)
			if err == nil {
				if existingID != input.ID {
					s.logger.Info("go_sync_profile_migrating_id", "email", input.Email, "old_id", existingID, "new_id", input.ID)

					newIDExists, err := s.profileRepo.CheckIDExists(txCtx, input.ID)
					if err != nil {
						s.logger.Warn("go_sync_profile_check_new_id_failed", "error", err)
						return err
					}

					if newIDExists {
						if err := s.profileRepo.DeleteProfile(txCtx, input.ID); err != nil {
							s.logger.Warn("go_sync_profile_delete_new_id_failed", "error", err)
							return err
						}
					}

					if err := s.profileRepo.InsertProfileCopyingFields(txCtx, input.ID, existingID); err != nil {
						s.logger.Warn("go_sync_profile_insert_new_failed", "error", err)
						return err
					}

					if err := s.profileRepo.MigrateReferences(txCtx, input.ID, existingID); err != nil {
						s.logger.Warn("go_sync_profile_migrate_ref_failed", "error", err)
						return err
					}

					if err := s.profileRepo.DeleteProfile(txCtx, existingID); err != nil {
						s.logger.Warn("go_sync_profile_delete_old_failed", "error", err)
						return err
					}

					if err := s.profileRepo.UpdateProfileEmail(txCtx, input.ID, input.Email); err != nil {
						s.logger.Warn("go_sync_profile_update_new_failed", "error", err)
						return err
					}
				}
			} else if !errors.Is(err, pgx.ErrNoRows) {
				s.logger.Warn("go_sync_profile_lookup_failed", "error", err)
				return err
			}
		}

		resPayload, err := s.profileRepo.UpsertProfile(txCtx, input.ID, input.Email, input.DisplayName)
		if err != nil {
			s.logger.Warn("go_sync_profile_failed", "error", err)
			return err
		}
		payload = resPayload
		return nil
	})

	if err != nil {
		return nil, err
	}

	return payload, nil
}
