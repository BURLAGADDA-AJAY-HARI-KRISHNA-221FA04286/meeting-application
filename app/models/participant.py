from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base

class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True) # Participant might not be a registered user? Spec says `user_id`. I'll assume it's a registered user for now, or null if guest.

    join_time: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    leave_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    total_speaking_time: Mapped[float] = mapped_column(Float, default=0.0)

    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User", back_populates="participations")
