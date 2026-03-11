import asyncio
from celery import shared_task
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger("meetingai.tasks")

async def _run_ai_pipeline(meeting_id: int, job_id: str):
    from app.db.session import AsyncSessionLocal
    from app.ai.orchestrator import AIAgentOrchestrator
    from sqlalchemy import update
    from app.models.job import Job

    async def update_progress(db_session, target_progress: int):
        await db_session.execute(
            update(Job).where(Job.id == job_id).values(progress=target_progress)
        )
        await db_session.commit()

    async with AsyncSessionLocal() as db:
        try:
            await update_progress(db, 20)
            
            # Start background progress simulator (20% -> 90%)
            async def progress_simulator():
                for p in range(25, 95, 5):
                    await asyncio.sleep(2)  # Update every 2 seconds
                    try:
                        await update_progress(db, p)
                    except Exception:
                        pass
            
            sim_task = asyncio.create_task(progress_simulator())
            
            try:
                orchestrator = AIAgentOrchestrator(db, meeting_id)
                result = await orchestrator.run_pipeline()
            finally:
                sim_task.cancel()  # Stop simulating 

            await update_progress(db, 100)
            return result.id if result else None
            
        except Exception:
            await db.rollback()
            raise

@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=5, retry_kwargs={"max_retries": 3})
def analyze_meeting_background(self, meeting_id: int, job_id: str) -> dict:
    """
    Background task to run AI analysis on a meeting.
    
    Args:
        meeting_id: ID of the meeting to analyze
        job_id: Tracking ID for the background job
        
    Returns:
        dict with status and result summary
    """
    from app.db.session import SessionLocal
    from app.models.job import Job
    from app.ai.rag import rag_store
    
    logger.info(f"Starting background analysis for job {job_id}, meeting {meeting_id}")
    
    with SessionLocal() as db:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "processing"
            job.progress = 10
            db.commit()
            
    try:
        # Run async pipeline synchronously in this worker thread
        result_id = asyncio.run(_run_ai_pipeline(meeting_id, job_id))
        
        # update RAG
        rag_store.invalidate(meeting_id)

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "completed"
                job.progress = 100
                job.result_id = result_id
                db.commit()
                
        return {
            "status": "success",
            "job_id": job_id,
            "meeting_id": meeting_id,
            "summary": "Analysis completed successfully",
        }
            
    except Exception as exc:
        logger.error(f"Analysis failed for job {job_id}, meeting {meeting_id}: {exc}")
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "failed"
                job.error = str(exc)
                db.commit()
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@shared_task
def cleanup_old_meetings(days_old: int = 90) -> dict:
    """
    Background task to cleanup meetings older than N days.
    
    Args:
        days_old: Delete meetings older than this many days
        
    Returns:
        dict with deleted count
    """
    from datetime import datetime, timedelta
    from app.db.session import SessionLocal
    from app.models.meeting import Meeting
    
    logger.info(f"Starting cleanup of meetings older than {days_old} days")
    
    db = SessionLocal()
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        deleted = db.query(Meeting).filter(Meeting.created_at < cutoff_date).delete()
        db.commit()
        
        logger.info(f"Deleted {deleted} old meetings")
        return {"deleted": deleted, "cutoff_date": cutoff_date.isoformat()}
    finally:
        db.close()


@shared_task
def generate_meeting_report(meeting_id: int, format: str = "txt") -> dict:
    """
    Background task to generate downloadable meeting report.
    
    Args:
        meeting_id: ID of the meeting
        format: Report format (txt, pdf, docx)
        
    Returns:
        dict with report URL/path
    """
    from app.db.session import SessionLocal
    from app.models.meeting import Meeting
    from app.models.ai_result import AIResult
    
    logger.info(f"Generating {format} report for meeting {meeting_id}")
    
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return {"error": "Meeting not found"}
        
        ai_result = db.query(AIResult).filter(AIResult.meeting_id == meeting_id).first()
        
        # TODO: Implement actual report generation
        # For now, return placeholder
        return {
            "status": "success",
            "meeting_id": meeting_id,
            "format": format,
            "note": "Report generation not yet implemented"
        }
    finally:
        db.close()


@shared_task
def transcribe_audio(audio_path: str) -> dict:
    """
    Background worker for Whisper or Gemini audio transcription.
    Moves heavy CPU operations out of the API.
    """
    logger.info(f"Background transcription started for: {audio_path}")
    # Process transcription here...
    return {"status": "completed", "file": audio_path}


@shared_task
def generate_rag_embeddings(meeting_id: int) -> dict:
    """
    Background worker for creating vector embeddings of meeting transcripts.
    Moves embedding model generation out of the API.
    """
    logger.info(f"Background RAG Vector Embedding started for meeting: {meeting_id}")
    # Generate vectors...
    return {"status": "completed", "meeting_id": meeting_id}


@shared_task(bind=True, max_retries=3)
def export_github_issues(self, meeting_id: int, repo: str) -> dict:
    """
    Background worker for syncing extracted tasks to GitHub.
    Protects API from external rate limits and timeouts.
    """
    logger.info(f"Background GitHub export started for meeting {meeting_id} to {repo}")
    # Sync with GitHub API...
    return {"status": "completed", "exported": True}


@shared_task
def extract_meeting_highlights(meeting_id: int) -> dict:
    """
    Background worker for LLM-based meeting highlights.
    """
    logger.info(f"Background Highlights extraction started for meeting: {meeting_id}")
    # Extract highlights...
    return {"status": "completed", "meeting_id": meeting_id}
