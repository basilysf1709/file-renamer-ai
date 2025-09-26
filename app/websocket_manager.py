import json
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
import redis
from datetime import datetime

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        try:
            self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        except:
            self.redis_client = None

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.active_connections:
            self.active_connections[job_id] = set()
        self.active_connections[job_id].add(websocket)

    def disconnect(self, websocket: WebSocket, job_id: str):
        if job_id in self.active_connections:
            self.active_connections[job_id].discard(websocket)
            if not self.active_connections[job_id]:
                del self.active_connections[job_id]

    async def send_update(self, job_id: str, message: dict):
        """Send update to all WebSocket connections for a job"""
        message["timestamp"] = datetime.now().isoformat()
        
        # Store in Redis for persistence (if available)
        if self.redis_client:
            try:
                self.redis_client.lpush(f"job_updates:{job_id}", json.dumps(message))
                self.redis_client.expire(f"job_updates:{job_id}", 3600)  # 1 hour TTL
            except:
                pass
        
        # Send to active WebSocket connections
        if job_id in self.active_connections:
            disconnected = []
            for websocket in self.active_connections[job_id]:
                try:
                    await websocket.send_text(json.dumps(message))
                except:
                    disconnected.append(websocket)
            
            # Remove disconnected websockets
            for ws in disconnected:
                self.active_connections[job_id].discard(ws)

    async def get_job_history(self, job_id: str, limit: int = 50):
        """Get recent updates for a job (for clients that missed real-time updates)"""
        if not self.redis_client:
            return []
        
        try:
            updates = self.redis_client.lrange(f"job_updates:{job_id}", 0, limit - 1)
            return [json.loads(update) for update in reversed(updates)]
        except:
            return []

# Global WebSocket manager instance
ws_manager = WebSocketManager()

async def send_job_update(job_id: str, update_type: str, data: dict):
    """Helper function to send job updates"""
    message = {
        "type": update_type,
        "job_id": job_id,
        **data
    }
    await ws_manager.send_update(job_id, message)
