package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL            string
	InternalAPIToken       string
	Port                   string
	SupabaseJWKSURL        string
	SupabaseJWTSecret      string
	SupabaseURL            string
	SupabaseServiceRoleKey string
	VAPIDPublicKey         string
	VAPIDPrivateKey        string
	CloudinaryCloud        string
	CloudinaryAPIKey       string
	CloudinarySecret       string
	AllowedOrigins         string
}

func Load() (Config, error) {

	cfg := Config{
		DatabaseURL:            strings.TrimSpace(os.Getenv("DATABASE_URL")),
		InternalAPIToken:       strings.TrimSpace(os.Getenv("INTERNAL_API_TOKEN")),
		Port:                   strings.TrimSpace(os.Getenv("PORT")),
		SupabaseJWKSURL:        strings.TrimSpace(os.Getenv("SUPABASE_JWKS_URL")),
		SupabaseJWTSecret:      strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET")),
		SupabaseURL:            strings.TrimSpace(os.Getenv("SUPABASE_URL")),
		SupabaseServiceRoleKey: strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY")),
		VAPIDPublicKey:         strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY")),
		VAPIDPrivateKey:        strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY")),
		CloudinaryCloud:        strings.TrimSpace(os.Getenv("CLOUDINARY_CLOUD_NAME")),
		CloudinaryAPIKey:       strings.TrimSpace(os.Getenv("CLOUDINARY_API_KEY")),
		CloudinarySecret:       strings.TrimSpace(os.Getenv("CLOUDINARY_API_SECRET")),
		AllowedOrigins:         strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS")),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.Port == "" {
		cfg.Port = "10001"
	}

	return cfg, nil
}
