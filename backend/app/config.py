"""Settings loaded from the environment or a root .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"
    plaid_webhook_url: str = ""
    database_url: str = "postgresql+psycopg://budgetflow:budgetflow@localhost:5432/budgetflow"
    app_encryption_key: str = ""
    frontend_url: str = "http://localhost:5173"

    @property
    def plaid_credentials_set(self) -> bool:
        return bool(self.plaid_client_id.strip() and self.plaid_secret.strip())

    @property
    def encryption_configured(self) -> bool:
        return bool(self.app_encryption_key.strip())

    @property
    def plaid_configured(self) -> bool:
        return self.plaid_credentials_set and self.encryption_configured and self.plaid_env in {
            "sandbox",
            "development",
            "production",
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def bank_connection_block_reason() -> str | None:
    """Why Plaid Link cannot start, or None when it can. Never includes secrets."""
    if not settings.plaid_credentials_set:
        return "Plaid credentials are not set. Add them to .env, or load demo data."
    if not settings.encryption_configured:
        return "Set APP_ENCRYPTION_KEY before connecting a bank."
    if settings.plaid_env not in {"sandbox", "development", "production"}:
        return "PLAID_ENV must be sandbox, development, or production."
    return None


def cors_origins() -> list[str]:
    origin = settings.frontend_url.rstrip("/")
    origins = {origin}
    if "localhost" in origin:
        origins.add(origin.replace("localhost", "127.0.0.1"))
    elif "127.0.0.1" in origin:
        origins.add(origin.replace("127.0.0.1", "localhost"))
    return sorted(origins)
