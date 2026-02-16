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


class MeetingStats(BaseModel):
    """Per-meeting statistics."""
    meeting_id: int
    subtitle_count: int
    task_count: int
    participant_count: int
    has_analysis: bool
    duration_seconds: float | None = None
    speakers: list[str] = []
