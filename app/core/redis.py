import json
import logging
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger("meetingai.redis")

redis_client: Redis = None

async def init_redis():
    """Initialize global redis connection pool."""
    global redis_client
    redis_url = f"redis://{settings.redis_host}:{settings.redis_port}/2" # Use DB 2 for cache
    redis_client = Redis.from_url(redis_url, decode_responses=True)
    try:
        await redis_client.ping()
        logger.info(f"Redis cache connected at {redis_url}")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")

async def close_redis():
    """Close redis connection pool."""
    global redis_client
    if redis_client:
        await redis_client.aclose()
        logger.info("Redis connection closed")

async def get_cache(key: str) -> dict | list | str | None:
    """Retrieve value from Redis cache by key and parse json."""
    if not redis_client:
        return None
    try:
        cached = await redis_client.get(key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass
    return None

async def set_cache(key: str, value: dict | list | str, ttl: int = 3600):
    """Save value to Redis cache with TTL."""
    if not redis_client:
        return
    try:
        await redis_client.set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass

async def invalidate_cache(prefix: str):
    """Delete all keys matching a prefix (e.g., 'meeting:123:*')."""
    if not redis_client:
        return
    try:
        # SCAN is better than KEYS in production
        cursor = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match=f"{prefix}*")
            if keys:
                await redis_client.delete(*keys)
            if cursor == 0:
                break
    except Exception:
        pass
