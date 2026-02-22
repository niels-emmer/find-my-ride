from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.user import UserOut


class BootstrapAdminRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=128)
    otp_code: str | None = Field(default=None, min_length=6, max_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class MFAVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class MFAStatusResponse(BaseModel):
    mfa_enabled: bool
