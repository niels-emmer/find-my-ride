from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
def system_status(db: Session = Depends(get_db)) -> dict[str, bool]:
    user_count = db.scalar(select(func.count(User.id))) or 0
    return {
        "has_users": user_count > 0,
        "allow_self_register": settings.allow_self_register,
    }
