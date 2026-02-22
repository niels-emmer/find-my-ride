from __future__ import annotations

import re

import httpx

from app.core.config import settings

COORDINATE_LABEL_PATTERN = re.compile(r"^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$")


def is_coordinate_label(value: str | None) -> bool:
    if value is None:
        return False
    return COORDINATE_LABEL_PATTERN.match(value) is not None


def _normalize_parts(parts: list[str | None]) -> str | None:
    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        if not part:
            continue
        normalized = part.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    if not result:
        return None
    return ", ".join(result)


def _extract_display_name(payload: dict[str, object]) -> str | None:
    address = payload.get("address")
    if isinstance(address, dict):
        street = address.get("road") or address.get("pedestrian") or address.get("footway") or address.get("path")
        house_number = address.get("house_number")
        postcode = address.get("postcode")
        city = address.get("city") or address.get("town") or address.get("village") or address.get("municipality")
        province = address.get("state") or address.get("county") or address.get("state_district")
        country = address.get("country")

        street_part = " ".join(
            [item.strip() for item in [street, house_number] if isinstance(item, str) and item.strip()]
        )
        city_part = " ".join(
            [item.strip() for item in [postcode, city] if isinstance(item, str) and item.strip()]
        )

        ordered = _normalize_parts(
            [
                street_part if street_part else None,
                city_part if city_part else None,
                province if isinstance(province, str) else None,
                country if isinstance(country, str) else None,
            ]
        )
        if ordered and not is_coordinate_label(ordered):
            return ordered

    display_name = payload.get("display_name")
    if not isinstance(display_name, str):
        return None
    normalized = display_name.strip()
    if not normalized or is_coordinate_label(normalized):
        return None
    return normalized


def format_location_label_from_payload(payload: dict[str, object]) -> str | None:
    return _extract_display_name(payload)


def reverse_geocode_location_label_sync(latitude: float, longitude: float) -> str | None:
    params = {
        "format": "jsonv2",
        "lat": str(latitude),
        "lon": str(longitude),
        "zoom": "18",
        "addressdetails": "1",
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": settings.geocode_user_agent,
    }

    try:
        with httpx.Client(timeout=settings.geocode_timeout_seconds) as client:
            response = client.get(settings.geocode_reverse_url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None

    return format_location_label_from_payload(payload)
