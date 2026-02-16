"""
WebSocket Connection Manager
==============================
Manages real-time connections for live meetings with:
  - Per-meeting connection tracking
  - Dead connection cleanup
  - Participant count broadcasting
"""
from fastapi import WebSocket
from typing import Dict, List
import json
import logging

logger = logging.getLogger("meetingai.ws")


class ConnectionManager:
    def __init__(self):
        # meeting_id -> list of active websockets
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: int):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)
        logger.info(
            "WebSocket connected to meeting %d (total: %d)",
            meeting_id, len(self.active_connections[meeting_id]),
        )

    def disconnect(self, websocket: WebSocket, meeting_id: int):
        """Remove a WebSocket connection from tracking."""
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]
        logger.info("WebSocket disconnected from meeting %d", meeting_id)

    def get_participant_count(self, meeting_id: int) -> int:
        """Get the number of active connections for a meeting."""
        return len(self.active_connections.get(meeting_id, []))

    async def broadcast(self, meeting_id: int, message: dict):
        """Send a message to all connections in a meeting, pruning dead ones."""
        if meeting_id not in self.active_connections:
            return

        dead_connections = []
        for connection in self.active_connections[meeting_id][:]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(
                    "Dead connection detected in meeting %d: %s", meeting_id, e,
                )
                dead_connections.append(connection)

        # Prune dead connections
        for dead in dead_connections:
            if dead in self.active_connections.get(meeting_id, []):
                self.active_connections[meeting_id].remove(dead)
            logger.info("Pruned dead connection from meeting %d", meeting_id)

        # Clean up empty meeting entries
        if meeting_id in self.active_connections and not self.active_connections[meeting_id]:
            del self.active_connections[meeting_id]

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send a message to a specific connection."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning("Failed to send personal message: %s", e)

    def get_active_meetings(self) -> list[int]:
        """Return list of meeting IDs with active connections."""
        return list(self.active_connections.keys())


manager = ConnectionManager()
