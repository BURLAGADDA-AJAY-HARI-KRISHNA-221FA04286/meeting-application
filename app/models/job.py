from sqlalchemy import Column, Integer, String, DateTime, func, JSON
from app.db.base import Base

class Job(Base):
    """
    Background Job Model
    Tracks the status and progress of long-running async tasks like AI analysis.
    """
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True)
    type = Column(String, index=True, nullable=False)  # e.g., 'ai_analysis', 'transcription'
    status = Column(String, index=True, default="pending")  # pending, processing, completed, failed
    progress = Column(Integer, default=0)
    result_id = Column(Integer, nullable=True)  # Associated meeting_id or task_id
    error = Column(String, nullable=True)
    details = Column(JSON, nullable=True)  # Extra context if needed
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
