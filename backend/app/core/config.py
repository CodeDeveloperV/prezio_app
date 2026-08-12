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

    cors_origins: list[str] = ["*"]


@lru_cache
def get_settings() -> Settings:
    # Cached so Settings() isn't re-parsed from env on every dependency call.
    return Settings()
