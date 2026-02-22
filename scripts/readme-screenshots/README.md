# README Screenshot Automation

This folder keeps the canonical automation for regenerating README screenshot assets.

## What is stored here

- `refresh.sh`: end-to-end workflow (authenticate demo user, seed DB rows, capture screenshots)
- `seed_history.sql`: deterministic fake history rows used for README captures
- `capture.mjs`: Playwright capture flow for `home`, `history`, `settings`

## Usage

1. Start the local stack:

```bash
docker compose up -d --build
```

2. Run refresh:

```bash
./scripts/readme-screenshots/refresh.sh
```

Optional environment overrides:

- `README_DEMO_USERNAME` (default `readme_demo`)
- `README_DEMO_PASSWORD` (default `ReadmeDemo9A`)
- `CHROME_EXECUTABLE` (optional browser path override)

If `README_DEMO_USERNAME` already exists with a different password, `refresh.sh` automatically creates a timestamp-suffixed fallback demo user for that run.

Outputs are written to:

- `docs/assets/screenshots/home.png`
- `docs/assets/screenshots/history.png`
- `docs/assets/screenshots/settings.png`
