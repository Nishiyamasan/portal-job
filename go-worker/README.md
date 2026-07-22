# portal-job Go Worker

This worker is the first Go migration step. It runs scheduled/internal jobs outside FastAPI.

The initial task is intentionally conservative:

- connect to PostgreSQL
- preview expired rows in `job_posts`
- preview expired rows in `boosts`
- log candidates
- do not write by default

## Run With Docker

From the repository root:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build go-worker
```

The local compose file starts PostgreSQL first, builds the worker, runs one dry-run cycle, then exits.

Expected log events:

- `worker_started`
- `expired_job_post_candidate`, only if matching rows exist
- `expire_job_posts_dry_run_completed`
- `expired_boost_candidate`, only if matching rows exist
- `expire_boosts_dry_run_completed`
- `worker_finished`

If the local database is fresh and does not have `job_posts` or `boosts`, the worker logs a skipped event for that table.

## Run Continuously

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm -e WORKER_ONE_SHOT=false go-worker
```

## Enable Writes

Dry-run is the default. Only disable it after checking logs.

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm -e WORKER_DRY_RUN=false go-worker
```

Write mode closes expired open rows in `job_posts`:

```sql
status = 'closed'
updated_at = NOW()
```

Write mode also expires active rows in `boosts`:

```sql
status = 'expired'
```

## Environment Variables

- `DATABASE_URL`: required PostgreSQL connection string
- `WORKER_DRY_RUN`: defaults to `true`
- `WORKER_ONE_SHOT`: defaults to `false`, local compose sets it to `true`
- `WORKER_INTERVAL_SECONDS`: defaults to `300`

## Local Tooling Note

The repository can build this worker through Docker even if Go is not installed on Windows.
