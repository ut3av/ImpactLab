"""Runtime configuration. Secrets are read from the environment and never exposed."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env", ".env"), extra="ignore")

    cerebras_api_key: SecretStr | None = Field(default=None)
    cerebras_model: str = "gpt-oss-120b"
    cerebras_timeout_s: float = 20.0
    data_dir: Path = REPO_ROOT / "data"
    static_dir: Path = REPO_ROOT / "frontend" / "dist"
    max_body_bytes: int = 32_000
    port: int = 8000

    @property
    def ai_configured(self) -> bool:
        return bool(self.cerebras_api_key and self.cerebras_api_key.get_secret_value().strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
