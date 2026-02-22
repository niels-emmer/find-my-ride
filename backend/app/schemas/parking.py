from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.input_validation import (
    LOCATION_LABEL_MAX_LENGTH,
    NOTE_MAX_LENGTH,
    normalize_optional_text,
)


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_name: str
    content_type: str
    file_size: int
    created_at: datetime
    download_url: str


class ParkingRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    latitude: float | None
    longitude: float | None
    location_label: str | None
    note: str | None
    parked_at: datetime
    created_at: datetime
    updated_at: datetime
    photos: list[PhotoOut]


class ParkingRecordUpdate(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_label: str | None = Field(default=None, max_length=LOCATION_LABEL_MAX_LENGTH)
    note: str | None = Field(default=None, max_length=NOTE_MAX_LENGTH)
    parked_at: datetime | None = None

    @field_validator("location_label")
    @classmethod
    def validate_location_label(cls, value: str | None) -> str | None:
        return normalize_optional_text(
            value,
            max_length=LOCATION_LABEL_MAX_LENGTH,
            field_name="Location label",
        )

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: str | None) -> str | None:
        return normalize_optional_text(
            value,
            max_length=NOTE_MAX_LENGTH,
            field_name="Note",
        )
