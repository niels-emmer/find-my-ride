from __future__ import annotations

from sqlalchemy import select

from app.core.database import SessionLocal, wait_for_db
from app.models.parking_record import ParkingRecord
from app.services.geocoding import reverse_geocode_location_label_sync


def main() -> None:
    wait_for_db()

    updated = 0
    failed = 0
    skipped = 0

    with SessionLocal() as db:
        records = db.scalars(select(ParkingRecord)).all()
        for record in records:
            if record.latitude is None or record.longitude is None:
                skipped += 1
                continue

            resolved = reverse_geocode_location_label_sync(record.latitude, record.longitude)
            if not resolved:
                failed += 1
                continue

            current = (record.location_label or "").strip()
            if current == resolved:
                skipped += 1
                continue

            record.location_label = resolved
            db.add(record)
            updated += 1

        db.commit()

    print(f"Backfill complete: updated={updated} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
