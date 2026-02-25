"""
Tasks API — Generate, List, Update, Delete, Batch Operations, and GitHub Export
"""
from datetime import datetime, timezone
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.core.security import sanitize_input
from app.models.meeting import Meeting
from app.models.ai_result import AIResult
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskOut, TaskUpdate, TaskCreate

router = APIRouter(tags=["tasks"])
logger = logging.getLogger("meetingai.tasks")

ALLOWED_PRIORITIES = {"low", "medium", "high"}
ALLOWED_STATUSES = {"todo", "in-progress", "done"}


def _parse_due_date(value: datetime | str | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid due_date format. Use ISO-8601.") from exc
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


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
            due_date=_parse_due_date(item.get("due_date") or item.get("deadline")),
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
        title=sanitize_input(payload.title),
        status=payload.status,
        priority=payload.priority,
        owner=payload.owner,
        estimated_minutes=payload.estimated_minutes,
        time_spent=0,
        due_date=_parse_due_date(payload.due_date),
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
    meeting_id: int | None = Query(default=None, ge=1),
    owner: str | None = Query(default=None, max_length=255),
    due_before: datetime | None = Query(default=None),
    due_after: datetime | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
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
    if meeting_id:
        stmt = stmt.filter(Task.meeting_id == meeting_id)
    if owner:
        stmt = stmt.filter(Task.owner.ilike(f"%{owner.strip()}%"))
    if due_before:
        stmt = stmt.filter(Task.due_date.is_not(None), Task.due_date <= _parse_due_date(due_before))
    if due_after:
        stmt = stmt.filter(Task.due_date.is_not(None), Task.due_date >= _parse_due_date(due_after))

    stmt = (
        stmt.order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    
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
        if key == "title" and value:
            value = sanitize_input(value)
        if key == "due_date":
            value = _parse_due_date(value)
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
    token: str | None = None
    task_ids: list[int] | None = None


class JiraExportRequest(BaseModel):
    base_url: str | None = None
    project_key: str | None = None
    email: str | None = None
    token: str | None = None
    task_ids: list[int] | None = None
    issue_type: str = "Task"


def _validate_jira_base_url(base_url: str) -> str:
    cleaned = base_url.strip().rstrip("/")
    if not cleaned.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="Jira base URL must start with http:// or https://")
    return cleaned


def _validate_jira_project_key(project_key: str) -> str:
    key = (project_key or "").strip().upper()
    if len(key) < 2 or len(key) > 20 or not key.replace("_", "").isalnum() or not key[0].isalpha():
        raise HTTPException(status_code=400, detail="Invalid Jira project key")
    return key


def _jira_description(text: str) -> dict:
    safe_text = text[:32000]
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": safe_text}],
            }
        ],
    }


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

    # Use payload token (user specific) or settings token (server global)
    gh_token = payload.token or settings.github_token
    if not gh_token:
        raise HTTPException(status_code=400, detail="GitHub token not configured. Please add it in Settings.")

    if not payload.repo or "/" not in payload.repo or payload.repo.startswith("http") or ".." in payload.repo:
        raise HTTPException(status_code=400, detail="Invalid repository format. Use 'owner/repo'.")

    stmt = select(Task).filter(Task.meeting_id == meeting_id)
    if payload.task_ids:
        stmt = stmt.filter(Task.id.in_(payload.task_ids))
    
    res = await db.execute(stmt)
    tasks = res.scalars().all()

    if not tasks:
        raise HTTPException(status_code=400, detail="No tasks found to export.")

    headers = {
        "Authorization": f"token {gh_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    priority_labels = {"high": "priority: high", "medium": "priority: medium", "low": "priority: low"}

    created_issues = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for task in tasks:
            body = f"**Meeting:** {meeting.title}\n"
            body += f"**Priority:** {task.priority}\n"
            body += f"**Owner:** {task.owner or 'Unassigned'}\n"
            if task.due_date:
                body += f"**Due Date:** {task.due_date.date().isoformat()}\n"
            if task.subtitle_reference:
                body += f"**Source:** {task.subtitle_reference}\n"
            body += f"\n---\n*Auto-generated by AI Meeting Intelligence System*"

            issue_data = {
                "title": f"[Meeting Task] {task.title}",
                "body": body,
                "labels": ["meeting-task", priority_labels.get(task.priority, "priority: medium")],
            }

            try:
                resp = await client.post(
                    f"https://api.github.com/repos/{payload.repo}/issues",
                    headers=headers,
                    json=issue_data,
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


@router.post("/meetings/{meeting_id}/export-jira")
async def export_to_jira(
    meeting_id: int,
    payload: JiraExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create Jira issues from meeting tasks."""
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    jira_base_url = payload.base_url or settings.jira_base_url
    jira_project_key = payload.project_key or settings.jira_project_key
    jira_email = payload.email or settings.jira_email
    jira_token = payload.token or settings.jira_api_token
    issue_type = (payload.issue_type or "Task").strip() or "Task"

    if not jira_base_url or not jira_project_key or not jira_email or not jira_token:
        raise HTTPException(
            status_code=400,
            detail="Jira settings missing. Provide base_url, project_key, email and token.",
        )

    jira_base_url = _validate_jira_base_url(jira_base_url)
    jira_project_key = _validate_jira_project_key(jira_project_key)

    stmt = select(Task).filter(Task.meeting_id == meeting_id)
    if payload.task_ids:
        stmt = stmt.filter(Task.id.in_(payload.task_ids))
    res = await db.execute(stmt)
    tasks = res.scalars().all()
    if not tasks:
        raise HTTPException(status_code=400, detail="No tasks found to export.")

    created_issues = []
    auth = httpx.BasicAuth(jira_email, jira_token)
    headers = {"Accept": "application/json", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=20.0) as client:
        for task in tasks:
            description_lines = [
                f"Meeting: {meeting.title}",
                f"Priority: {task.priority}",
                f"Owner: {task.owner or 'Unassigned'}",
            ]
            if task.due_date:
                description_lines.append(f"Due Date: {task.due_date.date().isoformat()}")
            if task.subtitle_reference:
                description_lines.append(f"Source: {task.subtitle_reference}")
            description_lines.append("Auto-generated by AI Meeting Intelligence System")

            issue_payload = {
                "fields": {
                    "project": {"key": jira_project_key},
                    "summary": f"[Meeting Task] {task.title}"[:255],
                    "description": _jira_description("\n".join(description_lines)),
                    "issuetype": {"name": issue_type},
                    "labels": ["meeting-task", f"priority-{(task.priority or 'medium').lower()}"],
                }
            }
            if task.due_date:
                issue_payload["fields"]["duedate"] = task.due_date.date().isoformat()

            try:
                resp = await client.post(
                    f"{jira_base_url}/rest/api/3/issue",
                    headers=headers,
                    auth=auth,
                    json=issue_payload,
                )
                if resp.status_code in (200, 201):
                    issue = resp.json()
                    issue_key = issue.get("key")
                    created_issues.append({
                        "task_id": task.id,
                        "issue_key": issue_key,
                        "url": f"{jira_base_url}/browse/{issue_key}" if issue_key else None,
                    })
                    logger.info("Created Jira issue %s for task %d", issue_key, task.id)
                else:
                    created_issues.append({
                        "task_id": task.id,
                        "error": f"Jira API returned {resp.status_code}",
                    })
                    logger.error("Jira issue creation failed: %s %s", resp.status_code, resp.text[:200])
            except Exception as exc:
                created_issues.append({"task_id": task.id, "error": str(exc)})
                logger.error("Jira API error: %s", exc)

    successful = len([i for i in created_issues if i.get("issue_key")])
    return {
        "exported": successful,
        "total": len(tasks),
        "issues": created_issues,
    }
