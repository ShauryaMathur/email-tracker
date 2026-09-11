from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    admin_chat_id: Optional[str] = None
    bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    # Shared secret Telegram echoes back on every webhook call (set via
    # setWebhook's secret_token param) so /telegram/webhook can reject
    # requests that aren't actually from Telegram.
    telegram_webhook_secret: Optional[str] = None

    # Auth: JWT session tokens + encryption-at-rest for TOTP secrets.
    jwt_secret: str
    jwt_expiry_days: int = 30
    fernet_key: str
    totp_issuer: str = "Email Tracker"

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / "app/.env", ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
