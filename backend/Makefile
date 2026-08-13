.PHONY: \
	install \
	test \
	run \
	migration \
	migrate \
	migrate-check \
	downgrade \
	heads \
	current \
	history \
	merge-heads \
	merge-heads-explicit \
	seed \
	docker-build \
	docker-up \
	docker-down \
	docker-migrate \
	docker-downgrade \
	docker-seed

# --- local dev (uv) -----------------------------------------------------
# DATABASE_URL/REDIS_URL/etc. come from backend/.env, loaded automatically by
# pydantic-settings (Settings.model_config env_file=".env") -- no extra
# sourcing needed here, unlike projects that inject secrets via Infisical.

install:
	uv sync --dev

test:
	uv run pytest -v

run:
	uv run uvicorn app.main:app \
		--reload \
		--reload-dir app \
		--host 0.0.0.0 \
		--port 8000

# --- migrations (uv + alembic) ------------------------------------------

migration:
ifndef m
	$(error m must be defined, e.g. make migration m="add foo table")
endif
	uv run alembic revision --autogenerate -m "$(m)"

migrate:
	uv run alembic upgrade head

downgrade:
	uv run alembic downgrade -1

heads:
	uv run alembic heads

current:
	uv run alembic current

history:
	uv run alembic history --verbose

# Fails if the models and the migration chain have drifted (i.e. autogenerate
# would produce a non-empty revision) -- run before committing model changes.
migrate-check:
	uv run alembic check

merge-heads:
ifndef m
	$(error m must be defined, e.g. make merge-heads m="merge heads")
endif
	uv run alembic merge -m "$(m)" heads

merge-heads-explicit:
ifndef m
	$(error m must be defined)
endif
ifndef r
	$(error r must be defined, e.g. r="c9507370e815 fcaffa123877")
endif
	uv run alembic merge -m "$(m)" $(r)

seed:
	uv run python -m app.scripts.seed

# --- docker (full stack: api + db + redis, compose file lives at repo root) ---

COMPOSE = docker compose -f ../docker-compose.yml --project-directory ..

docker-build:
	$(COMPOSE) build api

docker-up:
	$(COMPOSE) up -d

docker-down:
	$(COMPOSE) down

docker-migrate:
	$(COMPOSE) run --rm api alembic upgrade head

docker-downgrade:
	$(COMPOSE) run --rm api alembic downgrade -1

docker-seed:
	$(COMPOSE) run --rm api python -m app.scripts.seed
