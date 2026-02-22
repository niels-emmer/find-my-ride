from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import settings

ALLOWED_IMAGE_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def ensure_upload_dir() -> None:
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)


def _safe_ext(content_type: str, filename: str | None) -> str:
    if content_type in ALLOWED_IMAGE_CONTENT_TYPES:
        return ALLOWED_IMAGE_CONTENT_TYPES[content_type]

    if filename and "." in filename:
        return "." + filename.rsplit(".", 1)[1].lower()

    return ".bin"


def save_image_bytes(owner_id: str, record_id: str, upload: UploadFile, payload: bytes) -> tuple[str, str]:
    ext = _safe_ext(upload.content_type or "", upload.filename)
    photo_id = str(uuid4())

    relative_dir = Path(owner_id) / record_id
    absolute_dir = Path(settings.upload_dir) / relative_dir
    absolute_dir.mkdir(parents=True, exist_ok=True)

    file_name = f"{photo_id}{ext}"
    absolute_path = absolute_dir / file_name
    absolute_path.write_bytes(payload)

    relative_path = str(relative_dir / file_name)
    return file_name, relative_path


def absolute_upload_path(relative_path: str) -> Path:
    return (Path(settings.upload_dir) / relative_path).resolve()
