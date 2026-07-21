# portal-job Go API

This is the Phase 2 Go diagnostics API. It does not replace FastAPI user-facing routes yet.

## Endpoints

- `GET /health`: public health check
- `GET /internal/db/ping`: protected DB connectivity check
- `GET /internal/version`: protected service metadata
- `GET /internal/jobs/expire-preview`: protected dry-run preview for worker-managed expiration tasks
- `GET /api/v1/shops`: public approved shop list
- `GET /api/v1/shops/{idOrSlug}`: public shop detail
- `GET /api/v1/shops/{idOrSlug}/public-members`: public shop member list
- `GET /api/v1/jobs`: public open job list
- `GET /api/v1/jobs/{id}`: public job detail
- `GET /api/v1/jobs/my-jobs`: owner/manager job list, protected by Supabase JWT
- `GET /api/v1/jobs/shop/{shop_id}`: owner/manager shop job list, protected by Supabase JWT
- `POST /api/v1/jobs/`: create job, protected by Supabase JWT
- `PUT /api/v1/jobs/{id}`: update job, protected by Supabase JWT
- `DELETE /api/v1/jobs/{id}`: delete job, protected by Supabase JWT
- `POST /api/v1/shops/{id}/favorite`: favorite shop, protected by Supabase JWT
- `DELETE /api/v1/shops/{id}/favorite`: unfavorite shop, protected by Supabase JWT
- `GET /api/v1/messages/conversations`: recent conversations, protected by Supabase JWT
- `GET /api/v1/messages/conversation/{shop_id}/{other_user_id}`: conversation messages, protected by Supabase JWT
- `GET /api/v1/n2-supervisor-portal-xyz/stats`: supervisor/admin stats, protected by Supabase JWT
- `DELETE /api/v1/auth/me`: anonymizes the app profile and deletes the matching Supabase Auth user, protected by Supabase JWT

Internal endpoints require:

```text
X-Internal-API-Token: local-dev-internal-token
```

## Run With Docker

From the repository root:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --profile api up --build go-api
```

Check endpoints:

```powershell
curl http://localhost:10001/health
curl -H "X-Internal-API-Token: local-dev-internal-token" http://localhost:10001/internal/db/ping
curl -H "X-Internal-API-Token: local-dev-internal-token" http://localhost:10001/internal/version
curl -H "X-Internal-API-Token: local-dev-internal-token" http://localhost:10001/internal/jobs/expire-preview
curl "http://localhost:10001/api/v1/shops/?limit=2"
curl "http://localhost:10001/api/v1/jobs/?limit=2"
```

## Notes

- The API listens on port `10001`.
- It uses the same local PostgreSQL service as FastAPI.
- It is behind the `api` compose profile so normal frontend startup is unchanged.
- Job responses include `media_assets` for `asset_type = job_image` and `media_assets.job_post_id`.
- Account deletion requires server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key to the frontend.
