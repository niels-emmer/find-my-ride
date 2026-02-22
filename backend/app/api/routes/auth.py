from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    BootstrapAdminRequest,
    ChangePasswordRequest,
    MFAVerifyRequest,
    MFASetupResponse,
    MFAStatusResponse,
    MessageResponse,
    LoginRequest,
    TokenResponse,
)
from app.schemas.user import UserCreate, UserOut
from app.services import mfa, refresh_tokens

router = APIRouter(prefix="/auth", tags=["auth"])


def _existing_user_count(db: Session) -> int:
    return db.scalar(select(func.count(User.id))) or 0


def _refresh_cookie_max_age_seconds() -> int:
    return settings.refresh_token_expire_days * 24 * 60 * 60


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_token_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.refresh_token_cookie_secure,
        samesite=settings.refresh_token_cookie_samesite,
        path=settings.refresh_token_cookie_path,
        max_age=_refresh_cookie_max_age_seconds(),
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_token_cookie_name,
        path=settings.refresh_token_cookie_path,
        secure=settings.refresh_token_cookie_secure,
        samesite=settings.refresh_token_cookie_samesite,
    )


def _issue_session_tokens(response: Response, user: User, db: Session) -> TokenResponse:
    access_token = create_access_token(subject=user.id, is_admin=user.is_admin)
    refresh_token = refresh_tokens.issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, user=UserOut.model_validate(user))


@router.post("/bootstrap", response_model=TokenResponse)
def bootstrap_admin(
    payload: BootstrapAdminRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    if _existing_user_count(db) > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bootstrap already completed")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _issue_session_tokens(response, user, db)


@router.post("/register", response_model=TokenResponse)
def register_user(payload: UserCreate, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _issue_session_tokens(response, user, db)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.mfa_enabled:
        if not payload.otp_code or not mfa.verify_code(user.mfa_secret or "", payload.otp_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA code required or invalid")

    return _issue_session_tokens(response, user, db)


@router.post("/refresh", response_model=TokenResponse)
def refresh_session(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_token_cookie_name),
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is missing")

    try:
        user, rotated_refresh = refresh_tokens.rotate_refresh_token(db, refresh_token)
    except ValueError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid") from None

    _set_refresh_cookie(response, rotated_refresh)
    access_token = create_access_token(subject=user.id, is_admin=user.is_admin)
    return TokenResponse(access_token=access_token, user=UserOut.model_validate(user))


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_token_cookie_name),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if refresh_token:
        refresh_tokens.revoke_refresh_token(db, refresh_token)
    _clear_refresh_cookie(response)
    return MessageResponse(message="Signed out")


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    refresh_tokens.revoke_user_refresh_tokens(db, current_user.id)

    return MessageResponse(message="Password updated successfully")


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
