package service

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"testing"
)

// mockTransactor implements Transactor
type mockTransactor struct{}

func (m *mockTransactor) WithinTransaction(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

// mockProfileRepo implements repository.ProfileRepository
type mockProfileRepo struct {
	getExistingIDByEmail func(ctx context.Context, email string) (string, error)
	checkIDExists        func(ctx context.Context, id string) (bool, error)
	deleteProfile        func(ctx context.Context, id string) error
	insertProfile        func(ctx context.Context, newID, oldID string) error
	migrateReferences    func(ctx context.Context, newID, oldID string) error
	updateProfileEmail   func(ctx context.Context, id, email string) error
	upsertProfile        func(ctx context.Context, id, email, displayName string) (json.RawMessage, error)
}

func (m *mockProfileRepo) GetExistingIDByEmail(ctx context.Context, email string) (string, error) {
	if m.getExistingIDByEmail != nil {
		return m.getExistingIDByEmail(ctx, email)
	}
	return "", errors.New("not implemented")
}

func (m *mockProfileRepo) CheckIDExists(ctx context.Context, id string) (bool, error) {
	if m.checkIDExists != nil {
		return m.checkIDExists(ctx, id)
	}
	return false, errors.New("not implemented")
}

func (m *mockProfileRepo) DeleteProfile(ctx context.Context, id string) error {
	if m.deleteProfile != nil {
		return m.deleteProfile(ctx, id)
	}
	return errors.New("not implemented")
}

func (m *mockProfileRepo) InsertProfileCopyingFields(ctx context.Context, newID, oldID string) error {
	if m.insertProfile != nil {
		return m.insertProfile(ctx, newID, oldID)
	}
	return errors.New("not implemented")
}

func (m *mockProfileRepo) MigrateReferences(ctx context.Context, newID, oldID string) error {
	if m.migrateReferences != nil {
		return m.migrateReferences(ctx, newID, oldID)
	}
	return errors.New("not implemented")
}

func (m *mockProfileRepo) UpdateProfileEmail(ctx context.Context, id, email string) error {
	if m.updateProfileEmail != nil {
		return m.updateProfileEmail(ctx, id, email)
	}
	return errors.New("not implemented")
}

func (m *mockProfileRepo) UpsertProfile(ctx context.Context, id, email, displayName string) (json.RawMessage, error) {
	if m.upsertProfile != nil {
		return m.upsertProfile(ctx, id, email, displayName)
	}
	return nil, errors.New("not implemented")
}

func TestSyncProfile(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mockTx := &mockTransactor{}

	t.Run("success without migration", func(t *testing.T) {
		mockRepo := &mockProfileRepo{
			getExistingIDByEmail: func(ctx context.Context, email string) (string, error) {
				return "user-id", nil
			},
			upsertProfile: func(ctx context.Context, id, email, displayName string) (json.RawMessage, error) {
				return json.RawMessage(`{"id":"user-id"}`), nil
			},
		}

		svc := NewAuthService(mockTx, mockRepo, logger)

		input := SyncProfileInput{
			ID:          "user-id",
			Email:       "test@example.com",
			DisplayName: "Test User",
		}

		res, err := svc.SyncProfile(context.Background(), input)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if string(res) != `{"id":"user-id"}` {
			t.Errorf("expected response, got %s", string(res))
		}
	})

	t.Run("success with migration", func(t *testing.T) {
		mockRepo := &mockProfileRepo{
			getExistingIDByEmail: func(ctx context.Context, email string) (string, error) {
				return "old-id", nil
			},
			checkIDExists: func(ctx context.Context, id string) (bool, error) {
				return false, nil
			},
			insertProfile: func(ctx context.Context, newID, oldID string) error {
				return nil
			},
			migrateReferences: func(ctx context.Context, newID, oldID string) error {
				return nil
			},
			deleteProfile: func(ctx context.Context, id string) error {
				return nil
			},
			updateProfileEmail: func(ctx context.Context, id, email string) error {
				return nil
			},
			upsertProfile: func(ctx context.Context, id, email, displayName string) (json.RawMessage, error) {
				return json.RawMessage(`{"id":"new-id"}`), nil
			},
		}

		svc := NewAuthService(mockTx, mockRepo, logger)

		input := SyncProfileInput{
			ID:          "new-id",
			Email:       "test@example.com",
			DisplayName: "Test User",
		}

		res, err := svc.SyncProfile(context.Background(), input)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if string(res) != `{"id":"new-id"}` {
			t.Errorf("expected response, got %s", string(res))
		}
	})

	t.Run("validation failure (empty email)", func(t *testing.T) {
		mockRepo := &mockProfileRepo{}
		svc := NewAuthService(mockTx, mockRepo, logger)

		input := SyncProfileInput{
			ID:          "user-id",
			Email:       "", // validation failure expected
			DisplayName: "Test User",
		}

		_, err := svc.SyncProfile(context.Background(), input)
		if err == nil {
			t.Fatal("expected validation error, got nil")
		}
		if err.Error() != "email is required" {
			t.Errorf("expected 'email is required' error, got: %v", err)
		}
	})

	t.Run("validation failure (empty id)", func(t *testing.T) {
		mockRepo := &mockProfileRepo{}
		svc := NewAuthService(mockTx, mockRepo, logger)

		input := SyncProfileInput{
			ID:          "", // validation failure expected
			Email:       "test@example.com",
			DisplayName: "Test User",
		}

		_, err := svc.SyncProfile(context.Background(), input)
		if err == nil {
			t.Fatal("expected validation error, got nil")
		}
		if err.Error() != "id is required" {
			t.Errorf("expected 'id is required' error, got: %v", err)
		}
	})
}
