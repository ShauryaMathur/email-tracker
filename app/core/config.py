from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    chat_id: Optional[str] = None
    bot_token: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / "app/.env", ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
