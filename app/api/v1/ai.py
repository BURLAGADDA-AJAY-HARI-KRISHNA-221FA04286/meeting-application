"""
AI API — Analysis Pipeline, Results, and RAG Q&A
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import uuid
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.meeting import Meeting
from app.models.ai_result import AIResult
from app.models.job import Job
from app.ai.orchestrator import AIAgentOrchestrator
from app.ai.rag import rag_store
from app.tasks.ai_tasks import analyze_meeting_background

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger("meetingai.ai")


# ── Schemas ───────────────────────────────────────────────
class RAGQueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)


class AnalyzeResponse(BaseModel):
    status: str
    job_id: str | None = None
    summary: dict | None = None
    decisions: dict | None = None
    actions: dict | None = None
    risks: dict | None = None
    sentiment: dict | None = None


class RAGResponse(BaseModel):
    answer: str
    evidence: list[dict] = []
    chunks_searched: int = 0


# ── Analyze Meeting ──────────────────────────────────────
@router.post("/{meeting_id}/analyze", response_model=AnalyzeResponse)
async def analyze_meeting(
    meeting_id: int,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    One-click AI analysis: Summary, Decisions, Actions, Risks, Sentiment.
    Set force=true to re-analyze even if results already exist.
    """
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found or access denied")

    # Check if already analyzed
    res = await db.execute(select(AIResult).filter(AIResult.meeting_id == meeting_id))
    existing = res.scalars().first()
    
    if existing and not force:
        logger.info("Meeting %d already analyzed, returning cached results", meeting_id)
        return {
            "status": "cached",
            "summary": existing.summary_json,
            "decisions": existing.decisions_json,
            "actions": existing.actions_json,
            "risks": existing.risks_json,
            "sentiment": existing.sentiment_json,
        }

    try:
        job_id = f"ai_job_{uuid.uuid4().hex[:8]}"
        new_job = Job(
            id=job_id,
            type="ai_analysis",
            status="pending",
            result_id=meeting_id
        )
        db.add(new_job)
        await db.commit()

        # Enqueue celery background task
        analyze_meeting_background.delay(meeting_id, job_id)

        return {
            "status": "processing",
            "job_id": job_id
        }
    except Exception as e:
        logger.error("Failed to queue AI pipeline for meeting %d: %s", meeting_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start AI processing: {e}")

# ── Get Job Status ───────────────────────────────────────
@router.get("/job-status/{job_id}")
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve status of background AI job."""
    result = await db.execute(select(Job).filter(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "result_id": job.result_id,
        "error": job.error
    }


# ── Get AI Results ───────────────────────────────────────
@router.get("/{meeting_id}/results", response_model=AnalyzeResponse)
async def get_ai_results(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve cached AI analysis results."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    res = await db.execute(select(AIResult).filter(AIResult.meeting_id == meeting_id))
    ai_result = res.scalars().first()
    
    if not ai_result:
        return {"status": "pending", "message": "No AI results found yet."}

    return {
        "status": "complete",
        "summary": ai_result.summary_json,
        "decisions": ai_result.decisions_json,
        "actions": ai_result.actions_json,
        "risks": ai_result.risks_json,
        "sentiment": ai_result.sentiment_json,
    }


# ── RAG Q&A ──────────────────────────────────────────────
@router.post("/{meeting_id}/rag-query", response_model=RAGResponse)
async def rag_query(
    meeting_id: int,
    payload: RAGQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """RAG-powered Q&A: ask questions about a meeting, get answers with evidence."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    try:
        # Calls the async RAG system
        result = await rag_store.query(meeting_id, payload.question, db=db)
        
        logger.info(
            "RAG query for meeting %d: '%s' → %d evidence chunks",
            meeting_id, payload.question[:50], len(result.get("evidence", [])),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("RAG query failed for meeting %d: %s", meeting_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"RAG query failed: {e}")
