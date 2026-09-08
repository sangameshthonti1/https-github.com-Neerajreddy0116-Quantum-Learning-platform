"""Real Qiskit tracing, physical invariants, API compatibility and failure paths."""

import json
import math
from importlib.metadata import version
from random import Random

import numpy as np
import pytest
from fastapi.testclient import TestClient
from qiskit.quantum_info import DensityMatrix, Statevector

from app.core.config import Settings
from app.main import create_app
from app.services import qiskit_trace

URL = "/api/simulate/trace"
TOL = 1e-12


def gate(kind, target=0, control=None, gate_id="g0"):
    return {"id": gate_id, "type": kind, "targets": [target],
            "controls": [] if control is None else [control]}


def payload(gates=(), num_qubits=1, **updates):
    return {"numQubits": num_qubits, "gates": list(gates), "shots": 1024,
            "backend": "qiskit", "seedSimulator": 42, **updates}


def vector(items):
    return np.array([complex(item["real"], item["imag"]) for item in items])


def matrix(items):
    return np.array([vector(row) for row in items])


def equivalent(actual, expected):
    # Physical equality is equality of projectors, not elementwise amplitudes.
    expected = np.array(expected, dtype=complex)
    np.testing.assert_allclose(np.outer(actual, actual.conj()),
                               np.outer(expected, expected.conj()), atol=TOL, rtol=0)


def assert_trace(response, request):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json")
    data = json.loads(response.text, parse_constant=lambda value: pytest.fail(f"Nonfinite JSON: {value}"))
    assert set(data) == {"backend", "numQubits", "basisOrder", "steps", "metadata"}
    n = request["numQubits"]
    labels = [format(i, f"0{n}b") for i in range(2**n)]
    assert data["backend"] == "qiskit"
    assert data["numQubits"] == n
    assert data["basisOrder"] == labels
    assert len(data["steps"]) == len(request["gates"]) + 1
    metadata = data["metadata"]
    assert metadata == {
        "engine": "qiskit.quantum_info.Statevector", "method": "statevector",
        "measurement": "terminal-all", "statevectorStage": "before-measurement",
        "samplingPerformed": False, "bitOrder": "q[n-1]...q[0]",
        "reducedBasisOrder": ["0", "1"], "globalPhase": "qiskit-native",
        "gateCount": len(request["gates"]), "stepCount": len(request["gates"]) + 1,
        "qiskitVersion": version("qiskit"), "executionTimeMs": metadata["executionTimeMs"],
    }
    assert math.isfinite(metadata["executionTimeMs"]) and metadata["executionTimeMs"] >= 0
    paulis = [np.array([[0, 1], [1, 0]]), np.array([[0, -1j], [1j, 0]]), np.diag([1, -1])]
    for index, step in enumerate(data["steps"]):
        assert set(step) == {"index", "gate", "statevector", "probabilities", "qubits"}
        assert step["index"] == index
        assert step["gate"] == (None if index == 0 else request["gates"][index - 1])
        state = vector(step["statevector"])
        assert state.shape == (2**n,)
        assert np.isfinite(state).all()
        assert np.vdot(state, state).real == pytest.approx(1, abs=TOL)
        assert set(step["probabilities"]) == set(labels)
        for label, amplitude in zip(labels, state, strict=True):
            assert step["probabilities"][label] == pytest.approx(abs(amplitude)**2, abs=TOL)
        assert sum(step["probabilities"].values()) == pytest.approx(1, abs=TOL)
        assert [item["qubit"] for item in step["qubits"]] == list(range(n))
        for qubit, reduced in enumerate(step["qubits"]):
            assert set(reduced) == {"qubit", "densityMatrix", "blochVector"}
            rho = matrix(reduced["densityMatrix"])
            assert rho.shape == (2, 2) and np.isfinite(rho).all()
            np.testing.assert_allclose(rho, rho.conj().T, atol=TOL, rtol=0)
            assert np.trace(rho) == pytest.approx(1, abs=TOL)
            assert np.linalg.eigvalsh(rho).min() >= -TOL
            # Independent basis-index contraction verifies the partial-trace
            # convention without calling the same Qiskit helper as the service.
            expected = np.zeros((2, 2), dtype=complex)
            for a in range(2**n):
                for b in range(2**n):
                    if (a & ~(1 << qubit)) == (b & ~(1 << qubit)):
                        expected[(a >> qubit) & 1, (b >> qubit) & 1] += state[a] * state[b].conjugate()
            np.testing.assert_allclose(rho, expected, atol=TOL, rtol=0)
            bloch = reduced["blochVector"]
            assert set(bloch) == {"x", "y", "z"}
            components = np.array([bloch[axis] for axis in "xyz"])
            assert np.isfinite(components).all()
            assert np.linalg.norm(components) <= 1 + TOL
            np.testing.assert_allclose(components, [np.trace(rho @ pauli).real for pauli in paulis], atol=TOL, rtol=0)
    return data


@pytest.mark.parametrize("n", [1, 2, 3])
def test_empty_initial_state(client, n):
    request = payload(num_qubits=n)
    data = assert_trace(client.post(URL, json=request), request)
    equivalent(vector(data["steps"][0]["statevector"]), [1] + [0] * (2**n - 1))
    for reduced in data["steps"][0]["qubits"]:
        np.testing.assert_allclose(matrix(reduced["densityMatrix"]), [[1, 0], [0, 0]], atol=TOL)
        assert reduced["blochVector"] == {"x": 0, "y": 0, "z": 1}


@pytest.mark.parametrize(("operations", "expected", "bloch"), [
    (["x"], [0, 1], [0, 0, -1]),
    (["h"], [math.sqrt(0.5)] * 2, [1, 0, 0]),
    (["h", "h"], [1, 0], [0, 0, 1]),
    (["h", "z"], [math.sqrt(0.5), -math.sqrt(0.5)], [-1, 0, 0]),
    (["h", "z", "h"], [0, 1], [0, 0, -1]),
])
def test_transformations_and_interference(client, operations, expected, bloch):
    request = payload([gate(kind, gate_id=f"g{i}") for i, kind in enumerate(operations)])
    data = assert_trace(client.post(URL, json=request), request)
    final = data["steps"][-1]
    equivalent(vector(final["statevector"]), expected)
    assert final["qubits"][0]["blochVector"] == pytest.approx(dict(zip("xyz", bloch)), abs=TOL)


@pytest.mark.parametrize(("n", "control", "target"), [
    (2, 0, 1), (2, 1, 0), (3, 0, 2), (3, 2, 0), (3, 1, 2), (3, 2, 1),
])
def test_bell_intermediate_and_final_reduced_states(client, n, control, target):
    request = payload([gate("h", control), gate("cx", target, control, "g1")], n)
    data = assert_trace(client.post(URL, json=request), request)
    initial, intermediate, final = data["steps"]
    equivalent(vector(initial["statevector"]), [1] + [0] * (2**n - 1))
    expected = np.zeros(2**n)
    expected[0] = expected[1 << control] = math.sqrt(0.5)
    equivalent(vector(intermediate["statevector"]), expected)
    assert intermediate["qubits"][control]["blochVector"] == pytest.approx({"x": 1, "y": 0, "z": 0}, abs=TOL)
    assert intermediate["qubits"][target]["blochVector"] == pytest.approx({"x": 0, "y": 0, "z": 1}, abs=TOL)
    expected[1 << control] = 0
    expected[(1 << control) | (1 << target)] = math.sqrt(0.5)
    equivalent(vector(final["statevector"]), expected)
    for q in range(n):
        rho = matrix(final["qubits"][q]["densityMatrix"])
        entangled = q in (control, target)
        np.testing.assert_allclose(rho, np.diag([0.5, 0.5] if entangled else [1, 0]), atol=TOL)
        assert final["qubits"][q]["blochVector"] == pytest.approx({"x": 0, "y": 0, "z": 0 if entangled else 1}, abs=TOL)
        assert np.trace(rho @ rho).real == pytest.approx(0.5 if entangled else 1, abs=TOL)


@pytest.mark.parametrize(("n", "target"), [(1, 0), (2, 0), (2, 1), (3, 0), (3, 1), (3, 2)])
def test_x_bit_order(client, n, target):
    request = payload([gate("x", target)], n)
    data = assert_trace(client.post(URL, json=request), request)
    final = data["steps"][-1]
    expected = np.zeros(2**n)
    expected[1 << target] = 1
    equivalent(vector(final["statevector"]), expected)
    assert final["probabilities"][format(1 << target, f"0{n}b")] == pytest.approx(1, abs=TOL)


def test_ghz_and_disentangling_restore_pure_reduced_states(client):
    request = payload([
        gate("h"), gate("cx", 1, 0, "g1"), gate("cx", 2, 1, "g2"),
        gate("cx", 2, 1, "g3"), gate("cx", 1, 0, "g4"),
    ], 3)
    data = assert_trace(client.post(URL, json=request), request)
    equivalent(vector(data["steps"][3]["statevector"]), [math.sqrt(0.5)] + [0] * 6 + [math.sqrt(0.5)])
    for reduced in data["steps"][3]["qubits"]:
        assert reduced["blochVector"] == pytest.approx({"x": 0, "y": 0, "z": 0}, abs=TOL)
    for reduced, expected in zip(data["steps"][-1]["qubits"], [(1, 0, 0), (0, 0, 1), (0, 0, 1)], strict=True):
        assert reduced["blochVector"] == pytest.approx(dict(zip("xyz", expected)), abs=TOL)


def test_native_global_phase_is_preserved_but_physical_states_are_equivalent(client):
    request = payload([gate(kind, gate_id=f"g{i}") for i, kind in enumerate(["x", "z", "x", "z"])])
    data = assert_trace(client.post(URL, json=request), request)
    first = vector(data["steps"][0]["statevector"])
    last = vector(data["steps"][-1]["statevector"])
    np.testing.assert_allclose(last, -first, atol=TOL, rtol=0)  # Native convention only.
    equivalent(first, last)  # Physical equivalence, despite a global minus sign.
    assert data["steps"][0]["probabilities"] == data["steps"][-1]["probabilities"]
    assert data["steps"][0]["qubits"] == data["steps"][-1]["qubits"]


@pytest.mark.parametrize("sign", [1, -1])
def test_complex_reduction_and_bloch_y_sign(sign):
    # Internal mathematical helper only: this does NOT add a phase gate or
    # custom initial-state API. Current public gates all have real matrices.
    state = Statevector(np.array([1, sign * 1j]) / math.sqrt(2))
    reduced = qiskit_trace._snapshot(state, 0, None).qubits[0]
    assert reduced.bloch_vector.model_dump() == pytest.approx({"x": 0, "y": sign, "z": 0}, abs=TOL)
    rho = matrix(reduced.model_dump()["densityMatrix"])
    np.testing.assert_allclose(rho, [[0.5, -sign * 0.5j], [sign * 0.5j, 0.5]], atol=TOL)


@pytest.mark.parametrize("n", [1, 2, 3])
def test_every_prefix_agrees_with_existing_real_aer_endpoint(client, n):
    rng = Random(31 + n)
    gates = []
    for i in range(12):
        kind = rng.choice(["h", "x", "z", "cx"] if n > 1 else ["h", "x", "z"])
        target = rng.randrange(n)
        control = rng.choice([q for q in range(n) if q != target]) if kind == "cx" else None
        gates.append(gate(kind, target, control, f"g{i}"))
    request = payload(gates, n)
    data = assert_trace(client.post(URL, json=request), request)
    for step in data["steps"]:
        response = client.post("/api/simulate", json={**request, "gates": gates[:step["index"]]})
        assert response.status_code == 200, response.text
        simulation = response.json()
        assert set(simulation) == {"backend", "numQubits", "shots", "probabilities", "counts", "statevector", "metadata"}
        assert sum(simulation["counts"].values()) == request["shots"]
        equivalent(vector(step["statevector"]), vector(simulation["statevector"]))
        assert step["probabilities"] == pytest.approx(simulation["probabilities"], abs=TOL)


def test_maximum_trace_is_bounded_and_normalized(client):
    request = payload([gate("h", i % 3, gate_id=f"g{i}") for i in range(256)], 3)
    data = assert_trace(client.post(URL, json=request), request)
    assert len(data["steps"]) == 257


def test_shots_and_seed_are_validated_but_do_not_affect_trace(client):
    request = payload([gate("h"), gate("cx", 1, 0, "g1")], 2)
    baseline = assert_trace(client.post(URL, json=request), request)
    for shots, seed in [(1, 0), (8192, 4294967295), (1024, None)]:
        changed = {**request, "shots": shots, "seedSimulator": seed}
        data = assert_trace(client.post(URL, json=changed), changed)
        assert data["steps"] == baseline["steps"]
    del request["seedSimulator"]
    assert assert_trace(client.post(URL, json=request), request)["steps"] == baseline["steps"]


@pytest.mark.parametrize("invalid", [
    {}, payload(num_qubits=0), payload(num_qubits=4), payload(num_qubits=True),
    payload(shots=0), payload(shots=8193), payload(shots=1.0), payload(shots="1"),
    payload(seedSimulator=-1), payload(seedSimulator=4294967296), payload(seedSimulator=True),
    payload(backend="aer"), payload(unexpected="private"),
    payload([gate("measure")]), payload([gate("reset")]), payload([gate("ry")]),
    payload([gate("h", target=1)]), payload([gate("h", target=True)]),
    payload([gate("cx", 0, 0)], 2), payload([gate("cx", 0, 2)], 2),
    payload([gate("h"), gate("x")]), payload([gate("x", gate_id=" ")]),
    payload([gate("x", gate_id="x" * 65)]), payload([gate("x", gate_id=f"g{i}") for i in range(257)]),
    payload([{**gate("h"), "controls": [0]}]), payload([{**gate("h"), "targets": []}]),
    payload([{**gate("h"), "parameters": [0.2]}]),
])
def test_validation_matches_simulate_and_never_evolves(client, monkeypatch, invalid):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid input reached the state engine")
    monkeypatch.setattr(qiskit_trace.Statevector, "evolve", forbidden)
    response = client.post(URL, json=invalid)
    original = client.post("/api/simulate", json=invalid)
    assert response.status_code == original.status_code == 422
    assert response.json() == original.json()
    for issue in response.json()["detail"]:
        assert set(issue) == {"loc", "msg", "type"}


def test_malformed_json_uses_existing_validation_envelope(client):
    response = client.post(URL, content="{", headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert set(response.json()["detail"][0]) == {"loc", "msg", "type"}


@pytest.mark.parametrize("failure", ["exception", "nan", "inf", "unnormalized", "invalid-reduction"])
def test_engine_failure_returns_no_partial_trace_or_private_details(client, monkeypatch, failure):
    def broken_evolve(*args, **kwargs):
        if failure == "exception":
            raise RuntimeError("private engine failure")
        return Statevector([{"nan": float("nan"), "inf": float("inf"), "unnormalized": 2}[failure], 0])
    if failure == "invalid-reduction":
        monkeypatch.setattr(qiskit_trace, "partial_trace", lambda *args: DensityMatrix([[2, 0], [0, -1]]))
    else:
        monkeypatch.setattr(qiskit_trace.Statevector, "evolve", broken_evolve)
    response = client.post(URL, json=payload([gate("h")]))
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "simulation_failed", "message": "The simulator could not complete this circuit. Please retry."}}
    assert "private" not in response.text and "steps" not in response.json()


def test_openapi_reuses_request_and_exposes_trace_models(client):
    schema = client.get("/openapi.json").json()
    trace = schema["paths"][URL]["post"]
    original = schema["paths"]["/api/simulate"]["post"]
    assert trace["requestBody"] == original["requestBody"]
    assert {"200", "422", "500"} <= set(trace["responses"])
    assert trace["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/TraceResponse")
    assert original["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/SimulationResponse")


def test_trace_cors_is_scoped_to_exact_route():
    origin = "http://localhost:5173"
    with TestClient(create_app(Settings(_env_file=None, cors_origins=[origin]))) as client:
        headers = {"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"}
        response = client.options(URL, headers=headers)
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-allow-methods"] == "POST"
        assert "access-control-allow-credentials" not in response.headers
        assert client.post(URL, json=payload(), headers={"Origin": origin}).headers["access-control-allow-origin"] == origin
        assert client.options(URL, headers={**headers, "Origin": "https://untrusted.example"}).status_code == 400
        assert client.options(URL, headers={**headers, "Access-Control-Request-Headers": "Authorization"}).status_code == 400
        for path in ["/api/health", "/docs", "/api/simulate/trace/unknown"]:
            assert client.options(path, headers=headers).status_code == 400
