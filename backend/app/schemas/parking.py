from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    latitude: float
    longitude: float
    note: str | None
    parked_at: datetime
    created_at: datetime
    updated_at: datetime
    photos: list[PhotoOut]


class ParkingRecordUpdate(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    note: str | None = Field(default=None, max_length=2000)
    parked_at: datetime | None = None
