import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_meeting_intel.db")
os.environ.setdefault("ENV", "test")
if os.path.exists("test_meeting_intel.db"):
    os.remove("test_meeting_intel.db")

from app.main import app
from app.db.base import Base
from app.db.session import engine

Base.metadata.create_all(bind=engine)


client = TestClient(app)


def test_auth_and_refresh_flow():
    email = "user1@example.com"
    password = "testpassword123"

    register = client.post("/api/v1/register", json={"email": email, "password": password})
    assert register.status_code in (201, 400)

    login = client.post("/api/v1/login", json={"email": email, "password": password})
    assert login.status_code == 200
    body = login.json()
    assert "access_token" in body
    assert "refresh_token" in body

    refresh = client.post("/api/v1/refresh", json={"refresh_token": body["refresh_token"]})
    assert refresh.status_code == 200
    refreshed = refresh.json()
    assert "access_token" in refreshed


def test_meeting_crud_flow():
    email = "user2@example.com"
    password = "testpassword123"
    client.post("/api/v1/register", json={"email": email, "password": password})

    login = client.post("/api/v1/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create = client.post(
        "/api/v1/meetings",
        json={
            "title": "Sprint Planning",
            "transcript": "We decided to ship auth this week. Ajay will handle backend and Sam will do UI.",
        },
        headers=headers,
    )
    assert create.status_code == 201
    meeting_id = create.json()["id"]

    listed = client.get("/api/v1/meetings", headers=headers)
    assert listed.status_code == 200
    assert any(m["id"] == meeting_id for m in listed.json())

    fetched = client.get(f"/api/v1/meetings/{meeting_id}", headers=headers)
    assert fetched.status_code == 200

    deleted = client.delete(f"/api/v1/meetings/{meeting_id}", headers=headers)
    assert deleted.status_code == 204


def test_password_reset_and_logout_revocation_flow():
    email = "reset-user@example.com"
    old_password = "oldpass123"
    new_password = "newpass456"

    reg = client.post("/api/v1/register", json={"email": email, "password": old_password})
    assert reg.status_code in (201, 400)

    forgot = client.post("/api/v1/forgot-password", json={"email": email})
    assert forgot.status_code == 200
    reset_token = forgot.json().get("reset_token")
    assert reset_token

    reset = client.post("/api/v1/reset-password", json={"token": reset_token, "new_password": new_password})
    assert reset.status_code == 200

    old_login = client.post("/api/v1/login", json={"email": email, "password": old_password})
    assert old_login.status_code == 401

    new_login = client.post("/api/v1/login", json={"email": email, "password": new_password})
    assert new_login.status_code == 200
    tokens = new_login.json()

    logout = client.post(
        "/api/v1/logout",
        json={"refresh_token": tokens["refresh_token"]},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert logout.status_code == 200

    refresh_after_logout = client.post("/api/v1/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_after_logout.status_code == 401


def test_task_due_date_roundtrip():
    email = "tasks-user@example.com"
    password = "taskpass123"
    client.post("/api/v1/register", json={"email": email, "password": password})

    login = client.post("/api/v1/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    meeting = client.post(
        "/api/v1/meetings",
        json={"title": "Task Due Date Meeting", "transcript": "Owner will finish by Friday."},
        headers=headers,
    )
    assert meeting.status_code == 201
    meeting_id = meeting.json()["id"]

    create_task = client.post(
        "/api/v1/tasks",
        json={
            "meeting_id": meeting_id,
            "title": "Prepare release notes",
            "priority": "high",
            "status": "in-progress",
            "due_date": "2030-01-31T00:00:00",
        },
        headers=headers,
    )
    assert create_task.status_code == 200
    task = create_task.json()
    assert task["due_date"].startswith("2030-01-31")

    listed = client.get("/api/v1/tasks", headers=headers)
    assert listed.status_code == 200
    matching = [t for t in listed.json() if t["id"] == task["id"]]
    assert matching
    assert matching[0]["status"] == "in-progress"
