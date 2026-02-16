from fastapi.testclient import TestClient

from app.main import app


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
