"""
Tasks API — Generate, List, Update, Delete, Batch Operations, and GitHub Export
"""
import asyncio
import logging
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.meeting import Meeting
from app.models.ai_result import AIResult
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskOut, TaskUpdate, TaskCreate

router = APIRouter(tags=["tasks"])
logger = logging.getLogger("meetingai.tasks")

ALLOWED_PRIORITIES = {"low", "medium", "high"}
ALLOWED_STATUSES = {"todo", "in-progress", "done"}


def normalize_priority(value: str | None) -> str:
    if not value:
        return "medium"
    lowered = value.strip().lower()
    return lowered if lowered in ALLOWED_PRIORITIES else "medium"


# ── Generate Tasks from AI Action Items ──────────────────
@router.post("/meetings/{meeting_id}/generate-tasks", response_model=list[TaskOut])
async def generate_tasks(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-generate tasks from AI-extracted action items."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    res = await db.execute(select(AIResult).filter(AIResult.meeting_id == meeting_id))
    ai_result = res.scalars().first()
    
    if not ai_result or not ai_result.actions_json:
        raise HTTPException(
            status_code=400,
            detail="No AI action items found. Run /analyze first.",
        )

    actions_data = ai_result.actions_json.get("action_items", [])
    if not actions_data:
        return []

    # Get existing titles to avoid duplicates
    existing_res = await db.execute(select(Task.title).filter(Task.meeting_id == meeting_id))
    existing_titles = {row for row in existing_res.scalars().all()}

    created: list[Task] = []
    for item in actions_data:
        title = (item.get("task") or "Untitled task").strip()[:255]
        if title in existing_titles:
            continue

        task = Task(
            meeting_id=meeting_id,
            title=title,
            subtitle_reference=item.get("subtitle_ref"),
            owner=item.get("owner"),
            priority=normalize_priority(item.get("priority")),
            status="todo",
        )
        db.add(task)
        created.append(task)
        existing_titles.add(title)

    await db.commit()
    for task in created:
        await db.refresh(task)

    logger.info("Generated %d tasks for meeting %d", len(created), meeting_id)
    return created


# ── Create Manual Task ────────────────────────────────────
@router.post("/tasks", response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually create a new task."""
    # Verify meeting access
    res = await db.execute(
        select(Meeting).filter(Meeting.id == payload.meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found or access denied")

    task = Task(
        meeting_id=payload.meeting_id,
        title=payload.title,
        status=payload.status,
        priority=payload.priority,
        owner=payload.owner,
        estimated_minutes=payload.estimated_minutes,
        time_spent=0,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    logger.info("User %d created task %d", current_user.id, task.id)
    return task


# ── List Tasks ────────────────────────────────────────────
@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    status: str | None = Query(default=None, description="Filter by status: todo, in-progress, done"),
    priority: str | None = Query(default=None, description="Filter by priority: low, medium, high"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Task)
        .join(Meeting, Meeting.id == Task.meeting_id)
        .where(Meeting.user_id == current_user.id)
    )

    if status and status in ALLOWED_STATUSES:
        stmt = stmt.filter(Task.status == status)
    if priority and priority in ALLOWED_PRIORITIES:
        stmt = stmt.filter(Task.priority == priority)

    stmt = stmt.order_by(Task.created_at.desc())
    
    result = await db.execute(stmt)
    return result.scalars().all()


# ── Update Task ──────────────────────────────────────────
@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Task)
        .join(Meeting, Meeting.id == Task.meeting_id)
        .where(Task.id == task_id, Meeting.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = payload.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(task, key, value)

    await db.commit()
    await db.refresh(task)
    logger.info("Updated task %d: %s", task_id, updates)
    return task


# ── Delete Task ──────────────────────────────────────────
@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Task)
        .join(Meeting, Meeting.id == Task.meeting_id)
        .where(Task.id == task_id, Meeting.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()
    logger.info("Deleted task %d", task_id)


# ── Batch Status Update ─────────────────────────────────
class BatchStatusUpdate(BaseModel):
    task_ids: list[int]
    status: str


@router.post("/tasks/batch-update", response_model=list[TaskOut])
async def batch_update_tasks(
    payload: BatchStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update status of multiple tasks at once."""
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")

    stmt = (
        select(Task)
        .join(Meeting, Meeting.id == Task.meeting_id)
        .where(Task.id.in_(payload.task_ids), Meeting.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()

    if not tasks:
        raise HTTPException(status_code=404, detail="No matching tasks found")

    for task in tasks:
        task.status = payload.status

    await db.commit()
    # No need to refresh all if just returning, but better to be safe
    # Or just return updated objects (SQLAlchemy tracks changes)
    
    logger.info("Batch updated %d tasks to status '%s'", len(tasks), payload.status)
    return tasks


# ── GitHub Issue Export ──────────────────────────────────
class GitHubExportRequest(BaseModel):
    repo: str
    task_ids: list[int] | None = None


def _post_github_issue(url, headers, data):
    """Synchronous wrapper for requests.post to run in executor."""
    return requests.post(url, headers=headers, json=data, timeout=15)


@router.post("/meetings/{meeting_id}/export-github")
async def export_to_github(
    meeting_id: int,
    payload: GitHubExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create GitHub issues from meeting tasks."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if not settings.github_token:
        raise HTTPException(status_code=400, detail="GitHub token not configured.")

    stmt = select(Task).filter(Task.meeting_id == meeting_id)
    if payload.task_ids:
        stmt = stmt.filter(Task.id.in_(payload.task_ids))
    
    res = await db.execute(stmt)
    tasks = res.scalars().all()

    if not tasks:
        raise HTTPException(status_code=400, detail="No tasks found to export.")

    headers = {
        "Authorization": f"token {settings.github_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    priority_labels = {"high": "priority: high", "medium": "priority: medium", "low": "priority: low"}

    created_issues = []
    loop = asyncio.get_running_loop()

    for task in tasks:
        body = f"**Meeting:** {meeting.title}\n"
        body += f"**Priority:** {task.priority}\n"
        body += f"**Owner:** {task.owner or 'Unassigned'}\n"
        if task.subtitle_reference:
            body += f"**Source:** {task.subtitle_reference}\n"
        body += f"\n---\n*Auto-generated by AI Meeting Intelligence System*"

        issue_data = {
            "title": f"[Meeting Task] {task.title}",
            "body": body,
            "labels": ["meeting-task", priority_labels.get(task.priority, "priority: medium")],
        }

        try:
            # Offload blocking request
            resp = await loop.run_in_executor(
                None, 
                lambda: requests.post(
                    f"https://api.github.com/repos/{payload.repo}/issues",
                    headers=headers,
                    json=issue_data,
                    timeout=15,
                )
            )
            
            if resp.status_code == 201:
                issue = resp.json()
                created_issues.append({
                    "task_id": task.id,
                    "issue_number": issue["number"],
                    "url": issue["html_url"],
                })
                logger.info("Created GitHub issue #%d for task %d", issue["number"], task.id)
            else:
                logger.error("GitHub issue creation failed: %s %s", resp.status_code, resp.text[:200])
                created_issues.append({
                    "task_id": task.id,
                    "error": f"GitHub API returned {resp.status_code}",
                })
        except Exception as e:
            logger.error("GitHub API error: %s", e)
            created_issues.append({"task_id": task.id, "error": str(e)})

    successful = len([i for i in created_issues if "url" in i])
    return {
        "exported": successful,
        "total": len(tasks),
        "issues": created_issues,
    }
