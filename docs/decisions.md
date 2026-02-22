# Decisions

## ADR-001: Backend framework = FastAPI

- Date: 2026-02-22
- Status: accepted
- Decision: Use FastAPI + SQLAlchemy for API implementation.
- Why: Fast iteration, strong typing, clean dependency injection for auth/ACL checks.

## ADR-002: Data store = PostgreSQL + SQLAlchemy models

- Date: 2026-02-22
- Status: accepted
- Decision: Persist users, parking records, and photo metadata in PostgreSQL.
- Why: Relational integrity and clear ownership constraints.

## ADR-003: Media storage = filesystem volume

- Date: 2026-02-22
- Status: accepted
- Decision: Store image payloads in `data/uploads`, keep metadata paths in DB.
- Why: Simpler local and VPS deployment with Docker volumes.

## ADR-004: Access control model

- Date: 2026-02-22
- Status: accepted
- Decision: Non-admin users can only access their own records/photos; admin can access all.
- Why: Matches explicit product requirement for multi-user isolation with admin override.

## ADR-005: MFA model = TOTP

- Date: 2026-02-22
- Status: accepted
- Decision: Implement optional per-user TOTP MFA setup/verify/disable.
- Why: Provides practical second factor support with broad authenticator compatibility.

## ADR-006: Frontend packaging = Vite PWA

- Date: 2026-02-22
- Status: superseded by ADR-021
- Decision: React + Vite with plugin-based PWA build pipeline.
- Why: Initially chosen for fast local development and installable app behavior on mobile.

## ADR-007: Bootstrap admin pattern

- Date: 2026-02-22
- Status: accepted
- Decision: First account is created through `/api/auth/bootstrap` and is admin.
- Why: Satisfies requirement for initial admin creation without pre-seeding secrets in source.

## ADR-008: Test-gated delivery

- Date: 2026-02-22
- Status: accepted
- Decision: Treat validation as a completion gate for all code changes and require automated tests per functionality change.
- Why: Keeps code quality and regression resistance aligned with production-readiness and security goals.

## ADR-009: Dev API routing = same-origin `/api` with proxy

- Date: 2026-02-22
- Status: accepted
- Decision: In Docker development, frontend calls `/api` and Vite proxies to backend (`VITE_PROXY_TARGET`) instead of hardcoding `localhost` API URLs.
- Why: Allows local-network/mobile testing where `localhost` on the client device would otherwise break API connectivity.

## ADR-010: Home capture UX = explicit locate state + capture slots

- Date: 2026-02-22
- Status: accepted
- Decision: Replace manual latitude/longitude fields with explicit `Locate` flow (GPS + reverse place lookup / `No reception`) and use 3 camera-first photo slots with thumbnail preview/retake/remove controls.
- Why: Improves mobile ergonomics and reduces user error in garages/cities while keeping the save flow explicit.

## ADR-011: Location optional with evidence fallback

- Date: 2026-02-22
- Status: accepted
- Decision: Allow parking record creation without coordinates when a note and/or photos are provided; enforce latitude/longitude as an all-or-nothing pair.
- Why: Parking garages can block GPS, so save must still work with contextual evidence while preserving API data integrity.

## ADR-012: Persist location label + expandable details cards

- Date: 2026-02-22
- Status: accepted
- Decision: Persist reverse-geocoded place text on records (`location_label`) and render latest/history with a shared expandable card (`More info`/`Close`) that shows map preview, saved address text, photos, and map actions.
- Why: Improves scanability and avoids repeated geocoding lookups while giving a compact default list view with richer on-demand details.

## ADR-013: Address label quality gate

- Date: 2026-02-22
- Status: accepted
- Decision: Reject coordinate-style `location_label` values whenever coordinates are stored/updated and normalize accepted labels to street-first human-readable text.
- Why: Coordinates are retained for routing/map rendering, but end-user list/detail UX should consistently show readable physical location text.

## ADR-014: Local bundled hero background image

- Date: 2026-02-22
- Status: accepted
- Decision: Use a locally bundled parked-car background image (`frontend/public/images/parking-background-option-3.jpg`) from selected royalty-free source, rendered with theme-aware overlays.
- Why: Keeps visual identity aligned with app purpose while avoiding external runtime hotlink dependencies and preserving text readability.

## ADR-015: Open self-registration + split auth modes

- Date: 2026-02-22
- Status: accepted
- Decision: Keep self-registration open (no moderation gate) and render logged-out auth as two explicit modes (`Sign in`/`Register`) under the standard top bar.
- Why: Matches product direction for immediate onboarding and provides a clearer mobile-first auth flow with space reserved for future banner content.

## ADR-016: Two-phase MFA login UX

- Date: 2026-02-22
- Status: accepted
- Decision: Keep login forms focused on username/password and trigger OTP entry in a second-step modal only when backend indicates MFA is required.
- Why: Reduces clutter for non-MFA users while preserving strong authentication for MFA-enabled accounts.

## ADR-017: Local QR generation for MFA setup

- Date: 2026-02-22
- Status: accepted
- Decision: Generate MFA setup QR code client-side from `otpauth_url` and render it above the secret.
- Why: Provides fast scan setup without depending on third-party QR services and keeps MFA provisioning data local to the app session.

## ADR-018: Admin user lifecycle management in-app

- Date: 2026-02-22
- Status: accepted
- Decision: Add admin-only user update/delete endpoints and an admin UI with split `Add users` / `Edit users` sections, including modal-based role/password changes.
- Why: Reduces operational friction for multi-user management while preserving guardrails (no self edit/delete via admin endpoints and no removal of last admin).

## ADR-019: Rotating refresh-token sessions

- Date: 2026-02-22
- Status: accepted
- Decision: Keep short-lived JWT access tokens for API auth and add DB-backed rotating refresh tokens in HttpOnly cookies for session continuity.
- Why: Reduces re-login friction for PWA/mobile restarts while limiting long-lived bearer token exposure.
- Details:
  - Refresh tokens are random high-entropy secrets and stored hashed (`sha256`) in DB.
  - `/api/auth/refresh` rotates token on every use and rejects invalid/replayed/expired tokens.
  - Invalid/replayed refresh usage revokes active refresh sessions for that user.
  - Logout revokes current refresh token; password changes revoke all refresh tokens for the user.
  - Frontend auto-refreshes on startup and performs a single `401` retry after refresh.

## ADR-020: Centralized API input validation policy

- Date: 2026-02-22
- Status: accepted
- Decision: Centralize username/password/text validation in backend and enforce it through auth/user/parking schemas/routes.
- Why: Prevent inconsistent endpoint behavior and reduce malformed/untrusted input reaching persistence/auth logic.
- Details:
  - Usernames: normalized lowercase, 3-64 chars, restricted character set.
  - Password policy for create/reset/change: 8-128 chars with uppercase/lowercase/digit.
  - Text fields (`note`, `location_label`) are normalized and reject control characters.
  - Admin/user path/query identifiers and limits are validated at API boundary where applicable.

## ADR-021: Replace plugin-based PWA build chain with local manifest/service worker

- Date: 2026-02-22
- Status: accepted
- Decision: Remove `vite-plugin-pwa` and ship PWA support through static `manifest.webmanifest` + local `sw.js`.
- Why: Dependency audit showed unresolved high-severity advisories in the plugin/workbox chain; local implementation reduces third-party attack surface while preserving installable PWA behavior.
- Security note: service worker cache excludes `/api/*` to avoid caching authenticated API responses.

## ADR-022: PWA cache versioning keyed by release tag

- Date: 2026-02-22
- Status: accepted
- Decision: Register service worker with a versioned URL query (`/sw.js?v=<APP_VERSION>`) and derive cache namespace from that version.
- Why: Ensures installed/mobile PWA clients receive deterministic cache rotation on each release deployment instead of remaining on stale app-shell caches.
- Details:
  - Deployment sets `APP_VERSION` (typically equal to git release tag) and forwards it to frontend build as `VITE_APP_VERSION`.
  - Service worker cache key prefix includes release version.
  - Navigation fetch strategy uses network-first with offline fallback to cached `index.html` for better update propagation while preserving offline behavior.

## ADR-023: Client-side accent color presets for UI controls

- Date: 2026-02-22
- Status: accepted
- Decision: Add user-selectable accent presets in profile settings and apply them live to primary buttons and active selector controls.
- Why: Improves personalization and quick visual contrast tuning on mobile/desktop without introducing backend profile storage complexity.
- Details:
  - Accent selection is stored in browser local storage (`fmr_accent_color`).
  - Accent applies to primary CTA buttons and active navigation/auth selectors.
  - Each preset defines separate light/dark tone values so contrast remains readable across both themes.
  - Presets are curated for white foreground label readability over the existing app background treatment.

## ADR-024: Surface release metadata in settings UI

- Date: 2026-02-22
- Status: superseded
- Decision: The settings footer metadata line was removed to reduce UI noise and keep the settings screen focused on user controls.
- Why: The footer was not essential for primary use and consumed space near bottom navigation, especially on mobile.
- Details:
  - Build/version metadata remains available via deployment config and git tags/releases.
  - `APP_VERSION` remains in use for service worker cache versioning.

## ADR-025: Sticky active parking session on home

- Date: 2026-02-22
- Status: accepted
- Decision: Replace `Last parked` on home with a two-state flow: `Parked?` start form and `You are parked` active session panel that ends only on explicit confirmation.
- Why: Matches real parking behavior, prevents accidental history writes before a parking action is complete, and improves day-of-use orientation while parked.
- Details:
  - `Park Here Now` starts a local active session when location or note/photo evidence exists.
  - Active session shows start time, running duration, optional map, notes, and photo thumbnails.
  - `End parking` requires yes/no confirmation and writes the record to history only after confirmation.
  - Active session is persisted per user in browser local storage to survive app close/reopen.
  - While active and permission granted, browser notifications can display parked duration updates.

## ADR-026: Manual logout must suppress same-session silent refresh

- Date: 2026-02-22
- Status: accepted
- Decision: When logout is user-initiated, set a client-side manual-logout guard that blocks the no-token startup refresh path in the same app session.
- Why: Prevents mobile timing races where `/auth/logout` completion can lag and a background refresh could immediately re-authenticate the user after they sign out.
- Details:
  - Guard is enabled in logout handler before token state is cleared.
  - Guard is reset on explicit authentication success (login/register/bootstrap).
  - API-level token revocation behavior remains unchanged (refresh token revoked server-side).

## ADR-027: Mobile home layout overflow guard

- Date: 2026-02-22
- Status: accepted
- Decision: Add horizontal overflow constraints and min-width guards on key home-tab layout containers and long-text blocks.
- Why: Fixes mobile-specific rightward overflow that caused off-screen background exposure and apparent bottom-tab shift on the home tab.
- Details:
  - Apply root horizontal clipping.
  - Add `min-width: 0` to grid/flex containers that host wide content.
  - Allow long labels/metadata to wrap safely in narrow viewports.

## Related docs

- [Docs index](index.md)
- [Architecture](architecture.md)
- [Dev Guide](dev-guide.md)
- [API Reference](api-reference.md)
- [Security](security.md)
