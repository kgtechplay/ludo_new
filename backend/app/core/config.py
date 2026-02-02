from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    database_url: str = "postgresql+asyncpg://ludo_user:password@localhost:5432/ludo_db"
    app_env: str = "development"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
