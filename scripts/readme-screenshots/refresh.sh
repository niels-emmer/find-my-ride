#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env"
  set +a
fi

BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
POSTGRES_DB=${POSTGRES_DB:-find_my_ride}
POSTGRES_USER=${POSTGRES_USER:-find_my_ride}
README_DEMO_USERNAME=${README_DEMO_USERNAME:-readme_demo}
README_DEMO_PASSWORD=${README_DEMO_PASSWORD:-ReadmeDemo9A}

API_BASE="http://127.0.0.1:${BACKEND_PORT}/api"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq
require_cmd docker
require_cmd npm
require_cmd node

register_payload=$(printf '{"username":"%s","password":"%s"}' "$README_DEMO_USERNAME" "$README_DEMO_PASSWORD")
register_response=$(curl -sS -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' -d "$register_payload" || true)
access_token=$(printf '%s' "$register_response" | jq -r '.access_token // empty')
user_id=$(printf '%s' "$register_response" | jq -r '.user.id // empty')
effective_demo_username="$README_DEMO_USERNAME"

if [[ -z "$access_token" || -z "$user_id" ]]; then
  login_response=$(curl -sS -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' -d "$register_payload")
  access_token=$(printf '%s' "$login_response" | jq -r '.access_token // empty')
  user_id=$(printf '%s' "$login_response" | jq -r '.user.id // empty')
fi

if [[ -z "$access_token" || -z "$user_id" ]]; then
  fallback_username="${README_DEMO_USERNAME}_$(date +%s)"
  fallback_payload=$(printf '{"username":"%s","password":"%s"}' "$fallback_username" "$README_DEMO_PASSWORD")
  fallback_register_response=$(curl -sS -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' -d "$fallback_payload" || true)
  access_token=$(printf '%s' "$fallback_register_response" | jq -r '.access_token // empty')
  user_id=$(printf '%s' "$fallback_register_response" | jq -r '.user.id // empty')
  effective_demo_username="$fallback_username"
fi

if [[ -z "$access_token" || -z "$user_id" ]]; then
  echo "Could not authenticate screenshot demo user '$README_DEMO_USERNAME' or fallback account." >&2
  echo "Register response: $register_response" >&2
  exit 1
fi

echo "Seeding README history data for user: $effective_demo_username ($user_id)"
docker compose exec -T db psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 \
  -v demo_user_id="$user_id" \
  < "$SCRIPT_DIR/seed_history.sql" >/dev/null

if [[ ! -d "$SCRIPT_DIR/node_modules/playwright" ]]; then
  echo "Installing Playwright dependency (one-time)..."
  (cd "$SCRIPT_DIR" && npm install --no-audit --no-fund)
fi

echo "Capturing README screenshots at ${FRONTEND_URL}"
(
  cd "$SCRIPT_DIR"
  ACCESS_TOKEN="$access_token" FRONTEND_URL="$FRONTEND_URL" node capture.mjs
)

echo "Validating screenshot dimensions"
sips -g pixelWidth -g pixelHeight \
  "$REPO_ROOT/docs/assets/screenshots/home.png" \
  "$REPO_ROOT/docs/assets/screenshots/history.png" \
  "$REPO_ROOT/docs/assets/screenshots/settings.png"

echo "README screenshot refresh complete."
