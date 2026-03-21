"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration object.

    All environment variables use the `NICEFK_` prefix so local deployment and
    Docker deployment can share one configuration entrypoint.
    """

    model_config = SettingsConfigDict(env_prefix="NICEFK_", env_file=".env", extra="ignore")

    site_url: str = "http://127.0.0.1:8000"
    database_url: str = "sqlite:///./nicefk.db"
    cache_backend: str = "redis"
    redis_url: str = "redis://:aaaaTZ3QaF@127.0.0.1:6379/0"
    scheduler_enabled: bool = True
    order_expire_minutes: int = 5
    reconcile_interval_seconds: int = 180
    token_ttl_hours: int = 24
    frontend_dist: str = "backend/app/static"
    log_dir: str = "backend/logs"
    testing: bool = False
    request_timeout_seconds: int = 10
    config_cache_ttl_seconds: int = 120

    @property
    def frontend_dist_path(self) -> Path:
        """Absolute path to the compiled frontend assets."""

        return Path(self.frontend_dist).resolve()

    @property
    def log_dir_path(self) -> Path:
        """Absolute path to the log directory."""

        return Path(self.log_dir).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a singleton settings instance."""

    return Settings()
