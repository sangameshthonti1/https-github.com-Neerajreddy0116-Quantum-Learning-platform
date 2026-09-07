import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture(autouse=True)
def isolate_environment(monkeypatch):
    monkeypatch.delenv("QLP_API_TITLE", raising=False)
    monkeypatch.delenv("QLP_CORS_ORIGINS", raising=False)
    # Keep each test independent of a developer's private backend/.env.
    monkeypatch.setitem(Settings.model_config, "env_file", None)


@pytest.fixture
def client():
    with TestClient(create_app(Settings(_env_file=None))) as test_client:
        yield test_client
