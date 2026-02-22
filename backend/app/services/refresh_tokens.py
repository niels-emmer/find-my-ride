from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User


def _now() -> datetime:
    return datetime.now(UTC)


def _now_naive_utc() -> datetime:
    return _now().replace(tzinfo=None)


def _is_expired(expires_at: datetime) -> bool:
    """
    SQLAlchemy can yield timezone-naive datetimes on SQLite and timezone-aware
    datetimes on PostgreSQL. Compare using like-for-like timezone semantics.
    """
    if expires_at.tzinfo is None:
        return expires_at <= _now_naive_utc()
    return expires_at <= _now()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _new_raw_token() -> str:
    return secrets.token_urlsafe(64)


def issue_refresh_token(db: Session, user_id: str) -> str:
    raw_token = _new_raw_token()
    refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw_token),
        expires_at=_now() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh_token)
    db.commit()
    return raw_token


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[User, str]:
    token_hash = _hash_token(raw_token)
    record = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if record is None:
        raise ValueError("Invalid refresh token")

    if record.revoked_at is not None or _is_expired(record.expires_at):
        revoke_user_refresh_tokens(db, record.user_id)
        raise ValueError("Invalid refresh token")

    user = db.scalar(select(User).where(User.id == record.user_id))
    if user is None:
        raise ValueError("Invalid refresh token")

    record.revoked_at = _now()
    db.add(record)

    rotated_raw = _new_raw_token()
    rotated_record = RefreshToken(
        user_id=record.user_id,
        token_hash=_hash_token(rotated_raw),
        expires_at=_now() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(rotated_record)
    db.commit()

    return user, rotated_raw


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)
    record = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    if record is None:
        return

    record.revoked_at = _now()
    db.add(record)
    db.commit()


def revoke_user_refresh_tokens(db: Session, user_id: str) -> None:
    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=_now())
    )
    db.commit()
