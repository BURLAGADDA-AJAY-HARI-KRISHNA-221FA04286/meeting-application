
import asyncio
import os
import sys

# Add current dir to path
sys.path.append(os.getcwd())

from app.core.config import settings
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

def check_sync():
    print("--- SYNC CONNECTION CHECK ---")
    db_url = settings.database_url
    # Sync logic from session.py
    if "postgresql" in db_url:
        if "+asyncpg" in db_url:
            db_url = db_url.replace("+asyncpg", "+psycopg")
        elif "psycopg" not in db_url and "psycopg2" not in db_url:
             # Default to psycopg if not specified? Or psycopg2?
             # session.py uses +psycopg
             db_url = db_url.replace("postgresql://", "postgresql+psycopg://")
    
    print(f"Connecting to: {db_url.split('@')[1] if '@' in db_url else 'LOCAL'}") 
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print(f"Sync Result: {result.scalar()}")
        print("Sync OK!")
    except Exception as e:
        print(f"Sync FAILED: {e}")

async def check_async():
    print("\n--- ASYNC CONNECTION CHECK ---")
    # Async logic from session.py
    import re
    import ssl as _ssl
    
    async_db_url = settings.database_url
    _need_ssl = False

    if "postgresql" in async_db_url:
        if "+asyncpg" not in async_db_url:
            async_db_url = async_db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")
            async_db_url = async_db_url.replace("postgresql://", "postgresql+asyncpg://")
        if "sslmode=require" in async_db_url or "sslmode=verify" in async_db_url:
            _need_ssl = True
        async_db_url = re.sub(r'[&?]sslmode=[^&]*', '', async_db_url)
        async_db_url = re.sub(r'[&?]channel_binding=[^&]*', '', async_db_url)
        async_db_url = re.sub(r'\?$', '', async_db_url)
    
    print(f"Connecting to: {async_db_url.split('@')[1] if '@' in async_db_url else 'LOCAL'}")
    
    connect_args = {}
    if _need_ssl:
        ssl_ctx = _ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
        connect_args = {"ssl": ssl_ctx}

    try:
        engine = create_async_engine(async_db_url, connect_args=connect_args)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            print(f"Async Result: {result.scalar()}")
        print("Async OK!")
    except Exception as e:
        print(f"Async FAILED: {e}")

if __name__ == "__main__":
    check_sync()
    asyncio.run(check_async())
