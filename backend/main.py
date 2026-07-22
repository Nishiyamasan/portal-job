from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
import os
from dotenv import load_dotenv
import logging

load_dotenv()

import time
from contextlib import asynccontextmanager
import asyncio
import socket
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

from database import engine, Base, SessionLocal, get_db, DATABASE_URL
from routers import shops, ai, jobs, auth, admin, media, owner_applications, supervisor, messages, inquiries, push_notifications, system_settings
import models
import uuid
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session

# Setup logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
WELL_KNOWN_DIR = Path(__file__).resolve().parent / "static" / ".well-known"

async def diagnose_network():
    """Diagnose network issues from within the container."""
    logger.info("Starting Network Diagnosis...")
    try:
        # Extract host and port from DATABASE_URL
        # Example: postgresql://user:pass@host:port/dbname
        host_port = DATABASE_URL.split("@")[1].split("/")[0]
        host = host_port.split(":")[0]
        port = int(host_port.split(":")[1]) if ":" in host_port else 5432

        logger.info(f"Targeting Supabase Host: {host} on Port: {port}")

        # DNS Check
        try:
            addr = socket.gethostbyname(host)
            logger.info(f"DNS RESOLVE SUCCESS: {host} -> {addr}")
        except Exception as de:
            logger.error(f"DNS RESOLVE FAILED: {de}")

        # TCP Connect Check
        try:
            s = socket.create_connection((host, port), timeout=5)
            s.close()
            logger.info(f"TCP CONNECT SUCCESS: {host}:{port}")
        except Exception as te:
            logger.error(f"TCP CONNECT FAILED: {te}")

    except Exception as e:
        logger.error(f"Diagnosis Logic Error: {e}")

async def init_db_task():
    run_diag = os.getenv("ENABLE_STARTUP_NETWORK_DIAG", "").lower() in {"1", "true", "yes"}
    if run_diag:
        await diagnose_network()

    max_retries = 10
    retry_delay = 5

    for i in range(max_retries):
        try:
            logger.info(f"Supabase Connection Attempt {i+1}/{max_retries}")

            with engine.connect() as conn:
                # Check and add missing columns for PostgreSQL deployments.
                try:
                    inspector = inspect(engine)
                    schemas_to_check = ["public"]

                    for schema_name in schemas_to_check:
                        try:
                            # 1. Check shops columns
                            columns = [c['name'] for c in inspector.get_columns('shops', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.shops" if schema_name else "shops"

                                shop_columns = {
                                    "category": "VARCHAR",
                                    "tags": "VARCHAR[]",
                                    "owner_id": "UUID",
                                    "is_approved": "BOOLEAN DEFAULT FALSE",
                                    "claim_status": "VARCHAR DEFAULT 'unclaimed'",
                                    "verification_method": "VARCHAR",
                                    "is_manual_edited": "BOOLEAN DEFAULT FALSE",
                                    "original_description": "TEXT",
                                    "custom_description": "TEXT",
                                    "x_account_id": "VARCHAR",
                                    "instagram_account_id": "VARCHAR",
                                    "updated_at": "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
                                }
                                for column_name, column_type in shop_columns.items():
                                    if column_name not in columns:
                                        logger.info(f"Adding {column_name} column to {table_ref}...")
                                        conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN {column_name} {column_type}"))
                                        conn.commit()

                                tags_column = next((column for column in inspector.get_columns('shops', schema=schema_name) if column['name'] == 'tags'), None)
                                if tags_column and normalize_db_type(tags_column["type"]) in {"string", "text"}:
                                    logger.info(f"Converting {table_ref}.tags from text to VARCHAR[]...")
                                    conn.execute(text(
                                        f"ALTER TABLE {table_ref} "
                                        "ALTER COLUMN tags TYPE VARCHAR[] "
                                        "USING CASE "
                                        "WHEN tags IS NULL OR btrim(tags) = '' THEN NULL "
                                        "ELSE string_to_array(tags, ',') "
                                        "END"
                                    ))
                                    conn.commit()

                                for lang in ['en', 'zh', 'ko']:
                                    col_name = f'description_{lang}'
                                    if col_name not in columns:
                                        logger.info(f"Adding {col_name} column to {table_ref}...")
                                        conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN {col_name} TEXT"))
                                        conn.commit()

                            # 2. Check job_posts columns
                            columns = [c['name'] for c in inspector.get_columns('job_posts', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.job_posts" if schema_name else "job_posts"
                                ts_type = "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
                                if 'employment_type' not in columns:
                                    logger.info(f"Adding employment_type column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN employment_type VARCHAR"))
                                    conn.commit()
                                if 'location' not in columns:
                                    logger.info(f"Adding location column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN location VARCHAR"))
                                    conn.commit()
                                if 'created_at' not in columns:
                                    logger.info(f"Adding created_at column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN created_at {ts_type}"))
                                    conn.commit()
                                if 'updated_at' not in columns:
                                    logger.info(f"Adding updated_at column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN updated_at {ts_type}"))
                                    conn.commit()
                                if 'published_at' not in columns:
                                    logger.info(f"Adding published_at column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN published_at {ts_type}"))
                                    conn.commit()
                                if 'expires_at' not in columns:
                                    logger.info(f"Adding expires_at column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN expires_at {ts_type}"))
                                    conn.commit()

                            # 3. Check shop_members columns
                            columns = [c['name'] for c in inspector.get_columns('shop_members', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.shop_members" if schema_name else "shop_members"
                                if 'status' not in columns:
                                    logger.info(f"Adding status column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN status VARCHAR DEFAULT 'approved'"))
                                    conn.commit()
                                if 'display_order' not in columns:
                                    logger.info(f"Adding display_order column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN display_order INTEGER DEFAULT 0"))
                                    conn.commit()
                                conn.execute(text(f"UPDATE {table_ref} SET display_order = 0 WHERE display_order IS NULL"))
                                conn.commit()

                            # 4. Check profiles columns
                            columns = [c['name'] for c in inspector.get_columns('profiles', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.profiles" if schema_name else "profiles"
                                if 'updated_at' not in columns:
                                    logger.info(f"Adding updated_at column to {table_ref}...")
                                    ts_type = "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN updated_at {ts_type}"))
                                    conn.commit()
                                if 'deleted_at' not in columns:
                                    logger.info(f"Adding deleted_at column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE"))
                                    conn.commit()

                            # 5. Check messages columns
                            columns = [c['name'] for c in inspector.get_columns('messages', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.messages" if schema_name else "messages"
                                if 'shop_id' not in columns:
                                    logger.info(f"Adding shop_id column to {table_ref}...")
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN shop_id UUID"))
                                    conn.commit()
                                if 'is_read' not in columns:
                                    logger.info(f"Adding is_read column to {table_ref}...")
                                    bool_type = "BOOLEAN DEFAULT FALSE"
                                    conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN is_read {bool_type}"))
                                    conn.commit()
                                    # Update existing messages to have is_read = false
                                    conn.execute(text(f"UPDATE {table_ref} SET is_read = FALSE WHERE is_read IS NULL"))
                                    conn.commit()

                            # 6. Check media_assets columns
                            columns = [c['name'] for c in inspector.get_columns('media_assets', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.media_assets" if schema_name else "media_assets"
                                media_columns = {
                                    "job_post_id": "UUID",
                                    "provider": "VARCHAR DEFAULT 'cloudinary'",
                                    "cloudinary_public_id": "VARCHAR",
                                    "metadata": "JSON",
                                    "created_at": "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
                                    "storage_bucket": "VARCHAR",
                                    "storage_path": "VARCHAR",
                                    "mime_type": "VARCHAR",
                                    "bytes": "VARCHAR",
                                    "width": "VARCHAR",
                                    "height": "VARCHAR",
                                    "active": "BOOLEAN DEFAULT TRUE",
                                    "replaced_at": "TIMESTAMP WITH TIME ZONE",
                                    "deleted_at": "TIMESTAMP WITH TIME ZONE",
                                }
                                for column_name, column_type in media_columns.items():
                                    if column_name not in columns:
                                        logger.info(f"Adding {column_name} column to {table_ref}...")
                                        conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN {column_name} {column_type}"))
                                        conn.commit()

                                conn.execute(text(f"UPDATE {table_ref} SET active = TRUE WHERE active IS NULL"))
                                conn.commit()

                            # 7. Check inquiries columns
                            columns = [c['name'] for c in inspector.get_columns('inquiries', schema=schema_name)]
                            if columns:
                                table_ref = f"{schema_name}.inquiries" if schema_name else "inquiries"
                                inquiry_columns = {
                                    "is_resolved": "BOOLEAN DEFAULT FALSE",
                                    "resolved_at": "TIMESTAMP WITH TIME ZONE",
                                    "resolved_by": "UUID",
                                }
                                for column_name, column_type in inquiry_columns.items():
                                    if column_name not in columns:
                                        logger.info(f"Adding {column_name} column to {table_ref}...")
                                        conn.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN {column_name} {column_type}"))
                                        conn.commit()

                                conn.execute(text(f"UPDATE {table_ref} SET is_resolved = FALSE WHERE is_resolved IS NULL"))
                                conn.commit()

                        except Exception as e:
                            logger.warning(f"Error migrating schema {schema_name}: {e}")
                            continue
                except Exception as migration_error:
                    logger.warning(f"Migration check failed: {migration_error}")

            # Try to create tables
            try:
                Base.metadata.create_all(bind=engine)
            except Exception as metadata_error:
                if "incompatible types: uuid and integer" in str(metadata_error):
                    logger.critical("\n" + "!"*80 + "\n" +
                                    "DB TYPE MISMATCH DETECTED:\n" +
                                    "The 'shop_members' table already exists with an INTEGER 'id' column,\n" +
                                    "but the current code expects a UUID 'id' column.\n\n" +
                                    "ACTION REQUIRED: Please run the following SQL in your Supabase SQL Editor:\n" +
                                    "DROP TABLE IF EXISTS member_public_settings CASCADE;\n" +
                                    "DROP TABLE IF EXISTS shift_assignments CASCADE;\n" +
                                    "ALTER TABLE shop_members ALTER COLUMN id TYPE UUID USING (gen_random_uuid());\n" +
                                    "!"*80 + "\n")
                else:
                    raise metadata_error

            # Seed admin user
            db = SessionLocal()
            try:
                admin_id = uuid.UUID('00000000-0000-0000-0000-000000000000')
                if not db.query(models.Profile).filter(models.Profile.id == admin_id).first():
                    db.add(models.Profile(id=admin_id, email="admin@portal-job.local", display_name="Admin", role="admin"))
                    db.commit()
                    logger.info("Admin user verified/seeded.")
            finally:
                db.close()

            logger.info("Database initialized successfully.")
            return
        except Exception as e:
            logger.error(f"Supabase Connection Failed: {e}")
            await asyncio.sleep(retry_delay)

    logger.critical("CRITICAL: Failed to connect to Supabase after multiple attempts.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(init_db_task())
    yield

app = FastAPI(title="portal-job API", lifespan=lifespan)


@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    start = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "request_error request_id=%s method=%s path=%s duration_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
            headers={"X-Request-ID": request_id},
        )

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id

    if request.url.path != "/health":
        forwarded_for = request.headers.get("x-forwarded-for", "")
        client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else "-")
        user_agent = (request.headers.get("user-agent") or "-")[:120]
        logger.info(
            "request request_id=%s method=%s path=%s status=%s duration_ms=%.2f ip=%s ua=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            client_ip,
            user_agent,
        )

    return response

# Proxy support for Render
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

# CORS logic
raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,https://portal-job.onrender.com,https://portal-job.example.com,https://www.portal-job.example.com"
).split(",")
allowed_origins = [origin.strip() for origin in raw_origins if origin.strip()]

logger.info(f"Final CORS Allowed Origins: {allowed_origins}")

allow_creds = True
if "*" in allowed_origins:
    allow_creds = False
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Pagesのプレビュー/本番サブドメインとlocalhostを正規表現でカバー
    allow_origin_regex=r"https://.*portal-job\.pages\.dev|http://localhost(:\d+)?",
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shops.router, prefix="/api/v1/shops", tags=["shops"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(media.router, prefix="/api/v1/media", tags=["media"])
app.include_router(owner_applications.router, prefix="/api/v1/owner-applications", tags=["owner-applications"])
app.include_router(messages.router, prefix="/api/v1/messages", tags=["messages"])
app.include_router(push_notifications.router, prefix="/api/v1/push", tags=["push-notifications"])
app.include_router(supervisor.router, prefix="/api/v1/n2-supervisor-portal-xyz", tags=["supervisor"])
app.include_router(inquiries.router, prefix="/api/v1/inquiries", tags=["inquiries"])
app.include_router(system_settings.router, prefix="/api/v1", tags=["system-settings"])

@app.get("/health")
def health_check():
    return {"status": "ok"}

def normalize_db_type(db_type: Any) -> str:
    raw = str(db_type).lower()
    if "uuid" in raw:
        return "uuid"
    if "bool" in raw:
        return "boolean"
    if "timestamp" in raw or "datetime" in raw:
        return "datetime"
    if "json" in raw:
        return "json"
    if "text" in raw:
        return "text"
    if "char" in raw or "string" in raw or "varchar" in raw:
        return "string"
    if "date" in raw:
        return "date"
    if "array" in raw or raw.endswith("[]"):
        return "array"
    return raw

def normalize_model_type(model_type: Any) -> str:
    raw = str(model_type).lower()
    if "uuid" in raw:
        return "uuid"
    if "boolean" in raw:
        return "boolean"
    if "datetime" in raw or "timestamp" in raw:
        return "datetime"
    if "json" in raw:
        return "json"
    if "text" in raw:
        return "text"
    if "string" in raw or "varchar" in raw:
        return "string"
    if raw == "date":
        return "date"
    if "array" in raw:
        return "array"
    return raw

def build_schema_check(schema_name: str = "public") -> dict[str, Any]:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names(schema=schema_name))
    expected_tables = {
        table.name: table
        for table in Base.metadata.sorted_tables
        if table.name != "spatial_ref_sys"
    }

    missing_tables = sorted(set(expected_tables) - existing_tables)
    missing_columns: dict[str, list[str]] = {}
    type_mismatches: dict[str, dict[str, str]] = {}
    nullable_warnings: dict[str, dict[str, bool]] = {}

    for table_name, table in expected_tables.items():
        if table_name not in existing_tables:
            continue

        db_columns = {
            column["name"]: column
            for column in inspector.get_columns(table_name, schema=schema_name)
        }

        for model_column in table.columns:
            db_column = db_columns.get(model_column.name)
            if not db_column:
                missing_columns.setdefault(table_name, []).append(model_column.name)
                continue

            expected_type = normalize_model_type(model_column.type)
            actual_type = normalize_db_type(db_column["type"])
            if expected_type != actual_type:
                # Text and varchar are intentionally compatible for this app.
                compatible = {expected_type, actual_type} <= {"string", "text"}
                if not compatible:
                    type_mismatches[f"{table_name}.{model_column.name}"] = {
                        "expected": expected_type,
                        "actual": actual_type,
                    }

            expected_nullable = bool(model_column.nullable)
            actual_nullable = bool(db_column.get("nullable", True))
            if not expected_nullable and actual_nullable and not model_column.primary_key:
                nullable_warnings[f"{table_name}.{model_column.name}"] = {
                    "expected_nullable": expected_nullable,
                    "actual_nullable": actual_nullable,
                }

    status_value = "ok"
    if missing_tables or missing_columns or type_mismatches:
        status_value = "ng"

    return {
        "status": status_value,
        "schema": schema_name,
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
        "type_mismatches": type_mismatches,
        "nullable_warnings": nullable_warnings,
    }

def build_effective_schema_check() -> dict[str, Any]:
    inspector = inspect(engine)
    search_schemas = ["public"]
    tables_by_schema = {
        schema_name: set(inspector.get_table_names(schema=schema_name))
        for schema_name in search_schemas
    }
    expected_tables = {
        table.name: table
        for table in Base.metadata.sorted_tables
        if table.name != "spatial_ref_sys"
    }

    missing_tables: list[str] = []
    resolved_tables: dict[str, str] = {}
    missing_columns: dict[str, list[str]] = {}
    type_mismatches: dict[str, dict[str, str]] = {}
    nullable_warnings: dict[str, dict[str, bool]] = {}

    for table_name, table in expected_tables.items():
        resolved_schema = next(
            (schema_name for schema_name in search_schemas if table_name in tables_by_schema[schema_name]),
            None,
        )
        if not resolved_schema:
            missing_tables.append(table_name)
            continue

        resolved_tables[table_name] = resolved_schema
        db_columns = {
            column["name"]: column
            for column in inspector.get_columns(table_name, schema=resolved_schema)
        }

        for model_column in table.columns:
            db_column = db_columns.get(model_column.name)
            column_key = f"{resolved_schema}.{table_name}.{model_column.name}"
            if not db_column:
                missing_columns.setdefault(f"{resolved_schema}.{table_name}", []).append(model_column.name)
                continue

            expected_type = normalize_model_type(model_column.type)
            actual_type = normalize_db_type(db_column["type"])
            if expected_type != actual_type:
                compatible = {expected_type, actual_type} <= {"string", "text"}
                if not compatible:
                    type_mismatches[column_key] = {
                        "expected": expected_type,
                        "actual": actual_type,
                    }

            expected_nullable = bool(model_column.nullable)
            actual_nullable = bool(db_column.get("nullable", True))
            if not expected_nullable and actual_nullable and not model_column.primary_key:
                nullable_warnings[column_key] = {
                    "expected_nullable": expected_nullable,
                    "actual_nullable": actual_nullable,
                }

    missing_tables.sort()
    status_value = "ok"
    if missing_tables or missing_columns or type_mismatches:
        status_value = "ng"

    return {
        "status": status_value,
        "mode": "effective",
        "search_path": search_schemas,
        "resolved_tables": resolved_tables,
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
        "type_mismatches": type_mismatches,
        "nullable_warnings": nullable_warnings,
    }

@app.get("/.well-known/apple-app-site-association", include_in_schema=False)
def apple_app_site_association():
    return FileResponse(
        WELL_KNOWN_DIR / "apple-app-site-association",
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=3600"},
    )

@app.get("/.well-known/assetlinks.json", include_in_schema=False)
def android_asset_links():
    return FileResponse(
        WELL_KNOWN_DIR / "assetlinks.json",
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=3600"},
    )

@app.get("/api/v1/debug/db")
def debug_db(db: Session = Depends(get_db)):
    try:
        count = db.execute(text("SELECT count(*) FROM shops")).scalar()
        approved_count = db.execute(text("SELECT count(*) FROM shops WHERE is_approved = TRUE")).scalar()
        return {
            "status": "connected",
            "total_shops": count,
            "approved_shops": approved_count
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/v1/debug/schema-check")
def debug_schema_check(schema: str = "effective"):
    if schema not in {"effective", "public"}:
        raise HTTPException(status_code=400, detail="schema must be effective or public")
    try:
        if schema == "effective":
            return build_effective_schema_check()
        return build_schema_check(schema)
    except Exception as e:
        logger.exception("Schema check failed")
        return {"status": "error", "message": str(e)}
