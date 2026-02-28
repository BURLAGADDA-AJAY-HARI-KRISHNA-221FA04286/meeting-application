"""
Video Meeting API — Room Management, Signaling, and Transcript
"""
import asyncio
import secrets
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
from app.core.security import hash_password, verify_password, decode_token, sanitize_input
from app.core.token_revocation import is_jti_revoked

router = APIRouter(prefix="/video-meeting", tags=["video-meeting"])
logger = logging.getLogger("meetingai.video")


# ── Helpers ───────────────────────────────────────────────
def _generate_meeting_code() -> str:
    """Generate a human-readable meeting code like 'abc-defg-hij'."""
    chars = string.ascii_lowercase
    p1 = ''.join(secrets.choice(chars) for _ in range(3))
    p2 = ''.join(secrets.choice(chars) for _ in range(4))
    p3 = ''.join(secrets.choice(chars) for _ in range(3))
    return f"{p1}-{p2}-{p3}"


def _generate_password() -> str:
    """Generate a 6-digit numeric password."""
    return ''.join(secrets.choice(string.digits) for _ in range(6))


def _hash_password(password: str) -> str:
    return hash_password(password)


# In-memory store for active video rooms
# meeting_code -> room info dict
video_rooms: dict = {}
# room_id -> meeting_code  (reverse map for WebSocket compatibility)
room_id_to_code: dict = {}
# Per-room asyncio lock to prevent race conditions with concurrent joins
_room_locks: dict = {}


def _get_room_lock(code: str) -> asyncio.Lock:
    """Get or create a per-room lock. Prevents concurrent join race conditions."""
    if code not in _room_locks:
        _room_locks[code] = asyncio.Lock()
    return _room_locks[code]


def _cleanup_empty_rooms() -> None:
    """Remove rooms with no participants to prevent memory leaks."""
    empty = [
        code for code, room in video_rooms.items()
        if not room.get("participants")
    ]
    for code in empty:
        video_rooms.pop(code, None)
        _room_locks.pop(code, None)
        # Also clean reverse map
        rid = video_rooms.get(code, {}).get("room_id")
        if rid:
            room_id_to_code.pop(rid, None)


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
        join_link=f"/meetings/room/{room_id}",
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
    if not verify_password(payload.password, room["password_hash"]):
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
            join_link=f"/meetings/room/{room_id}",
            active_participants=0,
            created_at=datetime.utcnow().isoformat(),
        )

    return RoomInfoResponse(
        room_id=room_id,
        meeting_code=room["meeting_code"],
        title=room["title"],
        host_name=room["host_name"],
        join_link=f"/meetings/room/{room_id}",
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
    websocket: WebSocket,
    room_id: str,
    db: AsyncSession = Depends(get_db),
):
    token = websocket.query_params.get("token")
    display_name = sanitize_input(websocket.query_params.get("display_name", ""))

    if not token:
        protocol_header = websocket.headers.get("sec-websocket-protocol", "")
        protocols = [v.strip() for v in protocol_header.split(",") if v.strip()]
        # Expected protocols: ["bearer", "<jwt>"]
        if len(protocols) >= 2 and protocols[0].lower() == "bearer":
            token = protocols[1]

    try:
        if not token:
            await websocket.close(code=1008)
            return

        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        if await is_jti_revoked(db, payload.get("jti")):
            raise ValueError("Token has been revoked")
        user_id = int(payload.get("sub"))
    except Exception:
        await websocket.close(code=1008)
        return

    if not display_name:
        display_name = f"User {user_id}"

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
            "host_user_id": user_id,
            "host_name": display_name,
            "participants": [],
            "created_at": datetime.utcnow().isoformat(),
        }
        room = video_rooms[code]

    async with _get_room_lock(code):
        participant = {"ws": websocket, "user_id": user_id, "display_name": display_name}
        room["participants"].append(participant)

    # Snapshot existing participants BEFORE adding self, for room-state
    existing_participants = [
        {"user_id": p["user_id"], "display_name": p["display_name"]}
        for p in room["participants"] if p["user_id"] != user_id
    ]

    try:
        # Notify others that someone joined
        await broadcast(code, {
            "type": "user-joined",
            "user_id": user_id,
            "display_name": display_name,
        }, exclude=websocket)

        # Send current room state to the new joiner (so they can dial everyone)
        await websocket.send_json({
            "type": "room-state",
            "participants": existing_participants,
        })

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

            elif msg_type == "private-chat":
                # Route message to a specific participant only
                target_user_id = data.get("target_user_id")
                if target_user_id is not None:
                    for prt in room.get("participants", []):
                        if str(prt.get("user_id")) == str(target_user_id):
                            target_ws = prt.get("ws")
                            if target_ws:
                                try:
                                    await target_ws.send_json({
                                        "type": "private-chat",
                                        "sender_id": user_id,
                                        "sender_name": display_name,
                                        "text": data.get("text", ""),
                                    })
                                except Exception:
                                    pass
                            break

            elif msg_type == "admin-setting":
                # Broadcast admin setting change to all participants
                # Include target_user_id so mute-participant works client-side
                await broadcast(code, {
                    "type": "admin-setting",
                    "setting": data.get("setting"),
                    "enabled": data.get("enabled"),
                    "target_user_id": data.get("target_user_id"),
                    "admin_name": display_name,
                })

            elif msg_type == "shared-notes":
                # Relay shared notes to all participants
                await broadcast(code, {
                    "type": "shared-notes",
                    "text": data.get("text", ""),
                    "sender_name": display_name,
                }, exclude=websocket)

    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception as e:
        logger.error("WebSocket Error: %s", e, exc_info=True)
    finally:
        # Guaranteed cleanup on any exit — disconnect, error, or shutdown
        async with _get_room_lock(code):
            try:
                room["participants"].remove(participant)
            except (ValueError, KeyError):
                pass
        # Notify remaining participants the user left
        if room.get("participants"):
            await broadcast(code, {
                "type": "user-left",
                "user_id": user_id,
                "display_name": display_name,
            })
        # Clean up empty rooms to prevent memory leaks
        _cleanup_empty_rooms()


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
