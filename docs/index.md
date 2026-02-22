# find-my-ride docs index

This is the main documentation entrypoint for both humans and agents.

## What this project is

`find-my-ride` is a self-hosted, multi-user PWA to help users store and recover where they parked.

Core flow:

- Start parking from `home` with one tap
- Save any combination of:
  - location (GPS + reverse-geocoded address)
  - note
  - up to 3 photos
- Keep an active sticky parking state (`You are parked`) until explicitly ended
- Save finished sessions to history with expandable details and map-navigation links

## Stack at a glance

- Frontend: React + TypeScript + Vite (PWA)
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL
- Runtime: Docker Compose (dev + prod compose files)
- Documentation: MkDocs (`mkdocs.yml`, source in `docs/`, output in `site/`)

## Key capabilities (current)

### Authentication and users

- Initial bootstrap admin flow
- Self-registration (currently open, no moderation)
- Username validation/normalization
- Password policy enforcement
- Optional TOTP MFA with QR-based setup
- Multi-user RBAC:
  - users access only their own data
  - admin can manage users and view all records

### Session and security behavior

- Short-lived access token + rotating refresh token cookie
- Session restoration on app startup using refresh endpoint
- Refresh-token revocation on logout and password changes
- Manual logout guard blocks same-session silent refresh to prevent mobile logout/refresh race re-authentication
- Input validation/sanitization on API boundaries
- Security scan workflow available (`make security-scan`)

### Parking workflow and UX

- `Parked?` form supports location and no-GPS fallback using notes/photos
- In-app camera capture (`getUserMedia`) with gallery fallback
- Tap-to-expand full-size image previews for parking photos
- Home tab layout hardened for mobile to prevent horizontal overflow and off-screen bottom navigation
- Active parking card includes:
  - started time
  - running duration
  - optional location map
  - `Take me there` links (Google Maps / OpenStreetMap)
  - `Actions` section with `End parking`
- Active session persistence across app restarts
- History with expandable cards, notes, photos, map preview, and route links

## Read this next (task-oriented)

- [Architecture](architecture.md): system structure, data model, frontend/backend responsibilities
- [Decisions](decisions.md): ADRs and why choices were made
- [Dev Guide](dev-guide.md): local setup, commands, workflow, testing
  - includes the canonical README screenshot refresh workflow (size/zoom/theme/data state)
- [API Reference](api-reference.md): endpoints, payloads, constraints
- [Security](security.md): security posture, controls, hardening expectations

## Fast operations

- Run full test + infra checks: `make test-all`
- Run frontend tests: `make test-frontend`
- Build docs: `./.venv-docs/bin/mkdocs build`
- Serve docs locally: `./.venv-docs/bin/mkdocs serve -a 127.0.0.1:8001`

## Source-of-truth policy

Code is the source of truth. If docs and code diverge, update docs to match code.
