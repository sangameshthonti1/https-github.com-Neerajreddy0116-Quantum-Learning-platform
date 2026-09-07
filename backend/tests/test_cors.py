import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def cors_client():
    settings = Settings(
        _env_file=None,
        cors_origins=["http://localhost:5173"],
    )
    with TestClient(create_app(settings)) as client:
        yield client


def test_cors_is_disabled_by_default(client):
    response = client.get(
        "/api/health", headers={"Origin": "http://localhost:5173"}
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_configured_origin_is_allowed(cors_client):
    response = cors_client.get(
        "/api/health", headers={"Origin": "http://localhost:5173"}
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in response.headers
    assert "Origin" in response.headers["vary"]


@pytest.mark.parametrize(
    "origin",
    [
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://localhost:5173",
        "http://localhost:5173.evil.example",
        "null",
    ],
)
def test_unconfigured_origin_has_no_cors_permission(cors_client, origin):
    response = cors_client.get("/api/health", headers={"Origin": origin})

    # CORS controls browser access; it is not authentication or a network firewall.
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_allowed_preflight(cors_client):
    response = cors_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-methods"] == "GET"


@pytest.mark.parametrize(
    ("origin", "method", "headers"),
    [
        ("https://untrusted.example", "GET", ""),
        ("http://localhost:5173", "POST", ""),
        ("http://localhost:5173", "GET", "Authorization"),
    ],
)
def test_disallowed_preflight_is_rejected(cors_client, origin, method, headers):
    response = cors_client.options(
        "/api/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        },
    )

    assert response.status_code == 400
    if origin != "http://localhost:5173":
        assert "access-control-allow-origin" not in response.headers
