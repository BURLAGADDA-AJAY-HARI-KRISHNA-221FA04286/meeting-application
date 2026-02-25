from datetime import datetime, timedelta
import hashlib
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.rate_limit import limiter

from app.api.deps import get_current_user
from app.core.auth_safety import (
    login_is_allowed,
    register_failed_login,
    register_successful_login,
)
from app.core.config import settings
from app.core.token_revocation import (
    cleanup_expired_rows,
    exp_to_datetime,
    is_jti_revoked,
    revoke_token,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    PasswordChange,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserCreate,
    UserOut,
    UserProfileUpdate,
)

router = APIRouter(tags=["auth"])
security_logger = logging.getLogger("meetingai.security")


def _safe_client_ip(request: Request) -> str:
    if not request.client:
        return "unknown"
    return request.client.host or "unknown"


def _identifier(request: Request, email: str) -> str:
    return f"{_safe_client_ip(request)}:{email.lower().strip()}"


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return None
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header[7:].strip()
    return token or None


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, payload: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": user,
    }


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    ident = _identifier(request, payload.email)
    allowed, retry_after = login_is_allowed(ident)
    if not allowed:
        security_logger.warning(
            "auth_login_locked ip=%s email=%s retry_after=%s",
            _safe_client_ip(request), payload.email, retry_after,
        )
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {retry_after} seconds.",
        )

    result = await db.execute(select(User).filter(User.email == payload.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(payload.password, user.password_hash):
        locked_now, retry_after = register_failed_login(ident)
        security_logger.warning(
            "auth_login_failed ip=%s email=%s locked=%s",
            _safe_client_ip(request), payload.email, locked_now,
        )
        if locked_now:
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Try again in {retry_after} seconds.",
            )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    register_successful_login(ident)
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    security_logger.info("auth_login_success ip=%s user_id=%s", _safe_client_ip(request), user.id)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": user,
    }


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh(request: Request, payload: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        decoded = decode_token(payload.refresh_token)
        user_id = decoded.get("sub")
        token_type = decoded.get("type")
        token_jti = decoded.get("jti")
        if token_type != "refresh" or user_id is None:
            raise ValueError("Invalid refresh token")
        if await is_jti_revoked(db, token_jti):
            raise ValueError("Token already revoked")
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    await cleanup_expired_rows(db)
    await revoke_token(
        db,
        jti=decoded.get("jti"),
        token_type="refresh",
        user_id=user.id,
        expires_at=exp_to_datetime(decoded.get("exp")),
    )

    access = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    await db.commit()
    return {
        "access_token": access,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user,
    }


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_none=True)
    if "email" in updates and updates["email"] != current_user.email:
        result = await db.execute(
             select(User).filter(User.email == updates["email"], User.id != current_user.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
            
    for key, value in updates.items():
        setattr(current_user, key, value)
        
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/change-password")
async def change_password(
    payload: PasswordChange,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        security_logger.warning(
            "auth_change_password_failed ip=%s user_id=%s reason=invalid_current",
            _safe_client_ip(request), current_user.id,
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    current_user.password_hash = hash_password(payload.new_password)
    await cleanup_expired_rows(db)

    access_token = _extract_bearer_token(request)
    if access_token:
        try:
            access_payload = decode_token(access_token)
            if (
                access_payload.get("type") == "access"
                and int(access_payload.get("sub")) == current_user.id
            ):
                await revoke_token(
                    db,
                    jti=access_payload.get("jti"),
                    token_type="access",
                    user_id=current_user.id,
                    expires_at=exp_to_datetime(access_payload.get("exp")),
                )
        except Exception:
            pass

    if payload.refresh_token:
        try:
            refresh_payload = decode_token(payload.refresh_token)
            if (
                refresh_payload.get("type") == "refresh"
                and int(refresh_payload.get("sub")) == current_user.id
            ):
                await revoke_token(
                    db,
                    jti=refresh_payload.get("jti"),
                    token_type="refresh",
                    user_id=current_user.id,
                    expires_at=exp_to_datetime(refresh_payload.get("exp")),
                )
        except Exception:
            pass

    db.add(current_user)
    await db.commit()
    security_logger.info("auth_change_password_success ip=%s user_id=%s", _safe_client_ip(request), current_user.id)
    return {"message": "Password changed successfully"}


@router.post("/logout")
@limiter.limit("30/minute")
async def logout(
    request: Request,
    payload: LogoutRequest,
    db: AsyncSession = Depends(get_db),
):
    user_id = None
    revoked_any = False

    await cleanup_expired_rows(db)

    try:
        refresh_payload = decode_token(payload.refresh_token)
        refresh_user_id = int(refresh_payload.get("sub"))
        if refresh_payload.get("type") != "refresh":
            raise ValueError("Invalid token type")
        await revoke_token(
            db,
            jti=refresh_payload.get("jti"),
            token_type="refresh",
            user_id=refresh_user_id,
            expires_at=exp_to_datetime(refresh_payload.get("exp")),
        )
        user_id = refresh_user_id
        revoked_any = True
    except Exception:
        pass

    access_token = _extract_bearer_token(request)
    if access_token:
        try:
            access_payload = decode_token(access_token)
            if access_payload.get("type") == "access":
                access_user_id = int(access_payload.get("sub"))
                await revoke_token(
                    db,
                    jti=access_payload.get("jti"),
                    token_type="access",
                    user_id=access_user_id,
                    expires_at=exp_to_datetime(access_payload.get("exp")),
                )
                user_id = user_id or access_user_id
                revoked_any = True
        except Exception:
            pass

    if revoked_any:
        await db.commit()
        security_logger.info("auth_logout ip=%s user_id=%s", _safe_client_ip(request), user_id)
    return {"message": "Logged out"}


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    await cleanup_expired_rows(db)
    result = await db.execute(select(User).filter(User.email == payload.email))
    user = result.scalar_one_or_none()
    response: dict[str, str] = {"message": "If that email exists, a reset link has been generated."}

    if user:
        raw_token = secrets.token_urlsafe(48)
        token_hash = _token_hash(raw_token)
        expires = datetime.utcnow() + timedelta(minutes=settings.password_reset_token_expire_minutes)

        # Invalidate previous unused reset tokens for this user.
        await db.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            )
        )
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires,
            )
        )
        await db.commit()

        security_logger.info("auth_password_reset_requested ip=%s user_id=%s", _safe_client_ip(request), user.id)
        if not settings.is_production:
            # Dev/testing convenience when no email service is configured.
            response["reset_token"] = raw_token

    return response


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    await cleanup_expired_rows(db)
    token_hash = _token_hash(payload.token)
    now = datetime.utcnow()

    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    reset_row = result.scalar_one_or_none()
    if not reset_row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user_result = await db.execute(select(User).where(User.id == reset_row.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    user.password_hash = hash_password(payload.new_password)
    reset_row.used_at = now
    await db.execute(
        delete(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != reset_row.id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    db.add(user)
    db.add(reset_row)
    await db.commit()

    security_logger.info("auth_password_reset_success ip=%s user_id=%s", _safe_client_ip(request), user.id)
    return {"message": "Password reset successful"}
