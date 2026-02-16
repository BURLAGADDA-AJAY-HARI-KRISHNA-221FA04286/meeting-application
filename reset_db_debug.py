import traceback
import sys

try:
    from app.db.base import Base
    from app.db.session import engine
    # Trigger imports
    from app.models.user import User
    from app.models.meeting import Meeting
    from app.models.task import Task
    from app.models.participant import Participant
    from app.models.subtitle import Subtitle
    from app.models.ai_result import AIResult

    def reset_database():
        print("Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        print("Creating all tables...")
        Base.metadata.create_all(bind=engine)
        print("Database reset complete.")

    if __name__ == "__main__":
        reset_database()
except Exception:
    with open("error.log", "w") as f:
        traceback.print_exc(file=f)
    sys.exit(1)
