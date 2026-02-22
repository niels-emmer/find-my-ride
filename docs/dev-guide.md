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
- Frontend uses Vite dev server with hot reload.
- DB and upload storage are persisted in docker volumes / local folders.

## Bootstrap flow

1. Open frontend.
2. Create first user in "Create first admin" screen.
3. That user is stored as admin and signed in immediately.

## Parking capture flow

- Primary path uses browser geolocation in one tap.
- If GPS is unavailable (for example deep indoor garages), the UI accepts manual latitude/longitude fallback before submit.

## Multi-user behavior

- Admin can create new users in the UI (Admin users panel).
- Non-admin users only see/edit their own parking records.
- Admin can filter history scope by user or all users.

## MFA behavior

- Any signed-in user can start MFA setup.
- App returns TOTP secret + provisioning URI.
- User verifies one OTP code to enable MFA.
- If enabled, login requires `otp_code`.

## Documentation workflow

When changing code:

1. Update relevant pages in `docs/`.
2. Keep `docs/api-reference.md` in sync with route changes.
3. Keep architecture and decision pages current.

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
- Place frontend/backend behind an SSL reverse proxy (proxy config not included here).
- Restrict CORS to real public domain(s).
- Use strong credentials and persisted volumes for db/uploads.
