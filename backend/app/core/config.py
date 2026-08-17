from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Prezio API"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://prezio:prezio@localhost:5432/prezio"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    google_client_id: str = ""

    # `allow_credentials=True` in app.main's CORSMiddleware means this must NEVER default to
    # ["*"] in production -- browsers (and Starlette itself) treat wildcard-plus-credentials as
    # "reflect any Origin", which defeats CORS entirely. The default here is web-admin's local
    # Vite dev server only; production deployments must set CORS_ORIGINS to the real web-admin
    # domain(s) via env.
    cors_origins: list[str] = ["http://localhost:5173"]

    # Store comparator domain policy (see app.features.comparison): a branch's total is only
    # trusted for ranking/savings when at least this fraction of the list's products resolved
    # to *some* usable price there (AVAILABLE or STALE_PRICE).
    min_comparison_coverage: float = 0.80
    # Stricter companion threshold: fraction of products that must have a *fresh* (non-stale)
    # price. A branch can clear min_comparison_coverage on stale prices alone but still fail
    # this one, correctly staying non-comparable.
    min_fresh_comparison_coverage: float = 0.60
    # A price older than this (by `StoreProduct.last_verified_at`) is flagged STALE_PRICE rather
    # than AVAILABLE -- still used in the branch total, but excluded from `found_products_count`
    # and `fresh_coverage_percentage`.
    price_freshness_days: int = 7

    # How often AlertScheduler runs one PriceAlertEvaluator pass. A plain asyncio loop today
    # (see app.core.alert_scheduler) -- this interval is the only thing that matters if that
    # loop is later replaced by Celery/cron/a dedicated worker.
    alert_check_interval_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    # Cached so Settings() isn't re-parsed from env on every dependency call.
    return Settings()
