FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.8.11 /uv /uvx /usr/local/bin/

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

# Use the venv baked at build time directly instead of `uv run` -- `uv run` re-syncs
# (and re-resolves the interpreter) on every invocation, which is unreliable across
# container restarts and would also pull dev-only deps back in.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
