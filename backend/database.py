import os
import logging
from sqlalchemy import create_engine, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required. Configure a PostgreSQL database URL for local and deployed environments.")
if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError("Only PostgreSQL DATABASE_URL values are supported.")

logger = logging.getLogger(__name__)

def _get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default

pool_disabled = os.getenv("DB_POOL_DISABLED", "").lower() in {"1", "true", "yes"}
connect_args = {
    "options": "-c search_path=public",
    "keepalives": _get_int_env("DB_KEEPALIVES", 1),
    "keepalives_idle": _get_int_env("DB_KEEPALIVES_IDLE", 30),
    "keepalives_interval": _get_int_env("DB_KEEPALIVES_INTERVAL", 10),
    "keepalives_count": _get_int_env("DB_KEEPALIVES_COUNT", 5),
}
engine_kwargs = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
    "pool_recycle": _get_int_env("DB_POOL_RECYCLE", 1800),
}

if pool_disabled:
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs.update({
        "pool_size": _get_int_env("DB_POOL_SIZE", 10),
        "max_overflow": _get_int_env("DB_MAX_OVERFLOW", 20),
        "pool_timeout": _get_int_env("DB_POOL_TIMEOUT", 10),
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)
if pool_disabled:
    logger.info("Database engine initialized with NullPool (DB_POOL_DISABLED=true)")
else:
    logger.info(
        "Database engine initialized with QueuePool size=%s max_overflow=%s timeout=%s recycle=%s pre_ping=true",
        engine_kwargs["pool_size"],
        engine_kwargs["max_overflow"],
        engine_kwargs["pool_timeout"],
        engine_kwargs["pool_recycle"],
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def ARRAY_COMPAT(item_type):
    return ARRAY(item_type)
