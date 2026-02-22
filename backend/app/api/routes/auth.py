from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    BootstrapAdminRequest,
    MFAVerifyRequest,
    MFASetupResponse,
    MFAStatusResponse,
    LoginRequest,
    TokenResponse,
)
from app.schemas.user import UserCreate, UserOut
from app.services import mfa

router = APIRouter(prefix="/auth", tags=["auth"])


def _existing_user_count(db: Session) -> int:
    return db.scalar(select(func.count(User.id))) or 0


@router.post("/bootstrap", response_model=TokenResponse)
def bootstrap_admin(payload: BootstrapAdminRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if _existing_user_count(db) > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bootstrap already completed")

    user = User(
        username=payload.username.strip().lower(),
        password_hash=hash_password(payload.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id, is_admin=user.is_admin)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenResponse)
def register_user(payload: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    if not settings.allow_self_register:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self-registration is disabled")

    normalized_username = payload.username.strip().lower()
    existing = db.scalar(select(User).where(User.username == normalized_username))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=normalized_username,
        password_hash=hash_password(payload.password),
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id, is_admin=user.is_admin)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    normalized_username = payload.username.strip().lower()
    user = db.scalar(select(User).where(User.username == normalized_username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.mfa_enabled:
        if not payload.otp_code or not mfa.verify_code(user.mfa_secret or "", payload.otp_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA code required or invalid")

    token = create_access_token(subject=user.id, is_admin=user.is_admin)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/mfa/setup", response_model=MFASetupResponse)
def setup_mfa(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MFASetupResponse:
    secret = mfa.generate_secret()
    current_user.mfa_secret = secret
    current_user.mfa_enabled = False
    db.add(current_user)
    db.commit()

    return MFASetupResponse(secret=secret, otpauth_url=mfa.provisioning_uri(secret, current_user.username))


@router.post("/mfa/verify", response_model=MFAStatusResponse)
def verify_mfa(
    payload: MFAVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MFAStatusResponse:
    if not current_user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA setup not initialized")

    if not mfa.verify_code(current_user.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    current_user.mfa_enabled = True
    db.add(current_user)
    db.commit()

    return MFAStatusResponse(mfa_enabled=True)


@router.post("/mfa/disable", response_model=MFAStatusResponse)
def disable_mfa(
    payload: MFAVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MFAStatusResponse:
    if current_user.mfa_enabled:
        if not current_user.mfa_secret or not mfa.verify_code(current_user.mfa_secret, payload.code):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    db.add(current_user)
    db.commit()

    return MFAStatusResponse(mfa_enabled=False)
