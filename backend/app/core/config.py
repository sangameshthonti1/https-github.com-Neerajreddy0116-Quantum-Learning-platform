"""Validated configuration loaded from the environment and backend/.env."""

from pathlib import Path

from pydantic import AnyHttpUrl, Field, TypeAdapter, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_HTTP_URL = TypeAdapter(AnyHttpUrl)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="QLP_",
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_title: str = Field(default="Quantum Learning API", min_length=1)
    cors_origins: list[str] = Field(default_factory=list)

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, origins: list[str]) -> list[str]:
        normalized = []
        for origin in origins:
            if (
                "*" in origin
                or origin != origin.strip()
                or not origin.startswith(("http://", "https://"))
            ):
                raise ValueError("CORS origins must be explicit HTTP(S) origins")
            url = _HTTP_URL.validate_python(origin)
            if (
                url.username is not None
                or url.password is not None
                or url.path not in (None, "/")
                or url.query is not None
                or url.fragment is not None
            ):
                raise ValueError(
                    "CORS origins must not contain credentials, paths, queries, or fragments"
                )
            # Browsers send serialized origins without a trailing slash or default port.
            normalized.append(str(url).rstrip("/"))
        return list(dict.fromkeys(normalized))
