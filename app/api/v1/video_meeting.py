"""
Video Meeting API — Room Management, Signaling, and Transcript
"""
import asyncio
import hashlib
import random
import string
from datetime import datetime
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.meeting import Meeting
from app.models.subtitle import Subtitle
import uuid
import logging
import json

router = APIRouter(prefix="/video-meeting", tags=["video-meeting"])
logger = logging.getLogger("meetingai.video")


# ── Helpers ───────────────────────────────────────────────
def _generate_meeting_code() -> str:
    """Generate a human-readable meeting code like 'abc-defg-hij'."""
    chars = string.ascii_lowercase
    p1 = ''.join(random.choices(chars, k=3))
    p2 = ''.join(random.choices(chars, k=4))
    p3 = ''.join(random.choices(chars, k=3))
    return f"{p1}-{p2}-{p3}"


def _generate_password() -> str:
    """Generate a 6-digit numeric password."""
    return ''.join(random.choices(string.digits, k=6))


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


# In-memory store for active video rooms
# meeting_code -> room info dict
video_rooms = {}
# room_id -> meeting_code  (reverse map for WebSocket compatibility)
room_id_to_code = {}


# ── Schemas ───────────────────────────────────────────────
class CreateRoomResponse(BaseModel):
    room_id: str
    meeting_code: str
    password: str
    join_link: str
    title: str


class JoinRequest(BaseModel):
    meeting_code: str = Field(min_length=5, max_length=20)
    password: str = Field(min_length=1, max_length=20)


class JoinResponse(BaseModel):
    room_id: str
    meeting_code: str
    title: str
    host_name: str
    participant_count: int


class RoomInfoResponse(BaseModel):
    room_id: str
    meeting_code: str
    title: str
    host_name: str
    password: str | None = None
    join_link: str
    active_participants: int
    created_at: str


class TranscriptEntry(BaseModel):
    speaker: str = "Unknown"
    text: str
    start_time: float = 0.0
    end_time: float = 0.0
    confidence: float = 1.0


class SaveTranscriptRequest(BaseModel):
    title: str = Field(default="Video Meeting", max_length=255)
    transcript: list[TranscriptEntry] = []
    auto_analyze: bool = False


class SaveTranscriptResponse(BaseModel):
    meeting_id: int
    subtitle_count: int
    analysis_status: str


# ── Create Room ──────────────────────────────────────────
@router.post("/create", response_model=CreateRoomResponse)
async def create_room(
    title: str = "New Meeting",
    current_user: User = Depends(get_current_user),
):
    room_id = str(uuid.uuid4())[:8]
    meeting_code = _generate_meeting_code()
    password = _generate_password()

    # Store room info
    video_rooms[meeting_code] = {
        "room_id": room_id,
        "meeting_code": meeting_code,
        "title": title,
        "password_hash": _hash_password(password),
        "password_plain": password,  # stored for host to view
        "host_user_id": current_user.id,
        "host_name": current_user.full_name or current_user.email,
        "participants": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    room_id_to_code[room_id] = meeting_code

    logger.info(
        "Created room %s (code: %s) for %s", room_id, meeting_code, current_user.email
    )

    return CreateRoomResponse(
        room_id=room_id,
        meeting_code=meeting_code,
        password=password,
        join_link=f"/video-meeting/{room_id}",
        title=title,
    )


# ── Join Room (validate code + password) ─────────────────
@router.post("/join", response_model=JoinResponse)
async def join_room(
    payload: JoinRequest,
    current_user: User = Depends(get_current_user),
):
    # Normalize the code (lowercase, strip whitespace)
    code = payload.meeting_code.strip().lower()

    room = video_rooms.get(code)
    if not room:
        raise HTTPException(status_code=404, detail="Meeting not found. Please check the meeting code.")

    # Validate password
    if _hash_password(payload.password) != room["password_hash"]:
        raise HTTPException(status_code=403, detail="Incorrect password.")

    return JoinResponse(
        room_id=room["room_id"],
        meeting_code=code,
        title=room["title"],
        host_name=room["host_name"],
        participant_count=len(room["participants"]),
    )


# ── Get Room Info ────────────────────────────────────────
@router.get("/{room_id}/info", response_model=RoomInfoResponse)
async def get_room_info(
    room_id: str,
    current_user: User = Depends(get_current_user),
):
    code = room_id_to_code.get(room_id)
    room = video_rooms.get(code) if code else None

    if not room:
        # Room might not exist yet (joining via link), return default
        return RoomInfoResponse(
            room_id=room_id,
            meeting_code="",
            title="Meeting",
            host_name="",
            join_link=f"/video-meeting/{room_id}",
            active_participants=0,
            created_at=datetime.utcnow().isoformat(),
        )

    # Only show password to the host
    show_password = None
    if room["host_user_id"] == current_user.id:
        show_password = room["password_plain"]

    return RoomInfoResponse(
        room_id=room_id,
        meeting_code=room["meeting_code"],
        title=room["title"],
        host_name=room["host_name"],
        password=show_password,
        join_link=f"/video-meeting/{room_id}",
        active_participants=len(room["participants"]),
        created_at=room["created_at"],
    )


# ── Save Transcript & Analyze ────────────────────────────
@router.post("/{room_id}/save-transcript", response_model=SaveTranscriptResponse)
async def save_transcript(
    room_id: str,
    payload: SaveTranscriptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save video meeting captions as a transcript (Meeting + Subtitles),
    and optionally trigger the AI analysis pipeline.
    """
    if not payload.transcript:
        raise HTTPException(status_code=400, detail="No transcript data to save")

    # Use room title if available
    code = room_id_to_code.get(room_id)
    room = video_rooms.get(code) if code else None
    title = payload.title or (room["title"] if room else f"Video Meeting ({room_id})")

    # 1. Create a Meeting record
    meeting = Meeting(
        user_id=current_user.id,
        title=title,
        consent_given=True,
        created_at=datetime.utcnow(),
        ended_at=datetime.utcnow(),
    )
    db.add(meeting)
    await db.flush()

    # 2. Save each caption as a Subtitle row
    speaker_map = {}
    speaker_counter = 0
    subtitles_added = 0

    for entry in payload.transcript:
        if entry.speaker not in speaker_map:
            speaker_map[entry.speaker] = f"speaker_{speaker_counter}"
            speaker_counter += 1

        sub = Subtitle(
            meeting_id=meeting.id,
            speaker_id=speaker_map[entry.speaker],
            speaker_name=entry.speaker,
            text=entry.text,
            start_time=entry.start_time,
            end_time=entry.end_time or entry.start_time + 5.0,
            confidence=entry.confidence,
        )
        db.add(sub)
        subtitles_added += 1

    await db.commit()
    await db.refresh(meeting)

    logger.info(
        "Saved transcript for room %s → meeting %d with %d subtitles",
        room_id, meeting.id, subtitles_added,
    )

    # 3. Optionally trigger AI analysis
    analysis_status = "saved"
    if payload.auto_analyze:
        try:
            from app.ai.orchestrator import AIAgentOrchestrator
            orchestrator = AIAgentOrchestrator(db, meeting.id)
            await orchestrator.run_pipeline()
            analysis_status = "analyzed"
            logger.info("AI analysis complete for meeting %d", meeting.id)
        except Exception as e:
            logger.error("AI analysis failed for meeting %d: %s", meeting.id, e, exc_info=True)
            analysis_status = "analysis_failed"

    return SaveTranscriptResponse(
        meeting_id=meeting.id,
        subtitle_count=subtitles_added,
        analysis_status=analysis_status,
    )


# ── WebSocket Signaling ──────────────────────────────────
@router.websocket("/ws/{room_id}")
async def video_meeting_websocket(
    websocket: WebSocket, room_id: str, user_id: int, display_name: str
):
    await websocket.accept()

    # Find room by room_id
    code = room_id_to_code.get(room_id)
    room = video_rooms.get(code) if code else None

    # If no room exists yet, create a minimal room entry
    if not room:
        if not code:
            code = room_id  # use room_id as code fallback
            room_id_to_code[room_id] = code
        video_rooms[code] = {
            "room_id": room_id,
            "meeting_code": code,
            "title": "Meeting",
            "password_hash": "",
            "password_plain": "",
            "host_user_id": user_id,
            "host_name": display_name,
            "participants": [],
            "created_at": datetime.utcnow().isoformat(),
        }
        room = video_rooms[code]

    participant = {"ws": websocket, "user_id": user_id, "display_name": display_name}
    room["participants"].append(participant)

    try:
        # Notify others
        await broadcast(code, {
            "type": "user-joined",
            "user_id": user_id,
            "display_name": display_name,
            "participants": [
                {"user_id": p["user_id"], "display_name": p["display_name"]}
                for p in room["participants"]
            ],
        }, exclude=websocket)

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "signal":
                target_id = data.get("target")
                payload = data.get("payload")
                target_ws = next(
                    (p["ws"] for p in room["participants"] if p["user_id"] == target_id),
                    None,
                )
                if target_ws:
                    await target_ws.send_json({
                        "type": "signal",
                        "sender": user_id,
                        "payload": payload,
                    })

            elif msg_type == "chat":
                await broadcast(code, {
                    "type": "chat",
                    "sender": display_name,
                    "sender_name": display_name,
                    "text": data.get("text"),
                })

            elif msg_type == "reaction":
                await broadcast(code, {
                    "type": "reaction",
                    "emoji": data.get("emoji"),
                    "sender_name": display_name,
                }, exclude=websocket)

            elif msg_type == "hand-raise":
                await broadcast(code, {
                    "type": "hand-raise",
                    "user_id": user_id,
                    "sender_name": display_name,
                    "raised": data.get("raised", False),
                }, exclude=websocket)

            elif msg_type == "poll":
                await broadcast(code, {
                    "type": "poll",
                    "poll": data.get("poll"),
                }, exclude=websocket)

            elif msg_type == "poll-vote":
                await broadcast(code, {
                    "type": "poll-vote",
                    "pollId": data.get("pollId"),
                    "option": data.get("option"),
                }, exclude=websocket)

            elif msg_type == "WHITEBOARD" or msg_type == "whiteboard":
                await broadcast(code, data, exclude=websocket)

            elif msg_type == "kick":
                # Host is kicking a participant — send KICKED event to that user
                target_user_id = data.get("target_user_id")
                if target_user_id is not None:
                    # Find the target's websocket and send kick
                    for prt in room.get("participants", []):
                        if str(prt.get("user_id")) == str(target_user_id):
                            target_ws = prt.get("ws")
                            if target_ws:
                                try:
                                    await target_ws.send_json({
                                        "type": "KICKED",
                                        "reason": "Host removed you from the meeting",
                                        "target_user_id": target_user_id,
                                    })
                                except Exception:
                                    pass
                            break
                    logger.info(f"User {display_name} kicked user {target_user_id} from room {code}")

    except WebSocketDisconnect:
        try:
            if participant in room["participants"]:
                room["participants"].remove(participant)
        except (ValueError, KeyError):
            pass
        if room.get("participants"):
            await broadcast(code, {
                "type": "user-left",
                "user_id": user_id,
                "display_name": display_name,
            })
    except asyncio.CancelledError:
        # Graceful shutdown — don't let this crash the server
        try:
            if participant in room["participants"]:
                room["participants"].remove(participant)
        except (ValueError, KeyError):
            pass
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        try:
            if participant in room["participants"]:
                room["participants"].remove(participant)
        except (ValueError, KeyError):
            pass


async def broadcast(code: str, message: dict, exclude: WebSocket = None):
    room = video_rooms.get(code)
    if not room:
        return
    dead = []
    for p in room["participants"]:
        if p["ws"] != exclude:
            try:
                await p["ws"].send_json(message)
            except Exception:
                dead.append(p)
    # Clean up disconnected participants
    for p in dead:
        try:
            room["participants"].remove(p)
        except ValueError:
            pass
