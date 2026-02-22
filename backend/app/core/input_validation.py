from __future__ import annotations

import re

USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 64
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

NOTE_MAX_LENGTH = 2000
LOCATION_LABEL_MAX_LENGTH = 2000

_USERNAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$")
_HAS_UPPERCASE = re.compile(r"[A-Z]")
_HAS_LOWERCASE = re.compile(r"[a-z]")
_HAS_DIGIT = re.compile(r"[0-9]")
_CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def normalize_username(value: str) -> str:
    normalized = value.strip().lower()
    if not (USERNAME_MIN_LENGTH <= len(normalized) <= USERNAME_MAX_LENGTH):
        raise ValueError(f"Username must be {USERNAME_MIN_LENGTH}-{USERNAME_MAX_LENGTH} characters")
    if not _USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError("Username may include letters, digits, '.', '_' or '-' and must start/end with letter or digit")
    return normalized


def validate_password_policy(value: str) -> str:
    if not (PASSWORD_MIN_LENGTH <= len(value) <= PASSWORD_MAX_LENGTH):
        raise ValueError(f"Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters")
    if value != value.strip():
        raise ValueError("Password cannot start or end with whitespace")
    if not _HAS_UPPERCASE.search(value):
        raise ValueError("Password must include at least one uppercase letter")
    if not _HAS_LOWERCASE.search(value):
        raise ValueError("Password must include at least one lowercase letter")
    if not _HAS_DIGIT.search(value):
        raise ValueError("Password must include at least one digit")
    return value


def normalize_optional_text(value: str | None, *, max_length: int, field_name: str) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    if _CONTROL_CHAR_PATTERN.search(normalized):
        raise ValueError(f"{field_name} contains invalid control characters")
    return normalized
