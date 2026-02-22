from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import refresh_tokens

router = APIRouter(prefix="/users", tags=["users"])


def _count_admin_users(db: Session) -> int:
    return db.scalar(select(func.count(User.id)).where(User.is_admin.is_(True))) or 0


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(get_admin_user), db: Session = Depends(get_db)) -> list[UserOut]:
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [UserOut.model_validate(user) for user in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, _: User = Depends(get_admin_user), db: Session = Depends(get_db)) -> UserOut:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.scalar(select(User).where(User.id == str(user_id)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == admin_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot edit your own account here")

    password_changed = False
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        password_changed = True

    if payload.is_admin is not None:
        if not payload.is_admin and user.is_admin:
            if _count_admin_users(db) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one admin user is required",
                )
        user.is_admin = payload.is_admin

    db.add(user)
    db.commit()
    db.refresh(user)
    if password_changed:
        refresh_tokens.revoke_user_refresh_tokens(db, user.id)
    return UserOut.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_user(user_id: UUID, admin_user: User = Depends(get_admin_user), db: Session = Depends(get_db)) -> Response:
    user = db.scalar(select(User).where(User.id == str(user_id)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == admin_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

    if user.is_admin and _count_admin_users(db) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin user is required")

    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
