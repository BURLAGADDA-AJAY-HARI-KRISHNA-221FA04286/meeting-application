import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_meeting_health.db")
os.environ.setdefault("ENV", "test")
if os.path.exists("test_meeting_health.db"):
    os.remove("test_meeting_health.db")

from app.main import app
from app.db.base import Base
from app.db.session import engine

Base.metadata.create_all(bind=engine)


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
