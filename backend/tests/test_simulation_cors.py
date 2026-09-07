import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


ALLOWED_ORIGINS = ["http://localhost:5173", "https://learning.example"]
UNCONFIGURED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://localhost:5173",
    "http://localhost:5173.evil.example",
    "https://learning.example.evil.example",
    "https://untrusted.example",
    "null",
]
SIMULATION_REQUEST = {
    "numQubits": 1,
    "gates": [],
    "shots": 1,
    "backend": "qiskit",
    "seedSimulator": 0,
}


@pytest.fixture
def simulation_cors_client():
    settings = Settings(_env_file=None, cors_origins=ALLOWED_ORIGINS)
    with TestClient(create_app(settings)) as client:
        yield client


def _preflight(client, *, origin, headers="content-type", path="/api/simulate", method="POST"):
    request_headers = {
        "Origin": origin,
        "Access-Control-Request-Method": method,
    }
    if headers:
        request_headers["Access-Control-Request-Headers"] = headers
    return client.options(path, headers=request_headers)


@pytest.mark.parametrize("origin", ALLOWED_ORIGINS)
@pytest.mark.parametrize("requested_header", ["content-type", "Content-Type"])
def test_simulation_json_post_preflight_allows_explicit_origins(
    simulation_cors_client, origin, requested_header
):
    response = _preflight(simulation_cors_client, origin=origin, headers=requested_header)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    methods = {method.strip() for method in response.headers["access-control-allow-methods"].split(",")}
    assert "POST" in methods
    allowed_headers = {
        header.strip().lower()
        for header in response.headers["access-control-allow-headers"].split(",")
    }
    assert "content-type" in allowed_headers
    assert "authorization" not in allowed_headers
    assert "*" not in allowed_headers
    assert "access-control-allow-credentials" not in response.headers
    assert "origin" in {value.strip().lower() for value in response.headers["vary"].split(",")}


@pytest.mark.parametrize("origin", ALLOWED_ORIGINS)
def test_simulation_json_post_response_allows_explicit_origins(simulation_cors_client, origin):
    response = simulation_cors_client.post(
        "/api/simulate", json=SIMULATION_REQUEST, headers={"Origin": origin}
    )

    assert response.status_code == 200, response.text
    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers
    assert response.json()["counts"] == {"0": 1, "1": 0}


@pytest.mark.parametrize("origin", UNCONFIGURED_ORIGINS)
def test_simulation_preflight_rejects_unconfigured_origins(simulation_cors_client, origin):
    response = _preflight(simulation_cors_client, origin=origin)

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("origin", UNCONFIGURED_ORIGINS)
def test_simulation_response_has_no_cors_permission_for_unconfigured_origins(
    simulation_cors_client, origin
):
    response = simulation_cors_client.post(
        "/api/simulate", json=SIMULATION_REQUEST, headers={"Origin": origin}
    )

    # CORS restricts browser access to responses, not execution by non-browser clients.
    assert response.status_code == 200, response.text
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("origin", ALLOWED_ORIGINS)
@pytest.mark.parametrize("headers", ["Authorization", "content-type, Authorization"])
def test_simulation_preflight_denies_authorization_header(simulation_cors_client, origin, headers):
    response = _preflight(simulation_cors_client, origin=origin, headers=headers)

    assert response.status_code == 400
    assert "authorization" not in response.headers.get("access-control-allow-headers", "").lower()


def test_simulation_cors_is_disabled_without_explicit_origins(client):
    response = client.post(
        "/api/simulate", json=SIMULATION_REQUEST, headers={"Origin": ALLOWED_ORIGINS[0]}
    )
    assert response.status_code == 200, response.text
    assert "access-control-allow-origin" not in response.headers

    preflight = _preflight(client, origin=ALLOWED_ORIGINS[0])
    assert "access-control-allow-origin" not in preflight.headers
    assert "access-control-allow-methods" not in preflight.headers


@pytest.mark.parametrize("origin", ALLOWED_ORIGINS)
def test_simulation_cors_permission_is_present_on_validation_errors(simulation_cors_client, origin):
    response = simulation_cors_client.post("/api/simulate", json={}, headers={"Origin": origin})

    assert response.status_code == 422
    assert response.headers["access-control-allow-origin"] == origin
    assert isinstance(response.json()["detail"], list)


def test_simulation_post_permission_does_not_broaden_health_methods(simulation_cors_client):
    origin = ALLOWED_ORIGINS[0]
    simulation = _preflight(simulation_cors_client, origin=origin)
    assert simulation.status_code == 200

    health_get = _preflight(
        simulation_cors_client, origin=origin, path="/api/health", method="GET", headers=""
    )
    assert "Access-Control-Request-Headers" not in health_get.request.headers
    assert health_get.status_code == 200
    assert health_get.headers["access-control-allow-methods"] == "GET"
    assert health_get.headers["access-control-allow-origin"] == origin

    health_post = _preflight(
        simulation_cors_client, origin=origin, path="/api/health", method="POST", headers=""
    )
    assert "Access-Control-Request-Headers" not in health_post.request.headers
    assert health_post.status_code == 400

    health_authorization = _preflight(
        simulation_cors_client, origin=origin, path="/api/health", method="GET", headers="Authorization"
    )
    assert health_authorization.status_code == 400

    health = simulation_cors_client.get("/api/health", headers={"Origin": origin})
    assert health.status_code == 200
    assert health.headers["access-control-allow-origin"] == origin
