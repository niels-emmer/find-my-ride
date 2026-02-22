# find-my-ride memory index

This is the project memory entrypoint for engineers and agents.

## Current status

- Stack scaffolded: React PWA frontend + FastAPI backend + PostgreSQL + Docker Compose
- Auth implemented: bootstrap admin, login, optional self-register, optional TOTP MFA
- Parking workflow implemented: create records with geo + note + up to 3 photos, view latest, history edit, record/photo delete
- Access control implemented: per-user data isolation with admin override
- Documentation system active with MkDocs

## Memory sections

- [Architecture](architecture.md)
- [Decisions](decisions.md)
- [Dev Guide](dev-guide.md)
- [API Reference](api-reference.md)

## Source-of-truth policy

Code is the source of truth. If docs conflict with code, update docs immediately.
