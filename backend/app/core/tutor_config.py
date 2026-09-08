"""Server-only AI configuration. Disabled until an operator enables paid usage."""

from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class TutorSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="QLP_AI_", extra="ignore", env_file_encoding="utf-8",
        env_file=Path(__file__).resolve().parents[2] / ".env",
    )

    enabled: bool = False
    provider: Literal["openai"] = "openai"
    # Intentionally no default: account access and cost must be chosen explicitly.
    model: str = Field(default="", max_length=120, pattern=r"^[a-zA-Z0-9._:-]*$")
    api_key: SecretStr | None = Field(default=None, validation_alias="OPENAI_API_KEY", repr=False)
    max_output_tokens: int = Field(default=1600, ge=256, le=4096)
    timeout_seconds: float = Field(default=30, ge=1, le=45)
    max_concurrency: int = Field(default=2, ge=1, le=8)
    requests_per_minute: int = Field(default=20, ge=1, le=120)

    @property
    def ready(self) -> bool:
        return bool(self.enabled and self.model and self.api_key and self.api_key.get_secret_value().strip())
