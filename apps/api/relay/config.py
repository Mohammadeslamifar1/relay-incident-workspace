from pathlib import Path
from secrets import token_urlsafe
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RELAY_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/relay.db"
    secret_key: str = Field(default_factory=lambda: token_urlsafe(48), min_length=32)
    demo_enabled: bool = True
    cookie_secure: bool = False
    allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    ai_provider: Literal["extractive", "openai"] = "extractive"
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    static_dir: Path = Path("apps/web/dist")

    @model_validator(mode="after")
    def require_credentials(self):
        if self.ai_provider == "openai" and not self.openai_api_key:
            raise ValueError("RELAY_OPENAI_API_KEY is required when RELAY_AI_PROVIDER=openai")
        return self
