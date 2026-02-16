"""
AI Meeting Intelligence System — Application Entry Point
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
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# ── Logging Setup ──────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("meetingai")

limiter = Limiter(key_func=get_remote_address)


# ── Request ID Middleware ──────────────────────────────────
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
            "%s %s %s → %s (%.1fms)",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
        )
        return response


# ── Lifespan Handler ──────────────────────────────────────
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
        logger.info("Database tables created/verified")
    except Exception as exc:
        logger.warning("Database initialization skipped: %s", exc)

    yield  # Application runs here

    # Shutdown
    logger.info("Application shutting down...")


# ── App Factory ───────────────────────────────────────────
def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description=(
            "AI-powered meeting intelligence platform with transcript analysis, "
            "real-time subtitles, task generation, RAG queries, and GitHub integration."
        ),
        version="2.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request tracing
    app.add_middleware(RequestIdMiddleware)

    # ── Global Exception Handlers ─────────────────────────
    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. Please try again later."},
        )

    # ── Routes ────────────────────────────────────────────
    app.include_router(api_router, prefix="/api/v1")

    # ── Metrics Endpoint ──────────────────────────────────
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
