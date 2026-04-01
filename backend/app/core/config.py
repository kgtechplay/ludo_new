import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5176",
    "https://twisted-ludo.onrender.com",
    "https://twisted-ludo-api.onrender.com",
]


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Use a local SQLite database by default to avoid needing a separate DB server
    # and native drivers (like asyncpg) during local development.
    database_url: str = "sqlite+aiosqlite:///./ludo.db"
    db_auto_create: bool = True
    app_env: str = "development"
    cors_origins: str = ",".join(DEFAULT_CORS_ORIGINS)
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def model_post_init(self, __context) -> None:
        self.database_url = self.normalize_database_url(self.database_url)

    @staticmethod
    def normalize_database_url(value: str) -> str:
        if isinstance(value, str) and os.name == "nt" and value.startswith("postgresql+psycopg://"):
            normalized = value.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
            parsed = urlsplit(normalized)
            query_pairs = []
            for key, query_value in parse_qsl(parsed.query, keep_blank_values=True):
                if key == "connect_timeout":
                    continue
                query_pairs.append((key, query_value))
            return urlunsplit(parsed._replace(query=urlencode(query_pairs)))
        return value

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
