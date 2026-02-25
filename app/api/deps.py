from fastapi import Depends, HTTPException, status, Query as QueryParam, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.security import decode_token
from app.core.config import settings
from app.core.token_revocation import is_jti_revoked
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/login")


async def get_current_user(
    db: AsyncSession = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        token_jti = payload.get("jti")
        if user_id is None or token_type != "access":
            raise credentials_exception
        if await is_jti_revoked(db, token_jti):
            raise credentials_exception
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise credentials_exception

    # Async query execution
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
        
    return user


async def get_current_user_or_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = QueryParam(default=None),
) -> User:
    """Auth dependency that supports both header-based and query-param-based tokens.
    Used for file download endpoints where the browser opens a URL directly.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    
    # Try Authorization header first, then query param
    auth_header = request.headers.get("Authorization", "")
    jwt_token = None
    if auth_header.startswith("Bearer "):
        jwt_token = auth_header[7:]
    elif token and settings.allow_query_token_auth:
        jwt_token = token
    
    if not jwt_token:
        raise credentials_exception
    
    try:
        payload = decode_token(jwt_token)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        token_jti = payload.get("jti")
        if user_id is None or token_type != "access":
            raise credentials_exception
        if await is_jti_revoked(db, token_jti):
            raise credentials_exception
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise credentials_exception

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
        
    return user
