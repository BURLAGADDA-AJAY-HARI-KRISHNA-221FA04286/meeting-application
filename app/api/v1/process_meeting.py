"""
Live Meeting WebSocket — Real-time audio processing + broadcast
================================================================
Handles:
  - WebSocket authentication via query param token
  - Participant join/leave lifecycle
  - Audio chunk processing (Whisper + Pyannote)
  - Subtitle broadcast to all connected clients
  - Participant count updates
"""
import asyncio
import base64
import json
import logging
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.socket_manager import manager
from app.models.participant import Participant
from app.models.meeting import Meeting
from app.models.subtitle import Subtitle
from app.models.user import User
from app.core.security import decode_token, sanitize_input
from app.core.token_revocation import is_jti_revoked
# Lazy import for speech processor to avoid heavy load at startup
from app.ai.speech_service import get_speech_processor

router = APIRouter()
logger = logging.getLogger("meetingai.ws.meeting")


@router.websocket("/ws/meeting/{meeting_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    meeting_id: int, 
    db: AsyncSession = Depends(get_db)
):
    """WebSocket endpoint for live meeting participation."""

    # ── 1. Authenticate via query param ───────────────
    token = websocket.query_params.get("token")
    if not token:
        protocol_header = websocket.headers.get("sec-websocket-protocol", "")
        protocols = [v.strip() for v in protocol_header.split(",") if v.strip()]
        # Expected protocols: ["bearer", "<jwt>"]
        if len(protocols) >= 2 and protocols[0].lower() == "bearer":
            token = protocols[1]
    user_id = None

    try:
        if not token:
            logger.warning("WebSocket connection attempt without token for meeting %d", meeting_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Decode token (CPU bound, but fast enough)
        payload = decode_token(token)
        if await is_jti_revoked(db, payload.get("jti")):
            raise ValueError("Token has been revoked")
        user_id = int(payload.get("sub"))
        
        if not user_id:
            raise ValueError("No user ID in token")

    except Exception as e:
        logger.error("WebSocket auth failed for meeting %d: %s", meeting_id, e)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # ── 2. Validate meeting exists ────────────────────
    result = await db.execute(select(Meeting).filter(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    
    if not meeting:
        logger.warning("WebSocket: meeting %d not found", meeting_id)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # ── 3. Connect ────────────────────────────────────
    
    # Check meeting lock and waiting room status
    current_settings = manager.get_settings(meeting_id)
    if current_settings.get('locked'):
        await websocket.accept()
        await websocket.send_json({"type": "ERROR", "message": "Meeting is locked by host"})
        await websocket.close()
        return

    is_creator = (meeting.user_id == user_id)
    # user_id is the host/creator of the meeting
    
    # Set initial role
    role = 'host' if is_creator else manager.get_role(meeting_id, user_id)
    if not role:
        role = 'viewer'
    manager.set_role(meeting_id, user_id, role)

    # Handle Waiting Room
    if current_settings.get('waiting_room') and role != 'host':
        await websocket.accept()
        # Notify host
        await manager.broadcast(meeting_id, {
            "type": "WAITING_USER",
            "user_id": user_id,
            "name": f"User {user_id}" 
        })
        await websocket.send_json({"type": "WAITING", "message": "Please wait for the host to admit you"})
        
        # Store in waiting list with an event to unblock
        wait_event = asyncio.Event()
        if meeting_id not in manager.waiting_room: manager.waiting_room[meeting_id] = []
        manager.waiting_room[meeting_id].append((websocket, user_id, wait_event))
        
        # Wait until admitted
        try:
            await wait_event.wait()
        except Exception:
            # Client disconnected while waiting
            if meeting_id in manager.waiting_room:
                 manager.waiting_room[meeting_id] = [u for u in manager.waiting_room[meeting_id] if u[0] != websocket]
            return

    await manager.connect(websocket, meeting_id, user_id)

    logger.info("User %d joined meeting %d as %s", user_id, meeting_id, role)

    try:
        # ── 4. Register participant ───────────────────
        res = await db.execute(select(Participant).filter(
            Participant.meeting_id == meeting_id,
            Participant.user_id == user_id,
        ))
        participant = res.scalars().first()

        if not participant:
            participant = Participant(
                meeting_id=meeting_id,
                user_id=user_id,
                join_time=datetime.utcnow(),
            )
            db.add(participant)
        else:
            participant.join_time = datetime.utcnow()
            participant.leave_time = None

        await db.commit()

        # Broadcast join + participant count + settings
        await manager.broadcast(meeting_id, {
            "type": "JOIN",
            "user_id": user_id,
            "role": role,
            "settings": manager.get_settings(meeting_id),
            "participant_count": manager.get_participant_count(meeting_id),
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Broadcast participant list update
        # 1. Get active user IDs
        active_ids = list(manager.user_connections.get(meeting_id, {}).keys())
        # 2. Query users
        if active_ids:
            u_stmt = select(User).filter(User.id.in_(active_ids))
            u_res = await db.execute(u_stmt)
            users = u_res.scalars().all()
            
            p_List = []
            for u in users:
                p_role = manager.get_role(meeting_id, u.id)
                p_List.append({
                    "id": u.id,
                    "name": u.full_name or u.email,
                    "role": p_role,
                    "avatar": None # Placeholder
                })
            
            await manager.broadcast(meeting_id, {
                "type": "participants",
                "participants": p_List
            })

        # ── 5. Event Loop ────────────────────────────
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
                event_type = event.get("type")
                
                # Check permissions for admin actions
                user_role = manager.get_role(meeting_id, user_id)
                is_admin = user_role in ['host', 'presenter']

                if event_type == "ADMIN_UPDATE" and user_role == 'host':
                    # Update meeting settings (stored in-memory via manager)
                    updates = event.get("settings", {})
                    manager.update_settings(meeting_id, updates)
                    
                    await manager.broadcast(meeting_id, {
                        "type": "SETTINGS_UPDATE",
                        "settings": manager.get_settings(meeting_id)
                    })

                elif event_type == "ADMIN_ACTION" and is_admin:
                    action = event.get("action")
                    target_id = event.get("target_id")
                    
                    if action == "KICK":
                         # Find target websocket
                         target_ws = None
                         for ws in manager.active_connections.get(meeting_id, []):
                             # We need a way to map WS to ID, for now manager just has list
                             # This implementation limitation requires mapping. 
                             # Assuming we can't easily find WS by ID without mapping.
                             pass 
                         # For this prototype, broadcast KICK event and client handles disconnect?
                         # Better: Server forces disconnect?
                         # Let's use broadcast "KICK" and client auto-leaves if it matches them
                         await manager.broadcast(meeting_id, {
                             "type": "KICK_USER",
                             "target_id": target_id
                         })
                         
                    elif action == "SET_ROLE" and user_role == 'host':
                        new_role = event.get("role")
                        manager.set_role(meeting_id, target_id, new_role)
                        await manager.broadcast(meeting_id, {
                            "type": "ROLE_UPDATE",
                            "user_id": target_id,
                            "role": new_role
                        })
                        
                    elif action == "ADMIT" and user_role == 'host':
                        # Handle Waiting Room Admission
                        pending = manager.waiting_room.get(meeting_id, [])
                        found = next((u for u in pending if u[1] == target_id), None)
                        if found:
                            ws_waiting, u_id, w_event = found
                            await ws_waiting.send_json({"type": "ADMITTED"})
                            w_event.set() # Unblocks the other task
                            manager.waiting_room[meeting_id].remove(found)

                elif event_type == "QA_ASK":
                    # Broadcast new question
                    text = sanitize_input(event.get("text"))
                    if text:
                        await manager.broadcast(meeting_id, {
                            "type": "QA_ASK",
                            "id": event.get("id"),
                            "text": text,
                            "sender": "Anonymous" if event.get("anonymous") else event.get("sender", "User"),
                            "timestamp": datetime.utcnow().isoformat(),
                            "upvotes": 0
                        })

                elif event_type == "QA_UPVOTE":
                    # Broadcast upvote
                    await manager.broadcast(meeting_id, {
                        "type": "QA_UPVOTE",
                        "question_id": event.get("question_id"),
                        "user_id": user_id
                    })
                
                elif event_type == "QA_DELETE":
                    if is_admin: # Only admins can delete/resolve
                        await manager.broadcast(meeting_id, {
                            "type": "QA_DELETE",
                            "question_id": event.get("question_id")
                        })

                elif event_type == "FEEDBACK":
                    # ... [No change needed here for MVP security, but could sanitize comment]
                    comment = sanitize_input(event.get("comment"))
                    hosts = [uid for uid, r in manager.roles.get(meeting_id, {}).items() if r == 'host']
                    await manager.broadcast(meeting_id, {
                        "type": "FEEDBACK",
                        "rating": event.get("rating"),
                        "comment": comment,
                        "timestamp": datetime.utcnow().isoformat(),
                        "for_role": "host" 
                    })

                elif event_type == "AUDIO_CHUNK":
                    # ... [Binary data doesn't need HTML sanitization]
                    audio_b64 = event.get("data")
                    if audio_b64:
                        try:
                            audio_bytes = base64.b64decode(audio_b64)
                            processor = get_speech_processor()
                            
                            if processor:
                                # Offload heavy speech processing
                                result = await asyncio.to_thread(processor.process_chunk, audio_bytes)

                                if result:
                                    # Save subtitle asynchronously
                                    # Note: Speech-to-text output is generally safe from XSS, but let's be safe
                                    clean_text = sanitize_input(result.get("text", ""))
                                    new_subtitle = Subtitle(
                                        meeting_id=meeting_id,
                                        speaker_id=result.get("speaker", "Speaker"),
                                        speaker_name=result.get("speaker", "Speaker"),
                                        text=clean_text,
                                        start_time=result.get("start_offset", 0.0),
                                        end_time=result.get("end_offset", 0.0),
                                        confidence=result.get("confidence", 1.0),
                                    )
                                    db.add(new_subtitle)
                                    await db.commit()
                                    await db.refresh(new_subtitle)

                                    # Broadcast subtitle
                                    await manager.broadcast(meeting_id, {
                                        "type": "SUBTITLE",
                                        "id": new_subtitle.id,
                                        "text": new_subtitle.text,
                                        "speaker": new_subtitle.speaker_name,
                                        "start": new_subtitle.start_time,
                                        "end": new_subtitle.end_time,
                                        "timestamp": datetime.utcnow().isoformat(),
                                    })
                        except Exception as audio_err:
                            logger.error("Audio processing failed: %s", audio_err)

                # ── Browser-based transcription (Web Speech API) ──
                elif event_type in {"TRANSCRIPTION", "SUBTITLE"}:
                    text = sanitize_input(event.get("text", "").strip())
                    speaker = sanitize_input(event.get("speaker", "Speaker"))
                    confidence = event.get("confidence", 0.9)
                    
                    if text:
                        try:
                            # Save subtitle to DB
                            new_subtitle = Subtitle(
                                meeting_id=meeting_id,
                                speaker_id=str(user_id),
                                speaker_name=speaker,
                                text=text,
                                start_time=0.0,
                                end_time=0.0,
                                confidence=confidence,
                            )
                            db.add(new_subtitle)
                            await db.commit()
                            await db.refresh(new_subtitle)

                            # Broadcast to all participants
                            await manager.broadcast(meeting_id, {
                                "type": "SUBTITLE",
                                "id": new_subtitle.id,
                                "text": new_subtitle.text,
                                "speaker": new_subtitle.speaker_name,
                                "confidence": confidence,
                                "timestamp": datetime.utcnow().isoformat(),
                            })
                            logger.debug("Saved transcription: %s", text[:60])
                        except Exception as t_err:
                            logger.error("Transcription save failed: %s", t_err)

                elif event_type == "PING":
                    await manager.send_personal(websocket, {"type": "PONG"})

                elif event_type == "LEAVE":
                    break

                elif event_type == "CHAT":
                    # Save chat to DB
                    chat_text = sanitize_input(event.get("text", ""))
                    sender_name = event.get("sender", "Anonymous")
                    
                    if chat_text:
                        from app.models.chat_message import ChatMessage
                        new_chat = ChatMessage(
                            meeting_id=meeting_id,
                            sender_name=sender_name,
                            sender_id=user_id,
                            message=chat_text,
                            timestamp=datetime.utcnow(),
                        )
                        db.add(new_chat)
                        await db.commit()

                        # Broadcast chat message
                        await manager.broadcast(meeting_id, {
                            "type": "CHAT",
                            "sender": sender_name,
                            "text": chat_text,
                            "timestamp": datetime.utcnow().isoformat(),
                        })

                elif event_type == "REACTION":
                    # Broadcast emoji reaction
                    await manager.broadcast(meeting_id, {
                        "type": "REACTION",
                        "emoji": event.get("emoji", "👍"),
                        "sender": event.get("sender", "Anonymous"),
                        "timestamp": datetime.utcnow().isoformat(),
                    })

                elif event_type == "HAND_RAISE":
                    # Broadcast hand raise status
                    await manager.broadcast(meeting_id, {
                        "type": "HAND_RAISE",
                        "user_id": user_id,
                        "is_raised": event.get("is_raised", True),
                        "timestamp": datetime.utcnow().isoformat(),
                    })

                elif event_type == "CONFETTI":
                    # Broadcast confetti trigger
                    await manager.broadcast(meeting_id, {
                        "type": "CONFETTI",
                        "timestamp": datetime.utcnow().isoformat(),
                    })

                elif event_type == "POLL_CREATE":
                    # Broadcast new poll
                    # Sanitize question and options
                    question = sanitize_input(event.get("question"))
                    options = [sanitize_input(opt) for opt in event.get("options", [])]
                    
                    if question and options:
                        await manager.broadcast(meeting_id, {
                            "type": "POLL_CREATE",
                            "question": question,
                            "options": options,
                            "sender": event.get("sender", "Host"),
                            "timestamp": datetime.utcnow().isoformat(),
                        })

                elif event_type == "POLL_VOTE":
                    # Broadcast a vote
                    await manager.broadcast(meeting_id, {
                        "type": "POLL_VOTE",
                        "option_index": event.get("option_index"),
                        "user_id": user_id,
                        "timestamp": datetime.utcnow().isoformat(),
                    })

                elif event_type == "signal":
                    target_id = event.get("target")
                    payload = event.get("payload")
                    
                    target_ws = manager.get_socket(meeting_id, target_id)
                    if target_ws:
                        await manager.send_personal(target_ws, {
                            "type": "signal",
                            "sender": user_id,
                            "payload": payload
                        })

                elif event_type == "WHITEBOARD":
                    # Broadcast whiteboard actions to all EXCEPT sender
                    wb_msg = {
                        "type": "WHITEBOARD",
                        "action": event.get("action"),
                        "data": event.get("data"),
                        "sender": user_id
                    }
                    # Send to all connections except the sender
                    if meeting_id in manager.active_connections:
                        for conn in list(manager.active_connections[meeting_id]):
                            if conn != websocket:
                                try:
                                    await conn.send_json(wb_msg)
                                except Exception:
                                    pass

                elif event_type == "NOTE_UPDATE":
                    # Broadcast shared note changes
                    await manager.broadcast(meeting_id, {
                        "type": "NOTE_UPDATE",
                        "noteText": event.get("noteText"),
                        "sender": user_id
                    })

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        logger.info("User %d disconnected from meeting %d", user_id, meeting_id)
    except Exception as e:
        logger.error("WebSocket error in meeting %d: %s", meeting_id, e, exc_info=True)
    finally:
        manager.disconnect(websocket, meeting_id, user_id)

        # Update participant leave time
        try:
            res = await db.execute(select(Participant).filter(
                Participant.meeting_id == meeting_id,
                Participant.user_id == user_id,
            ))
            participant = res.scalars().first()

            if participant:
                participant.leave_time = datetime.utcnow()
                await db.commit()
        except Exception as e:
            logger.error("Error updating leave time for user %d meeting %d: %s", user_id, meeting_id, e)

        await manager.broadcast(meeting_id, {
            "type": "LEAVE",
            "user_id": user_id,
            "participant_count": manager.get_participant_count(meeting_id),
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Broadcast participant list update on leave
        active_ids = list(manager.user_connections.get(meeting_id, {}).keys())
        if active_ids:
            u_stmt = select(User).filter(User.id.in_(active_ids))
            u_res = await db.execute(u_stmt)
            users = u_res.scalars().all()
            
            p_List = []
            for u in users:
                p_role = manager.get_role(meeting_id, u.id)
                p_List.append({
                    "id": u.id,
                    "name": u.full_name or u.email,
                    "role": p_role
                })
            
            await manager.broadcast(meeting_id, {
                "type": "participants",
                "participants": p_List
            })
        else:
             # Last user left, empty list? Not really needed as no one is there to receive.
             pass
