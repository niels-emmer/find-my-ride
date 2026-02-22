# Dev Guide

## Prerequisites

- Docker + Docker Compose
- macOS terminal (`zsh`) for local workflow
- Optional: Python virtualenv for docs (`mkdocs`)

## Initial setup

1. Create env file:

```bash
cp .env.example .env
```

2. Update at minimum:

- `POSTGRES_PASSWORD`
- `SECRET_KEY` (64+ random chars)
- `CORS_ORIGINS`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `REFRESH_TOKEN_COOKIE_SECURE` (`true` in production behind HTTPS)
- `VITE_API_URL` (keep as `/api` in Docker dev)
- `VITE_PROXY_TARGET` (default: `http://backend:8000`)

## Run locally (Docker)

```bash
docker compose up --build
```

or:

```bash
make up
```

Endpoints:

- Frontend: `http://localhost:5173`
- Backend OpenAPI docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/healthz`

## Development loop

- Backend uses `uvicorn --reload` in compose dev service.
- Frontend uses Vite dev server with hot reload and `/api` proxy to backend.
- DB and upload storage are persisted in docker volumes / local folders.

## Phone/LAN testing

- Access the app from another device with `http://<host-lan-ip>:<FRONTEND_PORT>`.
- Keep `VITE_API_URL=/api` for this flow. If set to `http://localhost:...`, phones/tablets will try to call their own localhost and stall on status loading.
- Geolocation caveat: most mobile browsers require HTTPS for GPS access. Over plain HTTP LAN URLs, `Locate` can fail immediately and show `No reception`.

## Bootstrap flow

1. Open frontend.
2. Create first user in "Create first admin" screen.
3. That user is stored as admin and signed in immediately.

## Login and registration flow

- If users already exist, the logged-out screen shows the same top app bar styling as the signed-in app (without user menu actions).
- An auth mode bar appears directly below the top bar with `Sign in` and `Register`.
- `Register` is open by default (no moderation gate) and creates a normal non-admin account.
- `Sign in` first submits username/password only; if MFA is enabled for that account, an OTP modal appears as a second step.
- The auth card is positioned in the lower half of the viewport with intentional extra bottom space reserved for a future banner.
- Username input is normalized to lowercase and validated for `a-z`, `0-9`, `.`, `_`, `-` (3-64 chars).
- Password policy for create/reset/change: 8-128 chars with at least one uppercase, lowercase, and digit.

## Session and refresh-token flow

- Auth endpoints (`bootstrap`, `register`, `login`) return access token JSON and set an HttpOnly refresh cookie.
- Frontend stores access token for API bearer auth and includes cookies (`credentials: include`) for refresh calls.
- On cold start without access token, frontend attempts `/api/auth/refresh` to restore session.
- On API `401` responses with a bearer token, frontend attempts one refresh and retries the original request once.
- Backend rotates refresh token on every successful refresh and stores only a hashed token in DB.
- Logout revokes only the current refresh token and clears cookie.
- Password changes (self-service or admin reset) revoke all refresh tokens for that user.
- Manual logout in the UI disables same-session auto-refresh recovery to avoid mobile race conditions where slow logout responses could re-authenticate immediately.

## Parking capture flow

- `Locate` button requests geolocation and attempts reverse-lookup location naming.
- On success, the UI shows place name and coordinates.
- On successful save with coordinates, the current place label is persisted as `location_label` for later history/latest display.
- Coordinate-style location labels are rejected by the API; coordinates must be paired with a physical address label.
- Stored labels are normalized in street-first order (`Street 12, ZIP City, Province, Country`).
- On failure, the UI shows `No reception`; save is still allowed when note and/or photos are provided.
- Photos are handled via 3 capture slots; each slot is an empty action button or an image thumbnail that can be retaken/removed.
- Camera capture prefers an in-app camera modal (`getUserMedia`) to avoid external camera-app round trips on memory-constrained mobile browsers; gallery/file-picker fallback remains available.
- Any parking photo thumbnail can be tapped/clicked to open a full-size preview modal.

## Multi-user behavior

- Admin can create new users in the UI (`settings` > `admin` > `add users`).
- Admin can manage existing users in `settings` > `admin` > `edit users`:
  - `Edit` opens a modal to reset password and/or change admin role
  - `Delete` removes the selected user
  - self account is visible but does not expose edit/delete actions
- Non-admin users only see/delete their own parking records.
- Admin can filter history scope by user or all users.

## UI navigation

- The authenticated app uses 3 fixed bottom tabs:
  - `home`: parking start capture + active parking session
  - `history`: record history with expandable details and delete
  - `settings`: profile and admin
- Top app bar:
  - app brand on the left
  - account icon menu on the right with signed-in user and sign-out action
- Home-tab mobile layout includes horizontal overflow guards to prevent off-screen content and shifted bottom navigation.
- Background image asset:
  - file: `frontend/public/images/parking-background-option-3.jpg`
  - source: `https://www.pexels.com/photo/a-modern-car-in-an-underground-garage-16304132/`
  - license: `https://www.pexels.com/license/`
- `home` state flow:
  - default shows `Parked?` capture form (Locate, note, up to 3 photos)
  - after `Park Here Now`, app switches to `You are parked` with start timestamp + running duration
  - active panel shows optional location map, note, thumbnails, and `End parking` confirmation (yes/no)
  - active session is sticky per user across app close/reopen via local browser persistence
- `history` record cards:
  - collapsed view shows time/date, saved location text, and quick actions
  - `More info` expands details with OpenStreetMap embed preview, a `More details` note section, thumbnails, and a `Take me there` section
  - `Delete` removes the record
- `settings` > `profile` includes:
  - change password
  - theme switcher (system/light/dark)
  - accent color selector (preset button/select highlight palettes, applied live and tuned for light/dark)
  - MFA setup/verify/disable
- `settings` > `admin` is only visible to admin users and contains `edit users`.
- `settings` > `admin` layout:
  - `Add users` section for username/password/admin toggle creation
  - `Edit users` section for list + edit/delete actions (non-self users only)

## MFA behavior

- Any signed-in user can start MFA setup.
- App returns TOTP secret + provisioning URI, and the UI renders a QR code from that URI for app scan.
- User verifies one OTP code to enable MFA.
- If enabled, login requires `otp_code`.

## Documentation workflow

When changing code:

1. Update relevant pages in `docs/`.
2. Keep `docs/api-reference.md` in sync with route changes.
3. Keep architecture and decision pages current.

## One-time backfill for old address labels

If older records have missing/coordinate-style `location_label` values, run:

```bash
docker compose run --rm --no-deps backend python -m app.scripts.backfill_location_labels
```

This keeps coordinates intact and writes resolved physical addresses where lookup succeeds.

## Validation and tests policy

- Any code change must be validated before completing work.
- Every functional change must include or update automated tests.
- If a test command cannot be executed in the current environment, report that gap explicitly.

Run backend tests:

```bash
make test
```

`make test` runs the suite in Docker (`backend` service image) to avoid host dependency drift.
If you already installed backend Python dependencies locally, you can run:

```bash
make test-local
```

Run frontend tests:

```bash
make test-frontend
```

Run both:

```bash
make test-all
```

Run dependency security scans:

```bash
make security-scan
```

`make security-scan` runs:
- `npm audit` for frontend dependencies
- `pip-audit` for backend dependencies (inside backend container)
- `pip-audit` for docs dependencies (ephemeral Python container)

## Serve docs locally

```bash
pip install -r docs/requirements.txt
mkdocs serve
```

or:

```bash
make docs-serve
```

Open `http://127.0.0.1:8001`.

## Production deployment notes

- Use `docker-compose.prod.yml`.
- `docker-compose.prod.yml` maps frontend host port from `FRONTEND_PORT` (fallback `18080`).
- Production frontend nginx proxies `/api/*` to backend service, so no separate public backend port is required.
- Set `APP_VERSION` to the release tag before deploy (for example `APP_VERSION=v0.1-beta.1`) so PWA cache/version updates propagate to installed mobile clients.
- Place frontend/backend behind an SSL reverse proxy (proxy config not included here).
- Restrict CORS to real public domain(s).
- Use strong credentials and persisted volumes for db/uploads.

## Related docs

- [Docs index](index.md)
- [Architecture](architecture.md)
- [Decisions](decisions.md)
- [API Reference](api-reference.md)
- [Security](security.md)
