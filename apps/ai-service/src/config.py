"""Service configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VORTEX AI Service"
    app_version: str = "0.1.0"

    # LLM providers. At least one key is required unless mock mode is enabled.
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Model overrides
    openai_model: str = "gpt-4o-mini"
    anthropic_model: str = "claude-3-5-haiku-latest"

    # Deterministic offline responses for development and testing.
    mock_llm: bool = False

    # Endpoint timeout (seconds) for outgoing provider calls.
    default_timeout_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()