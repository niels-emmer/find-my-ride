from __future__ import annotations

import time
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


db_url = make_url(settings.database_url)
engine_kwargs: dict[str, object] = {"pool_pre_ping": True}

if db_url.get_backend_name() == "sqlite":
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    if db_url.database in (None, "", ":memory:"):
        engine_kwargs["poolclass"] = StaticPool

engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def wait_for_db(max_attempts: int = 20, delay_seconds: float = 2.0) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == max_attempts:
                raise
            time.sleep(delay_seconds)


def init_db() -> None:
    from app.models import parking_record, photo, refresh_token, user  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _run_startup_schema_adjustments()


def _run_startup_schema_adjustments() -> None:
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS location_label TEXT"))
        conn.execute(text("ALTER TABLE parking_records ALTER COLUMN latitude DROP NOT NULL"))
        conn.execute(text("ALTER TABLE parking_records ALTER COLUMN longitude DROP NOT NULL"))
