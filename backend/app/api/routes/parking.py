from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.parking_record import ParkingRecord
from app.models.photo import Photo
from app.models.user import User
from app.schemas.parking import ParkingRecordOut, ParkingRecordUpdate, PhotoOut
from app.services.storage import ALLOWED_IMAGE_CONTENT_TYPES, absolute_upload_path, save_image_bytes

router = APIRouter(prefix="/parking", tags=["parking"])


def _can_access_record(user: User, record: ParkingRecord) -> bool:
    return user.is_admin or record.owner_id == user.id


def _build_photo_out(photo: Photo) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        file_name=photo.file_name,
        content_type=photo.content_type,
        file_size=photo.file_size,
        created_at=photo.created_at,
        download_url=f"{settings.api_prefix}/parking/photos/{photo.id}/download",
    )


def _build_record_out(record: ParkingRecord) -> ParkingRecordOut:
    return ParkingRecordOut(
        id=record.id,
        owner_id=record.owner_id,
        latitude=record.latitude,
        longitude=record.longitude,
        note=record.note,
        parked_at=record.parked_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
        photos=[_build_photo_out(photo) for photo in record.photos],
    )


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="latitude out of range")
    if not -180 <= longitude <= 180:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="longitude out of range")


async def _read_and_validate_upload(upload: UploadFile) -> bytes:
    if upload.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        allowed = ", ".join(sorted(ALLOWED_IMAGE_CONTENT_TYPES))
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Allowed: {allowed}",
        )

    payload = await upload.read()
    max_bytes = settings.max_photo_size_mb * 1024 * 1024
    if len(payload) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.max_photo_size_mb} MB",
        )
    return payload


@router.post("/records", response_model=ParkingRecordOut, status_code=status.HTTP_201_CREATED)
async def create_record(
    latitude: float = Form(...),
    longitude: float = Form(...),
    note: str | None = Form(default=None),
    parked_at: datetime | None = Form(default=None),
    photos: list[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParkingRecordOut:
    _validate_coordinates(latitude, longitude)

    if len(photos) > settings.max_photos_per_record:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum {settings.max_photos_per_record} photos allowed",
        )

    record = ParkingRecord(
        owner_id=current_user.id,
        latitude=latitude,
        longitude=longitude,
        note=note,
        parked_at=parked_at or datetime.now(UTC),
    )
    db.add(record)
    db.flush()

    for upload in photos:
        payload = await _read_and_validate_upload(upload)
        file_name, relative_path = save_image_bytes(current_user.id, record.id, upload, payload)
        photo = Photo(
            record_id=record.id,
            file_name=file_name,
            storage_path=relative_path,
            content_type=upload.content_type or "application/octet-stream",
            file_size=len(payload),
        )
        db.add(photo)

    db.commit()

    loaded = db.scalar(
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .where(ParkingRecord.id == record.id)
    )
    if loaded is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Record load failure")

    return _build_record_out(loaded)


@router.get("/records", response_model=list[ParkingRecordOut])
def list_records(
    owner_id: str | None = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ParkingRecordOut]:
    limit = max(1, min(limit, 200))

    query = (
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .order_by(ParkingRecord.parked_at.desc())
        .limit(limit)
    )

    if current_user.is_admin and owner_id:
        query = query.where(ParkingRecord.owner_id == owner_id)
    elif not current_user.is_admin:
        query = query.where(ParkingRecord.owner_id == current_user.id)

    records = db.scalars(query).all()
    return [_build_record_out(record) for record in records]


@router.get("/records/latest", response_model=ParkingRecordOut | None)
def latest_record(
    owner_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParkingRecordOut | None:
    query = (
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .order_by(ParkingRecord.parked_at.desc())
        .limit(1)
    )

    if current_user.is_admin and owner_id:
        query = query.where(ParkingRecord.owner_id == owner_id)
    elif not current_user.is_admin:
        query = query.where(ParkingRecord.owner_id == current_user.id)

    record = db.scalar(query)
    if record is None:
        return None

    return _build_record_out(record)


@router.patch("/records/{record_id}", response_model=ParkingRecordOut)
def update_record(
    record_id: str,
    payload: ParkingRecordUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParkingRecordOut:
    record = db.scalar(
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .where(ParkingRecord.id == record_id)
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    if not _can_access_record(current_user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    updates = payload.model_dump(exclude_unset=True)
    if "latitude" in updates:
        _validate_coordinates(updates["latitude"], record.longitude)
        record.latitude = updates["latitude"]
    if "longitude" in updates:
        _validate_coordinates(record.latitude, updates["longitude"])
        record.longitude = updates["longitude"]
    if "note" in updates:
        record.note = updates["note"]
    if "parked_at" in updates:
        record.parked_at = updates["parked_at"]

    db.add(record)
    db.commit()
    db.refresh(record)

    loaded = db.scalar(
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .where(ParkingRecord.id == record_id)
    )
    if loaded is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    return _build_record_out(loaded)


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    record = db.scalar(select(ParkingRecord).where(ParkingRecord.id == record_id))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    if not _can_access_record(current_user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    db.delete(record)
    db.commit()


@router.post("/records/{record_id}/photos", response_model=ParkingRecordOut)
async def add_record_photos(
    record_id: str,
    photos: list[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParkingRecordOut:
    if not photos:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No photos uploaded")

    record = db.scalar(
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .where(ParkingRecord.id == record_id)
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    if not _can_access_record(current_user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    total_after_add = len(record.photos) + len(photos)
    if total_after_add > settings.max_photos_per_record:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum {settings.max_photos_per_record} photos allowed per record",
        )

    for upload in photos:
        payload = await _read_and_validate_upload(upload)
        file_name, relative_path = save_image_bytes(record.owner_id, record.id, upload, payload)
        photo = Photo(
            record_id=record.id,
            file_name=file_name,
            storage_path=relative_path,
            content_type=upload.content_type or "application/octet-stream",
            file_size=len(payload),
        )
        db.add(photo)

    db.commit()

    refreshed = db.scalar(
        select(ParkingRecord)
        .options(selectinload(ParkingRecord.photos))
        .where(ParkingRecord.id == record.id)
    )
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    return _build_record_out(refreshed)


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    photo = db.scalar(select(Photo).where(Photo.id == photo_id))
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    record = db.scalar(select(ParkingRecord).where(ParkingRecord.id == photo.record_id))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    if not _can_access_record(current_user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    path = absolute_upload_path(photo.storage_path)
    if path.exists() and path.is_file():
        path.unlink(missing_ok=True)

    db.delete(photo)
    db.commit()


@router.get("/photos/{photo_id}/download")
def download_photo(
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    photo = db.scalar(select(Photo).where(Photo.id == photo_id))
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    record = db.scalar(select(ParkingRecord).where(ParkingRecord.id == photo.record_id))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    if not _can_access_record(current_user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    path = absolute_upload_path(photo.storage_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(path=path, media_type=photo.content_type, filename=photo.file_name)
