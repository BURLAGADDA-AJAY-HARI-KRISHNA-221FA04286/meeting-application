from __future__ import annotations

from datetime import datetime, timedelta, timezone
from threading import Lock

from app.core.config import settings

_LOCK = Lock()
_FAILED_ATTEMPTS: dict[str, int] = {}
_LOCKED_UNTIL: dict[str, datetime] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cleanup(identifier: str) -> None:
    locked_until = _LOCKED_UNTIL.get(identifier)
    if locked_until and locked_until <= _now():
        _LOCKED_UNTIL.pop(identifier, None)
        _FAILED_ATTEMPTS.pop(identifier, None)


def login_is_allowed(identifier: str) -> tuple[bool, int]:
    with _LOCK:
        _cleanup(identifier)
        locked_until = _LOCKED_UNTIL.get(identifier)
        if not locked_until:
            return True, 0
        remaining = int(max((locked_until - _now()).total_seconds(), 0))
        return False, remaining


def register_failed_login(identifier: str) -> tuple[bool, int]:
    """Returns (is_now_locked, seconds_until_unlock)."""
    with _LOCK:
        _cleanup(identifier)
        attempts = _FAILED_ATTEMPTS.get(identifier, 0) + 1
        _FAILED_ATTEMPTS[identifier] = attempts

        if attempts < settings.login_max_attempts:
            return False, 0

        locked_until = _now() + timedelta(minutes=settings.login_lock_minutes)
        _LOCKED_UNTIL[identifier] = locked_until
        return True, int((locked_until - _now()).total_seconds())


def register_successful_login(identifier: str) -> None:
    with _LOCK:
        _FAILED_ATTEMPTS.pop(identifier, None)
        _LOCKED_UNTIL.pop(identifier, None)
