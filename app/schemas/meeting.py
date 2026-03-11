"""
Meeting Schemas — Pydantic models for request/response validation.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    transcript: str | None = Field(default=None)
    consent_given: bool = Field(default=False)


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)


class MeetingOut(BaseModel):
    id: int
    user_id: int
    title: str
    consent_given: bool = False
    created_at: datetime
    ended_at: datetime | None = None

    # Computed fields set by API layer
    transcript: str | None = None
    has_analysis: bool = False
    subtitle_count: int = 0
    task_count: int = 0

    # AI results (populated on detail fetch)
    summary: dict | None = None
    actions: dict | None = None
    risks: dict | None = None
    sentiment: dict | None = None

    class Config:
        from_attributes = True


class MeetingListOut(BaseModel):
    """Lighter schema for list endpoints (no transcript/analysis)."""
    id: int
    user_id: int
    title: str
    consent_given: bool = False
    created_at: datetime
    ended_at: datetime | None = None
    has_analysis: bool = False
    subtitle_count: int = 0
    task_count: int = 0

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_meetings: int
    total_tasks: int
    tasks_todo: int
    tasks_in_progress: int
    tasks_done: int
    high_priority_tasks: int
    recent_meetings: list[MeetingListOut]
    risk_count: int
    analyzed_meetings: int = 0
    avg_meeting_duration: float = 0.0
    longest_meeting: float = 0.0
    meeting_frequency: dict[str, Any] = {}  # {this_week, avg_per_day, peak_day}
    keyword_trends: list[dict] = []  # [{word, count}]
    calendar_heatmap: dict[str, int] = {}  # {"Mon": 3, "Tue": 5, ...}


class SpeakerInsights(BaseModel):
    speaking_time: float = 0
    messages: int = 0
    questions_asked: int = 0
    interruptions: int = 0
    words_per_minute: float = 0
    participation_score: int = 0


class SilentGap(BaseModel):
    timestamp: float = 0
    duration: float = 0


class HighlightedItem(BaseModel):
    text: str
    type: str  # "number", "deadline", "budget", "date"
    timestamp: float = 0


class MeetingStats(BaseModel):
    """Per-meeting statistics — comprehensive analytics engine."""
    meeting_id: int
    subtitle_count: int
    task_count: int
    participant_count: int
    has_analysis: bool
    duration_seconds: float | None = None
    speakers: list[str] = []
    speaking_time: dict[str, float] = {}
    speaker_insights: dict[str, SpeakerInsights] = {}
    engagement_score: int = 0
    heatmap: list[int] = []
    rule_based_decisions: list[str] = []

    # Efficiency report
    active_speaking_seconds: float = 0
    silent_seconds: float = 0
    efficiency_score: int = 0

    # Auto title suggestion
    suggested_title: str = ""
    keyword_cloud: list[dict] = []  # [{word, count}]

    # Speaker turns
    total_speaker_turns: int = 0
    longest_monologue_speaker: str = ""
    longest_monologue_seconds: float = 0

    # Silent gaps
    silent_gaps: list[SilentGap] = []

    # Questions
    questions: list[str] = []

    # Highlights (numbers, dates, budgets, deadlines)
    highlights: list[HighlightedItem] = []

    # Conversation speed per speaker
    conversation_speed: dict[str, float] = {}  # speaker -> words/min
