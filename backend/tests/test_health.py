def test_health_returns_exact_contract(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {
        "status": "ok",
        "service": "quantum-learning-api",
    }


def test_root_redirects_to_docs(client):
    response = client.get("/", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_docs_and_openapi_are_available(client):
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "text/html" in docs.headers["content-type"]
    assert "/openapi.json" in docs.text

    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "Quantum Learning API"
    assert "200" in schema["paths"]["/api/health"]["get"]["responses"]
    assert schema["components"]["schemas"]["HealthResponse"]["properties"]["status"]["const"] == "ok"
