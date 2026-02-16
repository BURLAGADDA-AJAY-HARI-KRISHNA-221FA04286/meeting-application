"""
Celery Application for Background Tasks
========================================
Handles async AI processing to avoid blocking API requests.
"""
import logging
from celery import Celery
from app.core.config import settings

logger = logging.getLogger("meetingai.celery")

# Create Celery app
celery_app = Celery(
    "meeting_intelligence",
    broker=f"redis://{settings.redis_host}:{settings.redis_port}/0" if hasattr(settings, 'redis_host') else "redis://localhost:6379/0",
    backend=f"redis://{settings.redis_host}:{settings.redis_port}/1" if hasattr(settings, 'redis_host') else "redis://localhost:6379/1",
)

# Configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max per task
    task_soft_time_limit=540,  # Warning at 9 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])

logger.info("Celery app configured successfully")
