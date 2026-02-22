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
- Status: accepted
- Decision: React + Vite + `vite-plugin-pwa`.
- Why: Fast local development and installable app behavior on mobile.

## ADR-007: Bootstrap admin pattern

- Date: 2026-02-22
- Status: accepted
- Decision: First account is created through `/api/auth/bootstrap` and is admin.
- Why: Satisfies requirement for initial admin creation without pre-seeding secrets in source.
