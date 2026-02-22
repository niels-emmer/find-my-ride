# find-my-ride memory index

This is the project memory entrypoint for engineers and agents.

## Current status

- Stack scaffolded: React PWA frontend + FastAPI backend + PostgreSQL + Docker Compose
- Auth implemented: bootstrap admin, login, open self-register (no moderation), optional TOTP MFA
- Username normalization/validation is enforced across auth and admin user-management endpoints
- Password policy enforced across create/reset/change flows (8-128 chars with uppercase/lowercase/digit)
- Session auth hardened: short-lived access tokens + rotating refresh tokens in HttpOnly cookies
- Frontend auto-restores sessions via refresh cookie at app start and retries once on token-expiry `401`
- Refresh sessions are revoked on logout, self password change, and admin password reset
- PWA update path hardened: service worker cache/version is keyed by `APP_VERSION` (release tag) with network-first navigation fetch
- Login UX uses a two-phase MFA flow: username/password first, OTP modal only when required
- MFA setup renders a QR code (from provisioning URI) above the secret for authenticator app scan
- Parking workflow implemented: start sticky active parking sessions (location or note/photo evidence required), then end/save to history with optional geo + note + up to 3 photos
- Frontend navigation implemented as fixed bottom tabs: home, history, settings
- Home capture uses locate (GPS + reverse place lookup) with explicit no-reception state and 3 photo capture slots with previews (in-app camera capture + gallery fallback); note/photo fallback supports no-GPS garage saves
- Home switches to `You are parked` after start, showing start date/time, running duration, optional map, notes, thumbnails, `Take me there` map links (when location exists), and `End parking` under `Actions`
- Active parking survives app close/reopen via local persistence and can emit browser notifications while parked
- History uses expandable record cards (`More info`/`Close`) with map preview, location text, photos, and direction links; photo thumbnails open full-size on tap/click
- Coordinates with coordinate-style labels are blocked by API validation to keep stored addresses human-readable
- Top app bar includes account menu (signed-in identity + sign-out)
- Settings profile includes password change, theme switcher, theme-aware accent color presets, and MFA controls
- Admin panel supports add/edit/delete user management (excluding self-actions) with role/password updates via modal
- Docker dev frontend API path uses `/api` + Vite proxy target for local-network phone access
- Access control implemented: per-user data isolation with admin override
- Backend automated API tests implemented for auth, MFA, users, records, ACL, and photo flows
- Frontend automated tests implemented for tab navigation and settings/profile/admin UI behavior
- Dependency security scanning workflow implemented (`make security-scan`)
- Documentation system active with MkDocs

## Memory sections

- [Architecture](architecture.md)
- [Decisions](decisions.md)
- [Dev Guide](dev-guide.md)
- [API Reference](api-reference.md)
- [Security](security.md)

## Source-of-truth policy

Code is the source of truth. If docs conflict with code, update docs immediately.
