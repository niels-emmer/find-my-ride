from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "find-my-ride"
    api_prefix: str = "/api"
    environment: str = "development"

    secret_key: str = Field(..., min_length=32)
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    database_url: str = "postgresql+psycopg://find_my_ride:find_my_ride@db:5432/find_my_ride"

    cors_origins: list[str] = ["http://localhost:5173"]

    upload_dir: str = "/data/uploads"
    max_photos_per_record: int = 3
    max_photo_size_mb: int = 8

    mfa_issuer: str = "find-my-ride"
    refresh_token_cookie_name: str = "fmr_refresh_token"
    refresh_token_cookie_secure: bool = False
    refresh_token_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_token_cookie_path: str = "/api/auth"

    geocode_reverse_url: str = "https://nominatim.openstreetmap.org/reverse"
    geocode_user_agent: str = "find-my-ride/0.1"
    geocode_timeout_seconds: float = 8.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        enable_decoding=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


settings = Settings()
