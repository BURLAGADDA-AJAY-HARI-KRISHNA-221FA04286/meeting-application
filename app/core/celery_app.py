import os
from celery import Celery
from app.core.config import settings

# Initialize Celery app
celery_app = Celery(
    "meeting_intel_worker",
    broker=settings.get_celery_broker_url,
    backend=settings.get_celery_result_backend,
    include=["app.tasks.ai_tasks"]
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_create_missing_queues=True,
)
