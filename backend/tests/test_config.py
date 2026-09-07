import pytest
from pydantic import ValidationError
from pydantic_settings import SettingsError

from app.core.config import Settings
from app.main import create_app


def test_defaults_deny_cross_origin_access():
    settings = Settings(_env_file=None)

    assert settings.api_title == "Quantum Learning API"
    assert settings.cors_origins == []


def test_factory_loads_environment(monkeypatch):
    monkeypatch.setenv("QLP_API_TITLE", "Local Quantum API")
    monkeypatch.setenv("QLP_CORS_ORIGINS", '["http://localhost:5173"]')

    app = create_app()

    assert app.title == "Local Quantum API"
    assert app.state.settings.cors_origins == ["http://localhost:5173"]


def test_environment_overrides_dotenv(tmp_path, monkeypatch):
    dotenv = tmp_path / ".env"
    dotenv.write_text(
        'QLP_API_TITLE="Title from dotenv"\n'
        'QLP_CORS_ORIGINS=["http://localhost:5173"]\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("QLP_API_TITLE", "Title from environment")

    settings = Settings(_env_file=dotenv)

    assert settings.api_title == "Title from environment"
    assert settings.cors_origins == ["http://localhost:5173"]


def test_origins_are_normalized_and_deduplicated():
    settings = Settings(
        _env_file=None,
        cors_origins=[
            "http://localhost:5173/",
            "http://localhost:5173",
            "https://example.com:443/",
            "http://[::1]:5173",
        ],
    )

    assert settings.cors_origins == [
        "http://localhost:5173",
        "https://example.com",
        "http://[::1]:5173",
    ]


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "https://*.example.com",
        "null",
        "localhost:5173",
        "http:localhost",
        "ftp://localhost:5173",
        "http://localhost:5173/path",
        "http://localhost:5173?query=value",
        "http://localhost:5173#fragment",
        "http://user:password@localhost:5173",
        " http://localhost:5173",
        "http://localhost:99999",
    ],
)
def test_invalid_origins_fail_fast(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=[origin])


def test_malformed_origins_environment_fails_startup(monkeypatch):
    monkeypatch.setenv("QLP_CORS_ORIGINS", "http://localhost:5173")

    with pytest.raises(SettingsError):
        create_app()


def test_factories_do_not_share_settings():
    first = create_app(Settings(_env_file=None, api_title="First API"))
    second = create_app(Settings(_env_file=None, api_title="Second API"))

    assert first.title == "First API"
    assert second.title == "Second API"
    assert first.state.settings is not second.state.settings
