from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.meetings import router as meetings_router
from app.api.v1.process_meeting import router as process_router
from app.api.v1.ai import router as ai_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.video_meeting import router as video_meeting_router
from app.api.v1.integrations import router as integrations_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(meetings_router)
api_router.include_router(process_router)
api_router.include_router(ai_router)
api_router.include_router(tasks_router)
api_router.include_router(video_meeting_router)
api_router.include_router(integrations_router)
