"""
Prometheus Metrics Middleware
==============================
Exposes application metrics for monitoring.
"""
import time
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Define metrics
http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"]
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"]
)

meetings_total = Gauge(
    "meetings_total",
    "Total number of meetings"
)

ai_analyses_total = Counter(
    "ai_analyses_total",
    "Total AI analyses performed",
    ["status"]
)

websocket_connections = Gauge(
    "websocket_connections",
    "Current WebSocket connections"
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware to collect HTTP request metrics."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip metrics endpoint itself
        if request.url.path == "/metrics":
            return await call_next(request)
        
        start_time = time.time()
        
        response = await call_next(request)
        
        duration = time.time() - start_time
        
        # Record metrics
        http_requests_total.labels(
            method=request.method,
            path=request.url.path,
            status=response.status_code
        ).inc()
        
        http_request_duration_seconds.labels(
            method=request.method,
            path=request.url.path
        ).observe(duration)
        
        return response


async def metrics_endpoint(request: Request):
    """Endpoint to expose Prometheus metrics."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
