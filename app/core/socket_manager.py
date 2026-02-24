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
        # meeting_id -> list of active websockets (legacy, keeping for broadcast)
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # meeting_id -> { user_id -> websocket }
        self.user_connections: Dict[int, Dict[int, WebSocket]] = {}
        # meeting_id -> { user_id -> role } ('host', 'presenter', 'viewer')
        self.roles: Dict[int, Dict[int, str]] = {}
        # meeting_id -> { 'locked': bool, 'waiting_room': bool, 'password': str }
        self.settings: Dict[int, dict] = {}
        # meeting_id -> list of (websocket, user_id) waiting for approval
        self.waiting_room: Dict[int, List] = {}

    async def connect(self, websocket: WebSocket, meeting_id: int, user_id: int):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
            self.user_connections[meeting_id] = {}
            self.settings[meeting_id] = {'locked': False, 'waiting_room': False, 'password': None}
            self.roles[meeting_id] = {}
            self.waiting_room[meeting_id] = []
            
        self.active_connections[meeting_id].append(websocket)
        self.user_connections[meeting_id][user_id] = websocket
        logger.info("WebSocket connected to meeting %d user %d (total: %d)", meeting_id, user_id, len(self.active_connections[meeting_id]))

    def disconnect(self, websocket: WebSocket, meeting_id: int, user_id: int = None):
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            
            # Remove from user map
            if user_id and meeting_id in self.user_connections and user_id in self.user_connections[meeting_id]:
                del self.user_connections[meeting_id][user_id]
            elif meeting_id in self.user_connections:
                # Fallback if user_id not provided, find by value
                params = [k for k, v in self.user_connections[meeting_id].items() if v == websocket]
                for k in params:
                    del self.user_connections[meeting_id][k]

            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]
                if meeting_id in self.user_connections: del self.user_connections[meeting_id]
                if meeting_id in self.roles: del self.roles[meeting_id]
                if meeting_id in self.settings: del self.settings[meeting_id]
                if meeting_id in self.waiting_room: del self.waiting_room[meeting_id]
        logger.info("WebSocket disconnected from meeting %d", meeting_id)

    def get_socket(self, meeting_id: int, user_id: int) -> WebSocket:
        return self.user_connections.get(meeting_id, {}).get(user_id)

    def get_participant_count(self, meeting_id: int) -> int:
        return len(self.active_connections.get(meeting_id, []))

    async def broadcast(self, meeting_id: int, message: dict):
        if meeting_id not in self.active_connections:
            return

        dead_connections = []
        # Create a copy to iterate safely
        connections = list(self.active_connections[meeting_id])
        
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning("Dead connection detected in meeting %d: %s", meeting_id, e)
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead, meeting_id)

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning("Failed to send personal message: %s", e)

    def get_active_meetings(self) -> list[int]:
        return list(self.active_connections.keys())

    # ── Security Methods ──
    def set_role(self, meeting_id: int, user_id: int, role: str):
        if meeting_id not in self.roles:
            self.roles[meeting_id] = {}
        self.roles[meeting_id][user_id] = role

    def get_role(self, meeting_id: int, user_id: int) -> str:
        return self.roles.get(meeting_id, {}).get(user_id, 'viewer')

    def update_settings(self, meeting_id: int, updates: dict):
        if meeting_id not in self.settings:
            self.settings[meeting_id] = {'locked': False, 'waiting_room': False, 'password': None}
        self.settings[meeting_id].update(updates)

    def get_settings(self, meeting_id: int) -> dict:
        return self.settings.get(meeting_id, {'locked': False, 'waiting_room': False, 'password': None})

    async def kick_user(self, meeting_id: int, target_ws: WebSocket):
        await self.send_personal(target_ws, {"type": "KICKED", "reason": "Host removed you"})
        await target_ws.close()
        self.disconnect(target_ws, meeting_id)


manager = ConnectionManager()
