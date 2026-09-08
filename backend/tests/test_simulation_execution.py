"""Real execution/statistical checks plus explicitly injected failure paths."""

from importlib.metadata import version
from types import SimpleNamespace

import pytest

from app.services import qiskit_simulator


BELL_REQUEST = {
    "numQubits": 2,
    "gates": [
        {"id": "g1", "type": "h", "targets": [0], "controls": []},
        {"id": "g2", "type": "cx", "targets": [1], "controls": [0]},
    ],
    "shots": 1024,
    "backend": "qiskit",
    "seedSimulator": 42,
}


@pytest.mark.parametrize("bell", [False, True], ids=["hadamard", "bell"])
def test_sampled_frequencies_agree_with_ideal_probabilities(client, bell):
    payload = {
        **BELL_REQUEST,
        "numQubits": 2 if bell else 1,
        "gates": BELL_REQUEST["gates"] if bell else BELL_REQUEST["gates"][:1],
        "shots": 8192,
    }
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    for label, probability in data["probabilities"].items():
        # About 4.5 standard deviations at p=0.5 and 8192 shots; no exact RNG counts.
        frequency = data["counts"][label] / data["shots"]
        assert frequency == pytest.approx(probability, abs=0.025)


def test_real_aer_run_saves_state_before_terminal_measurements(client, monkeypatch):
    original_run = qiskit_simulator.AerSimulator.run
    calls = []

    def recording_run(self, circuit, **options):
        calls.append((circuit, options))
        return original_run(self, circuit, **options)

    monkeypatch.setattr(qiskit_simulator.AerSimulator, "run", recording_run)
    response = client.post("/api/simulate", json=BELL_REQUEST)
    assert response.status_code == 200
    assert len(calls) == 1
    circuit, options = calls[0]
    assert options == {"shots": 1024, "seed_simulator": 42}
    names = [instruction.operation.name for instruction in circuit.data]
    assert names == ["h", "cx", "save_statevector", "measure", "measure"]
    for index, instruction in enumerate(circuit.data[-2:]):
        assert circuit.find_bit(instruction.qubits[0]).index == index
        assert circuit.find_bit(instruction.clbits[0]).index == index
    metadata = response.json()["metadata"]
    assert metadata["qiskitVersion"] == version("qiskit")
    assert metadata["aerVersion"] == version("qiskit-aer")


@pytest.mark.parametrize("failure", ["exception", "unsuccessful-result"])
def test_engine_failure_returns_structured_error_not_fake_results(client, monkeypatch, failure):
    def failing_run(self, *args, **kwargs):
        if failure == "exception":
            raise RuntimeError("private simulator failure details")
        return SimpleNamespace(
            result=lambda: SimpleNamespace(success=False, status="private failed status")
        )

    monkeypatch.setattr(qiskit_simulator.AerSimulator, "run", failing_run)
    response = client.post("/api/simulate", json=BELL_REQUEST)
    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "simulation_failed",
            "message": "The simulator could not complete this circuit. Please retry.",
        }
    }
    assert "private" not in response.text
    assert "counts" not in response.json()


def test_invalid_request_never_invokes_aer(client, monkeypatch):
    calls = []

    def unexpected_run(self, *args, **kwargs):
        calls.append(True)
        raise AssertionError("Validation must happen before execution")

    monkeypatch.setattr(qiskit_simulator.AerSimulator, "run", unexpected_run)
    response = client.post("/api/simulate", json={**BELL_REQUEST, "shots": 0})
    assert response.status_code == 422
    assert calls == []


def test_openapi_publishes_backend_independent_simulation_contract(client):
    schema = client.get("/openapi.json").json()
    endpoint = schema["paths"]["/api/simulate"]["post"]
    assert {"200", "422", "500"} <= set(endpoint["responses"])
    models = schema["components"]["schemas"]
    request = models["SimulationRequest"]
    assert set(request["required"]) == {"numQubits", "gates", "shots", "backend"}
    gates = request["properties"]["gates"]["items"]
    assert gates["discriminator"]["propertyName"] == "type"
    assert set(gates["discriminator"]["mapping"]) == {
        "h", "x", "y", "z", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "p", "cx", "cz", "swap", "ccx",
    }
    assert set(models["ComplexAmplitude"]["properties"]) == {"real", "imag"}
