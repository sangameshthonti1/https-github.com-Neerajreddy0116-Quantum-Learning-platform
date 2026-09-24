from concurrent.futures import ThreadPoolExecutor
from threading import Event

from app.core.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def public_settings(tmp_path, **updates):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<main>PUBLIC APP</main>", encoding="utf-8")
    (dist / "asset.txt").write_text("public asset", encoding="utf-8")
    values = {
        "public_mode": True,
        "frontend_dist": dist,
        "public_requests_per_minute": 60,
        "public_max_concurrency": 2,
        **updates,
    }
    return Settings(_env_file=None, **values)


def test_public_app_serves_assets_spa_routes_and_api(tmp_path):
    with TestClient(create_app(public_settings(tmp_path))) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert root.text == "<main>PUBLIC APP</main>"
        assert root.headers["cache-control"] == "no-cache"

        deep_link = client.get("/library/phase-in-quantum-states")
        assert deep_link.status_code == 200
        assert deep_link.text == root.text

        asset = client.get("/asset.txt")
        assert asset.status_code == 200
        assert asset.text == "public asset"

        assert client.get("/api/health").json()["status"] == "ok"
        assert client.get("/api/not-published").status_code == 404
        assert client.get("/docs").status_code == 200


def test_public_app_fails_fast_without_built_frontend(tmp_path):
    settings = Settings(
        _env_file=None,
        public_mode=True,
        frontend_dist=tmp_path / "missing",
    )

    try:
        create_app(settings)
    except RuntimeError as error:
        assert "frontend index" in str(error).lower()
    else:
        raise AssertionError("Public mode accepted a missing frontend bundle")


def test_public_guard_rejects_large_and_excess_requests(tmp_path):
    settings = public_settings(
        tmp_path,
        public_max_body_bytes=1024,
        public_requests_per_minute=1,
    )
    with TestClient(create_app(settings)) as client:
        too_large = client.post(
            "/api/simulate",
            content=b"x" * 1025,
            headers={"Content-Type": "application/json"},
        )
        assert too_large.status_code == 413
        assert too_large.json()["error"]["code"] == "public_body_too_large"

        first = client.post("/api/simulate", json={})
        assert first.status_code == 422
        limited = client.post("/api/simulate", json={})
        assert limited.status_code == 429
        assert limited.headers["retry-after"] == "60"
        assert limited.json()["error"]["code"] == "public_rate_limited"


def test_public_guard_rejects_concurrent_compute_instead_of_queueing(
    tmp_path, monkeypatch
):
    settings = public_settings(tmp_path, public_max_concurrency=1)
    app = create_app(settings)
    entered = Event()
    release = Event()

    import app.api.routes.simulation as simulation_route

    original = simulation_route.simulate_circuit

    def waiting(request):
        entered.set()
        release.wait(timeout=5)
        return original(request)

    monkeypatch.setattr(simulation_route, "simulate_circuit", waiting)
    body = {
        "numQubits": 1,
        "gates": [],
        "shots": 1,
        "backend": "qiskit",
        "seedSimulator": 42,
    }
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(client.post, "/api/simulate", json=body)
        assert entered.wait(timeout=5)
        busy = client.post("/api/simulate", json=body)
        assert busy.status_code == 429
        assert busy.headers["retry-after"] == "5"
        assert busy.json()["error"]["code"] == "public_service_busy"
        release.set()
        assert pending.result(timeout=10).status_code == 200
