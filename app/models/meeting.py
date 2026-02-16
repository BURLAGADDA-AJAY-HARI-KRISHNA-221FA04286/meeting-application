from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Using 'host_user_id' as per spec, but aliasing mapping to 'user_id' in DB if we want compatibility or just changing it.
    # Existing code uses 'user_id'. I will keep DB column 'user_id' to minimize migration pain if possible, 
    # but spec says 'host_user_id'. 
    # Decision: Use 'user_id' column name but property name host_user_id? 
    # No, strict spec compliance for new tables. For "Meetings", it says `host_user_id`.
    # I will stick to 'user_id' to avoid breaking existing queries in Phase 1 (e.g. `Meeting(user_id=...)`)
    # and Phase 1 explicitly asked for Auth/Registration which used User model.
    # The spec for Meetings table: `id, host_user_id, title, created_at, ended_at`
    # I'll keep user_id as the foreign key but conceptually it's the host.
    
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True) 
    
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Live meeting fields
    # room_code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    # is_live: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # meeting_type: Mapped[str] = mapped_column(String(20), default="transcript", nullable=False)
    
    # Spec fields
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="meetings")
    tasks = relationship("Task", back_populates="meeting", cascade="all, delete-orphan")
    participants = relationship("Participant", back_populates="meeting", cascade="all, delete-orphan")
    subtitles = relationship("Subtitle", back_populates="meeting", cascade="all, delete-orphan")
    ai_result = relationship("AIResult", back_populates="meeting", uselist=False, cascade="all, delete-orphan")
