from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_token_blocklist import AuthTokenBlocklist
from app.models.password_reset_token import PasswordResetToken


def exp_to_datetime(exp: int | float | datetime | None) -> datetime | None:
    if exp is None:
        return None
    if isinstance(exp, datetime):
        return exp
    return datetime.utcfromtimestamp(float(exp))


async def is_jti_revoked(db: AsyncSession, jti: str | None) -> bool:
    if not jti:
        return False
    result = await db.execute(
        select(AuthTokenBlocklist.id).where(AuthTokenBlocklist.jti == jti)
    )
    return result.scalar_one_or_none() is not None


async def revoke_token(
    db: AsyncSession,
    *,
    jti: str | None,
    token_type: str,
    user_id: int | None,
    expires_at: datetime | None,
) -> None:
    if not jti:
        return
    if await is_jti_revoked(db, jti):
        return
    db.add(
        AuthTokenBlocklist(
            jti=jti,
            token_type=token_type,
            user_id=user_id,
            expires_at=expires_at,
        )
    )


async def cleanup_expired_rows(db: AsyncSession) -> None:
    now = datetime.utcnow()
    await db.execute(delete(AuthTokenBlocklist).where(AuthTokenBlocklist.expires_at < now))
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.expires_at < now))
