.PHONY: up down logs build docs-serve docs-build

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

docs-serve:
	mkdocs serve -a 127.0.0.1:8001

docs-build:
	mkdocs build
