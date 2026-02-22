# AGENTS.md

## Purpose

This repository tracks a production-focused, security-conscious implementation of `find-my-ride`.
Agents working here must keep the documentation memory system current with the codebase.

## Core conventions

- Code is truth.
- If code and docs diverge, update docs immediately.
- No task is complete without validation of changed behavior.
- Every new or changed piece of functionality must include automated test coverage.
- After code changes or documentation updates, commit changes on the active working branch.
- Use descriptive commit messages that clearly explain the change intent and scope.
- Keep architecture/security decisions documented in `docs/decisions.md`.
- Keep API behavior documented in `docs/api-reference.md` when endpoints change.
- Keep onboarding/developer workflow up to date in `docs/dev-guide.md`.

## Required docs workflow

When making meaningful code changes, update as needed:

1. `docs/index.md` (high-level status and pointers)
2. `docs/architecture.md` (system structure)
3. `docs/decisions.md` (new ADR-style decisions)
4. `docs/dev-guide.md` (dev and deployment workflow)
5. `docs/api-reference.md` (request/response/auth changes)

## Engineering constraints

- Prefer secure defaults (least privilege, strict validation, explicit auth checks).
- Keep user data partitioned by owner unless admin access is explicitly required.
- Limit upload surface area (count, content type, size).
- Maintain mobile-first usability and PWA behavior.
- Run validation commands before finalizing work and report any gaps explicitly when a command cannot run.
