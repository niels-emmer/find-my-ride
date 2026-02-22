# Architecture

## Overview

`find-my-ride` is a 3-tier app:

- Frontend: React + TypeScript + Vite PWA (`frontend/`)
- Backend API: FastAPI + SQLAlchemy (`backend/`)
- Database: PostgreSQL (`db` service in Docker Compose)

Uploads are stored on filesystem volume `data/uploads` and referenced from database records.

## Runtime topology

Development (`docker-compose.yml`):

- `frontend` on `:5173`
- `backend` on `:8000`
- `db` on `:5432`

Production-style (`docker-compose.prod.yml`):

- `frontend` static app on `:8080` (expected behind external SSL reverse proxy)
- `backend` internal API
- `db` internal PostgreSQL

## Backend architecture

Main modules:

- `app/core/`: config, database session, security utilities, dependencies
- `app/models/`: SQLAlchemy models (`User`, `ParkingRecord`, `Photo`)
- `app/schemas/`: Pydantic request/response models
- `app/api/routes/`: route handlers for `system`, `auth`, `users`, `parking`
- `app/services/`: MFA and file storage helpers

Data model:

- `users`: account identity, password hash, admin flag, MFA status/secret
- `parking_records`: owner, lat/lng, note, parked time, timestamps
- `photos`: per-record metadata and storage path

## Frontend architecture

Single-page React app with feature sections:

- Bootstrap admin / login / optional self-register
- Park-now action with geolocation + optional note + up to 3 photos
- Park-now includes manual lat/lng fallback fields for poor GPS environments
- Latest record quick actions (Google Maps walking route + OpenStreetMap)
- History listing with editing and media management
- MFA setup/verify/disable
- Admin user creation and scope filtering
- Theme mode switch: light/dark/system

PWA support:

- Web manifest via `vite-plugin-pwa`
- Service worker auto-update registration in `src/main.tsx`

## Security model

- Passwords hashed with bcrypt (`passlib`)
- JWT bearer access tokens with expiry
- Route-level auth dependency (`get_current_user`) + admin guard (`get_admin_user`)
- Owner-based row access checks for parking records/photos
- Upload constraints:
  - Max photos per record (`MAX_PHOTOS_PER_RECORD`, default 3)
  - Allowed MIME types: jpeg/png/webp/heic/heif
  - Max photo size (`MAX_PHOTO_SIZE_MB`, default 8 MB)
- Basic security headers middleware enabled in backend
- CORS allowlist controlled by `CORS_ORIGINS`

## Limitations in current baseline

- JWT tokens are stored in browser localStorage by current frontend implementation.
- MFA secret is stored in DB without envelope encryption.
- DB schema migrations are currently startup `create_all` (no Alembic migration history yet).

These are acceptable for initial scaffold but should be hardened before full production rollout.
