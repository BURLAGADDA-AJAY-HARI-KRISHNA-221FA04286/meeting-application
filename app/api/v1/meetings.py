"""
Meetings API — CRUD, Dashboard, Transcript, Statistics, and Media Upload
"""
import logging
import os
import tempfile
import asyncio
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status, Response, Request
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_or_token
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


def _sanitize_filename(filename: str | None, default: str = "download.txt") -> str:
    if not filename:
        filename = default
    cleaned = "".join(
        ch for ch in filename
        if ch not in '<>:"/\\|?*' and ord(ch) >= 32
    ).strip().lstrip(".")
    cleaned = cleaned or default
    return cleaned[:180]


def _build_meeting_filename(title: str | None, suffix: str) -> str:
    base = (title or "meeting").strip().replace(" ", "_").replace("/", "_")
    base = _sanitize_filename(base, "meeting")
    return f"{base[:80]}_{suffix}.txt"


def _content_disposition(filename: str) -> str:
    safe = _sanitize_filename(filename)
    encoded = quote(safe)
    return f"attachment; filename=\"{safe}\"; filename*=UTF-8''{encoded}"


from app.core.security import sanitize_input

# ── Create Meeting ────────────────────────────────────────
@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    payload: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = Meeting(
        user_id=current_user.id,
        title=sanitize_input(payload.title),
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

    from app.core.redis import invalidate_cache
    await invalidate_cache(f"user:{current_user.id}:")
    return await _enrich_meeting(db, meeting, include_analysis=False)


# ── List Meetings ────────────────────────────────────────
@router.get("", response_model=list[MeetingListOut])
async def list_meetings(
    search: str | None = Query(default=None, max_length=255),
    status: str | None = Query(default=None, max_length=20),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.redis import get_cache, set_cache
    
    # Try cache first (only if no search or status filter is applied, for simplicity)
    cache_key = f"user:{current_user.id}:meetings:{skip}:{limit}"
    if not search and not status:
        cached = await get_cache(cache_key)
        if cached:
            return cached

    # Single query with subquery counts — no N+1
    sub_count = (
        select(func.count(Subtitle.id))
        .where(Subtitle.meeting_id == Meeting.id)
        .correlate(Meeting)
        .scalar_subquery()
    )
    task_count = (
        select(func.count(Task.id))
        .where(Task.meeting_id == Meeting.id)
        .correlate(Meeting)
        .scalar_subquery()
    )
    has_ai = (
        select(func.count(AIResult.id))
        .where(AIResult.meeting_id == Meeting.id)
        .correlate(Meeting)
        .scalar_subquery()
    )

    stmt = (
        select(
            Meeting.id,
            Meeting.user_id,
            Meeting.title,
            Meeting.consent_given,
            Meeting.created_at,
            Meeting.ended_at,
            sub_count.label("subtitle_count"),
            task_count.label("task_count"),
            (has_ai > 0).label("has_analysis"),
        )
        .where(Meeting.user_id == current_user.id)
    )
    if search:
        stmt = stmt.where(Meeting.title.ilike(f"%{search}%"))
    # Filter by analysis status using EXISTS subquery
    if status == "analyzed":
        stmt = stmt.where(
            select(AIResult.id).where(AIResult.meeting_id == Meeting.id).exists()
        )
    elif status == "pending":
        stmt = stmt.where(
            ~select(AIResult.id).where(AIResult.meeting_id == Meeting.id).exists()
        )

    stmt = stmt.order_by(desc(Meeting.created_at)).offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    meetings_list = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "title": r.title,
            "consent_given": r.consent_given,
            "created_at": r.created_at.isoformat(),
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "subtitle_count": r.subtitle_count,
            "task_count": r.task_count,
            "has_analysis": bool(r.has_analysis),
        }
        for r in rows
    ]

    if not search and not status:
        await set_cache(cache_key, meetings_list, ttl=300)

    return meetings_list



# ── Dashboard ─────────────────────────────────────────────
@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    from sqlalchemy import text
    from app.core.redis import get_cache, set_cache

    cache_key = f"user:{uid}:dashboard_stats"
    cached = await get_cache(cache_key)
    if cached:
        return cached

    # ── QUERY 1: All stats in ONE roundtrip (Optimized O(N) pass) ──
    stats_sql = text("""
        WITH user_meetings AS (
            SELECT id FROM meetings WHERE user_id = :uid
        )
        SELECT
            (SELECT COUNT(id) FROM user_meetings) AS total_meetings,
            (SELECT COUNT(id) FROM ai_results WHERE meeting_id IN (SELECT id FROM user_meetings)) AS analyzed_meetings,
            COUNT(t.id) AS total_tasks,
            COUNT(t.id) FILTER (WHERE t.status = 'todo') AS tasks_todo,
            COUNT(t.id) FILTER (WHERE t.status = 'in-progress') AS tasks_in_progress,
            COUNT(t.id) FILTER (WHERE t.status = 'done') AS tasks_done,
            COUNT(t.id) FILTER (WHERE t.priority = 'high') AS high_priority
        FROM tasks t
        WHERE t.meeting_id IN (SELECT id FROM user_meetings)
    """)
    stats_row = (await db.execute(stats_sql, {"uid": uid})).one()

    # ── QUERY 2: Recent meetings with counts ──
    sub_count = (
        select(func.count(Subtitle.id))
        .where(Subtitle.meeting_id == Meeting.id)
        .correlate(Meeting)
        .scalar_subquery()
    )
    t_count = (
        select(func.count(Task.id))
        .where(Task.meeting_id == Meeting.id)
        .correlate(Meeting)
        .scalar_subquery()
    )
    has_ai = (
        select(func.count(AIResult.id))
        .where(AIResult.meeting_id == Meeting.id)
        .correlate(Meeting)
        .scalar_subquery()
    )
    recent_q = (
        select(
            Meeting.id, Meeting.user_id, Meeting.title,
            Meeting.consent_given, Meeting.created_at, Meeting.ended_at,
            sub_count.label("subtitle_count"),
            t_count.label("task_count"),
            (has_ai > 0).label("has_analysis"),
        )
        .where(Meeting.user_id == uid)
        .order_by(desc(Meeting.created_at))
        .limit(5)
    )
    recent_rows = (await db.execute(recent_q)).all()

    recent_enriched = [
        {
            "id": r.id, "user_id": r.user_id, "title": r.title,
            "consent_given": r.consent_given, "created_at": r.created_at.isoformat(),
            "ended_at": r.ended_at.isoformat() if r.ended_at else None, "subtitle_count": r.subtitle_count,
            "task_count": r.task_count, "has_analysis": bool(r.has_analysis),
        }
        for r in recent_rows
    ]

    # Calculate meeting durations
    durations_res = await db.execute(select(Meeting.created_at, Meeting.ended_at).where(Meeting.user_id == uid, Meeting.ended_at != None))
    durations = [(r.ended_at - r.created_at).total_seconds() / 60.0 for r in durations_res.all()]
    avg_duration = sum(durations) / len(durations) if durations else 0.0
    longest_duration = max(durations) if durations else 0.0

    # ── Meeting Frequency Analytics ──
    from datetime import datetime, timedelta
    from collections import Counter
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    freq_res = await db.execute(select(Meeting.created_at).where(Meeting.user_id == uid, Meeting.created_at >= week_ago))
    week_meetings = freq_res.scalars().all()
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_counts = Counter(d.strftime("%A") for d in week_meetings)
    peak_day = max(day_counts, key=day_counts.get) if day_counts else "N/A"
    meeting_frequency = {
        "this_week": len(week_meetings),
        "avg_per_day": round(len(week_meetings) / 7.0, 1),
        "peak_day": peak_day,
    }

    # ── Calendar Heatmap ──
    all_dates_res = await db.execute(select(Meeting.created_at).where(Meeting.user_id == uid))
    all_dates = all_dates_res.scalars().all()
    calendar_heatmap = {}
    for d in day_names:
        calendar_heatmap[d[:3]] = 0
    for d in all_dates:
        calendar_heatmap[d.strftime("%a")] = calendar_heatmap.get(d.strftime("%a"), 0) + 1

    # ── Keyword Trends (top words across all recent titles) ──
    titles_res = await db.execute(select(Meeting.title).where(Meeting.user_id == uid).order_by(desc(Meeting.created_at)).limit(50))
    titles = titles_res.scalars().all()
    stop_words = {"the","a","an","meeting","and","or","with","for","on","in","to","of","is","are"}
    all_kw = []
    for t in titles:
        all_kw.extend(w.lower().strip(".,!?;:\"'") for w in (t or "").split() if w.lower() not in stop_words and len(w) > 2)
    kw_freq = Counter(all_kw)
    keyword_trends = [{"word": w, "count": c} for w, c in kw_freq.most_common(10)]

    response_data = {
        "total_meetings": stats_row.total_meetings or 0,
        "total_tasks": stats_row.total_tasks or 0,
        "tasks_todo": stats_row.tasks_todo or 0,
        "tasks_in_progress": stats_row.tasks_in_progress or 0,
        "tasks_done": stats_row.tasks_done or 0,
        "high_priority_tasks": stats_row.high_priority or 0,
        "recent_meetings": recent_enriched,
        "risk_count": 0,
        "analyzed_meetings": stats_row.analyzed_meetings or 0,
        "avg_meeting_duration": round(avg_duration, 1),
        "longest_meeting": round(longest_duration, 1),
        "meeting_frequency": meeting_frequency,
        "keyword_trends": keyword_trends,
        "calendar_heatmap": calendar_heatmap,
    }

    await set_cache(cache_key, response_data, ttl=60)
    return response_data


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


# ── Meeting Stats (Comprehensive Analytics Engine) ────────
@router.get("/{meeting_id}/stats", response_model=MeetingStats)
async def meeting_stats(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import re
    from collections import Counter

    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    sub_res = await db.execute(
        select(Subtitle).filter(Subtitle.meeting_id == meeting_id).order_by(Subtitle.start_time)
    )
    subtitles = sub_res.scalars().all()

    speakers = list({s.speaker_name or s.speaker_id for s in subtitles})
    duration = max((s.end_time for s in subtitles), default=0) if subtitles else None

    t_count = await db.execute(select(func.count(Task.id)).filter(Task.meeting_id == meeting_id))
    p_count = await db.execute(select(func.count(Participant.id)).filter(Participant.meeting_id == meeting_id))
    ai_check = await db.execute(select(AIResult).filter(AIResult.meeting_id == meeting_id))

    # ── Accumulators ──
    speaking_time: dict[str, float] = {}
    speaker_insights: dict[str, dict] = {}
    speaker_word_counts: dict[str, int] = {}
    heatmap_dict: dict[int, int] = {}
    prev_speaker = None
    prev_end_time = 0.0
    topic_changes = 0
    total_active = 0.0
    total_speaker_turns = 0
    current_monologue_dur = 0.0
    longest_mono_dur = 0.0
    longest_mono_spk = ""
    all_words: list[str] = []
    questions: list[str] = []
    silent_gaps: list[dict] = []

    decision_re = re.compile(r'\b(decided|approved|finalized|agreed|confirmed|resolved)\b', re.IGNORECASE)
    highlight_re = re.compile(r'(\$[\d,]+(?:\.\d+)?|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|\bdeadline\b|\bbudget\b|\b\d{4,}\b)', re.IGNORECASE)
    rule_based_decisions: list[str] = []
    highlights: list[dict] = []

    STOP_WORDS = {"the","a","an","is","are","was","were","be","been","being","have","has","had",
                  "do","does","did","will","would","shall","should","may","might","must","can","could",
                  "i","me","my","we","our","you","your","he","him","his","she","her","it","its",
                  "they","them","their","this","that","these","those","and","but","or","nor","not",
                  "so","if","then","else","when","at","by","for","with","about","against","between",
                  "through","during","before","after","above","below","to","from","up","down","in",
                  "out","on","off","over","under","again","further","once","of","all","each",
                  "every","both","few","more","most","other","some","such","no","only","own","same",
                  "than","too","very","just","don","t","s","re","ll","ve","d","m", "ok", "yeah",
                  "yes","no","like","also","well","know","think","going","want","need","get","got",
                  "let","thing","things","way","really","right","good","new","one","two","three",
                  "what","how","who","where","why","which","there","here","uh","um","oh"}

    for sub in subtitles:
        spk = sub.speaker_name or sub.speaker_id or "Speaker"
        time_diff = max(0.0, sub.end_time - sub.start_time)
        if time_diff == 0:
            time_diff = max(2.0, len(sub.text) / 15.0)

        total_active += time_diff
        words = sub.text.split()
        word_count = len(words)
        all_words.extend(w.lower().strip(".,!?;:\"'()[]{}") for w in words)

        if spk not in speaker_insights:
            speaker_insights[spk] = {"speaking_time": 0.0, "messages": 0, "questions_asked": 0, "interruptions": 0, "words_per_minute": 0, "participation_score": 0}
            speaker_word_counts[spk] = 0

        speaker_insights[spk]["speaking_time"] += time_diff
        speaker_insights[spk]["messages"] += 1
        speaker_word_counts[spk] = speaker_word_counts.get(spk, 0) + word_count

        if "?" in sub.text:
            speaker_insights[spk]["questions_asked"] += 1
            if len(questions) < 30:
                questions.append(sub.text.strip())

        # Speaker turn tracking
        if prev_speaker and prev_speaker != spk:
            total_speaker_turns += 1
            if prev_speaker != spk and sub.start_time < prev_end_time + 1.0:
                speaker_insights[spk]["interruptions"] += 1
            # Check monologue
            if current_monologue_dur > longest_mono_dur:
                longest_mono_dur = current_monologue_dur
                longest_mono_spk = prev_speaker
            current_monologue_dur = time_diff
        else:
            current_monologue_dur += time_diff

        # Detect silent gaps (>8 seconds)
        if prev_end_time > 0 and sub.start_time - prev_end_time > 8.0:
            gap = sub.start_time - prev_end_time
            if len(silent_gaps) < 20:
                silent_gaps.append({"timestamp": prev_end_time, "duration": round(gap, 1)})
            if gap > 15.0:
                topic_changes += 1

        prev_speaker = spk
        prev_end_time = max(prev_end_time, sub.end_time)
        speaking_time[spk] = speaking_time.get(spk, 0) + time_diff

        minute_idx = int(sub.start_time // 60)
        heatmap_dict[minute_idx] = heatmap_dict.get(minute_idx, 0) + 1

        if decision_re.search(sub.text) and len(rule_based_decisions) < 20:
            rule_based_decisions.append(sub.text.strip())

        # Smart highlighting
        for m in highlight_re.finditer(sub.text):
            matched = m.group(0)
            h_type = "number"
            if matched.startswith("$") or "budget" in matched.lower():
                h_type = "budget"
            elif "deadline" in matched.lower():
                h_type = "deadline"
            elif any(mo in matched.lower() for mo in ["january","february","march","april","may","june","july","august","september","october","november","december"]) or "/" in matched or "-" in matched:
                h_type = "date"
            if len(highlights) < 30:
                highlights.append({"text": matched, "type": h_type, "timestamp": sub.start_time})

    # Check final monologue
    if current_monologue_dur > longest_mono_dur:
        longest_mono_dur = current_monologue_dur
        longest_mono_spk = prev_speaker or ""

    # ── Conversation Speed ──
    conversation_speed: dict[str, float] = {}
    for spk, si in speaker_insights.items():
        dur_min = si["speaking_time"] / 60.0 if si["speaking_time"] > 0 else 1
        wpm = round(speaker_word_counts.get(spk, 0) / dur_min, 0)
        si["words_per_minute"] = wpm
        conversation_speed[spk] = wpm

    # ── Participation scores ──
    max_msgs = max((si["messages"] for si in speaker_insights.values()), default=1)
    max_qs = max((si["questions_asked"] for si in speaker_insights.values()), default=1) or 1
    for spk, si in speaker_insights.items():
        score = min(100, int(
            (si["messages"] / max(1, max_msgs)) * 40 +
            (si["speaking_time"] / max(1, total_active)) * 30 +
            (si["questions_asked"] / max_qs) * 20 +
            (total_speaker_turns > 0 and 10 or 0)
        ))
        si["participation_score"] = score

    # ── Speaking time percentages ──
    total_spk_time = sum(speaking_time.values())
    if total_spk_time > 0:
        for k in speaking_time:
            speaking_time[k] = round((speaking_time[k] / total_spk_time) * 100, 1)

    # ── Heatmap ──
    heatmap = []
    if heatmap_dict:
        for i in range(max(heatmap_dict.keys()) + 1):
            heatmap.append(heatmap_dict.get(i, 0))

    # ── Efficiency ──
    silent_seconds = max(0, (duration or 0) - total_active)
    efficiency_score = int((total_active / max(1, duration or 1)) * 100) if subtitles else 0
    efficiency_score = min(100, efficiency_score)

    # ── Engagement ──
    duration_mins = (duration or 1.0) / 60.0
    subtitle_density = len(subtitles) / max(1.0, duration_mins)
    engagement_score = min(100, int((len(speakers) * 10) + (subtitle_density * 2) + (topic_changes * 5))) if subtitles else 0

    # ── Keyword Cloud & TF-IDF Title ──
    filtered = [w for w in all_words if w not in STOP_WORDS and len(w) > 2]
    word_freq = Counter(filtered)
    keyword_cloud = [{"word": w, "count": c} for w, c in word_freq.most_common(40)]

    top_words = [w for w, _ in word_freq.most_common(5)]
    suggested_title = " ".join(w.title() for w in top_words) + " Discussion" if top_words else meeting.title

    return {
        "meeting_id": meeting_id,
        "subtitle_count": len(subtitles),
        "task_count": t_count.scalar() or 0,
        "participant_count": p_count.scalar() or 0,
        "has_analysis": ai_check.scalars().first() is not None,
        "duration_seconds": duration,
        "speakers": speakers,
        "speaking_time": speaking_time,
        "speaker_insights": speaker_insights,
        "engagement_score": engagement_score,
        "heatmap": heatmap,
        "rule_based_decisions": rule_based_decisions,
        "active_speaking_seconds": round(total_active, 1),
        "silent_seconds": round(silent_seconds, 1),
        "efficiency_score": efficiency_score,
        "suggested_title": suggested_title,
        "keyword_cloud": keyword_cloud,
        "total_speaker_turns": total_speaker_turns,
        "longest_monologue_speaker": longest_mono_spk,
        "longest_monologue_seconds": round(longest_mono_dur, 1),
        "silent_gaps": silent_gaps,
        "questions": questions,
        "highlights": highlights,
        "conversation_speed": conversation_speed,
    }


# ── Update Meeting ────────────────────────────────────────
@router.patch("/{meeting_id}", response_model=MeetingOut)
async def update_meeting(
    meeting_id: int,
    payload: MeetingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.redis import invalidate_cache

    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    updates = payload.model_dump(exclude_none=True)
    for key, value in updates.items():
        if key == "title" and value:
            value = sanitize_input(value)
        setattr(meeting, key, value)
        
    await db.commit()
    await db.refresh(meeting)

    await invalidate_cache(f"user:{current_user.id}:")
    return await _enrich_meeting(db, meeting, include_analysis=True)


# ── Delete Meeting ────────────────────────────────────────
@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.redis import invalidate_cache

    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    logger.info("Deleting meeting %d for user %d", meeting_id, current_user.id)
    await db.delete(meeting)
    await db.commit()

    await invalidate_cache(f"user:{current_user.id}:")


# ── Upload Video/Audio → Transcript ──────────────────────
ALLOWED_MEDIA_TYPES = {
    "video/mp4", "video/webm", "video/x-matroska", "video/quicktime",
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm",
    "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a",
}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


def _matches_media_magic(content_type: str, chunk: bytes) -> bool:
    """Best-effort magic-byte validation for common audio/video upload types."""
    if not chunk:
        return False
    ct = (content_type or "").lower()

    if ct in {"video/mp4", "audio/mp4", "audio/x-m4a", "audio/m4a", "video/quicktime"}:
        # ISO Base Media File Format (mp4/m4a/mov): bytes 4..7 are usually "ftyp".
        return len(chunk) >= 12 and chunk[4:8] == b"ftyp"
    if ct in {"video/webm", "audio/webm", "video/x-matroska"}:
        # EBML header for WebM / Matroska.
        return chunk.startswith(b"\x1a\x45\xdf\xa3")
    if ct in {"audio/wav", "audio/x-wav"}:
        return len(chunk) >= 12 and chunk.startswith(b"RIFF") and chunk[8:12] == b"WAVE"
    if ct == "audio/ogg":
        return chunk.startswith(b"OggS")
    if ct in {"audio/mpeg", "audio/mp3"}:
        return chunk.startswith(b"ID3") or (len(chunk) >= 2 and chunk[0] == 0xFF and (chunk[1] & 0xE0) == 0xE0)
    return True


from celery import shared_task

@shared_task
def _transcribe_with_gemini(file_path: str, mime_type: str) -> str:
    """Use Gemini to transcribe audio/video file (sync, runs in worker)."""
    from google import genai
    from app.core.config import settings

    if not settings.gemini_api_key:
        raise ValueError("Gemini API key not configured")

    client = genai.Client(api_key=settings.gemini_api_key)

    logger.info("Uploading media file to Gemini for transcription...")
    
    # Upload file
    uploaded = client.files.upload(file=file_path, config={'mime_type': mime_type})
    logger.info("File uploaded: %s", uploaded.name)

    prompt = (
        "Transcribe the following audio/video file into a text transcript. "
        "Format each line as 'Speaker: text'. If you cannot identify distinct speakers, "
        "use 'Speaker 1', 'Speaker 2', etc. If only one speaker, use 'Speaker'. "
        "Include all spoken content. Do NOT add commentary or analysis — only the transcript. "
        "If the audio is unclear, do your best to transcribe what you hear."
    )

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[uploaded, prompt]
    )
    transcript = (response.text or "").strip()

    # Clean up uploaded file
    try:
        client.files.delete(name=uploaded.name)
    except Exception:
        pass

    return transcript


@router.post("/upload-media", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    auto_analyze: bool = Form(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a video or audio file → Gemini transcribes it → creates a meeting.
    Supports: mp4, webm, mp3, wav, m4a, ogg (up to 100 MB).
    """
    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: mp4, webm, mp3, wav, m4a, ogg"
        )

    # Stream file to disk with size check to avoid loading large files in memory.
    ext = os.path.splitext(file.filename or "upload.mp4")[1] or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    total_size = 0
    first_chunk_checked = False
    try:
        while True:
            chunk = await file.read(1024 * 1024)  # 1MB chunks
            if not chunk:
                break
            if not first_chunk_checked:
                if not _matches_media_magic(content_type, chunk):
                    raise HTTPException(
                        status_code=400,
                        detail="Uploaded file content does not match the declared media type.",
                    )
                first_chunk_checked = True
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                raise HTTPException(status_code=400, detail="File too large. Max 100 MB.")
            tmp.write(chunk)

        if total_size < 1000:
            raise HTTPException(status_code=400, detail="File too small or empty.")

        tmp.flush()
        tmp.close()

        # Transcribe in a thread (Gemini SDK is sync)
        transcript = await asyncio.to_thread(
            _transcribe_with_gemini, tmp.name, content_type
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Media transcription failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Transcription failed. Please try again.")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    if not transcript or len(transcript) < 10:
        raise HTTPException(status_code=400, detail="Could not extract any transcript from this file.")

    # Create meeting with transcript
    meeting_title = sanitize_input(title.strip()) if title.strip() else f"Media Upload ({file.filename})"
    meeting = Meeting(
        user_id=current_user.id,
        title=meeting_title,
        consent_given=True,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    # Save transcript lines as subtitles
    lines = transcript.split("\n")
    current_time = 0.0
    saved_count = 0
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
            confidence=0.85,
        )
        db.add(sub)
        current_time += duration
        saved_count += 1

    await db.commit()
    logger.info(
        "Created meeting %d from media upload (%s), %d subtitle lines",
        meeting.id, file.filename, saved_count
    )

    # Auto-analyze if requested
    if auto_analyze:
        try:
            from app.models.job import Job
            from app.tasks.ai_tasks import analyze_meeting_background
            
            import uuid
            job_id = f"ai_job_{uuid.uuid4().hex[:8]}"
            new_job = Job(
                id=job_id,
                type="ai_analysis",
                status="pending",
                result_id=meeting.id
            )
            db.add(new_job)
            await db.commit()

            analyze_meeting_background.delay(meeting.id, job_id)
            logger.info("Queued auto-analysis for meeting %d", meeting.id)
        except Exception as e:
            logger.error("Auto-analysis failed to queue for meeting %d: %s", meeting.id, e)

    from app.core.redis import invalidate_cache
    await invalidate_cache(f"user:{current_user.id}:")
    return await _enrich_meeting(db, meeting, include_analysis=True)


# ── Server-Served File Downloads ──────────────────────────
# These serve files via HTTP response with Content-Disposition headers
# so browsers treat them as regular downloads (not blocked by SmartScreen).

@router.get("/{meeting_id}/download-report")
async def download_report(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_or_token),
):
    """Download a formatted meeting report as a .txt file."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    transcript = await _reconstruct_transcript(db, meeting.id)

    # Get analysis if it exists
    ai_result = (await db.execute(
        select(AIResult).where(AIResult.meeting_id == meeting.id).limit(1)
    )).scalar_one_or_none()

    lines = []
    divider = "═" * 60

    lines.append(divider)
    lines.append(f"  MEETING REPORT: {meeting.title}")
    lines.append(divider)
    lines.append("")
    lines.append(f"Date: {meeting.created_at}")
    from datetime import datetime
    lines.append(f"Report Generated: {datetime.now()}")
    lines.append("")

    if ai_result:
        # Summary from summary_json
        summary = ai_result.summary_json
        if summary:
            lines.append("─" * 40)
            lines.append("📋 EXECUTIVE SUMMARY")
            lines.append("─" * 40)
            if isinstance(summary, str):
                lines.append(summary)
            elif isinstance(summary, dict):
                text = summary.get("executive_summary") or summary.get("summary") or summary.get("text") or ""
                if text:
                    lines.append(text)
                # Key points
                key_points = summary.get("key_points") or summary.get("topics_discussed") or []
                if key_points:
                    lines.append("")
                    lines.append("🔑 KEY POINTS:")
                    for i, p in enumerate(key_points, 1):
                        txt = p if isinstance(p, str) else (p.get("point") or p.get("text") or str(p))
                        lines.append(f"  {i}. {txt}")
                # Decisions from summary
                decisions = summary.get("key_decisions") or summary.get("decisions") or []
                if decisions:
                    lines.append("")
                    lines.append("✅ KEY DECISIONS:")
                    for i, d in enumerate(decisions, 1):
                        txt = d if isinstance(d, str) else (d.get("decision") or d.get("text") or str(d))
                        lines.append(f"  {i}. {txt}")
            lines.append("")

        # Decisions from decisions_json
        decisions_data = ai_result.decisions_json
        if decisions_data:
            decs = decisions_data if isinstance(decisions_data, list) else []
            if isinstance(decisions_data, dict):
                for v in decisions_data.values():
                    if isinstance(v, list):
                        decs = v
                        break
            if decs:
                lines.append("─" * 40)
                lines.append("📌 DECISIONS")
                lines.append("─" * 40)
                for i, d in enumerate(decs, 1):
                    txt = d if isinstance(d, str) else (d.get("decision") or d.get("text") or str(d))
                    lines.append(f"  {i}. {txt}")
                lines.append("")

        # Actions from actions_json
        actions_data = ai_result.actions_json
        if actions_data:
            acts = actions_data if isinstance(actions_data, list) else []
            if isinstance(actions_data, dict):
                for v in actions_data.values():
                    if isinstance(v, list):
                        acts = v
                        break
            if acts:
                lines.append("─" * 40)
                lines.append("📝 ACTION ITEMS")
                lines.append("─" * 40)
                for i, a in enumerate(acts, 1):
                    if isinstance(a, str):
                        lines.append(f"  {i}. {a}")
                    else:
                        lines.append(f"  {i}. {a.get('action') or a.get('task') or a.get('text') or str(a)}")
                        if a.get("assignee"):
                            lines.append(f"     Assigned to: {a['assignee']}")
                        if a.get("deadline") or a.get("due_date"):
                            lines.append(f"     Deadline: {a.get('deadline') or a.get('due_date')}")
                lines.append("")

        # Risks from risks_json
        risks_data = ai_result.risks_json
        if risks_data:
            rsks = risks_data if isinstance(risks_data, list) else []
            if isinstance(risks_data, dict):
                for v in risks_data.values():
                    if isinstance(v, list):
                        rsks = v
                        break
            if rsks:
                lines.append("─" * 40)
                lines.append("⚠️ RISKS & CONCERNS")
                lines.append("─" * 40)
                for i, r in enumerate(rsks, 1):
                    txt = r if isinstance(r, str) else (r.get("risk") or r.get("text") or str(r))
                    lines.append(f"  {i}. {txt}")
                lines.append("")

        # Sentiment from sentiment_json
        sentiment = ai_result.sentiment_json
        if sentiment:
            lines.append("─" * 40)
            lines.append("📊 SENTIMENT ANALYSIS")
            lines.append("─" * 40)
            if isinstance(sentiment, str):
                lines.append(sentiment)
            elif isinstance(sentiment, dict):
                if sentiment.get("overall"):
                    lines.append(f"  Overall: {sentiment['overall']}")
                if sentiment.get("tone"):
                    lines.append(f"  Tone: {sentiment['tone']}")
            lines.append("")

    # Transcript
    if transcript:
        lines.append("─" * 40)
        lines.append("📄 TRANSCRIPT")
        lines.append("─" * 40)
        lines.append(transcript)
        lines.append("")

    lines.append(divider)
    lines.append("  Generated by MeetingAI Intelligence Platform")
    lines.append(divider)

    content = "\n".join(lines)
    filename = _build_meeting_filename(meeting.title, "report")

    return Response(
        content=content,
        media_type="text/plain",
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "no-cache",
        },
    )


@router.get("/{meeting_id}/download-transcript")
async def download_transcript(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_or_token),
):
    """Download the raw transcript as a .txt file."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    transcript = await _reconstruct_transcript(db, meeting.id)

    if not transcript:
        raise HTTPException(status_code=404, detail="No transcript available for this meeting")

    filename = _build_meeting_filename(meeting.title, "transcript")

    return Response(
        content=transcript,
        media_type="text/plain",
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "no-cache",
        },
    )


@router.post("/download-file")
async def download_file(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Generic file download — accepts content via POST body and returns 
    it as a downloadable file with proper Content-Disposition headers.
    Used for client-side generated content (notes, ICS calendar files).
    """

    body = await request.json()
    content = body.get("content", "")
    filename = _sanitize_filename(body.get("filename", "download.txt"))
    mime_type = body.get("mime_type", "text/plain")

    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "no-cache",
        },
    )
