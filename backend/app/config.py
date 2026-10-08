"""Settings loaded from the environment or a root .env file.

Every field is a plain string on purpose: pydantic validation errors echo the rejected
input, which could print a secret. Values are checked by `configuration_problems()`
instead, and its messages name variables only, never their values.
"""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]

APP_ENVS = {"development", "production"}
# Plaid's Development environment has been retired; only Sandbox and Production remain.
PLAID_ENVS = {"sandbox", "production"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"
    plaid_webhook_url: str = ""
    database_url: str = "postgresql+psycopg://budgetflow:budgetflow@localhost:5432/budgetflow"
    app_encryption_key: str = ""
    frontend_url: str = "http://localhost:5173"

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() == "production"

    @property
    def plaid_environment(self) -> str:
        """Normalised Plaid environment. Anything unrecognised falls back to Sandbox."""
        value = self.plaid_env.strip().lower()
        return value if value in PLAID_ENVS else "sandbox"

    @property
    def plaid_credentials_set(self) -> bool:
        return bool(self.plaid_client_id.strip() and self.plaid_secret.strip())

    @property
    def encryption_configured(self) -> bool:
        return encryption_key_valid(self.app_encryption_key)

    @property
    def plaid_configured(self) -> bool:
        return self.plaid_credentials_set and self.encryption_configured and not configuration_problems(self)


def encryption_key_valid(value: str) -> bool:
    key = value.strip()
    if not key:
        return False
    try:
        Fernet(key.encode("utf-8"))
    except (ValueError, TypeError):
        return False
    return True


def _origin_problem(url: str, require_https: bool) -> str | None:
    value = url.strip()
    if not value or "*" in value:
        return "FRONTEND_URL must be one exact origin such as http://localhost:5173. Wildcards are not allowed."
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc or parts.path not in {"", "/"} or parts.query:
        return "FRONTEND_URL must be an origin like https://budget.example.com, with no path."
    if require_https and parts.scheme != "https":
        return "FRONTEND_URL must use https when APP_ENV=production."
    return None


def configuration_problems(config: Settings) -> list[str]:
    """Problems that make the configuration unsafe. Messages never contain values."""
    problems: list[str] = []
    app_env = config.app_env.strip().lower()
    plaid_env = config.plaid_env.strip().lower()
    if app_env not in APP_ENVS:
        problems.append("APP_ENV must be development or production.")
    if plaid_env not in PLAID_ENVS:
        problems.append("PLAID_ENV must be sandbox or production.")
    if plaid_env == "production" and app_env != "production":
        problems.append("PLAID_ENV=production is only allowed when APP_ENV=production. Use PLAID_ENV=sandbox locally.")
    if config.app_encryption_key.strip() and not encryption_key_valid(config.app_encryption_key):
        problems.append("APP_ENCRYPTION_KEY is not a valid Fernet key. Generate a new one with the command in .env.example.")
    if bool(config.plaid_client_id.strip()) != bool(config.plaid_secret.strip()):
        problems.append("Set both PLAID_CLIENT_ID and PLAID_SECRET, or leave both empty for demo mode.")
    origin = _origin_problem(config.frontend_url, require_https=app_env == "production")
    if origin:
        problems.append(origin)
    if config.plaid_webhook_url.strip() and not config.plaid_webhook_url.strip().startswith("https://"):
        problems.append("PLAID_WEBHOOK_URL must be an https URL.")
    if app_env == "production":
        if not config.encryption_configured:
            problems.append("APP_ENCRYPTION_KEY is required when APP_ENV=production.")
        if "budgetflow:budgetflow@" in config.database_url:
            problems.append("DATABASE_URL still uses the local development password. Use a managed database secret in production.")
    return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def bank_connection_block_reason() -> str | None:
    """Why Plaid Link cannot start, or None when it can. Never includes secrets."""
    if configuration_problems(settings):
        return "Bank connections are disabled because the server configuration is invalid. Check the API logs."
    if not settings.plaid_credentials_set:
        return "Plaid credentials are not set. Add them to .env, or load demo data."
    if not settings.encryption_configured:
        return "Set APP_ENCRYPTION_KEY before connecting a bank."
    return None


def cors_origins() -> list[str]:
    """Exact origins only. Never a wildcard."""
    origin = settings.frontend_url.strip().rstrip("/")
    if not origin or "*" in origin:
        return []
    origins = {origin}
    if not settings.is_production:
        if "localhost" in origin:
            origins.add(origin.replace("localhost", "127.0.0.1"))
        elif "127.0.0.1" in origin:
            origins.add(origin.replace("127.0.0.1", "localhost"))
    return sorted(origins)
