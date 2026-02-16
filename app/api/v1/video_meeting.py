"""
Video Meeting – WebRTC Signaling Server (Full-Featured)
========================================================
Zoom-like WebSocket signaling with waiting room, host controls,
whiteboard, polls, breakout rooms, raise hand, and more.
"""
import logging
import uuid
import json
from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)
router = APIRouter(tags=["video-meeting"])


# ── Data Models ────────────────────────────────────────────────────────────
class Participant:
    def __init__(self, ws: WebSocket, user_id: str, display_name: str):
        self.ws = ws
        self.user_id = user_id
        self.display_name = display_name
        self.video_on = True
        self.audio_on = True
        self.screen_sharing = False
        self.hand_raised = False
        self.bg_blurred = False
        self.joined_at = datetime.utcnow().isoformat()
        self.breakout_room: Optional[str] = None

    def to_dict(self, host_id: str) -> dict:
        return {
            "user_id": self.user_id,
            "display_name": self.display_name,
            "video_on": self.video_on,
            "audio_on": self.audio_on,
            "screen_sharing": self.screen_sharing,
            "hand_raised": self.hand_raised,
            "bg_blurred": self.bg_blurred,
            "is_host": self.user_id == host_id,
            "joined_at": self.joined_at,
            "breakout_room": self.breakout_room,
        }


class Poll:
    def __init__(self, poll_id: str, question: str, options: list, creator: str):
        self.poll_id = poll_id
        self.question = question
        self.options = options
        self.creator = creator
        self.votes: Dict[str, int] = {}  # user_id -> option_index
        self.active = True
        self.created_at = datetime.utcnow().isoformat()

    def to_dict(self) -> dict:
        vote_counts = [0] * len(self.options)
        for idx in self.votes.values():
            if 0 <= idx < len(self.options):
                vote_counts[idx] += 1
        return {
            "poll_id": self.poll_id,
            "question": self.question,
            "options": self.options,
            "vote_counts": vote_counts,
            "total_votes": len(self.votes),
            "active": self.active,
            "creator": self.creator,
            "created_at": self.created_at,
        }


class Room:
    def __init__(self, room_id: str, host_id: str, title: str = "Video Meeting"):
        self.room_id = room_id
        self.host_id = host_id
        self.title = title
        self.participants: Dict[str, Participant] = {}
        self.waiting_room: Dict[str, Participant] = {}
        self.chat_history: list = []
        self.whiteboard_strokes: list = []
        self.polls: Dict[str, Poll] = {}
        self.breakout_rooms: Dict[str, list] = {}  # room_name -> [user_ids]
        self.locked = False
        self.waiting_room_enabled = False
        self.recording = False
        self.created_at = datetime.utcnow().isoformat()

    def get_participant_list(self):
        return [p.to_dict(self.host_id) for p in self.participants.values()]

    def get_waiting_list(self):
        return [{"user_id": p.user_id, "display_name": p.display_name}
                for p in self.waiting_room.values()]

    def get_settings(self):
        return {
            "locked": self.locked,
            "waiting_room_enabled": self.waiting_room_enabled,
            "recording": self.recording,
            "host_id": self.host_id,
        }

    async def broadcast(self, message: dict, exclude: str = None):
        dead = []
        for uid, p in self.participants.items():
            if uid == exclude:
                continue
            try:
                if p.ws.client_state == WebSocketState.CONNECTED:
                    await p.ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.participants.pop(uid, None)

    async def send_to(self, target_id: str, message: dict):
        # Check both participants and waiting room
        p = self.participants.get(target_id) or self.waiting_room.get(target_id)
        if p:
            try:
                if p.ws.client_state == WebSocketState.CONNECTED:
                    await p.ws.send_json(message)
            except Exception:
                self.participants.pop(target_id, None)
                self.waiting_room.pop(target_id, None)


# ── Global State ───────────────────────────────────────────────────────────
rooms: Dict[str, Room] = {}


# ── REST Endpoints ─────────────────────────────────────────────────────────
@router.post("/video-meeting/create")
async def create_room(title: str = "Video Meeting"):
    room_id = str(uuid.uuid4())[:8]
    return {
        "room_id": room_id,
        "title": title,
        "join_url": f"/video-meeting/{room_id}",
        "created_at": datetime.utcnow().isoformat(),
    }


@router.get("/video-meeting/{room_id}/info")
async def room_info(room_id: str):
    room = rooms.get(room_id)
    if not room:
        return {"exists": False, "room_id": room_id, "participants": 0}
    return {
        "exists": True,
        "room_id": room_id,
        "title": room.title,
        "participants": len(room.participants),
        "participant_list": room.get_participant_list(),
        "waiting": len(room.waiting_room),
        "locked": room.locked,
        "created_at": room.created_at,
    }


# ── WebSocket Signaling ───────────────────────────────────────────────────
@router.websocket("/ws/video-meeting/{room_id}")
async def video_meeting_ws(
    websocket: WebSocket,
    room_id: str,
    user_id: str = Query(default=None),
    display_name: str = Query(default="Guest"),
):
    await websocket.accept()
    if not user_id:
        user_id = str(uuid.uuid4())[:12]

    # Create room if needed
    is_creator = room_id not in rooms
    if is_creator:
        rooms[room_id] = Room(room_id, host_id=user_id)
        logger.info(f"Room {room_id} created by {display_name}")

    room = rooms[room_id]
    participant = Participant(websocket, user_id, display_name)

    # ── Check locked / waiting room ────────────────────
    if room.locked and user_id != room.host_id:
        await websocket.send_json({"type": "meeting-locked"})
        await websocket.close()
        return

    if room.waiting_room_enabled and user_id != room.host_id:
        room.waiting_room[user_id] = participant
        await websocket.send_json({
            "type": "waiting-room",
            "message": "Please wait for the host to let you in.",
        })
        # Notify host
        await room.send_to(room.host_id, {
            "type": "waiting-room-update",
            "waiting_list": room.get_waiting_list(),
        })
        # Wait for admission or rejection
        try:
            while True:
                raw = await websocket.receive_text()
                data = json.loads(raw)
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
        except (WebSocketDisconnect, Exception):
            room.waiting_room.pop(user_id, None)
            await room.send_to(room.host_id, {
                "type": "waiting-room-update",
                "waiting_list": room.get_waiting_list(),
            })
            return

    # ── Add to room ────────────────────────────────────
    room.participants[user_id] = participant
    logger.info(f"{display_name} ({user_id}) joined room {room_id}. "
                f"Total: {len(room.participants)}")

    try:
        # Notify the joiner
        await websocket.send_json({
            "type": "room-joined",
            "user_id": user_id,
            "room_id": room_id,
            "title": room.title,
            "participants": room.get_participant_list(),
            "chat_history": room.chat_history[-100:],
            "whiteboard_strokes": room.whiteboard_strokes,
            "polls": {pid: p.to_dict() for pid, p in room.polls.items()},
            "settings": room.get_settings(),
            "is_host": user_id == room.host_id,
        })

        # Notify others
        await room.broadcast({
            "type": "user-joined",
            "user_id": user_id,
            "display_name": display_name,
            "participants": room.get_participant_list(),
        }, exclude=user_id)

        # ── Message Loop ──────────────────────────────────
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            # ── WebRTC Signaling ──────────────────────────
            if msg_type == "offer":
                await room.send_to(data["target"], {
                    "type": "offer", "offer": data["offer"],
                    "from_user": user_id, "display_name": display_name,
                })

            elif msg_type == "answer":
                await room.send_to(data["target"], {
                    "type": "answer", "answer": data["answer"],
                    "from_user": user_id,
                })

            elif msg_type == "ice-candidate":
                await room.send_to(data["target"], {
                    "type": "ice-candidate", "candidate": data["candidate"],
                    "from_user": user_id,
                })

            # ── Chat ──────────────────────────────────────
            elif msg_type == "chat":
                chat_msg = {
                    "type": "chat",
                    "user_id": user_id,
                    "display_name": display_name,
                    "message": data.get("message", ""),
                    "timestamp": datetime.utcnow().isoformat(),
                    "is_file": data.get("is_file", False),
                    "file_name": data.get("file_name"),
                    "file_url": data.get("file_url"),
                }
                room.chat_history.append(chat_msg)
                await room.broadcast(chat_msg)

            # ── Media State ───────────────────────────────
            elif msg_type == "media-state":
                p = room.participants.get(user_id)
                if p:
                    if "video" in data: p.video_on = data["video"]
                    if "audio" in data: p.audio_on = data["audio"]
                    if "screen" in data: p.screen_sharing = data["screen"]
                    if "bg_blur" in data: p.bg_blurred = data["bg_blur"]
                await room.broadcast({
                    "type": "media-state",
                    "user_id": user_id,
                    **{k: data[k] for k in ("video", "audio", "screen", "bg_blur") if k in data},
                }, exclude=user_id)

            # ── Raise / Lower Hand ────────────────────────
            elif msg_type == "raise-hand":
                p = room.participants.get(user_id)
                if p:
                    p.hand_raised = data.get("raised", not p.hand_raised)
                    await room.broadcast({
                        "type": "hand-raised",
                        "user_id": user_id,
                        "display_name": display_name,
                        "raised": p.hand_raised,
                        "participants": room.get_participant_list(),
                    })

            # ── Reactions ─────────────────────────────────
            elif msg_type == "reaction":
                await room.broadcast({
                    "type": "reaction",
                    "user_id": user_id,
                    "display_name": display_name,
                    "emoji": data.get("emoji", "👍"),
                })

            # ── Host Controls ─────────────────────────────
            elif msg_type == "host-action" and user_id == room.host_id:
                action = data.get("action")

                if action == "mute-all":
                    for p in room.participants.values():
                        if p.user_id != room.host_id:
                            p.audio_on = False
                    await room.broadcast({
                        "type": "host-mute-all",
                        "participants": room.get_participant_list(),
                    })

                elif action == "mute-user":
                    target = data.get("target_user")
                    p = room.participants.get(target)
                    if p:
                        p.audio_on = False
                        await room.send_to(target, {
                            "type": "force-mute",
                            "message": "The host has muted you.",
                        })
                        await room.broadcast({
                            "type": "media-state",
                            "user_id": target,
                            "audio": False,
                        })

                elif action == "remove-user":
                    target = data.get("target_user")
                    tp = room.participants.get(target)
                    if tp:
                        await room.send_to(target, {
                            "type": "removed",
                            "message": "You have been removed from the meeting.",
                        })
                        try:
                            await tp.ws.close()
                        except Exception:
                            pass
                        room.participants.pop(target, None)
                        await room.broadcast({
                            "type": "user-left",
                            "user_id": target,
                            "display_name": tp.display_name,
                            "participants": room.get_participant_list(),
                        })

                elif action == "lock-meeting":
                    room.locked = data.get("locked", not room.locked)
                    await room.broadcast({
                        "type": "settings-update",
                        "settings": room.get_settings(),
                    })

                elif action == "toggle-waiting-room":
                    room.waiting_room_enabled = data.get(
                        "enabled", not room.waiting_room_enabled
                    )
                    await room.broadcast({
                        "type": "settings-update",
                        "settings": room.get_settings(),
                    })

                elif action == "admit-user":
                    target = data.get("target_user")
                    wp = room.waiting_room.pop(target, None)
                    if wp:
                        room.participants[target] = wp
                        await room.send_to(target, {
                            "type": "admitted",
                            "room_id": room_id,
                            "participants": room.get_participant_list(),
                            "chat_history": room.chat_history[-100:],
                            "whiteboard_strokes": room.whiteboard_strokes,
                            "polls": {pid: p.to_dict() for pid, p in room.polls.items()},
                            "settings": room.get_settings(),
                            "is_host": False,
                        })
                        await room.broadcast({
                            "type": "user-joined",
                            "user_id": target,
                            "display_name": wp.display_name,
                            "participants": room.get_participant_list(),
                        }, exclude=target)

                elif action == "reject-user":
                    target = data.get("target_user")
                    wp = room.waiting_room.pop(target, None)
                    if wp:
                        await room.send_to(target, {
                            "type": "rejected",
                            "message": "The host has denied your request to join.",
                        })
                        try:
                            await wp.ws.close()
                        except Exception:
                            pass

                elif action == "lower-all-hands":
                    for p in room.participants.values():
                        p.hand_raised = False
                    await room.broadcast({
                        "type": "all-hands-lowered",
                        "participants": room.get_participant_list(),
                    })

                elif action == "toggle-recording":
                    room.recording = data.get("recording", not room.recording)
                    await room.broadcast({
                        "type": "recording-state",
                        "recording": room.recording,
                    })

                elif action == "end-meeting":
                    await room.broadcast({
                        "type": "meeting-ended",
                        "message": "The host has ended the meeting.",
                    })
                    # Close all connections
                    for p in list(room.participants.values()):
                        try:
                            await p.ws.close()
                        except Exception:
                            pass
                    rooms.pop(room_id, None)
                    return

                # Notify host of updated waiting list
                await room.send_to(room.host_id, {
                    "type": "waiting-room-update",
                    "waiting_list": room.get_waiting_list(),
                })

            # ── Whiteboard ────────────────────────────────
            elif msg_type == "whiteboard-stroke":
                stroke = {
                    "user_id": user_id,
                    "points": data.get("points", []),
                    "color": data.get("color", "#ffffff"),
                    "width": data.get("width", 2),
                    "tool": data.get("tool", "pen"),
                }
                room.whiteboard_strokes.append(stroke)
                await room.broadcast({
                    "type": "whiteboard-stroke",
                    **stroke,
                }, exclude=user_id)

            elif msg_type == "whiteboard-clear":
                room.whiteboard_strokes.clear()
                await room.broadcast({"type": "whiteboard-clear"})

            # ── Polls ─────────────────────────────────────
            elif msg_type == "create-poll":
                poll_id = str(uuid.uuid4())[:8]
                poll = Poll(
                    poll_id=poll_id,
                    question=data.get("question", ""),
                    options=data.get("options", []),
                    creator=user_id,
                )
                room.polls[poll_id] = poll
                await room.broadcast({
                    "type": "poll-created",
                    "poll": poll.to_dict(),
                })

            elif msg_type == "vote-poll":
                poll = room.polls.get(data.get("poll_id"))
                if poll and poll.active:
                    poll.votes[user_id] = data.get("option_index", 0)
                    await room.broadcast({
                        "type": "poll-updated",
                        "poll": poll.to_dict(),
                    })

            elif msg_type == "end-poll":
                poll = room.polls.get(data.get("poll_id"))
                if poll and (user_id == room.host_id or user_id == poll.creator):
                    poll.active = False
                    await room.broadcast({
                        "type": "poll-ended",
                        "poll": poll.to_dict(),
                    })

            # ── Breakout Rooms ────────────────────────────
            elif msg_type == "create-breakout" and user_id == room.host_id:
                br_rooms = data.get("rooms", [])
                room.breakout_rooms = {}
                for br in br_rooms:
                    name = br.get("name", f"Room {len(room.breakout_rooms)+1}")
                    members = br.get("members", [])
                    room.breakout_rooms[name] = members
                    for mid in members:
                        p = room.participants.get(mid)
                        if p:
                            p.breakout_room = name
                await room.broadcast({
                    "type": "breakout-update",
                    "breakout_rooms": room.breakout_rooms,
                    "participants": room.get_participant_list(),
                })

            elif msg_type == "close-breakout" and user_id == room.host_id:
                room.breakout_rooms = {}
                for p in room.participants.values():
                    p.breakout_room = None
                await room.broadcast({
                    "type": "breakout-closed",
                    "participants": room.get_participant_list(),
                })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"{display_name} ({user_id}) disconnected from {room_id}")
    except Exception as e:
        logger.error(f"WS error in {room_id}: {e}")
    finally:
        room.participants.pop(user_id, None)

        if user_id == room.host_id and room.participants:
            # Transfer host to next participant
            new_host = next(iter(room.participants))
            room.host_id = new_host
            await room.broadcast({
                "type": "host-changed",
                "new_host": new_host,
                "display_name": room.participants[new_host].display_name,
                "participants": room.get_participant_list(),
                "settings": room.get_settings(),
            })

        await room.broadcast({
            "type": "user-left",
            "user_id": user_id,
            "display_name": display_name,
            "participants": room.get_participant_list(),
        })

        if not room.participants:
            rooms.pop(room_id, None)
            logger.info(f"Room {room_id} destroyed")
