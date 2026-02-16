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
from app.core.security import decode_token
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
    user_id = None

    try:
        if not token:
            logger.warning("WebSocket connection attempt without token for meeting %d", meeting_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Decode token (CPU bound, but fast enough)
        payload = decode_token(token)
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
    await manager.connect(websocket, meeting_id)
    # Note: manager.connect accepts connection. 
    # If using multiple workers, this manager is local memory only. 
    # For production, we need Redis pub/sub. 
    # Phase 1 assumes single worker or sticky sessions.

    logger.info("User %d joined meeting %d", user_id, meeting_id)

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

        # Broadcast join + participant count
        await manager.broadcast(meeting_id, {
            "type": "JOIN",
            "user_id": user_id,
            "participant_count": manager.get_participant_count(meeting_id),
            "timestamp": datetime.utcnow().isoformat(),
        })

        # ── 5. Event Loop ────────────────────────────
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
                event_type = event.get("type")

                if event_type == "AUDIO_CHUNK":
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
                                    new_subtitle = Subtitle(
                                        meeting_id=meeting_id,
                                        speaker_id=result.get("speaker", "Speaker"),
                                        speaker_name=result.get("speaker", "Speaker"),
                                        text=result.get("text", ""),
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
                elif event_type == "TRANSCRIPTION":
                    text = event.get("text", "").strip()
                    speaker = event.get("speaker", "Speaker")
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
                            
                            # Also append to meeting transcript
                            if meeting.transcript:
                                meeting.transcript += f"\n{speaker}: {text}"
                            else:
                                meeting.transcript = f"{speaker}: {text}"
                            
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
                    # Keep-alive ping
                    await manager.send_personal(websocket, {"type": "PONG"})

                elif event_type == "LEAVE":
                    break

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        logger.info("User %d disconnected from meeting %d", user_id, meeting_id)
    except Exception as e:
        logger.error("WebSocket error in meeting %d: %s", meeting_id, e, exc_info=True)
    finally:
        manager.disconnect(websocket, meeting_id)

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
