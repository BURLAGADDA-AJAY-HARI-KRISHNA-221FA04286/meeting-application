# ── Stage 1: Build Dependencies ──────────────────────────
FROM python:3.13-slim AS builder

WORKDIR /build

# System deps for compilation (kept only in build stage)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime (lean final image) ──────────────────
FROM python:3.13-slim AS runtime

# Runtime system deps only
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

COPY --chown=appuser:appuser . .

# Pre-compile Python files for faster startup
RUN python -m compileall -q app/

USER appuser

EXPOSE 8000

# Built-in health check for Docker/k8s orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--loop", "uvloop"]
