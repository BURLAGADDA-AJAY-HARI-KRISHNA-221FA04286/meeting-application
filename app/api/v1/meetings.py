"""
Meetings API — CRUD, Dashboard, Transcript, and Statistics
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.meeting import Meeting
from app.models.subtitle import Subtitle
from app.models.task import Task
from app.models.ai_result import AIResult
from app.models.participant import Participant
from app.models.user import User
from app.schemas.meeting import (
    DashboardStats,
    MeetingCreate,
    MeetingListOut,
    MeetingOut,
    MeetingStats,
    MeetingUpdate,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])
logger = logging.getLogger("meetingai.meetings")


# ── Helpers ───────────────────────────────────────────────
async def _reconstruct_transcript(db: AsyncSession, meeting_id: int) -> str:
    """Rebuild transcript from subtitle timeline."""
    result = await db.execute(
        select(Subtitle)
        .filter(Subtitle.meeting_id == meeting_id)
        .order_by(Subtitle.start_time)
    )
    subtitles = result.scalars().all()
    
    if not subtitles:
        return ""
    return "\n".join(
        f"{s.speaker_name or s.speaker_id}: {s.text}" for s in subtitles
    )


async def _enrich_meeting(db: AsyncSession, meeting: Meeting, include_analysis: bool = False) -> dict:
    """Convert Meeting ORM to enriched dict with computed fields."""
    data = {
        "id": meeting.id,
        "user_id": meeting.user_id,
        "title": meeting.title,
        "consent_given": meeting.consent_given,
        "created_at": meeting.created_at,
        "ended_at": meeting.ended_at,
    }

    # Execute counts efficiently
    sub_count = await db.execute(select(func.count(Subtitle.id)).filter(Subtitle.meeting_id == meeting.id))
    data["subtitle_count"] = sub_count.scalar() or 0

    task_count = await db.execute(select(func.count(Task.id)).filter(Task.meeting_id == meeting.id))
    data["task_count"] = task_count.scalar() or 0

    ai_res = await db.execute(select(AIResult).filter(AIResult.meeting_id == meeting.id))
    ai_result = ai_res.scalars().first()
    data["has_analysis"] = ai_result is not None

    if include_analysis:
        data["transcript"] = await _reconstruct_transcript(db, meeting.id)
        if ai_result:
            data["summary"] = ai_result.summary_json
            data["actions"] = ai_result.actions_json
            data["risks"] = ai_result.risks_json
            data["sentiment"] = ai_result.sentiment_json

    return data


# ── Create Meeting ────────────────────────────────────────
@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    payload: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = Meeting(
        user_id=current_user.id,
        title=payload.title,
        consent_given=payload.consent_given,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    if payload.transcript:
        lines = payload.transcript.split("\n")
        current_time = 0.0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue

            parts = line.split(":", 1)
            if len(parts) == 2:
                speaker = parts[0].strip()
                text = parts[1].strip()
            else:
                speaker = "Speaker"
                text = line

            if not text:
                continue

            duration = max(2.0, len(text) / 15.0)

            sub = Subtitle(
                meeting_id=meeting.id,
                speaker_id=speaker,
                speaker_name=speaker,
                text=text,
                start_time=current_time,
                end_time=current_time + duration,
                confidence=1.0,
            )
            db.add(sub)
            current_time += duration

        await db.commit()
        logger.info("Created meeting %d with %d subtitle lines", meeting.id, len(lines))

    return await _enrich_meeting(db, meeting, include_analysis=False)


# ── List Meetings ────────────────────────────────────────
@router.get("", response_model=list[MeetingListOut])
async def list_meetings(
    search: str | None = Query(default=None, max_length=255),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Meeting).filter(Meeting.user_id == current_user.id)
    if search:
        stmt = stmt.filter(Meeting.title.ilike(f"%{search}%"))

    stmt = stmt.order_by(desc(Meeting.created_at)).offset(skip).limit(limit)
    result = await db.execute(stmt)
    meetings = result.scalars().all()

    # Note: N+1 queries here, should be optimized in Phase 2 with joined loads or window functions
    result_data = []
    for m in meetings:
        data = await _enrich_meeting(db, m, include_analysis=False)
        result_data.append(data)

    return result_data


# ── Dashboard ─────────────────────────────────────────────
@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Total meetings
    meetings_count = await db.execute(select(func.count(Meeting.id)).filter(Meeting.user_id == current_user.id))
    total_meetings = meetings_count.scalar() or 0

    # Get meeting IDs
    ids_res = await db.execute(select(Meeting.id).filter(Meeting.user_id == current_user.id))
    meeting_ids = ids_res.scalars().all()

    total_tasks = 0
    tasks_todo = 0
    tasks_in_progress = 0
    tasks_done = 0
    high_priority = 0
    risk_count = 0
    analyzed_count = 0

    if meeting_ids:
        # Task Stats
        # Optimization: use group_by
        # For simplicity in migration, using separate queries for readability as per previous logic
        task_base = select(Task).filter(Task.meeting_id.in_(meeting_ids))
        
        # Total Tasks
        t_res = await db.execute(select(func.count()).select_from(task_base.subquery()))
        total_tasks = t_res.scalar() or 0
        
        # Status counts
        todo_res = await db.execute(select(func.count()).filter(Task.meeting_id.in_(meeting_ids), Task.status == "todo"))
        tasks_todo = todo_res.scalar() or 0
        
        inp_res = await db.execute(select(func.count()).filter(Task.meeting_id.in_(meeting_ids), Task.status == "in-progress"))
        tasks_in_progress = inp_res.scalar() or 0
        
        done_res = await db.execute(select(func.count()).filter(Task.meeting_id.in_(meeting_ids), Task.status == "done"))
        tasks_done = done_res.scalar() or 0
        
        high_res = await db.execute(select(func.count()).filter(Task.meeting_id.in_(meeting_ids), Task.priority == "high"))
        high_priority = high_res.scalar() or 0

        # AI Results & Risks
        ai_res = await db.execute(select(AIResult).filter(AIResult.meeting_id.in_(meeting_ids)))
        ai_results = ai_res.scalars().all()
        analyzed_count = len(ai_results)
        
        for r in ai_results:
            if r.risks_json and "risks" in r.risks_json:
                risk_count += len(r.risks_json["risks"])

    # Recent meetings
    recent_res = await db.execute(
        select(Meeting)
        .filter(Meeting.user_id == current_user.id)
        .order_by(desc(Meeting.created_at))
        .limit(5)
    )
    recent = recent_res.scalars().all()
    recent_enriched = [await _enrich_meeting(db, m) for m in recent]

    return {
        "total_meetings": total_meetings,
        "total_tasks": total_tasks,
        "tasks_todo": tasks_todo,
        "tasks_in_progress": tasks_in_progress,
        "tasks_done": tasks_done,
        "high_priority_tasks": high_priority,
        "recent_meetings": recent_enriched,
        "risk_count": risk_count,
        "analyzed_meetings": analyzed_count,
    }


# ── Get Single Meeting (full detail) ─────────────────────
@router.get("/{meeting_id}", response_model=MeetingOut)
async def get_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    return await _enrich_meeting(db, meeting, include_analysis=True)


# ── Meeting Stats ────────────────────────────────────────
@router.get("/{meeting_id}/stats", response_model=MeetingStats)
async def meeting_stats(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Fetch subtitles
    sub_res = await db.execute(select(Subtitle).filter(Subtitle.meeting_id == meeting_id))
    subtitles = sub_res.scalars().all()
    
    speakers = list({s.speaker_name or s.speaker_id for s in subtitles})
    duration = max((s.end_time for s in subtitles), default=0) if subtitles else None
    
    # Counts
    t_count = await db.execute(select(func.count(Task.id)).filter(Task.meeting_id == meeting_id))
    p_count = await db.execute(select(func.count(Participant.id)).filter(Participant.meeting_id == meeting_id))
    
    ai_check = await db.execute(select(AIResult).filter(AIResult.meeting_id == meeting_id))

    return {
        "meeting_id": meeting_id,
        "subtitle_count": len(subtitles),
        "task_count": t_count.scalar() or 0,
        "participant_count": p_count.scalar() or 0,
        "has_analysis": ai_check.scalars().first() is not None,
        "duration_seconds": duration,
        "speakers": speakers,
    }


# ── Update Meeting ────────────────────────────────────────
@router.patch("/{meeting_id}", response_model=MeetingOut)
async def update_meeting(
    meeting_id: int,
    payload: MeetingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    updates = payload.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(meeting, key, value)
        
    await db.commit()
    await db.refresh(meeting)
    return await _enrich_meeting(db, meeting, include_analysis=True)


# ── Delete Meeting ────────────────────────────────────────
@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    logger.info("Deleting meeting %d for user %d", meeting_id, current_user.id)
    await db.delete(meeting)
    await db.commit()
