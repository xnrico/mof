from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://mof:mof@localhost:5432/mof"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Plaid
    PLAID_CLIENT_ID: Optional[str] = None
    PLAID_SECRET: Optional[str] = None
    PLAID_ENV: str = "sandbox"

    # GoCardless (Nordigen Bank Account Data)
    GOCARDLESS_SECRET_ID: Optional[str] = None
    GOCARDLESS_SECRET_KEY: Optional[str] = None
    GOCARDLESS_ENV: str = "sandbox"  # "sandbox" or "live"

    # TrueLayer (UK Open Banking)
    TRUELAYER_CLIENT_ID: Optional[str] = None
    TRUELAYER_CLIENT_SECRET: Optional[str] = None
    TRUELAYER_ENV: str = "sandbox"  # "sandbox" or "live"
    IBKR_ACCOUNT_ID: Optional[str] = None
    IBKR_HOST: str = "127.0.0.1"
    IBKR_PORT: int = 7497
    IBKR_CLIENT_ID: int = 1

    # Trading 212
    TRADING212_API_KEY: Optional[str] = None
    TRADING212_ENV: str = "demo"

    # Sync
    SYNC_SCHEDULE: str = "0 */6 * * *"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000


settings = Settings()
