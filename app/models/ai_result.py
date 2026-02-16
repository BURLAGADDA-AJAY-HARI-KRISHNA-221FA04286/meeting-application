from datetime import datetime
from sqlalchemy import JSON, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base

class AIResult(Base):
    __tablename__ = "ai_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), unique=True) # One-to-One
    
    summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    decisions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    actions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    risks_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sentiment_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="ai_result")
