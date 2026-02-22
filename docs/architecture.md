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
- Frontend API path uses same-origin `/api` and Vite dev proxy forwards to backend (`VITE_PROXY_TARGET`)

Production-style (`docker-compose.prod.yml`):

- `frontend` static app on `:${FRONTEND_PORT}` (container `80`; default host fallback `18080`)
- `backend` internal API
- `db` internal PostgreSQL
- Frontend nginx proxies `/api/*` to backend (`http://backend:8000`) so the browser keeps same-origin API calls

## Backend architecture

Main modules:

- `app/core/`: config, database session, security utilities, dependencies
- `app/models/`: SQLAlchemy models (`User`, `ParkingRecord`, `Photo`, `RefreshToken`)
- `app/schemas/`: Pydantic request/response models
- `app/api/routes/`: route handlers for `system`, `auth`, `users`, `parking`
- `app/services/`: geocoding, MFA, refresh-token lifecycle, and file storage helpers

Data model:

- `users`: account identity, password hash, admin flag, MFA status/secret
- `parking_records`: owner, optional lat/lng pair, persisted location label text (street-first normalized), note, parked time, timestamps
- `photos`: per-record metadata and storage path
- `refresh_tokens`: hashed refresh token values, owner, expiry, and revocation timestamp

## Frontend architecture

Single-page React app with feature sections:

- Bootstrap admin / login / open self-register (no moderation)
- Login flow is two-phase for MFA users: username/password first, then OTP in a modal when challenged
- MFA setup shows a locally generated QR code above the TOTP secret, using the backend `otpauth_url`
- Bottom-tab navigation:
  - `home`: start parking + active parking session (sticky until ended)
  - `history`: record history + details + delete
  - `settings`: profile + admin (admin-only)
- Top app bar with account menu for signed-in identity and sign-out
- Logged-out auth layout mirrors the top app bar style and places auth mode buttons (`Sign in`/`Register`) directly below it
- Auth form panel is anchored toward the lower half of the viewport with reserved bottom spacing for a future banner slot
- Subtle parked-car background image (locally bundled from selected royalty-free source) with theme-aware overlays to preserve readability
- Park-now action with `Locate` (geolocation) + reverse place lookup + optional note + up to 3 photos
- Park-now photo intake uses 3 camera-first capture slots with thumbnail preview/retake/remove controls
- Camera capture is handled in-app with `getUserMedia` (when available) to avoid mobile browser restarts during external camera handoff; gallery/file-picker fallback remains available
- File-picker selection is synchronized on `focus`/`visibilitychange` for fallback browser flows
- Park-now location state is explicit (`ready` with place/coords or `No reception`)
- On non-secure contexts (common on HTTP LAN URLs), location state surfaces an HTTPS requirement hint for mobile browsers
- Park-now start accepts either a valid location pair or note/photo evidence, allowing garage use when GPS is unavailable
- Park-now requires a resolved physical `location_label` when coordinates are saved (coordinate-style labels are rejected)
- Home active state (`You are parked`) shows start timestamp, running duration, optional location map, notes, and thumbnails until user confirms `End parking`
- When active parking has coordinates, home also shows a `Take me there` section with `Google Maps` and `OpenStreetMap` links; `Actions` section always contains `End parking`
- Parking thumbnails (home capture, active parking, history details) open a full-size preview modal on tap/click
- Active parking session is persisted per user in browser storage so app restarts restore the in-progress state
- Active parking can emit browser notifications with parked duration when notification permission is granted
- History cards use expandable (`More info`/`Close`) details with OpenStreetMap embed preview, saved location text, a `More details` note section, photo thumbnails, and route/actions sections
- Date/time rendering in cards is day-first (`dd-mm-yyyy`) with browser-local time
- History cards provide quick delete action from collapsed state
- Profile controls: change password, MFA setup/verify/disable, theme mode switch, and accent color preset selection (theme-aware tones, stored client-side)
- Admin user management and history scope filtering (`Admin` > `Add users` + `Edit users` list with edit/delete actions and role/password modal)

PWA support:

- Static web manifest at `frontend/public/manifest.webmanifest`
- Local service worker at `frontend/public/sw.js`, registered in `src/main.tsx`
- Service worker explicitly avoids caching `/api/*` responses to prevent sensitive auth/data caching
- Service worker cache is versioned by app release tag via `VITE_APP_VERSION`/`APP_VERSION` and rotates cache namespace on deploy
- Navigation requests use network-first caching so online clients can fetch the latest app shell after a release

## Security model

- Passwords hashed with bcrypt (`passlib`)
- Username validation and normalization at API boundary (lowercased, restricted character set)
- Password policy enforced at API boundary for create/reset/change operations: 8-128 chars with uppercase/lowercase/digit
- Note/location text sanitization rejects control characters and normalizes whitespace
- Short-lived JWT bearer access tokens with expiry
- Refresh tokens are random 64-byte URL-safe secrets, stored hashed (`sha256`) in DB
- Refresh token cookie is HttpOnly and scoped to `/api/auth`; backend rotates refresh token on every refresh
- Refresh token replay/expired/revoked checks revoke active refresh sessions for that user before rejecting
- Refresh tokens are revoked on logout, self password change, and admin password reset
- Frontend retries once on `401` by refreshing and replaying the original API request
- Route-level auth dependency (`get_current_user`) + admin guard (`get_admin_user`)
- Owner-based row access checks for parking records/photos
- Upload constraints:
  - Max photos per record (`MAX_PHOTOS_PER_RECORD`, default 3)
  - Allowed MIME types: jpeg/jpg/pjpeg/png/webp/heic/heic-sequence/heif/heif-sequence/avif
  - Max photo size (`MAX_PHOTO_SIZE_MB`, default 8 MB)
- Basic security headers middleware enabled in backend
- CORS allowlist controlled by `CORS_ORIGINS` with credentials enabled for cookie-based refresh flow

## Limitations in current baseline

- Access tokens are still persisted in browser `localStorage` between reloads (refresh token stays HttpOnly cookie).
- MFA secret is stored in DB without envelope encryption.
- DB schema migrations are currently startup `create_all` (no Alembic migration history yet).

These are acceptable for initial scaffold but should be hardened before full production rollout.
