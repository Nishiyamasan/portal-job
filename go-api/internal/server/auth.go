package server

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type currentUser struct {
	ID    string
	Email string
	Role  string
}

type tokenIdentity struct {
	ID    string
	Email string
}

type jwkSet struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type jwksCache struct {
	mu        sync.Mutex
	keys      map[string]any
	expiresAt time.Time
}

func (s *Server) requireSupervisor(next func(http.ResponseWriter, *http.Request, currentUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := s.currentUser(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"detail": err.Error()})
			return
		}
		if user.Role != "admin" && user.Role != "supervisor" {
			writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Supervisor access required"})
			return
		}
		next(w, r, user)
	}
}

func (s *Server) requireUser(next func(http.ResponseWriter, *http.Request, currentUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := s.currentUser(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"detail": err.Error()})
			return
		}
		next(w, r, user)
	}
}

func (s *Server) currentUser(r *http.Request) (currentUser, error) {
	identity, err := s.tokenIdentity(r)
	if err != nil {
		s.logger.Info("current_user_token_failed", "error", err)
		return currentUser{}, err
	}

	s.logger.Info("current_user_lookup_start", "identity_id", identity.ID, "identity_email", identity.Email)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var user currentUser
	if err := s.db.QueryRow(ctx, `
SELECT id::text, COALESCE(email, ''), COALESCE(role, 'user')
FROM profiles
WHERE id = $1
  AND deleted_at IS NULL`, identity.ID).Scan(&user.ID, &user.Email, &user.Role); err != nil {
		s.logger.Warn("current_user_lookup_failed", "identity_id", identity.ID, "error", err)
		return currentUser{}, errors.New("Invalid token")
	}
	if user.Email == "" {
		user.Email = identity.Email
	}
	s.logger.Info("current_user_lookup_success", "user_id", user.ID, "user_email", user.Email, "user_role", user.Role)
	return user, nil
}

func (s *Server) tokenIdentity(r *http.Request) (tokenIdentity, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return tokenIdentity{}, errors.New("Authorization header is missing")
	}
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return tokenIdentity{}, errors.New("Invalid Authorization header format")
	}

	tokenString := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, s.jwtKeyfunc)
	if err != nil {
		return tokenIdentity{}, errors.New("Invalid token")
	}
	if !token.Valid {
		return tokenIdentity{}, errors.New("Invalid token")
	}
	if err := claimsValidator().Validate(claims); err != nil {
		return tokenIdentity{}, errors.New("Invalid token")
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return tokenIdentity{}, errors.New("Invalid token")
	}
	email, _ := claims["email"].(string)
	return tokenIdentity{ID: sub, Email: email}, nil
}

func claimsValidator() *jwt.Validator {
	return jwt.NewValidator(jwt.WithAudience("authenticated"), jwt.WithExpirationRequired())
}

func (s *Server) jwtKeyfunc(token *jwt.Token) (any, error) {
	if token.Method.Alg() == jwt.SigningMethodHS256.Alg() && s.cfg.SupabaseJWTSecret != "" {
		return []byte(s.cfg.SupabaseJWTSecret), nil
	}
	if s.cfg.SupabaseJWKSURL == "" {
		return nil, errors.New("JWKS URL is not configured")
	}
	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		return nil, errors.New("JWT kid is missing")
	}
	key, err := s.jwksKey(kid)
	if err != nil {
		return nil, err
	}
	return key, nil
}

func (s *Server) jwksKey(kid string) (any, error) {
	s.jwks.mu.Lock()
	defer s.jwks.mu.Unlock()

	if s.jwks.keys != nil && time.Now().Before(s.jwks.expiresAt) {
		if key, ok := s.jwks.keys[kid]; ok {
			return key, nil
		}
	}

	req, err := http.NewRequest(http.MethodGet, s.cfg.SupabaseJWKSURL, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("JWKS fetch failed")
	}

	var set jwkSet
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, err
	}

	keys := make(map[string]any, len(set.Keys))
	for _, jwk := range set.Keys {
		key, err := parseJWK(jwk)
		if err != nil {
			continue
		}
		keys[jwk.Kid] = key
	}

	s.jwks.keys = keys
	s.jwks.expiresAt = time.Now().Add(15 * time.Minute)

	if key, ok := keys[kid]; ok {
		return key, nil
	}
	return nil, errors.New("JWT signing key not found")
}

func parseJWK(jwk jwkKey) (any, error) {
	switch jwk.Kty {
	case "EC":
		if jwk.Crv != "P-256" {
			return nil, errors.New("unsupported EC curve")
		}
		xBytes, err := base64.RawURLEncoding.DecodeString(jwk.X)
		if err != nil {
			return nil, err
		}
		yBytes, err := base64.RawURLEncoding.DecodeString(jwk.Y)
		if err != nil {
			return nil, err
		}
		return &ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}, nil
	case "RSA":
		nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
		if err != nil {
			return nil, err
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
		if err != nil {
			return nil, err
		}
		return &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: int(new(big.Int).SetBytes(eBytes).Int64()),
		}, nil
	default:
		return nil, errors.New("unsupported JWK type")
	}
}
