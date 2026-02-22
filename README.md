# find-my-ride

A secure, multi-user web app (PWA) for saving where you parked your car and finding it later.

## What this setup includes

- `frontend/`: React + TypeScript + Vite + PWA support
- `backend/`: FastAPI + PostgreSQL API with JWT auth, role-based access, and optional TOTP MFA
- `docker-compose.yml`: local development stack
- `docker-compose.prod.yml`: production-like container stack (for deployment behind an SSL reverse proxy)
- `docs/` + `mkdocs.yml`: project memory/docs system
- `AGENTS.md`: agent conventions for keeping code and docs aligned

## Core features implemented

- One-tap park record capture: timestamp, latitude/longitude, optional note, optional up to 3 photos
- Manual latitude/longitude fallback for low-GPS environments (e.g., deep garages)
- Last parked location with one-click links to Google Maps and OpenStreetMap
- Full history list with edit support and photo add/remove
- Multi-user data isolation (users only see their own records)
- Admin override to view all users and all records
- First created account becomes admin (bootstrap endpoint)
- Optional MFA (TOTP) per user
- Light/dark/system theme support

## Quick start (Docker)

1. Copy env template:

```bash
cp .env.example .env
```

2. Set secure values in `.env` (`POSTGRES_PASSWORD`, `SECRET_KEY`).

3. Start dev stack:

```bash
docker compose up --build
```

or:

```bash
make up
```

4. Open:
- Frontend: `http://localhost:5173`
- Backend API docs: `http://localhost:8000/docs`

## Local docs site

1. Create a Python env (recommended).
2. Install docs deps:

```bash
pip install -r docs/requirements.txt
```

3. Serve docs:

```bash
mkdocs serve
```

4. Open `http://127.0.0.1:8001`

## Deployment notes

- Intended for deployment behind an existing SSL reverse proxy.
- Set strict, production-grade secrets and `CORS_ORIGINS`.
- Mount persistent storage for `data/uploads` and PostgreSQL volume.
- Use `docker-compose.prod.yml` for production builds.
