"""
Database Session Management
===========================
Provides async engine for FastAPI application and sync engine for migrations/celery.
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# ── ASYNC ENGINE (FastAPI) ───────────────────────────────────────────────────
# Convert database URL to async driver
import re
import ssl as _ssl

async_db_url = settings.database_url
_need_ssl = False

if "postgresql" in async_db_url:
    # Ensure standard postgresql:// becomes postgresql+asyncpg://
    if "+asyncpg" not in async_db_url:
        async_db_url = async_db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")
        async_db_url = async_db_url.replace("postgresql://", "postgresql+asyncpg://")
    # Detect if SSL was requested via sslmode
    if "sslmode=require" in async_db_url or "sslmode=verify" in async_db_url:
        _need_ssl = True
    # Strip psycopg-specific parameters that asyncpg doesn't understand
    async_db_url = re.sub(r'[&?]sslmode=[^&]*', '', async_db_url)
    async_db_url = re.sub(r'[&?]channel_binding=[^&]*', '', async_db_url)
    # Clean up dangling ? if all query params were removed
    async_db_url = re.sub(r'\?$', '', async_db_url)
elif "sqlite" in async_db_url:
    # Ensure sqlite:// becomes sqlite+aiosqlite://
    if "+aiosqlite" not in async_db_url:
        async_db_url = async_db_url.replace("sqlite://", "sqlite+aiosqlite://")

# Build connect_args
if "sqlite" in async_db_url:
    connect_args = {"check_same_thread": False}
elif _need_ssl:
    # asyncpg uses ssl=True or an ssl.SSLContext instead of sslmode= URL param
    ssl_ctx = _ssl.create_default_context()
    if settings.db_ssl_verify:
        ssl_ctx.check_hostname = True
        ssl_ctx.verify_mode = _ssl.CERT_REQUIRED
    else:
        # For local/dev environments that don't provide CA bundles.
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    connect_args = {"ssl": ssl_ctx}
else:
    connect_args = {}

async_engine = create_async_engine(
    async_db_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=300,   # Recycle connections every 5 min to prevent stale Neon connections
    connect_args=connect_args
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
    class_=AsyncSession,
    autoflush=False
)

# ── SYNC ENGINE (Migrations / Celery) ────────────────────────────────────────
# Use standard psycopg driver for sync operations
sync_db_url = settings.database_url
if "postgresql" in sync_db_url:
    if "+asyncpg" in sync_db_url:
        sync_db_url = sync_db_url.replace("+asyncpg", "+psycopg")
    elif "psycopg" not in sync_db_url:
         sync_db_url = sync_db_url.replace("postgresql://", "postgresql+psycopg://")

sync_connect_args = {"check_same_thread": False} if "sqlite" in sync_db_url else {}

engine = create_engine(
    sync_db_url,
    pool_pre_ping=True,
    connect_args=sync_connect_args
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


async def get_db() -> AsyncSession:
    """Async database session dependency generator."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
