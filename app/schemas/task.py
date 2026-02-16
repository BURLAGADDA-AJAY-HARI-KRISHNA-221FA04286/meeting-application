from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TaskStatus = Literal["todo", "in-progress", "done"]
TaskPriority = Literal["low", "medium", "high"]


class TaskOut(BaseModel):
    id: int
    meeting_id: int
    title: str
    subtitle_reference: str | None = None
    owner: str | None = None
    status: TaskStatus
    priority: TaskPriority
    estimated_minutes: int | None = 0
    time_spent: int | None = 0
    created_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    meeting_id: int
    title: str = Field(..., max_length=255)
    priority: TaskPriority = "medium"
    status: TaskStatus = "todo"
    owner: str | None = Field(default=None, max_length=255)
    estimated_minutes: int | None = 30


class TaskUpdate(BaseModel):
    status: TaskStatus | None = None
    owner: str | None = Field(default=None, max_length=255)
    priority: TaskPriority | None = None
    title: str | None = Field(default=None, max_length=255)
    estimated_minutes: int | None = None
    time_spent: int | None = None
