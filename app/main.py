"""
AI Meeting Intelligence System - Application Entry Point
=========================================================
Production-grade FastAPI application with structured logging,
lifespan management, error handling, and request tracing.
"""
import logging
import sys
import uuid
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import inspect, text
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.core.rate_limit import limiter

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("meetingai")


def _ensure_schema_compatibility() -> None:
    """Apply lightweight runtime schema upgrades for existing deployments."""
    try:
        with engine.begin() as conn:
            inspector = inspect(conn)
            dialect_name = (conn.dialect.name or "").lower()
            tables = set(inspector.get_table_names())
            if "tasks" not in tables:
                return

            task_columns = {col["name"] for col in inspector.get_columns("tasks")}
            if "due_date" not in task_columns:
                due_date_type = "TIMESTAMP" if dialect_name in {"postgresql", "sqlite"} else "DATETIME"
                conn.execute(text(f"ALTER TABLE tasks ADD COLUMN due_date {due_date_type}"))
                logger.info("Applied schema upgrade: added tasks.due_date column")

            task_indexes = {idx["name"] for idx in inspector.get_indexes("tasks")}
            if "ix_tasks_due_date" not in task_indexes:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_due_date ON tasks (due_date)"))
                logger.info("Applied schema upgrade: added ix_tasks_due_date index")
    except Exception as exc:
        logger.warning("Runtime schema compatibility check skipped: %s", exc)


# Request ID Middleware
class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request for tracing."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id

        start = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"

        logger.info(
            "%s %s %s -> %s (%.1fms)",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
        )
        return response


# Short-lived GET cache — reduces repeat API roundtrips in the browser
class CacheControlMiddleware(BaseHTTPMiddleware):
    """Set short Cache-Control on safe GET responses so browsers can serve stale-while-revalidate."""
    SKIP_PATHS = {"/api/v1/auth", "/ws"}  # don't cache auth or websockets

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if (
            request.method == "GET"
            and 200 <= response.status_code < 300
            and not any(request.url.path.startswith(p) for p in self.SKIP_PATHS)
        ):
            response.headers.setdefault(
                "Cache-Control", "public, max-age=3, stale-while-revalidate=10"
            )
        return response


# Lifespan Handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks using modern lifespan protocol."""
    # Startup
    logger.info("=" * 50)
    logger.info("  AI Meeting Intelligence System v2.1.0")
    logger.info("  Environment: %s", settings.env)
    logger.info("  Database: %s", settings.database_url[:30] + "...")
    logger.info("  Gemini Model: %s", settings.gemini_model)
    logger.info("  AI: %s", "Enabled" if settings.gemini_api_key else "Disabled")

    # Check FFmpeg
    try:
        import subprocess
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        version_line = result.stdout.split('\n')[0]
        logger.info("  FFmpeg: Detected (%s)", version_line)
    except FileNotFoundError:
        logger.error("  FFmpeg: Not found in PATH. Audio processing will fail.")
    except Exception as e:
        logger.warning("  FFmpeg: Check failed: %s", e)

    logger.info("=" * 50)

    try:
        Base.metadata.create_all(bind=engine)
        _ensure_schema_compatibility()
        logger.info("Database tables created/verified")
    except Exception as exc:
        logger.warning("Database initialization skipped: %s", exc)

    yield  # Application runs here

    # Shutdown
    logger.info("Application shutting down...")


# App Factory
def create_app() -> FastAPI:
    show_docs = not settings.is_production
    app = FastAPI(
        title=settings.app_name,
        description=(
            "AI-powered meeting intelligence platform with transcript analysis, "
            "real-time subtitles, task generation, RAG queries, and GitHub integration."
        ),
        version="2.1.0",
        lifespan=lifespan,
        docs_url="/docs" if show_docs else None,
        redoc_url="/redoc" if show_docs else None,
    )

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=settings.cors_allow_methods_list,
        allow_headers=settings.cors_allow_headers_list,
        expose_headers=["Content-Disposition"],
    )

    # Compress API payloads to reduce transfer time on slower networks.
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    # Short-lived GET cache (stale-while-revalidate for fast repeat loads)
    app.add_middleware(CacheControlMiddleware)

    # Request tracing
    app.add_middleware(RequestIdMiddleware)

    # Security Headers
    from fastapi.middleware.trustedhost import TrustedHostMiddleware
    allowed_hosts = ["*"] if settings.env != "production" else (settings.trusted_hosts_list or ["localhost"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
    
    # Custom Security Headers
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), display-capture=(self)"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        # Keep CSP broad in development for hot reload and local tooling.
        if settings.env != "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self' data: blob:; "
                "script-src 'self' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "connect-src 'self' ws: wss: http: https:; "
                "img-src 'self' data: blob:; object-src 'none'; base-uri 'self';"
            )
        else:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self'; "
                "connect-src 'self' wss:; img-src 'self' data:; object-src 'none'; "
                "base-uri 'self'; frame-ancestors 'none';"
            )
        return response

    # Global Exception Handlers
    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        # In production, do not leak internal error details
        if settings.env == "production":
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error. Please contact support."},
            )
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )

    # Routes
    app.include_router(api_router, prefix="/api/v1")

    # Metrics Endpoint
    try:
        from app.middleware.prometheus import metrics_endpoint, PrometheusMiddleware
        app.add_middleware(PrometheusMiddleware)
        app.add_route("/metrics", metrics_endpoint, methods=["GET"])
        logger.info("Prometheus metrics enabled at /metrics")
    except ImportError:
        logger.warning("Prometheus client not installed, metrics disabled")

    @app.get("/health")
    @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
    def health(request: Request):
        return {
            "status": "ok",
            "version": "2.1.0",
            "environment": settings.env,
            "ai_enabled": bool(settings.gemini_api_key),
            "github_enabled": bool(settings.github_token),
        }

    return app


app = create_app()

