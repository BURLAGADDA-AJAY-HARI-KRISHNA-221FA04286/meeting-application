from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base

class Subtitle(Base):
    __tablename__ = "subtitles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    speaker_id: Mapped[str] = mapped_column(String, nullable=False) # e.g. "speaker_0"
    speaker_name: Mapped[str] = mapped_column(String, nullable=True) # e.g. "John Doe"
    text: Mapped[str] = mapped_column(String, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="subtitles")
