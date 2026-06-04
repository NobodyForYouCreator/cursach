from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://travel:travel@localhost:5432/travel"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 120
    app_create_tables: bool = True
    admin_username: str = "admin"
    admin_email: str = "admin@example.com"
    admin_password: str = "Admin123!"
    places_provider_url: str = "https://nominatim.openstreetmap.org/search"
    places_provider_timeout_seconds: float = 3.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
