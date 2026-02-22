.PHONY: up down logs build test test-local test-frontend test-all docs-serve docs-build security-scan

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

test:
	docker compose --env-file .env.example run --rm --no-deps backend python -m unittest discover -s tests -v

test-local:
	PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v

test-frontend:
	cd frontend && npm test

test-all: test test-frontend

docs-serve:
	mkdocs serve -a 127.0.0.1:8001

docs-build:
	mkdocs build

security-scan:
	cd frontend && npm audit
	docker compose --env-file .env.example run --rm --no-deps backend sh -lc "pip install --quiet pip-audit && pip-audit -r /app/requirements.txt --format columns"
	docker run --rm -v "$$PWD":/src -w /src python:3.12-slim sh -lc "pip install --quiet pip-audit && pip-audit -r docs/requirements.txt --format columns"
